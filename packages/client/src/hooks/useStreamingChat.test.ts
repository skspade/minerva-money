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

  it('parses all SSE event types', () => {
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

// ── Integration Tests ──────────────────────────────────────────────

describe('processStream (two-step flow)', () => {
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

  function mockTwoStepFetch(
    conversationId: string,
    sseEvents: Array<Record<string, unknown>>,
  ): ReturnType<typeof vi.fn> {
    const fetchSpy = vi.fn()
      .mockImplementation((url: string) => {
        if (url === '/api/chat/stream') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ conversationId }),
          });
        }
        if (url === `/api/chat/events/${conversationId}`) {
          return Promise.resolve({
            ok: true,
            status: 200,
            body: createSSEStream(sseEvents),
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createHandlers() {
    return {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onThinking: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };
  }

  it('POSTs to /api/chat/stream then GETs events', async () => {
    const fetchSpy = mockTwoStepFetch('conv-1', [{ type: 'done', text: 'ok' }]);
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await processStream('Hello', handlers, { model: 'claude-sonnet-4-6' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/chat/stream');
    expect(fetchSpy.mock.calls[1][0]).toBe('/api/chat/events/conv-1');
  });

  it('sends correct POST body', async () => {
    const fetchSpy = mockTwoStepFetch('conv-1', [{ type: 'done', text: 'ok' }]);
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await processStream('Hello', handlers, { conversationId: 'conv-existing', model: 'claude-haiku-4-5' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({ message: 'Hello', model: 'claude-haiku-4-5', conversationId: 'conv-existing' });
  });

  it('fires onConversation from POST response', async () => {
    mockTwoStepFetch('conv-new', [{ type: 'done', text: 'ok' }]);
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await processStream('Hello', handlers);

    expect(handlers.onConversation).toHaveBeenCalledWith('conv-new');
  });

  it('accumulates text-delta events from SSE stream', async () => {
    mockTwoStepFetch('conv-1', [
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ' world' },
      { type: 'done', text: 'Hello world' },
    ]);
    const { processStream } = await import('./useStreamingChat');
    const textDeltas: string[] = [];
    const handlers = createHandlers();
    handlers.onTextDelta = vi.fn((text: string) => textDeltas.push(text));

    await processStream('test', handlers);
    expect(textDeltas).toEqual(['Hello', ' world']);
  });

  it('tracks tool-start and tool-end events', async () => {
    mockTwoStepFetch('conv-1', [
      { type: 'tool-start', tool: 'get_balances' },
      { type: 'tool-end', tool: 'get_balances' },
      { type: 'done', text: 'done' },
    ]);
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await processStream('test', handlers);
    expect(handlers.onToolStart).toHaveBeenCalledWith('get_balances');
    expect(handlers.onToolEnd).toHaveBeenCalledWith('get_balances');
  });

  it('fires onDone with full text and sessionId', async () => {
    mockTwoStepFetch('conv-1', [
      { type: 'session', sessionId: 'sess-abc' },
      { type: 'text-delta', text: 'Hi' },
      { type: 'done', text: 'Hi there' },
    ]);
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await processStream('test', handlers);
    expect(handlers.onDone).toHaveBeenCalledWith('Hi there', 'sess-abc');
  });

  it('fires onError on SSE error event', async () => {
    mockTwoStepFetch('conv-1', [{ type: 'error', message: 'Something broke' }]);
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await processStream('test', handlers);
    expect(handlers.onError).toHaveBeenCalledWith('Something broke');
  });

  it('throws on POST failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    }));
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await expect(processStream('test', handlers)).rejects.toThrow('Server error');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { processStream } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await expect(processStream('test', handlers)).rejects.toThrow('Network error');
  });
});

describe('connectToEvents', () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createHandlers() {
    return {
      onTextDelta: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onThinking: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onSession: vi.fn(),
      onConversation: vi.fn(),
    };
  }

  it('returns silently on 404 (no active job)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));
    const { connectToEvents } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await connectToEvents('conv-1', handlers);
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('processes SSE events from GET response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createSSEStream([
        { type: 'text-delta', text: 'Hello' },
        { type: 'done', text: 'Hello' },
      ]),
    }));
    const { connectToEvents } = await import('./useStreamingChat');
    const handlers = createHandlers();

    await connectToEvents('conv-1', handlers);
    expect(handlers.onTextDelta).toHaveBeenCalledWith('Hello');
    expect(handlers.onDone).toHaveBeenCalledWith('Hello', '');
  });
});
