export type Cents = number & { readonly __brand: 'Cents' };

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100) as Cents;
}

export type {
  SSESessionEvent,
  SSETextDeltaEvent,
  SSEToolStartEvent,
  SSEToolEndEvent,
  SSEDoneEvent,
  SSEErrorEvent,
  SSEEvent,
  SSEEventType,
} from './sse-events.js';
