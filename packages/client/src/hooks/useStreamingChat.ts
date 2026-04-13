import { useState, useRef, useEffect } from 'react';
import type { SSEEvent } from '@minerva/shared';

// ── SSE Parsing ─────────────────────────────────────────────────────

export function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const segments = chunk.split('\n\n');

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i].trim();
    if (!segment) continue;

    for (const line of segment.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data: ')) {
        const json = trimmed.slice(6);
        try {
          events.push(JSON.parse(json) as SSEEvent);
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  return events;
}

// ── Stream Processing (testable without React) ──────────────────────

export interface StreamHandlers {
  onTextDelta: (text: string) => void;
  onToolStart: (tool: string) => void;
  onToolEnd: (tool: string) => void;
  onThinking: () => void;
  onDone: (text: string, sessionId: string) => void;
  onError: (message: string) => void;
  onSession: (sessionId: string) => void;
  onConversation: (conversationId: string) => void;
}

export interface StreamOptions {
  conversationId?: string;
  model?: string;
  signal?: AbortSignal;
}

export async function connectToEvents(
  conversationId: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/chat/events/${conversationId}`, { signal });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw new Error(`Events request failed with status ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let capturedSessionId = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lastDoubleNewline = buffer.lastIndexOf('\n\n');
      if (lastDoubleNewline < 0) continue;

      const completePart = buffer.slice(0, lastDoubleNewline + 2);
      buffer = buffer.slice(lastDoubleNewline + 2);

      const events = parseSSEChunk(completePart);
      for (const event of events) {
        switch (event.type) {
          case 'session':
            capturedSessionId = event.sessionId;
            handlers.onSession(event.sessionId);
            break;
          case 'conversation':
            handlers.onConversation(event.conversationId);
            break;
          case 'text-delta':
            handlers.onTextDelta(event.text);
            break;
          case 'tool-start':
            handlers.onToolStart(event.tool);
            break;
          case 'tool-end':
            handlers.onToolEnd(event.tool);
            break;
          case 'thinking':
            handlers.onThinking();
            break;
          case 'done':
            handlers.onDone(event.text, capturedSessionId);
            break;
          case 'error':
            handlers.onError(event.message);
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function processStream(
  message: string,
  handlers: StreamHandlers,
  options: StreamOptions = {},
): Promise<void> {
  const { conversationId, model, signal } = options;

  const postResponse = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, model, conversationId }),
    signal,
  });

  if (!postResponse.ok) {
    let errorMsg = `Request failed with status ${postResponse.status}`;
    try {
      const body = await postResponse.json();
      if (body.error) errorMsg = body.error;
    } catch { /* use default message */ }
    throw new Error(errorMsg);
  }

  const { conversationId: jobConversationId } = await postResponse.json();
  handlers.onConversation(jobConversationId);

  await connectToEvents(jobConversationId, handlers, signal);
}

// ── React Hook ──────────────────────────────────────────────────────

export interface ToolCallState {
  tool: string;
  status: 'running' | 'done';
}

export interface UseStreamingChatOptions {
  onComplete: (text: string, sessionId: string, toolCalls: string[]) => void;
  onConversation?: (conversationId: string) => void;
}

export interface UseStreamingChatReturn {
  send: (message: string, conversationId?: string, model?: string) => void;
  reconnect: (conversationId: string) => void;
  streamingText: string;
  toolCalls: ToolCallState[];
  isThinking: boolean;
  isStreaming: boolean;
  error: string | null;
}

export function useStreamingChat(options: UseStreamingChatOptions): UseStreamingChatReturn {
  const [streamingText, setStreamingText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCallState[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolCallsRef = useRef<ToolCallState[]>([]);
  const onCompleteRef = useRef(options.onComplete);
  onCompleteRef.current = options.onComplete;
  const onConversationRef = useRef(options.onConversation);
  onConversationRef.current = options.onConversation;

  function createHandlers(): StreamHandlers {
    return {
      onTextDelta: (text) => {
        setStreamingText((prev) => prev + text);
        setIsThinking(false);
      },
      onToolStart: (tool) => {
        const entry: ToolCallState = { tool, status: 'running' };
        toolCallsRef.current = [...toolCallsRef.current, entry];
        setToolCalls(toolCallsRef.current);
        setIsThinking(false);
      },
      onToolEnd: (tool) => {
        let found = false;
        toolCallsRef.current = toolCallsRef.current.map(tc => {
          if (!found && tc.tool === tool && tc.status === 'running') {
            found = true;
            return { ...tc, status: 'done' as const };
          }
          return tc;
        });
        setToolCalls([...toolCallsRef.current]);
      },
      onThinking: () => setIsThinking(true),
      onDone: (text, sid) => {
        const tools = toolCallsRef.current.map(tc => tc.tool);
        setToolCalls([]);
        toolCallsRef.current = [];
        setIsThinking(false);
        setIsStreaming(false);
        onCompleteRef.current(text, sid, tools);
      },
      onError: (msg) => {
        setError(msg);
        setIsThinking(false);
        setIsStreaming(false);
      },
      onSession: () => {},
      onConversation: (id) => onConversationRef.current?.(id),
    };
  }

  function resetState() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');
    setToolCalls([]);
    toolCallsRef.current = [];
    setIsThinking(true);
    setError(null);
    setIsStreaming(true);
    return controller;
  }

  function send(message: string, conversationId?: string, model?: string) {
    const controller = resetState();
    const handlers = createHandlers();

    processStream(message, handlers, { conversationId, model, signal: controller.signal }).catch(
      (err) => {
        if (controller.signal.aborted) return;
        setIsStreaming(false);
        setIsThinking(false);
        setError(err instanceof Error ? err.message : 'Chat request failed');
      },
    );
  }

  function reconnect(conversationId: string) {
    const controller = resetState();
    const handlers = createHandlers();

    connectToEvents(conversationId, handlers, controller.signal).catch(
      (err) => {
        if (controller.signal.aborted) return;
        setIsStreaming(false);
        setIsThinking(false);
        setError(err instanceof Error ? err.message : 'Failed to reconnect to chat');
      },
    );
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { send, reconnect, streamingText, toolCalls, isThinking, isStreaming, error };
}
