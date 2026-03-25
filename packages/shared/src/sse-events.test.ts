import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  SSESessionEvent,
  SSETextDeltaEvent,
  SSEToolStartEvent,
  SSEToolEndEvent,
  SSEDoneEvent,
  SSEErrorEvent,
  SSEEvent,
  SSEEventType,
} from './sse-events.js';

describe('SSE Event Types', () => {
  it('should accept a valid session event', () => {
    const event: SSEEvent = { type: 'session', sessionId: 'abc-123' };
    expect(event.type).toBe('session');
  });

  it('should accept a valid text-delta event', () => {
    const event: SSEEvent = { type: 'text-delta', text: 'hello' };
    expect(event.type).toBe('text-delta');
  });

  it('should accept a valid tool-start event', () => {
    const event: SSEEvent = { type: 'tool-start', tool: 'get_budget' };
    expect(event.type).toBe('tool-start');
  });

  it('should accept a valid tool-end event', () => {
    const event: SSEEvent = { type: 'tool-end', tool: 'get_budget' };
    expect(event.type).toBe('tool-end');
  });

  it('should accept a valid done event with text field', () => {
    const event: SSEEvent = { type: 'done', text: 'Full response here' };
    expect(event.type).toBe('done');
    if (event.type === 'done') {
      expect(event.text).toBe('Full response here');
    }
  });

  it('should accept a valid error event with message field', () => {
    const event: SSEEvent = { type: 'error', message: 'Something went wrong' };
    expect(event.type).toBe('error');
    if (event.type === 'error') {
      expect(event.message).toBe('Something went wrong');
      expect(event.partialText).toBeUndefined();
    }
  });

  it('should accept an error event with optional partialText', () => {
    const event: SSEEvent = {
      type: 'error',
      message: 'Failed',
      partialText: 'Partial...',
    };
    if (event.type === 'error') {
      expect(event.message).toBe('Failed');
      expect(event.partialText).toBe('Partial...');
    }
  });

  it('should have SSEEventType covering all 6 event types', () => {
    const types: SSEEventType[] = [
      'session',
      'text-delta',
      'tool-start',
      'tool-end',
      'done',
      'error',
    ];
    expect(types).toHaveLength(6);
  });

  it('should narrow types correctly in exhaustive switch', () => {
    function handleEvent(event: SSEEvent): string {
      switch (event.type) {
        case 'session':
          return event.sessionId;
        case 'text-delta':
          return event.text;
        case 'tool-start':
          return event.tool;
        case 'tool-end':
          return event.tool;
        case 'done':
          return event.text;
        case 'error':
          return event.message;
      }
    }

    const sessionEvent: SSEEvent = { type: 'session', sessionId: 'test-id' };
    expect(handleEvent(sessionEvent)).toBe('test-id');

    const doneEvent: SSEEvent = { type: 'done', text: 'complete' };
    expect(handleEvent(doneEvent)).toBe('complete');

    const errorEvent: SSEEvent = { type: 'error', message: 'oops' };
    expect(handleEvent(errorEvent)).toBe('oops');
  });

  it('should have correct type relationships', () => {
    expectTypeOf<SSESessionEvent>().toMatchTypeOf<SSEEvent>();
    expectTypeOf<SSETextDeltaEvent>().toMatchTypeOf<SSEEvent>();
    expectTypeOf<SSEToolStartEvent>().toMatchTypeOf<SSEEvent>();
    expectTypeOf<SSEToolEndEvent>().toMatchTypeOf<SSEEvent>();
    expectTypeOf<SSEDoneEvent>().toMatchTypeOf<SSEEvent>();
    expectTypeOf<SSEErrorEvent>().toMatchTypeOf<SSEEvent>();
  });
});
