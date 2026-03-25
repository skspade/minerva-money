# Milestone Context

**Source:** Brainstorm session (streaming chat responses)
**Design:** .planning/designs/2026-03-24-streaming-chat-responses-design.md

## Milestone Goal

Add true token-by-token streaming of LLM responses to the chat interface using Server-Sent Events (SSE), so users see text appear in real-time like major AI websites. Also show tool activity indicators when the agent is calling tools.

## Features

### SSE Event Protocol

Typed SSE event protocol with six event types: `session`, `text-delta`, `tool-start`, `tool-end`, `done`, and `error`. The `done` event carries full assembled text for confirmation parsing. Standard SSE wire format over HTTP.

### Server SSE Endpoint

New `POST /api/chat/stream` Express route (outside tRPC) that validates input with Zod, sets SSE headers, and streams events. Uses POST (not GET/EventSource) to support sending message body with sessionId and model selection.

### Server Stream Processing

New `streamChat()` function that iterates the Agent SDK's async iterable and emits SSE events in real-time instead of collecting the full response. Maps SDK message types to SSE events. Timeout handling per model. Existing `chat()` function kept as fallback.

### Client Stream Consumer

New `useStreamingChat` React hook that uses `fetch()` with `ReadableStream` to consume SSE events. Exposes `streamingText`, `activeTool`, `isStreaming`, and `error` state. Small SSE parser utility with no external dependencies.

### Client Incremental Rendering & Tool Activity UI

ChatPage renders `streamingText` through react-markdown as it accumulates. Tool activity indicator shows friendly labels (e.g., "Checking your budget...") when agent is calling tools. Bouncing dots only shown before first text delta arrives. Auto-scroll on new deltas. Confirmation flow unchanged — triggered from `done` event.

### Migration & Coexistence

SSE endpoint added alongside existing tRPC mutation. Both paths work simultaneously. Old collect-and-return path kept as fallback. No changes to tRPC router, MCP server, tools, or system prompt.
