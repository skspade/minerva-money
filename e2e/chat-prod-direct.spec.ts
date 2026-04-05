import { test, expect } from '@playwright/test';

/**
 * Direct SSE test — bypasses the browser entirely.
 *
 * Posts directly to /api/chat/stream from Node using fetch, reads the
 * raw SSE body with a ReadableStreamDefaultReader, and logs every event
 * with elapsed-ms timestamps. This removes the React / useStreamingChat
 * layer from the equation.
 *
 * Interpretation:
 * - If this test passes with a `done` event → bug is client-side.
 * - If only `conversation` / `session` appear → Claude SDK call never
 *   produces output (and the server's 30s idle timeout should fire an
 *   `error` event — if it doesn't, that's an extra bug).
 * - If the request itself errors → server-side pre-SDK code is broken.
 */
test.describe('Chat (prod direct SSE)', () => {
  test('POST /api/chat/stream emits a done event within timeout', async () => {
    const startTime = Date.now();
    const events: Array<{ elapsedMs: number; event: Record<string, unknown> }> = [];

    const logEvent = (event: Record<string, unknown>) => {
      const elapsedMs = Date.now() - startTime;
      events.push({ elapsedMs, event });
      const type = event.type;
      let detail = '';
      if (type === 'text-delta' && typeof event.text === 'string') {
        detail = ` "${event.text.slice(0, 60)}${event.text.length > 60 ? '...' : ''}"`;
      } else if (type === 'tool-start' || type === 'tool-end') {
        detail = ` tool=${event.tool}`;
      } else if (type === 'error') {
        detail = ` message=${JSON.stringify(event.message)}`;
      } else if (type === 'session') {
        detail = ` sessionId=${event.sessionId}`;
      } else if (type === 'conversation') {
        detail = ` conversationId=${event.conversationId}`;
      } else if (type === 'done' && typeof event.text === 'string') {
        detail = ` text.length=${event.text.length}`;
      }
      console.log(`[+${elapsedMs.toString().padStart(6, ' ')}ms] ${type}${detail}`);
    };

    const response = await fetch('http://localhost:3001/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "What's my account balance?" }),
    });

    console.log(`[+${(Date.now() - startTime).toString().padStart(6, ' ')}ms] HTTP ${response.status} ${response.statusText} content-type=${response.headers.get('content-type')}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type') ?? '').toMatch(/text\/event-stream/);
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Hard cap: 50s — longer than server's 30s sonnet idle timeout so we
    // see the error event fire if the SDK hangs.
    const hardDeadline = startTime + 50_000;

    readLoop: while (true) {
      const remaining = hardDeadline - Date.now();
      if (remaining <= 0) {
        console.log(`[+${(Date.now() - startTime).toString().padStart(6, ' ')}ms] HARD TIMEOUT — aborting read`);
        break;
      }

      // Race the read against a deadline timer so we don't hang forever
      // if the server stops writing without closing.
      let timeoutHandle: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        timeoutHandle = setTimeout(() => resolve('timeout'), remaining);
      });

      const result = await Promise.race([
        reader.read(),
        timeoutPromise,
      ]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (result === 'timeout') {
        console.log(`[+${(Date.now() - startTime).toString().padStart(6, ' ')}ms] READ TIMED OUT (server not writing)`);
        break;
      }

      if (result.done) {
        console.log(`[+${(Date.now() - startTime).toString().padStart(6, ' ')}ms] stream closed by server`);
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });

      // Parse complete SSE frames (separated by \n\n)
      while (true) {
        const idx = buffer.indexOf('\n\n');
        if (idx < 0) break;
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of frame.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
            logEvent(parsed);
            if (parsed.type === 'done') {
              // Keep reading for a beat to catch anything after `done`
              break readLoop;
            }
          } catch (err) {
            console.log(`[parse error] ${line.slice(0, 120)} — ${(err as Error).message}`);
          }
        }
      }
    }

    // ── Summary ───────────────────────────────────────────────────
    console.log('─── SUMMARY ───');
    const types = events.map((e) => e.event.type);
    const counts = types.reduce<Record<string, number>>((acc, t) => {
      acc[String(t)] = (acc[String(t)] ?? 0) + 1;
      return acc;
    }, {});
    console.log('event counts:', counts);
    console.log('event order: ', types.join(' → '));
    const totalElapsed = Date.now() - startTime;
    console.log(`total elapsed: ${totalElapsed}ms`);

    // ── Assertions ────────────────────────────────────────────────
    // These assertions encode the EXPECTED correct behaviour.
    // When they fail, the failure mode tells us where in the flow the bug is.
    const hasConversation = events.some((e) => e.event.type === 'conversation');
    const hasSession = events.some((e) => e.event.type === 'session');
    const hasTextDelta = events.some((e) => e.event.type === 'text-delta');
    const hasDone = events.some((e) => e.event.type === 'done');
    const hasError = events.some((e) => e.event.type === 'error');

    console.log(`flags: conversation=${hasConversation} session=${hasSession} text-delta=${hasTextDelta} done=${hasDone} error=${hasError}`);

    expect(hasConversation, 'expected conversation event').toBe(true);
    expect(hasSession, 'expected session event (SDK init)').toBe(true);
    expect(hasTextDelta, 'expected at least one text-delta event').toBe(true);
    expect(hasDone, 'expected done event to complete the stream').toBe(true);
    expect(hasError, 'expected no error events').toBe(false);
  });
});
