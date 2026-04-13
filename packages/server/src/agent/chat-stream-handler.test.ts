/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('./models.js', () => ({
  isValidModelId: vi.fn((id: string) => ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'].includes(id)),
  MODELS: [
    { id: 'claude-haiku-4-5', label: 'Haiku' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet' },
    { id: 'claude-opus-4-6', label: 'Opus' },
  ],
  DEFAULT_MODEL_ID: 'claude-sonnet-4-6',
}));

vi.mock('../chat-history/chat-history-service.js', () => ({
  createConversation: vi.fn(() => ({
    id: 'new-conv-uuid',
    title: 'Test conversation',
    model: 'claude-sonnet-4-6',
    created_at: '2026-03-28',
    updated_at: '2026-03-28',
  })),
  getConversation: vi.fn((_db: unknown, id: string) => {
    if (id === 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5') {
      return {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        title: 'Existing conversation',
        model: 'claude-sonnet-4-6',
        sdk_session_id: 'sdk-sess-123',
        created_at: '2026-03-28',
        updated_at: '2026-03-28',
        messages: [],
      };
    }
    return null;
  }),
  appendMessage: vi.fn(),
}));

const { createChatStreamHandler } = await import('./chat-stream-handler.js');
const { createConversation, getConversation, appendMessage } = await import('../chat-history/chat-history-service.js');

function createMockReq(body: Record<string, unknown> = {}): Partial<Request> {
  return { body } as any;
}

function createMockRes(): Partial<Response> & { _written: string[]; _statusCode: number } {
  const res: any = {
    _written: [] as string[],
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
  };
  return res;
}

function createMockJobManager(overrides: Record<string, unknown> = {}) {
  return {
    hasActiveJob: vi.fn(() => null),
    startJob: vi.fn(),
    ...overrides,
  } as any;
}

describe('createChatStreamHandler', () => {
  const mockDb = {} as any;
  const mockCtx = { db: mockDb, rateLimiter: {}, client: {} } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('returns 400 when message field is missing', async () => {
      const handler = createChatStreamHandler(mockDb, mockCtx, createMockJobManager());
      const req = createMockReq({});
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 400 when message is empty string', async () => {
      const handler = createChatStreamHandler(mockDb, mockCtx, createMockJobManager());
      const req = createMockReq({ message: '' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when model is invalid', async () => {
      const handler = createChatStreamHandler(mockDb, mockCtx, createMockJobManager());
      const req = createMockReq({ message: 'hello', model: 'invalid-model' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      const errorBody = JSON.parse(res._written[0]);
      expect(errorBody.error).toContain('Invalid model');
    });

    it('returns 400 when conversationId is not a valid UUID', async () => {
      const handler = createChatStreamHandler(mockDb, mockCtx, createMockJobManager());
      const req = createMockReq({ message: 'hello', conversationId: 'not-a-uuid' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Conversation Management', () => {
    it('creates new conversation when no conversationId provided', async () => {
      const jobManager = createMockJobManager();
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(createConversation).toHaveBeenCalledWith(mockDb, {
        model: 'claude-sonnet-4-6',
        firstMessage: 'hello',
      });
    });

    it('loads existing conversation when valid conversationId provided', async () => {
      const jobManager = createMockJobManager();
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(getConversation).toHaveBeenCalledWith(mockDb, 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5');
      expect(createConversation).not.toHaveBeenCalled();
    });

    it('returns 400 when conversationId not found in DB', async () => {
      const jobManager = createMockJobManager();
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({
        message: 'hello',
        conversationId: '00000000-0000-0000-0000-000000000000',
      });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      const errorBody = JSON.parse(res._written[0]);
      expect(errorBody.error).toContain('Conversation not found');
    });
  });

  describe('Job Management', () => {
    it('returns conversationId as JSON', async () => {
      const jobManager = createMockJobManager();
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.json).toHaveBeenCalledWith({ conversationId: 'new-conv-uuid' });
    });

    it('persists user message before starting job', async () => {
      let appendOrder = -1;
      let startJobOrder = -1;
      let callIndex = 0;

      (appendMessage as any).mockImplementation(() => { appendOrder = callIndex++; });
      const jobManager = createMockJobManager({
        startJob: vi.fn(() => { startJobOrder = callIndex++; }),
      });
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(appendMessage).toHaveBeenCalledWith(mockDb, {
        conversationId: 'new-conv-uuid',
        role: 'user',
        content: 'hello',
      });
      expect(appendOrder).toBeLessThan(startJobOrder);
    });

    it('starts job with correct params', async () => {
      const jobManager = createMockJobManager();
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(jobManager.startJob).toHaveBeenCalledWith({
        db: mockDb,
        ctx: mockCtx,
        conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        message: 'hello',
        sdkSessionId: 'sdk-sess-123',
        model: undefined,
      });
    });

    it('returns 409 when another job is active for a different conversation', async () => {
      const jobManager = createMockJobManager({
        hasActiveJob: vi.fn(() => ({ conversationId: 'other-conv-id' })),
      });
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(409);
      const errorBody = JSON.parse(res._written[0]);
      expect(errorBody.error).toContain('already running');
      expect(errorBody.activeConversationId).toBe('other-conv-id');
    });

    it('allows request when active job is for the same conversation', async () => {
      const jobManager = createMockJobManager({
        hasActiveJob: vi.fn(() => ({ conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' })),
      });
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello', conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.json).toHaveBeenCalledWith({ conversationId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5' });
    });

    it('returns 409 if jobManager.startJob throws', async () => {
      const jobManager = createMockJobManager({
        startJob: vi.fn(() => { throw new Error('Another chat job is already running'); }),
      });
      const handler = createChatStreamHandler(mockDb, mockCtx, jobManager);
      const req = createMockReq({ message: 'hello' });
      const res = createMockRes();

      await handler(req as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });
});
