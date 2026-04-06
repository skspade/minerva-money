import { test, expect } from '@playwright/test';

/**
 * E2E test: verify each AI model responds via the browser UI.
 *
 * Runs against an already-running prod server at http://localhost:3001
 * (see playwright.prod.config.ts). Does NOT mock any network traffic.
 *
 * Run with: npm run test:chat:prod -- --grep "model responses"
 */

const MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku', assertionTimeoutMs: 30_000, testTimeoutMs: 45_000 },
  { id: 'claude-sonnet-4-6', label: 'Sonnet', assertionTimeoutMs: 45_000, testTimeoutMs: 60_000 },
  { id: 'claude-opus-4-6', label: 'Opus', assertionTimeoutMs: 90_000, testTimeoutMs: 105_000 },
] as const;

test.describe('Chat model responses (prod)', () => {
  for (const model of MODELS) {
    test(`${model.label} (${model.id}) responds to a message`, async ({ page }) => {
      test.setTimeout(model.testTimeoutMs);

      // ── Diagnostics ───────────────────────────────────────────────
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
      page.on('response', (res) => {
        const url = res.url();
        if (url.includes('/api/chat/stream') || url.includes('/trpc/')) {
          const line = `[response] ${res.status()} ${res.statusText()} ${url} content-type=${res.headers()['content-type'] ?? '(none)'}`;
          consoleLogs.push(line);
          console.log(line);
        }
      });

      // ── Load /chat ────────────────────────────────────────────────
      await page.goto('/chat');
      await expect(
        page.getByText('Ask Minerva anything about your finances'),
      ).toBeVisible({ timeout: 15_000 });

      // ── Select model ──────────────────────────────────────────────
      const select = page.locator('select');
      await expect(select).toBeVisible();
      await expect(select.locator('option')).toHaveCount(3, { timeout: 10_000 });
      await select.selectOption(model.id);

      if (model.id !== 'claude-sonnet-4-6') {
        await expect(
          page.getByText('Ask Minerva anything about your finances'),
        ).toBeVisible({ timeout: 5_000 });
      }

      // ── Send prompt ───────────────────────────────────────────────
      const prompt = 'Say hello in one sentence.';
      const textarea = page.getByPlaceholder('Ask about your finances...');
      await textarea.fill(prompt);

      const sendButton = page.getByRole('button', { name: 'Send' });
      await expect(sendButton).toBeEnabled();
      await sendButton.click();

      // User bubble should appear immediately
      await expect(
        page.locator('.bg-accent').filter({ hasText: prompt }).first(),
      ).toBeVisible();

      // ── Wait for assistant response ───────────────────────────────
      const assistantOutput = page.locator('.prose').first();
      const errorBubble = page.locator('.bg-danger-light').first();

      try {
        // Wait for either a real response or an error bubble to appear
        await Promise.race([
          expect(assistantOutput).toBeVisible({ timeout: model.assertionTimeoutMs }),
          expect(errorBubble).toBeVisible({ timeout: model.assertionTimeoutMs }),
        ]);

        // Fail if the response is an error, not a real message
        const errorVisible = await errorBubble.isVisible().catch(() => false);
        if (errorVisible) {
          const errorText = await errorBubble.textContent().catch(() => '(unknown)');
          throw new Error(`Model responded with error: ${errorText}`);
        }

        // Verify the response has meaningful content (at least 5 chars)
        const text = await assistantOutput.textContent();
        expect(text!.trim().length).toBeGreaterThanOrEqual(5);
      } catch (err) {
        // ── Post-mortem diagnostics ───────────────────────────────
        const bouncingDotsStillVisible = await page
          .locator('.animate-bounce')
          .first()
          .isVisible()
          .catch(() => false);

        const errorBubbleVisible = await errorBubble.isVisible().catch(() => false);
        const errorBubbleText = errorBubbleVisible
          ? await errorBubble.textContent().catch(() => null)
          : null;

        console.log(`─── DIAGNOSTICS (${model.label}) ───`);
        console.log(`current URL:              ${page.url()}`);
        console.log(`bouncing dots visible:    ${bouncingDotsStillVisible}`);
        console.log(`error bubble visible:     ${errorBubbleVisible}`);
        if (errorBubbleText) console.log(`error bubble text:        ${errorBubbleText}`);
        console.log('─── collected log lines ───');
        for (const line of consoleLogs) console.log(line);
        console.log('─── end diagnostics ───');

        throw err;
      }
    });
  }
});
