import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSSEChunk } from './useStreamingChat';

// ── SSE Parsing Tests ───────────────────────────────────────────────

describe('parseSSEChunk', () => {
  it('parses a single complete SSE event', () => {
    const chunk = 'data: {"type":"text-delta","text":"Hello"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([{ type: 'text-delta', text: 'Hello' }]);
  });

  it('parses multiple events in a single chunk', () => {
    const chunk =
      'data: {"type":"session","sessionId":"abc"}\n\n' +
      'data: {"type":"text-delta","text":"Hi"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'session', sessionId: 'abc' });
    expect(events[1]).toEqual({ type: 'text-delta', text: 'Hi' });
  });

  it('returns empty array for incomplete chunk with no trailing double newline', () => {
    const chunk = 'data: {"type":"text-delta","text":"Hi"}';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([]);
  });

  it('ignores empty lines between events', () => {
    const chunk = '\n\ndata: {"type":"done","text":"Full"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([{ type: 'done', text: 'Full' }]);
  });

  it('ignores SSE comment lines', () => {
    const chunk = ': this is a comment\n\ndata: {"type":"text-delta","text":"X"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([{ type: 'text-delta', text: 'X' }]);
  });

  it('parses all 6 SSE event types', () => {
    const events = [
      { type: 'session', sessionId: 's1' },
      { type: 'text-delta', text: 'hi' },
      { type: 'tool-start', tool: 'get_balance' },
      { type: 'tool-end', tool: 'get_balance' },
      { type: 'done', text: 'full text' },
      { type: 'error', message: 'oops' },
    ];
    const chunk = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
    const parsed = parseSSEChunk(chunk);
    expect(parsed).toEqual(events);
  });

  it('handles chunk that ends mid-event (returns only complete events)', () => {
    const chunk =
      'data: {"type":"text-delta","text":"A"}\n\n' +
      'data: {"type":"text-delta","text":"B"}';
    const events = parseSSEChunk(chunk);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'text-delta', text: 'A' });
  });
});

// ── Hook Integration Tests ──────────────────────────────────────────

describe('useStreamingChat (integration)', () => {
  // Helper to create a ReadableStream from SSE event strings
  function createSSEStream(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  function mockFetchSuccess(events: Array<Record<string, unknown>>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: createSSEStream(events),
      }),
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends fetch with correct URL, method, headers, and body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createSSEStream([{ type: 'done', text: 'ok' }]),
    });
    vi.stubGlobal('fetch', fetchSpy);

    // We test the pure function behavior via processStream
    const { processStream } = await import('./useStreamingChat');

    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('Hello', handlers, { sessionId: 'sess-1', model: 'claude-sonnet-4-5' });

    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/stream', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello', sessionId: 'sess-1', model: 'claude-sonnet-4-5' }),
    }));
  });

  it('accumulates text-delta events', async () => {
    mockFetchSuccess([
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ' world' },
      { type: 'done', text: 'Hello world' },
    ]);

    const { processStream } = await import('./useStreamingChat');
    const textDeltas: string[] = [];
    const handlers = {
      onTextDelta: (text: string) => textDeltas.push(text),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('test', handlers);
    expect(textDeltas).toEqual(['Hello', ' world']);
  });

  it('tracks tool-start and tool-end events', async () => {
    mockFetchSuccess([
      { type: 'tool-start', tool: 'get_balances' },
      { type: 'tool-end', tool: 'get_balances' },
      { type: 'done', text: 'done' },
    ]);

    const { processStream } = await import('./useStreamingChat');
    const toolStarts: string[] = [];
    const toolEnds: string[] = [];
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: (tool: string) => toolStarts.push(tool),
      onToolEnd: (tool: string) => toolEnds.push(tool),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('test', handlers);
    expect(toolStarts).toEqual(['get_balances']);
    expect(toolEnds).toEqual(['get_balances']);
  });

  it('fires onDone with full text and sessionId from session event', async () => {
    mockFetchSuccess([
      { type: 'session', sessionId: 'sess-abc' },
      { type: 'text-delta', text: 'Hi' },
      { type: 'done', text: 'Hi there' },
    ]);

    const { processStream } = await import('./useStreamingChat');
    const onDone = vi.fn();
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone,
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('test', handlers);
    expect(onDone).toHaveBeenCalledWith('Hi there', 'sess-abc');
  });

  it('fires onSession with sessionId', async () => {
    mockFetchSuccess([
      { type: 'session', sessionId: 'sess-xyz' },
      { type: 'done', text: 'ok' },
    ]);

    const { processStream } = await import('./useStreamingChat');
    const onSession = vi.fn();
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession,
      onConversation: vi.fn(),
    };

    await processStream('test', handlers);
    expect(onSession).toHaveBeenCalledWith('sess-xyz');
  });

  it('sets error on SSE error event', async () => {
    mockFetchSuccess([{ type: 'error', message: 'Something broke' }]);

    const { processStream } = await import('./useStreamingChat');
    const onError = vi.fn();
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError,
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('test', handlers);
    expect(onError).toHaveBeenCalledWith('Something broke');
  });

  it('throws on fetch network error (for fallback handling)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { processStream } = await import('./useStreamingChat');
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await expect(processStream('test', handlers)).rejects.toThrow('Network error');
  });

  it('throws on non-200 response (for fallback handling)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
      }),
    );

    const { processStream } = await import('./useStreamingChat');
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await expect(processStream('test', handlers)).rejects.toThrow();
  });

  it('throws on non-event-stream Content-Type (for fallback handling)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const { processStream } = await import('./useStreamingChat');
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await expect(processStream('test', handlers)).rejects.toThrow();
  });

  it('falls back to options.sessionId in onDone when no session event is emitted', async () => {
    mockFetchSuccess([
      { type: 'text-delta', text: 'Resumed' },
      { type: 'done', text: 'Resumed response' },
    ]);

    const { processStream } = await import('./useStreamingChat');
    const onDone = vi.fn();
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone,
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('test', handlers, { sessionId: 'existing-sess-123' });
    expect(onDone).toHaveBeenCalledWith('Resumed response', 'existing-sess-123');
  });

  it('supports AbortController signal', async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    const { processStream } = await import('./useStreamingChat');
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await expect(processStream('test', handlers, { signal: controller.signal })).rejects.toThrow();
  });

  it('fires onConversation with conversationId from conversation event', async () => {
    mockFetchSuccess([
      { type: 'conversation', conversationId: 'conv-123' },
      { type: 'done', text: 'ok' },
    ]);

    const { processStream } = await import('./useStreamingChat');
    const onConversation = vi.fn();
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation,
    };

    await processStream('test', handlers);
    expect(onConversation).toHaveBeenCalledWith('conv-123');
  });

  it('includes conversationId in fetch body when provided', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createSSEStream([{ type: 'done', text: 'ok' }]),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { processStream } = await import('./useStreamingChat');
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('Hello', handlers, { conversationId: 'conv-456' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.conversationId).toBe('conv-456');
  });

  it('omits conversationId from fetch body when not provided', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createSSEStream([{ type: 'done', text: 'ok' }]),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { processStream } = await import('./useStreamingChat');
    const handlers = {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };

    await processStream('Hello', handlers);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.conversationId).toBeUndefined();
  });
});
