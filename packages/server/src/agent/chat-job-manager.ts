import type Database from 'better-sqlite3';
import type { SSEEvent } from '@minerva/shared';
import type { Context } from '../sync/trpc.js';
import type { StreamState } from './agent-service.js';
import type { ModelId } from './models.js';
import { chatStream } from './agent-service.js';
import {
  appendMessage,
  updateSdkSessionId,
} from '../chat-history/chat-history-service.js';

const CLEANUP_DELAY_MS = 5 * 60 * 1000;

interface ChatJob {
  conversationId: string;
  events: SSEEvent[];
  done: boolean;
  subscribers: Set<(event: SSEEvent) => void>;
  abortController: AbortController;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  state: StreamState;
}

export class ChatJobManager {
  private jobs = new Map<string, ChatJob>();
  private activeJobId: string | null = null;

  startJob(params: {
    db: Database.Database;
    ctx: Context;
    conversationId: string;
    message: string;
    sdkSessionId: string;
    model?: ModelId;
  }): void {
    if (this.activeJobId && this.activeJobId !== params.conversationId) {
      throw new Error('Another chat job is already running');
    }

    if (this.jobs.has(params.conversationId)) {
      const existing = this.jobs.get(params.conversationId)!;
      if (!existing.done) return;
      this.removeJob(params.conversationId);
    }

    const abortController = new AbortController();
    const state: StreamState = {
      sessionId: params.sdkSessionId,
      fullText: '',
      toolCalls: [],
      conversationId: params.conversationId,
    };

    const job: ChatJob = {
      conversationId: params.conversationId,
      events: [],
      done: false,
      subscribers: new Set(),
      abortController,
      cleanupTimer: null,
      state,
    };

    this.jobs.set(params.conversationId, job);
    this.activeJobId = params.conversationId;

    this.runJob(job, params);
  }

  getJob(conversationId: string): ChatJob | undefined {
    return this.jobs.get(conversationId);
  }

  hasActiveJob(): { conversationId: string } | null {
    if (!this.activeJobId) return null;
    return { conversationId: this.activeJobId };
  }

  subscribe(conversationId: string, callback: (event: SSEEvent) => void): (() => void) | null {
    const job = this.jobs.get(conversationId);
    if (!job) return null;
    job.subscribers.add(callback);
    return () => { job.subscribers.delete(callback); };
  }

  cancelJob(conversationId: string): void {
    const job = this.jobs.get(conversationId);
    if (job && !job.done) {
      job.abortController.abort();
    }
  }

  private runJob(job: ChatJob, params: {
    db: Database.Database;
    ctx: Context;
    conversationId: string;
    message: string;
    model?: ModelId;
  }): void {
    const run = async () => {
      const sdkSessionIdBefore = job.state.sessionId;

      try {
        const stream = chatStream(
          params.db,
          params.ctx,
          params.message,
          job.abortController.signal,
          job.state,
          params.model,
        );

        for await (const event of stream) {
          this.emitEvent(job, event);

          if (event.type === 'done') {
            try {
              const toolCallsForStorage = job.state.toolCalls.length > 0 ? job.state.toolCalls : undefined;
              appendMessage(params.db, {
                conversationId: params.conversationId,
                role: 'assistant',
                content: job.state.fullText,
                toolCalls: toolCallsForStorage,
              });
            } catch (err) {
              console.warn('Failed to persist assistant message:', err);
            }

            if (job.state.sessionId && job.state.sessionId !== sdkSessionIdBefore) {
              try {
                updateSdkSessionId(params.db, params.conversationId, job.state.sessionId);
              } catch (err) {
                console.warn('Failed to update SDK session ID:', err);
              }
            }
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        this.emitEvent(job, {
          type: 'error',
          message: errMsg,
          partialText: job.state.fullText || undefined,
        });
      } finally {
        job.done = true;
        if (this.activeJobId === job.conversationId) {
          this.activeJobId = null;
        }
        job.cleanupTimer = setTimeout(() => {
          this.removeJob(job.conversationId);
        }, CLEANUP_DELAY_MS);
      }
    };

    run().catch((err) => {
      console.error('Unexpected error in chat job:', err);
    });
  }

  private emitEvent(job: ChatJob, event: SSEEvent): void {
    job.events.push(event);
    for (const subscriber of job.subscribers) {
      try {
        subscriber(event);
      } catch {
        job.subscribers.delete(subscriber);
      }
    }
  }

  private removeJob(conversationId: string): void {
    const job = this.jobs.get(conversationId);
    if (job?.cleanupTimer) clearTimeout(job.cleanupTimer);
    this.jobs.delete(conversationId);
    if (this.activeJobId === conversationId) {
      this.activeJobId = null;
    }
  }
}
