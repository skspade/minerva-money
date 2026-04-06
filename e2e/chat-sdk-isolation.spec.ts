import { test, expect } from '@playwright/test';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Regression test: verifies the Claude Agent SDK's query() completes
 * successfully when settingSources is set to [] (isolation mode).
 *
 * Background: without settingSources: [], the SDK spawns a `claude` CLI
 * subprocess that inherits the host user's ~/.claude settings, including
 * MCP servers (Linear, Gmail, Calendar). On the prod iMac, those
 * inherited MCP connections fail and cause unhandled rejections that
 * crash the server.
 *
 * This test calls query() directly (no Express, no browser) with the
 * same isolation options used in agent-service.ts to confirm the fix
 * prevents the crash.
 */
test.describe('Claude Agent SDK isolation', () => {
  test('query() completes when settingSources is []', async () => {
    // Minimal MCP server matching the shape of packages/server/src/agent/mcp-server.ts
    const mcpServer = createSdkMcpServer({
      name: 'minerva',
      version: '1.0.0',
      tools: [
        tool(
          'get_balance',
          'Get the current account balance',
          { account: z.string() },
          async () => ({
            content: [{ type: 'text' as const, text: 'Balance: $1234.56' }],
          }),
        ),
      ],
    });

    // Mirror options from packages/server/src/agent/agent-service.ts:147-157
    const options: Record<string, unknown> = {
      model: 'claude-sonnet-4-5',
      systemPrompt: 'You are a helpful financial assistant. Use the get_balance tool when asked about balance.',
      mcpServers: { minerva: mcpServer },
      allowedTools: ['mcp__minerva__*'],
      tools: [],
      maxTurns: 3,
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      // The fix: explicitly isolate from user's global ~/.claude settings
      // so inherited MCP servers (Linear, Gmail, Calendar) don't poison
      // the spawned CLI subprocess.
      settingSources: [],
    };

    const events: Array<{ elapsedMs: number; type: string; subtype?: string }> = [];
    const start = Date.now();
    let lastError: unknown = null;
    let resultText = '';

    try {
      const stream = query({
        prompt: "What's my checking account balance?",
        options,
      });

      for await (const msg of stream) {
        const elapsedMs = Date.now() - start;
        const type = msg.type;
        const subtype = ('subtype' in msg ? String(msg.subtype) : undefined);
        events.push({ elapsedMs, type, subtype });

        if (type === 'result' && subtype === 'success') {
          resultText = (msg as { result: string }).result;
        }
        if (events.length > 200) break; // safety
      }
    } catch (err) {
      lastError = err;
    }

    console.log('─── SDK isolation test events ───');
    const counts = events.reduce<Record<string, number>>((acc, e) => {
      const key = e.subtype ? `${e.type}/${e.subtype}` : e.type;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log('counts:', counts);
    console.log('total messages:', events.length);
    console.log('total elapsed:', Date.now() - start, 'ms');
    if (lastError) {
      console.log('ERROR:', lastError instanceof Error ? lastError.message : lastError);
      console.log('STACK:', lastError instanceof Error ? lastError.stack : '(no stack)');
    }
    console.log('result text (first 200 chars):', resultText.slice(0, 200));

    expect(lastError, 'query() should not throw').toBe(null);
    expect(events.some((e) => e.type === 'system' && e.subtype === 'init'), 'expected system/init message').toBe(true);
    expect(events.some((e) => e.type === 'result' && e.subtype === 'success'), 'expected result/success message').toBe(true);
    expect(resultText.length, 'result text should be non-empty').toBeGreaterThan(0);
  });
});
