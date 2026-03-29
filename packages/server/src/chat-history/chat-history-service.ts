import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: unknown | null;
  created_at: string;
}

export interface ConversationWithMessages {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export function generateTitle(message: string): string {
  throw new Error('Not implemented');
}

export function createConversation(
  db: Database.Database,
  params: { model: string; firstMessage: string },
): { id: string; title: string; model: string; created_at: string; updated_at: string } {
  throw new Error('Not implemented');
}

export function appendMessage(
  db: Database.Database,
  params: { conversationId: string; role: string; content: string; toolCalls?: unknown },
): void {
  throw new Error('Not implemented');
}

export function listConversations(db: Database.Database): ConversationSummary[] {
  throw new Error('Not implemented');
}

export function getConversation(
  db: Database.Database,
  conversationId: string,
): ConversationWithMessages | null {
  throw new Error('Not implemented');
}

export function deleteConversation(db: Database.Database, conversationId: string): boolean {
  throw new Error('Not implemented');
}

export function renameConversation(
  db: Database.Database,
  conversationId: string,
  title: string,
): boolean {
  throw new Error('Not implemented');
}

export function purgeOldConversations(db: Database.Database, retentionDays: number): number {
  throw new Error('Not implemented');
}
