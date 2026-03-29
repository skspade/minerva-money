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
  const trimmed = message.trim();
  if (!trimmed) return 'New conversation';
  if (trimmed.length <= 60) return trimmed;
  const truncated = trimmed.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) return truncated.slice(0, lastSpace) + '...';
  return truncated + '...';
}

export function createConversation(
  db: Database.Database,
  params: { model: string; firstMessage: string },
): { id: string; title: string; model: string; created_at: string; updated_at: string } {
  const id = crypto.randomUUID();
  const title = generateTitle(params.firstMessage);

  db.prepare(
    'INSERT INTO chat_conversations (id, title, model) VALUES (?, ?, ?)',
  ).run(id, title, params.model);

  const row = db.prepare(
    'SELECT id, title, model, created_at, updated_at FROM chat_conversations WHERE id = ?',
  ).get(id) as { id: string; title: string; model: string; created_at: string; updated_at: string };

  return row;
}

export function appendMessage(
  db: Database.Database,
  params: { conversationId: string; role: string; content: string; toolCalls?: unknown },
): void {
  const toolCallsJson = params.toolCalls != null ? JSON.stringify(params.toolCalls) : null;

  db.prepare(
    'INSERT INTO chat_messages (conversation_id, role, content, tool_calls) VALUES (?, ?, ?, ?)',
  ).run(params.conversationId, params.role, params.content, toolCallsJson);

  db.prepare(
    "UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?",
  ).run(params.conversationId);
}

export function listConversations(db: Database.Database): ConversationSummary[] {
  const rows = db.prepare(`
    SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) AS message_count
    FROM chat_conversations c
    ORDER BY c.updated_at DESC
  `).all() as ConversationSummary[];

  return rows;
}

export function getConversation(
  db: Database.Database,
  conversationId: string,
): ConversationWithMessages | null {
  const conv = db.prepare(
    'SELECT id, title, model, sdk_session_id, created_at, updated_at FROM chat_conversations WHERE id = ?',
  ).get(conversationId) as {
    id: string;
    title: string;
    model: string;
    sdk_session_id: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!conv) return null;

  const messages = db.prepare(
    'SELECT id, conversation_id, role, content, tool_calls, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC',
  ).all(conversationId) as {
    id: number;
    conversation_id: string;
    role: string;
    content: string;
    tool_calls: string | null;
    created_at: string;
  }[];

  return {
    ...conv,
    messages: messages.map((m) => ({
      ...m,
      tool_calls: m.tool_calls != null ? JSON.parse(m.tool_calls) : null,
    })),
  };
}

export function deleteConversation(db: Database.Database, conversationId: string): boolean {
  const result = db.prepare('DELETE FROM chat_conversations WHERE id = ?').run(conversationId);
  return result.changes > 0;
}

export function renameConversation(
  db: Database.Database,
  conversationId: string,
  title: string,
): boolean {
  const result = db.prepare(
    'UPDATE chat_conversations SET title = ? WHERE id = ?',
  ).run(title, conversationId);
  return result.changes > 0;
}

export function updateSdkSessionId(
  db: Database.Database,
  conversationId: string,
  sdkSessionId: string,
): boolean {
  const result = db.prepare(
    'UPDATE chat_conversations SET sdk_session_id = ? WHERE id = ?',
  ).run(sdkSessionId, conversationId);
  return result.changes > 0;
}

export function purgeOldConversations(db: Database.Database, retentionDays: number): number {
  const result = db.prepare(
    `DELETE FROM chat_conversations WHERE updated_at < datetime('now', '-${retentionDays} days')`,
  ).run();
  return result.changes;
}
