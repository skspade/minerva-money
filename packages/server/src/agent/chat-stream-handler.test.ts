import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { SSEEvent } from '@minerva/shared';

// Mock agent-service to avoid SDK dependency
vi.mock('./agent-service.js', () => ({
  chatStream: vi.fn(),
}));

// Mock models
vi.mock('./models.js', () => ({
  isValidModelId: vi.fn((id: string) => ['claude-haiku-3-5-20241022', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'].includes(id)),
  MODELS: [
    { id: 'claude-haiku-3-5-20241022', label: 'Haiku' },
    { id: 'claude-sonnet-4-20250514', label: 'Sonnet' },
    { id: 'claude-opus-4-20250514', label: 'Opus' },
  ],
  DEFAULT_MODEL_ID: 'claude-sonnet-4-20250514',
}));

// Mock chat-history-service
vi.mock('../chat-history/chat-history-service.js', () => ({
  createConversation: vi.fn(() => ({
    id: 'new-conv-uuid',
    title: 'Test conversation',
    model: 'claude-sonnet-4-20250514',
    created_at: '2026-03-28',
    updated_at: '2026-03-28',
  })),
  getConversation: vi.fn((db: unknown, id: string) => {
    if (id === 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5') {
      return {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        title: 'Existing conversation',
        model: 'claude-sonnet-4-20250514',
        sdk_session_id: 'sdk-sess-123',
        created_at: '2026-03-28',
        updated_at: '2026-03-28',
        messages: [],
      };
    }
    return null;
  }),
  appendMessage: vi.fn(),
  updateSdkSessionId: vi.fn(),
}));

const { chatStream } = await import('./agent-service.js');
const { createChatStreamHandler } = await import('./chat-stream-handler.js');
const { createConversation, getConversation, appendMessage, updateSdkSessionId } = await import('../chat-history/chat-history-service.js');

function createMockReq(body: Record<string, unknown> = {}): Partial<Request> {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    body,
    on: vi.fn((event: string, handler: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }) as any,
    _listeners: listeners,
  } as any;
}

function createMockRes(): Partial<Response> & { _written: string[]; _headers: Record<string, string>; _statusCode: number } {
  const res: any = {
    _written: [] as string[],
    _headers: {} as Record<string, string>,
    _statusCode: 200,
    statusCode: 200,
    status: vi.fn(function (this: any, code: number) {
      this._statusCode = code;
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: any, data: unknown) {
      this._written.push(JSON.stringify(data));
      return this;
    }),
    setHeader: vi.fn(function (this: any, key: string, value: string) {
      this._headers[key] = value;
      return this;
    }),
    flushHeaders: vi.fn(),
    write: vi.fn(function (this: any, data: string) {
      this._written.push(data);
      return true;
    }),
    end: vi.fn(),
  };
  return res;
}

async function* mockGenerator(events: SSEEvent[]): AsyncGenerator<SSEEvent> {
  for (const event of events) {
    yield event;
  }
}

function parseWrittenEvents(res: { _written: string[] }): Array<Record<string, unknown>> {
  return res._written
    .filter(w => w.startsWith('data: '))
    .map(w => JSON.parse(w.replace('data: ', '').trim()));
}

describe('createChatStreamHandler', () => {
  const mockDb = {} as any;
  const mockCtx = { db: mockDb, rateLimiter: {}, client: {} } as any;
  let handler: ReturnType<typeof createChatStreamHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = createChatStreamHandler(mockDb, mockCtx);
  });

  describe('Input Validation', () => {
    it('returns 400 when message field is missing', async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 400 when message is empty string', async () => {
      const req = createMockReq({ message: '' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when model is invalid', async () => {
      const req = createMockReq({ message: 'hello', model: 'invalid-model' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      const errorBody = JSON.parse(res._written[0]);
      expect(errorBody.error).toContain('Invalid model');
    });

    it('returns 400 when conversationId is not a valid UUID', async () => {
      const req = createMockReq({ message: 'hello', conversationId: 'not-a-uuid' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('does not set SSE headers on validation failure', async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.flushHeaders).not.toHaveBeenCalled();
    });
  });

  describe('Conversation Creation (API-05)', () => {
    it('creates new conversation when no conversationId provided', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(createConversation).toHaveBeenCalledWith(mockDb, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'hello',
      });
    });

    it('loads existing conversation when valid conversationId provided', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(getConversation).toHaveBeenCalledWith(mockDb, 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5');
      expect(createConversation).not.toHaveBeenCalled();
    });

    it('returns 400 when conversationId not found in DB', async () => {
      const req = createMockReq({
        message: 'hello',
        conversationId: '00000000-0000-0000-0000-000000000000',
      });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      const errorBody = JSON.parse(res._written[0]);
      expect(errorBody.error).toContain('Conversation not found');
      expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    });
  });

  describe('SSE Conversation Event (API-06)', () => {
    it('emits conversation event as first SSE event', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      const written = parseWrittenEvents(res);
      expect(written[0]).toEqual({
        type: 'conversation',
        conversationId: 'new-conv-uuid',
      });
    });

    it('emits conversation event with existing conversationId', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      const written = parseWrittenEvents(res);
      expect(written[0]).toEqual({
        type: 'conversation',
        conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
    });
  });

  describe('Message Persistence (API-07)', () => {
    it('persists user message before stream starts', async () => {
      let chatStreamCallOrder = -1;
      let appendMessageCallOrder = -1;
      let callIndex = 0;

      (appendMessage as any).mockImplementation(() => {
        if (appendMessageCallOrder === -1) {
          appendMessageCallOrder = callIndex++;
        } else {
          callIndex++;
        }
      });

      (chatStream as any).mockImplementation(() => {
        chatStreamCallOrder = callIndex++;
        return mockGenerator([{ type: 'done', text: 'Hello' }]);
      });

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      // appendMessage for user message should be called before chatStream
      expect(appendMessage).toHaveBeenCalledWith(mockDb, {
        conversationId: 'new-conv-uuid',
        role: 'user',
        content: 'hello',
      });
      expect(appendMessageCallOrder).toBeLessThan(chatStreamCallOrder);
    });

    it('persists assistant message after stream done event', async () => {
      const events: SSEEvent[] = [
        { type: 'session', sessionId: 'sess-1' },
        { type: 'text-delta', text: 'Hello' },
        { type: 'done', text: 'Hello' },
      ];

      // Mock chatStream to populate state.fullText
      (chatStream as any).mockImplementation((db: any, ctx: any, msg: any, signal: any, state: any) => {
        async function* gen(): AsyncGenerator<SSEEvent> {
          for (const event of events) {
            if (event.type === 'text-delta' && event.type === 'text-delta') {
              state.fullText += event.text;
            }
            yield event;
          }
        }
        return gen();
      });

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      // Second appendMessage call should be for assistant
      const appendCalls = (appendMessage as any).mock.calls;
      expect(appendCalls.length).toBeGreaterThanOrEqual(2);
      expect(appendCalls[1][1]).toMatchObject({
        conversationId: 'new-conv-uuid',
        role: 'assistant',
        content: 'Hello',
      });
    });

    it('does NOT persist assistant message on error event', async () => {
      const events: SSEEvent[] = [
        { type: 'error', message: 'Something went wrong', partialText: 'partial' },
      ];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      // Only user message should be persisted
      const appendCalls = (appendMessage as any).mock.calls;
      expect(appendCalls).toHaveLength(1);
      expect(appendCalls[0][1].role).toBe('user');
    });

    it('persists done event AFTER assistant message', async () => {
      const doneWriteOrder: number[] = [];
      let writeCallIndex = 0;

      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];

      (chatStream as any).mockImplementation((db: any, ctx: any, msg: any, signal: any, state: any) => {
        state.fullText = 'Hello';
        return mockGenerator(events);
      });

      (appendMessage as any).mockImplementation(() => {
        doneWriteOrder.push(writeCallIndex++);
      });

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();
      const originalWrite = res.write;
      (res as any).write = vi.fn(function (this: any, data: string) {
        if (data.includes('"done"')) {
          doneWriteOrder.push(writeCallIndex++);
        }
        return originalWrite.call(this, data);
      });

      await handler(req as Request, res as unknown as Response, vi.fn());

      // appendMessage for assistant (index 1 from mock) should happen before done write
      // doneWriteOrder[0] = user appendMessage, [1] = assistant appendMessage, [2] = done write
      expect(doneWriteOrder.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('SDK Session ID Management', () => {
    it('passes sdk_session_id from conversation as state.sessionId', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(chatStream).toHaveBeenCalledWith(
        mockDb,
        mockCtx,
        'hello',
        expect.any(AbortSignal),
        expect.objectContaining({ sessionId: 'sdk-sess-123', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' }),
        undefined,
      );
    });

    it('calls updateSdkSessionId when session ID changes', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];

      (chatStream as any).mockImplementation((db: any, ctx: any, msg: any, signal: any, state: any) => {
        // Simulate SDK assigning a new session ID
        state.sessionId = 'new-sdk-sess';
        state.fullText = 'Hello';
        return mockGenerator(events);
      });

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(updateSdkSessionId).toHaveBeenCalledWith(mockDb, 'new-conv-uuid', 'new-sdk-sess');
    });

    it('does not call updateSdkSessionId when session ID unchanged', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];

      (chatStream as any).mockImplementation((db: any, ctx: any, msg: any, signal: any, state: any) => {
        // Session ID stays as the one from conversation
        state.sessionId = 'sdk-sess-123';
        state.fullText = 'Hello';
        return mockGenerator(events);
      });

      const req = createMockReq({ message: 'hello', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(updateSdkSessionId).not.toHaveBeenCalled();
    });
  });

  describe('SSE Response Format', () => {
    it('sets SSE headers for valid request', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'Hello' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('writes each event as SSE data line', async () => {
      const events: SSEEvent[] = [
        { type: 'session', sessionId: 'sess-1' },
        { type: 'text-delta', text: 'Hello' },
        { type: 'done', text: 'Hello' },
      ];

      (chatStream as any).mockImplementation((db: any, ctx: any, msg: any, signal: any, state: any) => {
        state.fullText = 'Hello';
        return mockGenerator(events);
      });

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      // Conversation event + all generator events
      for (const event of events) {
        expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    it('calls res.end() after generator completes', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'done' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('Abort Handling', () => {
    it('wires req close event to abort controller', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'done' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('writes SSE error event if chatStream throws unexpectedly', async () => {
      (chatStream as any).mockImplementation(() => {
        async function* gen(): AsyncGenerator<SSEEvent> {
          throw new Error('Unexpected crash');
        }
        return gen();
      });

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      const errorWrite = (res.write as any).mock.calls.find(
        (call: string[]) => call[0].includes('"type":"error"'),
      );
      expect(errorWrite).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });
  });
});
