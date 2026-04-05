import { test, expect } from '@playwright/test';

/**
 * Reproduction test for the broken chat on the production server.
 *
 * Runs against an already-running prod server at http://localhost:3001
 * (see playwright.prod.config.ts). Does NOT mock any network traffic —
 * the whole point is to observe how /api/chat/stream and the tRPC
 * fallback actually behave in production.
 *
 * Run with:
 *   npm run test:chat:prod
 */
test.describe('Chat (prod repro)', () => {
  test('sending a message produces an assistant response', async ({ page }) => {
    // ── Diagnostics: attach listeners BEFORE navigation ──────────────
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const line = `[console.${msg.type()}] ${msg.text()}`;
      consoleLogs.push(line);
      console.log(line);
    });

    page.on('pageerror', (err) => {
      const line = `[pageerror] ${err.message}`;
      consoleLogs.push(line);
      console.log(line);
    });

    page.on('requestfailed', (req) => {
      const line = `[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`;
      consoleLogs.push(line);
      console.log(line);
    });

    // Log status + headers for chat-relevant responses (do NOT read the body;
    // that would consume the SSE stream).
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/api/chat/stream') || url.includes('/trpc/')) {
        const line = `[response] ${res.status()} ${res.statusText()} ${url} content-type=${res.headers()['content-type'] ?? '(none)'}`;
        consoleLogs.push(line);
        console.log(line);
      }
    });

    // ── Load /chat and confirm the prod server serves the built client ─
    await page.goto('/chat');
    await expect(
      page.getByText('Ask Minerva anything about your finances'),
    ).toBeVisible({ timeout: 15_000 });

    // ── Send a deterministic, cheap prompt ───────────────────────────
    const prompt = "What's my account balance?";
    const textarea = page.getByPlaceholder('Ask about your finances...');
    await textarea.fill(prompt);

    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // User message bubble should appear immediately (pure client-side state).
    // Scope to the user bubble (.bg-accent) to avoid matching the sidebar,
    // which may show past conversations with the same title.
    await expect(
      page.locator('.bg-accent').filter({ hasText: prompt }).first(),
    ).toBeVisible();

    // ── The reproduction assertion ───────────────────────────────────
    // Wait for any assistant output: either a completed `.prose` markdown
    // bubble, or the live streaming bubble with text. When the bug is
    // active, neither appears and this times out.
    const assistantOutput = page.locator('.prose').first();

    try {
      await expect(assistantOutput).toBeVisible({ timeout: 45_000 });
      await expect(assistantOutput).not.toBeEmpty();
    } catch (err) {
      // ── Post-mortem diagnostics on failure ─────────────────────────
      const bouncingDotsStillVisible = await page
        .locator('.animate-bounce')
        .first()
        .isVisible()
        .catch(() => false);

      const errorBubble = page.locator('text=/^Error:/').first();
      const errorBubbleVisible = await errorBubble.isVisible().catch(() => false);
      const errorBubbleText = errorBubbleVisible
        ? await errorBubble.textContent().catch(() => null)
        : null;

      const currentUrl = page.url();

      console.log('─── CHAT REPRO DIAGNOSTICS ───');
      console.log(`current URL:              ${currentUrl}`);
      console.log(`bouncing dots visible:    ${bouncingDotsStillVisible}`);
      console.log(`error bubble visible:     ${errorBubbleVisible}`);
      if (errorBubbleText) console.log(`error bubble text:        ${errorBubbleText}`);
      console.log('─── collected log lines ───');
      for (const line of consoleLogs) console.log(line);
      console.log('─── end diagnostics ───');

      throw err;
    }
  });
});
