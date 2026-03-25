import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SSEEvent } from '@minerva/shared';

// Mock the SDK query function
const mockClose = vi.fn();
let mockMessages: Array<Record<string, unknown>> = [];

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(() => {
    let index = 0;
    const generator = {
      [Symbol.asyncIterator]() { return this; },
      async next() {
        if (index < mockMessages.length) {
          return { value: mockMessages[index++], done: false };
        }
        return { value: undefined, done: true };
      },
      async return() { return { value: undefined, done: true }; },
      async throw(e: Error) { throw e; },
      close: mockClose,
    };
    return generator;
  }),
}));

vi.mock('./mcp-server.js', () => ({
  createMcpServer: vi.fn(() => ({})),
}));

vi.mock('./system-prompt.js', () => ({
  getSystemPrompt: vi.fn(() => 'test system prompt'),
}));

async function collectEvents(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// Dynamically import after mocks are set up
const { chatStream } = await import('./agent-service.js');

describe('chatStream', () => {
  let abortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    abortController = new AbortController();
    mockMessages = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Core Streaming (SRVR-03)', () => {
    it('yields SSESessionEvent with session_id from SDK init message', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-123' },
        { type: 'result', subtype: 'success', result: 'done' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      expect(events[0]).toEqual({ type: 'session', sessionId: 'sess-123' });
    });

    it('yields SSETextDeltaEvent for content_block_delta text_delta events', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' },
          },
          session_id: 'sess-1',
        },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: ' world' },
          },
          session_id: 'sess-1',
        },
        { type: 'result', subtype: 'success', result: 'Hello world' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const textDeltas = events.filter(e => e.type === 'text-delta');
      expect(textDeltas).toEqual([
        { type: 'text-delta', text: 'Hello' },
        { type: 'text-delta', text: ' world' },
      ]);
    });

    it('yields SSEDoneEvent with full accumulated text on SDKResultSuccess', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } },
          session_id: 'sess-1',
        },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'there' } },
          session_id: 'sess-1',
        },
        { type: 'result', subtype: 'success', result: 'Hi there' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const doneEvents = events.filter(e => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0]).toEqual({ type: 'done', text: 'Hi there' });
    });

    it('yields SSEErrorEvent on SDKResultError', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } },
          session_id: 'sess-1',
        },
        {
          type: 'result',
          subtype: 'error_during_execution',
          errors: ['Something went wrong'],
          is_error: true,
        },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toEqual({
        type: 'error',
        message: 'Something went wrong',
        partialText: 'partial',
      });
    });

    it('ignores irrelevant SDK message types', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        { type: 'system', subtype: 'status', status: 'compacting' },
        { type: 'system', subtype: 'compact_boundary' },
        { type: 'tool_progress', tool_name: 'test', tool_use_id: '123' },
        { type: 'result', subtype: 'success', result: '' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      // Should only have session + done events, not status/compact/tool_progress
      const types = events.map(e => e.type);
      expect(types).toEqual(['session', 'done']);
    });
  });

  describe('Tool Events (SRVR-04)', () => {
    it('yields SSEToolStartEvent when content_block_start has tool_use', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'get_budget', id: 'tu-1' },
          },
          session_id: 'sess-1',
        },
        { type: 'user', tool_use_result: { content: 'result' }, session_id: 'sess-1' },
        { type: 'result', subtype: 'success', result: 'done' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const toolStarts = events.filter(e => e.type === 'tool-start');
      expect(toolStarts).toEqual([{ type: 'tool-start', tool: 'get_budget' }]);
    });

    it('yields SSEToolEndEvent when SDKUserMessage has tool_use_result', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'get_budget', id: 'tu-1' },
          },
          session_id: 'sess-1',
        },
        { type: 'user', tool_use_result: { content: 'result' }, session_id: 'sess-1' },
        { type: 'result', subtype: 'success', result: 'done' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const toolEnds = events.filter(e => e.type === 'tool-end');
      expect(toolEnds).toEqual([{ type: 'tool-end', tool: 'get_budget' }]);
    });

    it('does not emit duplicate tool-start for the same tool name', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'get_budget', id: 'tu-1' },
          },
          session_id: 'sess-1',
        },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'get_budget', id: 'tu-2' },
          },
          session_id: 'sess-1',
        },
        { type: 'user', tool_use_result: { content: 'result' }, session_id: 'sess-1' },
        { type: 'result', subtype: 'success', result: 'done' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const toolStarts = events.filter(e => e.type === 'tool-start');
      expect(toolStarts).toHaveLength(1);
    });
  });

  describe('Abort Handling (SRVR-05)', () => {
    it('stops yielding events when signal is aborted', async () => {
      // Pre-abort the signal before starting iteration
      const preAbortController = new AbortController();

      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
          session_id: 'sess-1',
        },
        { type: 'result', subtype: 'success', result: 'Hello world' },
      ];

      // Abort before collecting events
      preAbortController.abort();

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', preAbortController.signal),
      );

      // With pre-aborted signal, the loop should break immediately
      // No done event should be yielded
      const doneEvents = events.filter(e => e.type === 'done');
      expect(doneEvents).toHaveLength(0);
    });

    it('calls query.close() when signal is aborted', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
      ];

      // Start iterating
      const gen = chatStream({} as any, {} as any, 'hello', abortController.signal);
      await gen.next(); // get session event

      // Abort
      abortController.abort();

      // close should have been called
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('Idle Timeout (SRVR-06)', () => {
    it('yields SSEErrorEvent when idle timeout expires', async () => {
      // Use a generator that never finishes (hangs after first message)
      const { query: mockQuery } = await import('@anthropic-ai/claude-agent-sdk');
      let hangResolve: () => void;
      const hangPromise = new Promise<void>(r => { hangResolve = r; });

      (mockQuery as any).mockImplementationOnce(() => {
        let sent = false;
        const gen = {
          [Symbol.asyncIterator]() { return this; },
          async next() {
            if (!sent) {
              sent = true;
              return { value: { type: 'system', subtype: 'init', session_id: 'sess-1' }, done: false };
            }
            // Hang indefinitely until resolved
            await hangPromise;
            return { value: undefined, done: true };
          },
          async return() { return { value: undefined, done: true }; },
          async throw(e: Error) { throw e; },
          close() { hangResolve!(); },
        };
        return gen;
      });

      const eventsPromise = collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      // Advance past the idle timeout (default model is sonnet = 30s)
      await vi.advanceTimersByTimeAsync(31_000);

      const events = await eventsPromise;
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      if (errorEvents[0].type === 'error') {
        expect(errorEvents[0].message).toContain('timeout');
      }
    });

    it('includes partial text in timeout error event', async () => {
      const { query: mockQuery } = await import('@anthropic-ai/claude-agent-sdk');
      let msgIndex = 0;
      let hangResolve: () => void;
      const hangPromise = new Promise<void>(r => { hangResolve = r; });

      const messages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } },
          session_id: 'sess-1',
        },
      ];

      (mockQuery as any).mockImplementationOnce(() => {
        const gen = {
          [Symbol.asyncIterator]() { return this; },
          async next() {
            if (msgIndex < messages.length) {
              return { value: messages[msgIndex++], done: false };
            }
            await hangPromise;
            return { value: undefined, done: true };
          },
          async return() { return { value: undefined, done: true }; },
          async throw(e: Error) { throw e; },
          close() { hangResolve!(); },
        };
        return gen;
      });

      const eventsPromise = collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      await vi.advanceTimersByTimeAsync(31_000);

      const events = await eventsPromise;
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      if (errorEvents[0].type === 'error') {
        expect(errorEvents[0].partialText).toBe('partial');
      }
    });
  });

  describe('Text Accumulation', () => {
    it('accumulates all text deltas into fullText for done event', async () => {
      mockMessages = [
        { type: 'system', subtype: 'init', session_id: 'sess-1' },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
          session_id: 'sess-1',
        },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world!' } },
          session_id: 'sess-1',
        },
        { type: 'result', subtype: 'success', result: 'Hello world!' },
      ];

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent).toEqual({ type: 'done', text: 'Hello world!' });
    });
  });

  describe('Error Handling', () => {
    it('yields SSEErrorEvent on unexpected exceptions', async () => {
      const { query: mockQuery } = await import('@anthropic-ai/claude-agent-sdk');
      (mockQuery as any).mockImplementationOnce(() => {
        const gen = {
          [Symbol.asyncIterator]() { return this; },
          async next() {
            throw new Error('Unexpected SDK crash');
          },
          async return() { return { value: undefined, done: true }; },
          async throw(e: Error) { throw e; },
          close: mockClose,
        };
        return gen;
      });

      const events = await collectEvents(
        chatStream({} as any, {} as any, 'hello', abortController.signal),
      );

      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      if (errorEvents[0].type === 'error') {
        expect(errorEvents[0].message).toContain('Unexpected SDK crash');
      }
    });

    it('never re-throws from the generator', async () => {
      const { query: mockQuery } = await import('@anthropic-ai/claude-agent-sdk');
      (mockQuery as any).mockImplementationOnce(() => {
        const gen = {
          [Symbol.asyncIterator]() { return this; },
          async next() {
            throw new Error('crash');
          },
          async return() { return { value: undefined, done: true }; },
          async throw(e: Error) { throw e; },
          close: mockClose,
        };
        return gen;
      });

      // Should not throw - should yield error event and complete
      await expect(
        collectEvents(chatStream({} as any, {} as any, 'hello', abortController.signal)),
      ).resolves.toBeDefined();
    });
  });
});
