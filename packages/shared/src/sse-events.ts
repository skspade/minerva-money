/**
 * SSE Event Protocol — Shared type definitions for streaming chat events.
 *
 * Defines a discriminated union on the `type` field for all 6 SSE event kinds.
 * Both server and client import these types from @minerva/shared to prevent
 * protocol drift.
 */

/** Emitted once at stream start to establish session identity. */
export interface SSESessionEvent {
  readonly type: 'session';
  readonly sessionId: string;
}

/** Emitted early in the stream to identify the conversation. Sent after session event, before text deltas. */
export interface SSEConversationEvent {
  readonly type: 'conversation';
  readonly conversationId: string;
}

/** Emitted for each incremental text token from the LLM. */
export interface SSETextDeltaEvent {
  readonly type: 'text-delta';
  readonly text: string;
}

/** Emitted when the agent begins invoking a tool. */
export interface SSEToolStartEvent {
  readonly type: 'tool-start';
  readonly tool: string;
}

/** Emitted when a tool invocation completes. */
export interface SSEToolEndEvent {
  readonly type: 'tool-end';
  readonly tool: string;
}

/** Emitted when the stream finishes successfully. Carries the full assembled response. */
export interface SSEDoneEvent {
  readonly type: 'done';
  readonly text: string;
}

/** Emitted when an error occurs during streaming. */
export interface SSEErrorEvent {
  readonly type: 'error';
  readonly message: string;
  readonly partialText?: string;
}

/**
 * Discriminated union of all SSE event types.
 * Use `event.type` in a switch statement for exhaustive type narrowing.
 */
export type SSEEvent =
  | SSESessionEvent
  | SSEConversationEvent
  | SSETextDeltaEvent
  | SSEToolStartEvent
  | SSEToolEndEvent
  | SSEDoneEvent
  | SSEErrorEvent;

/**
 * String literal union of all SSE event type discriminants.
 * Useful for the SSE `event:` line in the wire format.
 */
export type SSEEventType = SSEEvent['type'];
