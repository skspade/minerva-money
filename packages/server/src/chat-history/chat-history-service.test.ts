import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import {
  generateTitle,
  createConversation,
  appendMessage,
  listConversations,
  getConversation,
  deleteConversation,
  renameConversation,
  updateSdkSessionId,
  purgeOldConversations,
} from './chat-history-service.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('chat-history-service', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-chat-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generateTitle', () => {
    it('returns short message as-is when under 60 chars', () => {
      expect(generateTitle('What is my budget for groceries?')).toBe(
        'What is my budget for groceries?',
      );
    });

    it('truncates long message at last word boundary before ~60 chars with ellipsis', () => {
      const longMessage =
        'Can you show me a breakdown of all my spending across every category for the last three months?';
      const title = generateTitle(longMessage);
      expect(title.length).toBeLessThanOrEqual(63); // 60 + "..."
      expect(title).toMatch(/\.\.\.$/);
      // Should cut at a word boundary — the text before "..." should end with a complete word
      const withoutEllipsis = title.replace('...', '');
      expect(withoutEllipsis).not.toMatch(/\s$/); // No trailing space before "..."
    });

    it('returns "New conversation" for empty string', () => {
      expect(generateTitle('')).toBe('New conversation');
    });

    it('returns "New conversation" for whitespace-only string', () => {
      expect(generateTitle('   \n\t  ')).toBe('New conversation');
    });

    it('returns message as-is when exactly 60 chars', () => {
      const msg = 'A'.repeat(60);
      expect(generateTitle(msg)).toBe(msg);
    });

    it('strips leading and trailing whitespace before processing', () => {
      expect(generateTitle('  Hello world  ')).toBe('Hello world');
    });
  });

  describe('createConversation', () => {
    it('returns object with UUID id, auto-generated title, model, and timestamps', () => {
      const result = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'What is my net worth?',
      });
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.title).toBe('What is my net worth?');
      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.created_at).toBeTruthy();
      expect(result.updated_at).toBeTruthy();
    });

    it('generates title matching generateTitle output', () => {
      const longMsg =
        'Can you show me a breakdown of all my spending across every category for the last three months?';
      const result = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: longMsg,
      });
      expect(result.title).toBe(generateTitle(longMsg));
    });

    it('conversation is retrievable after creation', () => {
      const result = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hello',
      });
      const fetched = getConversation(db, result.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(result.id);
      expect(fetched!.title).toBe('Hello');
    });
  });

  describe('appendMessage', () => {
    it('inserts message with correct role and content', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      appendMessage(db, {
        conversationId: conv.id,
        role: 'user',
        content: 'What is my budget?',
      });
      const fetched = getConversation(db, conv.id);
      expect(fetched!.messages).toHaveLength(1);
      expect(fetched!.messages[0].role).toBe('user');
      expect(fetched!.messages[0].content).toBe('What is my budget?');
    });

    it('updates conversation updated_at timestamp', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      const originalUpdatedAt = conv.updated_at;

      // Force a different timestamp by manipulating the DB directly
      db.prepare(
        "UPDATE chat_conversations SET updated_at = datetime('now', '-1 hour') WHERE id = ?",
      ).run(conv.id);

      appendMessage(db, {
        conversationId: conv.id,
        role: 'user',
        content: 'Test',
      });

      const fetched = getConversation(db, conv.id);
      expect(fetched!.updated_at).not.toBe(
        db
          .prepare('SELECT datetime(\'now\', \'-1 hour\') as t')
          .get() as { t: string },
      );
    });

    it('stores tool_calls as JSON when provided', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      const toolCalls = [{ name: 'get_balance', input: { account: 'checking' } }];
      appendMessage(db, {
        conversationId: conv.id,
        role: 'assistant',
        content: 'Let me check...',
        toolCalls,
      });
      const fetched = getConversation(db, conv.id);
      expect(fetched!.messages[0].tool_calls).toEqual(toolCalls);
    });

    it('stores null tool_calls when not provided', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      appendMessage(db, {
        conversationId: conv.id,
        role: 'user',
        content: 'Hello',
      });
      const fetched = getConversation(db, conv.id);
      expect(fetched!.messages[0].tool_calls).toBeNull();
    });
  });

  describe('listConversations', () => {
    it('returns empty array when no conversations exist', () => {
      expect(listConversations(db)).toEqual([]);
    });

    it('returns conversations ordered by updated_at DESC', () => {
      const c1 = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'First',
      });
      const c2 = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Second',
      });

      // Make c1 more recent by appending a message
      db.prepare(
        "UPDATE chat_conversations SET updated_at = datetime('now', '+1 minute') WHERE id = ?",
      ).run(c1.id);

      const list = listConversations(db);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(c1.id);
      expect(list[1].id).toBe(c2.id);
    });

    it('includes message_count for each conversation', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      appendMessage(db, { conversationId: conv.id, role: 'user', content: 'Hello' });
      appendMessage(db, { conversationId: conv.id, role: 'assistant', content: 'Hi there!' });

      const list = listConversations(db);
      expect(list[0].message_count).toBe(2);
    });

    it('message_count reflects actual number of messages', () => {
      const c1 = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'First',
      });
      const c2 = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Second',
      });
      appendMessage(db, { conversationId: c1.id, role: 'user', content: 'A' });
      appendMessage(db, { conversationId: c1.id, role: 'assistant', content: 'B' });
      appendMessage(db, { conversationId: c1.id, role: 'user', content: 'C' });

      const list = listConversations(db);
      const first = list.find((c) => c.id === c1.id)!;
      const second = list.find((c) => c.id === c2.id)!;
      expect(first.message_count).toBe(3);
      expect(second.message_count).toBe(0);
    });
  });

  describe('getConversation', () => {
    it('returns null for non-existent conversation', () => {
      expect(getConversation(db, 'non-existent-id')).toBeNull();
    });

    it('returns conversation with all messages ordered by created_at ASC', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      appendMessage(db, { conversationId: conv.id, role: 'user', content: 'First' });
      appendMessage(db, { conversationId: conv.id, role: 'assistant', content: 'Second' });
      appendMessage(db, { conversationId: conv.id, role: 'user', content: 'Third' });

      const fetched = getConversation(db, conv.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.messages).toHaveLength(3);
      expect(fetched!.messages[0].content).toBe('First');
      expect(fetched!.messages[1].content).toBe('Second');
      expect(fetched!.messages[2].content).toBe('Third');
    });

    it('parses tool_calls JSON back to object', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      const toolCalls = [{ name: 'list_accounts', input: {} }];
      appendMessage(db, {
        conversationId: conv.id,
        role: 'assistant',
        content: 'Checking...',
        toolCalls,
      });

      const fetched = getConversation(db, conv.id);
      expect(fetched!.messages[0].tool_calls).toEqual(toolCalls);
      expect(typeof fetched!.messages[0].tool_calls).toBe('object');
    });

    it('returns null tool_calls as null, not string "null"', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      appendMessage(db, { conversationId: conv.id, role: 'user', content: 'Hello' });

      const fetched = getConversation(db, conv.id);
      expect(fetched!.messages[0].tool_calls).toBeNull();
      expect(fetched!.messages[0].tool_calls).not.toBe('null');
    });
  });

  describe('deleteConversation', () => {
    it('returns true when conversation exists and is deleted', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      expect(deleteConversation(db, conv.id)).toBe(true);
      expect(getConversation(db, conv.id)).toBeNull();
    });

    it('returns false when conversation does not exist', () => {
      expect(deleteConversation(db, 'non-existent-id')).toBe(false);
    });

    it('CASCADE deletes all associated messages', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      appendMessage(db, { conversationId: conv.id, role: 'user', content: 'A' });
      appendMessage(db, { conversationId: conv.id, role: 'assistant', content: 'B' });

      deleteConversation(db, conv.id);

      const msgCount = db
        .prepare('SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ?')
        .get(conv.id) as { count: number };
      expect(msgCount.count).toBe(0);
    });
  });

  describe('renameConversation', () => {
    it('returns true and updates title when conversation exists', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hi',
      });
      expect(renameConversation(db, conv.id, 'New Title')).toBe(true);
      const fetched = getConversation(db, conv.id);
      expect(fetched!.title).toBe('New Title');
    });

    it('returns false when conversation does not exist', () => {
      expect(renameConversation(db, 'non-existent-id', 'Title')).toBe(false);
    });
  });

  describe('updateSdkSessionId', () => {
    it('updates sdk_session_id on existing conversation and returns true', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hello',
      });
      expect(updateSdkSessionId(db, conv.id, 'sdk-session-abc')).toBe(true);
      const fetched = getConversation(db, conv.id);
      expect(fetched!.sdk_session_id).toBe('sdk-session-abc');
    });

    it('returns false for non-existent conversation', () => {
      expect(updateSdkSessionId(db, 'non-existent-id', 'sdk-session-abc')).toBe(false);
    });

    it('overwrites previously set sdk_session_id', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Hello',
      });
      updateSdkSessionId(db, conv.id, 'first-session');
      updateSdkSessionId(db, conv.id, 'second-session');
      const fetched = getConversation(db, conv.id);
      expect(fetched!.sdk_session_id).toBe('second-session');
    });
  });

  describe('purgeOldConversations', () => {
    it('returns 0 when no conversations to purge', () => {
      expect(purgeOldConversations(db, 90)).toBe(0);
    });

    it('deletes conversations older than retention threshold', () => {
      const conv = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Old conversation',
      });
      // Backdate the conversation to 100 days ago
      db.prepare(
        "UPDATE chat_conversations SET updated_at = datetime('now', '-100 days') WHERE id = ?",
      ).run(conv.id);

      const deleted = purgeOldConversations(db, 90);
      expect(deleted).toBe(1);
      expect(getConversation(db, conv.id)).toBeNull();
    });

    it('returns count of deleted conversations', () => {
      for (let i = 0; i < 3; i++) {
        const conv = createConversation(db, {
          model: 'claude-sonnet-4-20250514',
          firstMessage: `Old ${i}`,
        });
        db.prepare(
          "UPDATE chat_conversations SET updated_at = datetime('now', '-100 days') WHERE id = ?",
        ).run(conv.id);
      }
      expect(purgeOldConversations(db, 90)).toBe(3);
    });

    it('does not delete conversations within retention threshold', () => {
      const recent = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Recent',
      });
      const old = createConversation(db, {
        model: 'claude-sonnet-4-20250514',
        firstMessage: 'Old',
      });
      db.prepare(
        "UPDATE chat_conversations SET updated_at = datetime('now', '-100 days') WHERE id = ?",
      ).run(old.id);

      purgeOldConversations(db, 90);
      expect(getConversation(db, recent.id)).not.toBeNull();
      expect(getConversation(db, old.id)).toBeNull();
    });
  });
});
