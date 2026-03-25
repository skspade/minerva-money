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

const { chatStream } = await import('./agent-service.js');
const { createChatStreamHandler } = await import('./chat-stream-handler.js');

function createMockReq(body: Record<string, unknown> = {}): Partial<Request> {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    body,
    on: vi.fn((event: string, handler: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }) as any,
    // Expose listeners for testing
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

describe('createChatStreamHandler', () => {
  const mockDb = {} as any;
  const mockCtx = { db: mockDb, rateLimiter: {}, client: {} } as any;
  let handler: ReturnType<typeof createChatStreamHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = createChatStreamHandler(mockDb, mockCtx);
  });

  describe('Input Validation (SRVR-02)', () => {
    it('returns 400 when message field is missing', async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      const errorBody = JSON.parse(res._written[0]);
      expect(errorBody).toHaveProperty('error');
    });

    it('returns 400 when message is empty string', async () => {
      const req = createMockReq({ message: '' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 400 when model is invalid', async () => {
      const req = createMockReq({ message: 'hello', model: 'invalid-model' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      const errorBody = JSON.parse(res._written[0]);
      expect(errorBody.error).toContain('Invalid model');
    });

    it('does not set SSE headers on validation failure', async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.flushHeaders).not.toHaveBeenCalled();
    });
  });

  describe('SSE Response Format (SRVR-01)', () => {
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
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      // Each event should be written as data: JSON\n\n
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

    it('passes sessionId and model to chatStream when provided', async () => {
      const events: SSEEvent[] = [{ type: 'done', text: 'done' }];
      (chatStream as any).mockReturnValue(mockGenerator(events));

      const req = createMockReq({ message: 'hello', sessionId: 'sess-1', model: 'claude-haiku-3-5-20241022' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(chatStream).toHaveBeenCalledWith(
        mockDb,
        mockCtx,
        'hello',
        expect.any(AbortSignal),
        'sess-1',
        'claude-haiku-3-5-20241022',
      );
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

      // Should write an error event and end
      const errorWrite = (res.write as any).mock.calls.find(
        (call: string[]) => call[0].includes('"type":"error"'),
      );
      expect(errorWrite).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });
  });
});
