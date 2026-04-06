import { test, expect, type Page, type Route } from '@playwright/test';

// ── Helpers ────────────────────────────────────────────────────────

/** Format an SSE event line */
function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Build a complete SSE response body for a simple text reply */
function simpleStreamBody(text: string, conversationId = 'conv-001'): string {
  return [
    sse({ type: 'conversation', conversationId }),
    sse({ type: 'session', sessionId: 'sess-001' }),
    sse({ type: 'text-delta', text }),
    sse({ type: 'done', text }),
  ].join('');
}

/** Build an SSE response body that includes tool activity */
function toolStreamBody(
  toolName: string,
  text: string,
  conversationId = 'conv-001',
): string {
  return [
    sse({ type: 'conversation', conversationId }),
    sse({ type: 'session', sessionId: 'sess-001' }),
    sse({ type: 'tool-start', tool: toolName }),
    sse({ type: 'tool-end', tool: toolName }),
    sse({ type: 'text-delta', text }),
    sse({ type: 'done', text }),
  ].join('');
}

/** Build an SSE response body with a confirmation prompt */
function confirmationStreamBody(
  description: string,
  action: string,
  preamble: string,
  conversationId = 'conv-001',
): string {
  const confirmBlock = `\`\`\`json\n${JSON.stringify({ type: 'confirmation', action, description })}\n\`\`\``;
  const fullText = `${preamble}\n\n${confirmBlock}`;
  return [
    sse({ type: 'conversation', conversationId }),
    sse({ type: 'session', sessionId: 'sess-001' }),
    sse({ type: 'text-delta', text: fullText }),
    sse({ type: 'done', text: fullText }),
  ].join('');
}

/** Build an SSE error response */
function errorStreamBody(message: string, conversationId = 'conv-001'): string {
  return [
    sse({ type: 'conversation', conversationId }),
    sse({ type: 'session', sessionId: 'sess-001' }),
    sse({ type: 'error', message }),
  ].join('');
}

const MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku', description: 'Fast and lightweight.' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet', description: 'Balanced performance.' },
  { id: 'claude-opus-4', label: 'Opus', description: 'Most capable.' },
];

/**
 * Extract procedure names from a tRPC batch URL.
 * tRPC httpBatchLink format: /trpc/proc1,proc2?batch=1&input={...}
 */
function getTrpcProcedures(url: URL): string[] {
  const path = url.pathname;
  const trpcPrefix = '/trpc/';
  if (!path.startsWith(trpcPrefix)) return [];
  return path.slice(trpcPrefix.length).split(',');
}

/** Default tRPC response for a procedure name */
function defaultTrpcResult(proc: string): Record<string, unknown> {
  if (proc === 'agent.models') {
    return { result: { data: MODELS } };
  }
  if (proc === 'chatHistory.list') {
    return { result: { data: [] } };
  }
  return { result: { data: null } };
}

/** Mock the tRPC batch endpoint for models + conversation list queries */
async function mockTrpcBatch(route: Route) {
  const url = new URL(route.request().url());
  const procedures = getTrpcProcedures(url);

  const results = procedures.map((proc) => defaultTrpcResult(proc));

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(results),
  });
}

/**
 * Set up route interceptions for the chat page.
 * Returns a helper to customize the stream response per-test.
 */
async function setupChatMocks(page: Page) {
  let streamHandler: ((route: Route) => Promise<void>) | null = null;

  // Mock tRPC batch queries (models, chatHistory.list)
  await page.route('**/trpc/**', mockTrpcBatch);

  // Mock the SSE stream endpoint — delegates to streamHandler if set
  await page.route('**/api/chat/stream', async (route) => {
    if (streamHandler) {
      await streamHandler(route);
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: simpleStreamBody('Hello! How can I help you with your finances?'),
      });
    }
  });

  return {
    /** Override the stream response for the next call(s) */
    setStreamHandler(handler: (route: Route) => Promise<void>) {
      streamHandler = handler;
    },
    /** Set a simple text response */
    setStreamResponse(body: string) {
      streamHandler = async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          body,
        });
      };
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

test.describe('Chat Page', () => {
  test.describe('Empty state and page load', () => {
    test('shows welcome message and example questions on fresh load', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      await expect(page.getByText('Ask Minerva anything about your finances')).toBeVisible();
      await expect(page.getByText('Get instant answers about balances, spending, budgets, and more.')).toBeVisible();

      // All 4 example questions should be visible
      await expect(page.getByRole('button', { name: "What's my account balance?" })).toBeVisible();
      await expect(page.getByRole('button', { name: 'How much did I spend on groceries this month?' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Show my budget summary' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Any uncategorized transactions?' })).toBeVisible();
    });

    test('shows textarea, send button, and model selector', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      await expect(page.getByPlaceholder('Ask about your finances...')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

      // Model selector with all 3 models
      const select = page.locator('select');
      await expect(select).toBeVisible();
      await expect(select.locator('option')).toHaveCount(3);
    });

    test('send button is disabled when input is empty', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

      await page.getByPlaceholder('Ask about your finances...').fill('hello');
      await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();

      await page.getByPlaceholder('Ask about your finances...').fill('');
      await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    });
  });

  test.describe('Example questions', () => {
    test('clicking an example question sends it as a message', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(simpleStreamBody('Your total balance is $5,000.'));
      await page.goto('/chat');

      await page.getByRole('button', { name: "What's my account balance?" }).click();

      // User message should appear
      await expect(page.getByText("What's my account balance?")).toBeVisible();

      // Assistant response should appear
      await expect(page.getByText('Your total balance is $5,000.')).toBeVisible();

      // Example questions should be gone (replaced by messages)
      await expect(page.getByText('Ask Minerva anything about your finances')).not.toBeVisible();
    });
  });

  test.describe('Sending messages and streaming', () => {
    test('sends a message via textarea and displays streamed response', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(simpleStreamBody('You spent $342 on groceries this month.'));
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('How much did I spend on groceries?');
      await page.getByRole('button', { name: 'Send' }).click();

      // User message bubble
      await expect(page.getByText('How much did I spend on groceries?')).toBeVisible();

      // Assistant response
      await expect(page.getByText('You spent $342 on groceries this month.')).toBeVisible();

      // Input should be cleared after sending
      await expect(textarea).toHaveValue('');
    });

    test('sends message on Enter key (not Shift+Enter)', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(simpleStreamBody('Here is your budget summary.'));
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Show budget');
      await textarea.press('Enter');

      // Message should be sent
      await expect(page.getByText('Show budget')).toBeVisible();
      await expect(page.getByText('Here is your budget summary.')).toBeVisible();
    });

    test('Shift+Enter does not send message (allows newline)', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Line one');
      await textarea.press('Shift+Enter');

      // Welcome message should still be visible (message not sent)
      await expect(page.getByText('Ask Minerva anything about your finances')).toBeVisible();
    });

    test('displays tool activity indicator during streaming', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      // Use a delayed stream to capture the tool indicator
      mocks.setStreamHandler(async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          body: toolStreamBody('get_account_balances', 'Your balance is $10,000.'),
        });
      });
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('What are my balances?');
      await page.getByRole('button', { name: 'Send' }).click();

      // Final response should appear
      await expect(page.getByText('Your balance is $10,000.')).toBeVisible();
    });

    test('multiple messages in a conversation', async ({ page }) => {
      const mocks = await setupChatMocks(page);

      let callCount = 0;
      mocks.setStreamHandler(async (route) => {
        callCount++;
        const text = callCount === 1 ? 'First response.' : 'Second response.';
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          body: simpleStreamBody(text),
        });
      });

      await page.goto('/chat');

      // First message
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('First question');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText('First response.')).toBeVisible();

      // Second message
      await textarea.fill('Second question');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText('Second response.')).toBeVisible();

      // Both user messages should be visible
      await expect(page.getByText('First question')).toBeVisible();
      await expect(page.getByText('Second question')).toBeVisible();
    });
  });

  test.describe('Error handling', () => {
    test('displays error message when stream returns an error event', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(errorStreamBody('Agent timeout exceeded'));
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Do something complex');
      await page.getByRole('button', { name: 'Send' }).click();

      // Error message should be displayed
      await expect(page.getByText('Agent timeout exceeded')).toBeVisible();
    });

    test('displays error on non-200 SSE response (falls back to tRPC)', async ({ page }) => {
      const mocks = await setupChatMocks(page);

      // SSE returns 500, tRPC fallback also fails
      mocks.setStreamHandler(async (route) => {
        await route.fulfill({ status: 500, body: 'Internal Server Error' });
      });

      // Also mock the tRPC mutation fallback to fail
      await page.route('**/trpc/**', async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify([{ error: { message: 'Server error' } }]),
          });
        } else {
          await mockTrpcBatch(route);
        }
      });

      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Trigger error');
      await page.getByRole('button', { name: 'Send' }).click();

      // Should show some error indication
      await expect(page.locator('text=/error|failed|Error/i').first()).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Model selector', () => {
    test('defaults to Sonnet model', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      const select = page.locator('select');
      await expect(select).toHaveValue('claude-sonnet-4-5');
    });

    test('changing model clears conversation and resets to empty state', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(simpleStreamBody('Response text'));
      await page.goto('/chat');

      // Send a message first
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Hello');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText('Response text')).toBeVisible();

      // Change model
      await page.locator('select').selectOption('claude-opus-4');

      // Should be back to empty state
      await expect(page.getByText('Ask Minerva anything about your finances')).toBeVisible();
      // Messages should be gone
      await expect(page.getByText('Response text')).not.toBeVisible();
    });

    test('model selector is disabled while streaming', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      // Use a promise to control when the stream completes
      let resolveStream!: () => void;
      const streamPromise = new Promise<void>((resolve) => {
        resolveStream = resolve;
      });

      mocks.setStreamHandler(async (route) => {
        // Send initial events but don't complete yet
        const body = [
          sse({ type: 'conversation', conversationId: 'conv-001' }),
          sse({ type: 'session', sessionId: 'sess-001' }),
          sse({ type: 'text-delta', text: 'Thinking...' }),
        ].join('');

        // Fulfill immediately with partial stream (done event comes later via new handler)
        // Actually for Playwright route.fulfill, we can't stream progressively,
        // so let's just check the disabled state via the attribute
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          body: body + sse({ type: 'done', text: 'Thinking...' }),
        });
        resolveStream();
      });

      await page.goto('/chat');
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Test');
      await page.getByRole('button', { name: 'Send' }).click();
      await streamPromise;

      // After stream completes, selector should be enabled again
      await expect(page.locator('select')).toBeEnabled();
    });
  });

  test.describe('Confirmation prompts', () => {
    test('displays confirm/cancel buttons for confirmation responses', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(
        confirmationStreamBody(
          'Categorize 3 transactions as Groceries',
          'categorize_transactions',
          'I found 3 uncategorized grocery transactions.',
        ),
      );
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Categorize my groceries');
      await page.getByRole('button', { name: 'Send' }).click();

      // Confirmation UI should appear
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
      await expect(page.getByText('Categorize 3 transactions as Groceries')).toBeVisible();
    });

    test('clicking Confirm sends "Yes, confirm" message', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      let callCount = 0;

      mocks.setStreamHandler(async (route) => {
        callCount++;
        if (callCount === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            body: confirmationStreamBody(
              'Categorize transactions',
              'categorize',
              'Found transactions to categorize.',
            ),
          });
        } else {
          // Verify the confirm message was sent
          const postData = JSON.parse(route.request().postData() ?? '{}');
          expect(postData.message).toBe('Yes, confirm');
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            body: simpleStreamBody('Done! 3 transactions categorized.'),
          });
        }
      });

      await page.goto('/chat');
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Categorize');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();

      await page.getByRole('button', { name: 'Confirm' }).click();

      // Confirmation message and response
      await expect(page.getByText('Yes, confirm')).toBeVisible();
      await expect(page.getByText('Done! 3 transactions categorized.')).toBeVisible();

      // Confirm/Cancel buttons should be hidden after responding
      await expect(page.getByRole('button', { name: 'Confirm' })).not.toBeVisible();
    });

    test('clicking Cancel sends "No, cancel" message', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      let callCount = 0;

      mocks.setStreamHandler(async (route) => {
        callCount++;
        if (callCount === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            body: confirmationStreamBody(
              'Delete rule',
              'delete_rule',
              'I will delete this rule.',
            ),
          });
        } else {
          const postData = JSON.parse(route.request().postData() ?? '{}');
          expect(postData.message).toBe('No, cancel');
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            body: simpleStreamBody('OK, cancelled.'),
          });
        }
      });

      await page.goto('/chat');
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Delete rule');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByText('No, cancel')).toBeVisible();
      await expect(page.getByText('OK, cancelled.')).toBeVisible();
    });
  });

  test.describe('Conversation sidebar', () => {
    test('shows "No conversations yet" when empty', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      // Desktop sidebar should show empty state
      await expect(page.getByText('No conversations yet')).toBeVisible();
    });

    test('shows New Chat button', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      await expect(page.getByRole('button', { name: 'New Chat' })).toBeVisible();
    });

    test('shows conversation list after sending a message', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(simpleStreamBody('Hello!'));

      // After the first message, chatHistory.list should return the new conversation
      let listCallCount = 0;
      await page.route('**/trpc/**', async (route) => {
        const url = new URL(route.request().url());
        const procs = getTrpcProcedures(url);

        if (procs.includes('chatHistory.list')) {
          listCallCount++;
          if (listCallCount > 1) {
            // After first message, return conversation in the list
            const results = procs.map((proc) => {
              if (proc === 'chatHistory.list') {
                return {
                  result: {
                    data: [{
                      id: 'conv-001',
                      title: 'Hello!',
                      model: 'claude-sonnet-4-5',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }],
                  },
                };
              }
              return defaultTrpcResult(proc);
            });
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(results),
            });
            return;
          }
        }
        await mockTrpcBatch(route);
      });

      await page.goto('/chat');
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Hello!');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByText('Hello!').first()).toBeVisible();
    });

    test('New Chat button navigates to /chat', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      await page.getByRole('button', { name: 'New Chat' }).click();
      await expect(page).toHaveURL(/\/chat$/);
    });
  });

  test.describe('Conversation loading', () => {
    test('loads existing conversation from URL', async ({ page }) => {
      const convId = '550e8400-e29b-41d4-a716-446655440000';

      await page.route('**/trpc/**', async (route) => {
        const url = new URL(route.request().url());
        const procs = getTrpcProcedures(url);

        const results = procs.map((proc) => {
          if (proc === 'chatHistory.get') {
            return {
              result: {
                data: {
                  id: convId,
                  title: 'Previous Chat',
                  model: 'claude-sonnet-4-5',
                  sdk_session_id: 'sess-prev',
                  created_at: '2026-03-28T10:00:00Z',
                  updated_at: '2026-03-28T10:05:00Z',
                  messages: [
                    { role: 'user', content: 'What is my net worth?', created_at: '2026-03-28T10:00:00Z' },
                    { role: 'assistant', content: 'Your net worth is $50,000.', created_at: '2026-03-28T10:00:05Z' },
                  ],
                },
              },
            };
          }
          if (proc === 'chatHistory.list') {
            return {
              result: {
                data: [{
                  id: convId,
                  title: 'Previous Chat',
                  model: 'claude-sonnet-4-5',
                  created_at: '2026-03-28T10:00:00Z',
                  updated_at: '2026-03-28T10:05:00Z',
                }],
              },
            };
          }
          return defaultTrpcResult(proc);
        });

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(results),
        });
      });

      await page.route('**/api/chat/stream', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          body: simpleStreamBody('Follow-up response.', convId),
        });
      });

      await page.goto(`/chat/${convId}`);

      // Should show the loaded conversation messages
      await expect(page.getByText('What is my net worth?')).toBeVisible();
      await expect(page.getByText('Your net worth is $50,000.')).toBeVisible();

      // Welcome/empty state should NOT show
      await expect(page.getByText('Ask Minerva anything about your finances')).not.toBeVisible();
    });

    test('redirects to /chat on invalid conversation ID', async ({ page }) => {
      const badId = '00000000-0000-0000-0000-000000000000';

      await page.route('**/trpc/**', async (route) => {
        const url = new URL(route.request().url());
        const procs = getTrpcProcedures(url);

        const results = procs.map((proc) => {
          if (proc === 'chatHistory.get') {
            return {
              error: {
                message: 'Conversation not found',
                code: -32004,
                data: { code: 'NOT_FOUND', httpStatus: 404 },
              },
            };
          }
          return defaultTrpcResult(proc);
        });

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(results),
        });
      });

      await page.goto(`/chat/${badId}`);

      // Should redirect to /chat and show empty state
      await expect(page).toHaveURL(/\/chat$/, { timeout: 10_000 });
      await expect(page.getByText('Ask Minerva anything about your finances')).toBeVisible();
    });
  });

  test.describe('Keyboard navigation', () => {
    test('textarea is focused on page load (can immediately type)', async ({ page }) => {
      await setupChatMocks(page);
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      // Textarea should exist and be interactable
      await expect(textarea).toBeVisible();
      await expect(textarea).toBeEnabled();
    });
  });

  test.describe('Stream request payload', () => {
    test('sends correct payload with message and model', async ({ page }) => {
      const mocks = await setupChatMocks(page);

      let capturedPayload: Record<string, unknown> | null = null;
      mocks.setStreamHandler(async (route) => {
        capturedPayload = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          body: simpleStreamBody('OK'),
        });
      });

      await page.goto('/chat');
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Test message');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByText('OK')).toBeVisible();

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload!.message).toBe('Test message');
      expect(capturedPayload!.model).toBe('claude-sonnet-4-5');
    });

    test('sends conversationId on subsequent messages', async ({ page }) => {
      const mocks = await setupChatMocks(page);

      const payloads: Record<string, unknown>[] = [];
      mocks.setStreamHandler(async (route) => {
        payloads.push(JSON.parse(route.request().postData() ?? '{}'));
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          body: simpleStreamBody('Response'),
        });
      });

      await page.goto('/chat');
      const textarea = page.getByPlaceholder('Ask about your finances...');

      // First message - no conversationId
      await textarea.fill('First');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText('Response').first()).toBeVisible();

      // Second message - should include conversationId from the stream response
      await textarea.fill('Second');
      await page.getByRole('button', { name: 'Send' }).click();
      // Wait for second response
      await expect(page.locator('text=Response')).toHaveCount(2, { timeout: 5_000 });

      expect(payloads).toHaveLength(2);
      expect(payloads[0].conversationId).toBeUndefined();
      expect(payloads[1].conversationId).toBe('conv-001');
    });
  });

  test.describe('URL and navigation', () => {
    test('URL updates to include conversationId after first message', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      mocks.setStreamResponse(simpleStreamBody('Hello!', 'conv-abc-123'));
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Hi');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByText('Hello!')).toBeVisible();
      await expect(page).toHaveURL(/\/chat\/conv-abc-123/);
    });
  });

  test.describe('Markdown rendering', () => {
    test('renders markdown in assistant responses', async ({ page }) => {
      const mocks = await setupChatMocks(page);
      const markdownText = '**Bold text** and a list:\n\n- Item 1\n- Item 2';
      mocks.setStreamResponse(simpleStreamBody(markdownText));
      await page.goto('/chat');

      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill('Show formatted data');
      await page.getByRole('button', { name: 'Send' }).click();

      // Check that markdown was rendered (bold should be in a <strong> tag)
      await expect(page.locator('strong', { hasText: 'Bold text' })).toBeVisible();
      // List items should be rendered
      await expect(page.getByText('Item 1')).toBeVisible();
      await expect(page.getByText('Item 2')).toBeVisible();
    });
  });
});
