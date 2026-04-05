import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStreamingChat } from '../hooks/useStreamingChat';
import { getToolLabel } from '../utils/tool-labels';
import ConversationSidebar from '../components/ConversationSidebar';
import { History } from 'lucide-react';

type MessageRole = 'user' | 'assistant' | 'error';

interface ChatMessage {
  role: MessageRole;
  content: string;
  confirmation: Confirmation | null;
}

interface Confirmation {
  action: string;
  description: string;
}

const exampleQuestions = [
  "What's my account balance?",
  "How much did I spend on groceries this month?",
  "Show my budget summary",
  "Any uncategorized transactions?",
];

function parseConfirmation(content: string): {
  textContent: string;
  confirmation: Confirmation | null;
} {
  const match = content.match(/```json\s*\n(\{[\s\S]*?"type"\s*:\s*"confirmation"[\s\S]*?\})\s*\n```/);
  if (!match) return { textContent: content, confirmation: null };

  try {
    const parsed = JSON.parse(match[1]);
    const textContent = content.replace(match[0], '').trim();
    return {
      textContent,
      confirmation: {
        action: parsed.action || '',
        description: parsed.description || '',
      },
    };
  } catch {
    return { textContent: content, confirmation: null };
  }
}

export default function ChatPage() {
  const { conversationId: urlConversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(urlConversationId);
  const [respondedConfirmations, setRespondedConfirmations] = useState<Set<number>>(new Set());
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-20250514');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: models } = useQuery(trpc.agent.models.queryOptions());

  // Fetch conversation data when URL has a conversationId
  const { data: conversation, error: convError, isLoading: convLoading } = useQuery(
    trpc.chatHistory.get.queryOptions(
      { conversationId: urlConversationId! },
      { enabled: !!urlConversationId },
    ),
  );

  // Redirect on invalid conversation ID (NOT_FOUND from tRPC)
  useEffect(() => {
    if (convError) {
      navigate('/chat', { replace: true });
    }
  }, [convError, navigate]);

  // Load conversation messages when data arrives
  useEffect(() => {
    if (!conversation) return;
    const loadedMessages: ChatMessage[] = conversation.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        if (m.role === 'assistant') {
          const { textContent, confirmation } = parseConfirmation(m.content);
          return { role: 'assistant' as const, content: textContent, confirmation };
        }
        return { role: m.role as MessageRole, content: m.content, confirmation: null };
      });
    setMessages(loadedMessages);
    setSelectedModel(conversation.model);
    // Mark all loaded confirmations as already responded (historical confirmations are display-only)
    const confirmedIndices = new Set(
      loadedMessages
        .map((m, i) => m.confirmation ? i : -1)
        .filter(i => i >= 0),
    );
    setRespondedConfirmations(confirmedIndices);
    setConversationId(conversation.id);
  }, [conversation]);

  // Handle conversation switch via browser back/forward
  useEffect(() => {
    if (urlConversationId !== conversationId) {
      setMessages([]);
      setRespondedConfirmations(new Set());
      setConversationId(urlConversationId);
    }
    if (!urlConversationId) {
      // Navigated back to /chat — clear everything for fresh chat
      setMessages([]);
      setRespondedConfirmations(new Set());
      setConversationId(undefined);
    }
  }, [urlConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onComplete = useCallback((text: string, _sessionId: string) => {
    const { textContent, confirmation } = parseConfirmation(text);
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: textContent, confirmation },
    ]);
  }, []);

  const onConversation = useCallback((newConversationId: string) => {
    setConversationId(newConversationId);
    navigate(`/chat/${newConversationId}`, { replace: true });
    // Pre-invalidate chatHistory.list so Phase 56 sidebar sees new conversations
    queryClient.invalidateQueries({ queryKey: trpc.chatHistory.list.queryKey() });
  }, [navigate, queryClient, trpc.chatHistory.list]);

  const { send, streamingText, activeTool, isStreaming, error } = useStreamingChat({ onComplete, onConversation });

  // Append error messages reactively
  useEffect(() => {
    if (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: error, confirmation: null },
      ]);
    }
  }, [error]);

  // Detect user scroll-up
  useEffect(() => {
    const container = messageContainerRef.current;
    if (!container) return;
    function handleScroll() {
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 50;
      userScrolledUpRef.current = !nearBottom;
    }
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll during streaming (if user hasn't scrolled up)
  useEffect(() => {
    if (!isStreaming || userScrolledUpRef.current) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [streamingText, isStreaming]);

  // Always scroll when new messages added (user sent or response completed)
  useEffect(() => {
    userScrolledUpRef.current = false;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend(text?: string) {
    const messageText = text ?? input.trim();
    if (!messageText) return;
    if (!text) setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: messageText, confirmation: null },
    ]);
    send(messageText, conversationId, selectedModel);
  }

  function handleConfirm(index: number) {
    setRespondedConfirmations((prev) => new Set(prev).add(index));
    handleSend('Yes, confirm');
  }

  function handleCancel(index: number) {
    setRespondedConfirmations((prev) => new Set(prev).add(index));
    handleSend('No, cancel');
  }

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedModel(e.target.value);
    setMessages([]);
    setConversationId(undefined);
    setRespondedConfirmations(new Set());
    navigate('/chat', { replace: true });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed inset-0 top-0 md:top-[56px] bottom-[calc(env(safe-area-inset-bottom)+60px)] md:bottom-0 flex bg-surface-alt z-10">
      {/* Desktop sidebar - always visible on md+ */}
      <div className="hidden md:flex md:flex-col md:min-w-[280px] md:max-w-[280px] border-r border-border bg-surface overflow-y-auto">
        <ConversationSidebar
          conversationId={conversationId}
          isStreaming={isStreaming}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar panel */}
          <div className="absolute inset-y-0 left-0 w-[280px] bg-surface shadow-xl overflow-y-auto">
            <ConversationSidebar
              conversationId={conversationId}
              isStreaming={isStreaming}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with history toggle */}
        <div className="flex items-center px-3 py-2 border-b border-border bg-surface md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-lg hover:bg-surface-secondary text-text-secondary"
            aria-label="Open conversation history"
          >
            <History size={20} />
          </button>
          <span className="ml-2 text-sm font-medium text-text-primary truncate">
            {conversationId ? 'Chat' : 'New Chat'}
          </span>
        </div>

        {/* Message area */}
        <div ref={messageContainerRef} className="flex-1 overflow-y-auto overscroll-contain p-4">
        {convLoading && urlConversationId ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h2 className="text-2xl font-semibold text-text-primary mb-2">
              Ask Minerva anything about your finances
            </h2>
            <p className="text-text-secondary mb-6">
              Get instant answers about balances, spending, budgets, and more.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {exampleQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={isStreaming}
                  className="px-4 py-2 text-sm rounded-full border border-border-heavy text-text-primary hover:bg-surface-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'user' && (
                  <div className="ml-auto bg-accent text-text-invert rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%]">
                    {msg.content}
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%]">
                    <div className="prose prose-sm max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                    </div>
                    {msg.confirmation && !respondedConfirmations.has(i) && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border items-center">
                        <button
                          onClick={() => handleConfirm(i)}
                          disabled={isStreaming}
                          className="px-4 py-1.5 text-sm rounded-lg bg-success text-text-invert hover:bg-success disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleCancel(i)}
                          disabled={isStreaming}
                          className="px-4 py-1.5 text-sm rounded-lg bg-surface-tertiary text-text-primary hover:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                        <span className="text-sm text-text-secondary">
                          {msg.confirmation.description}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {msg.role === 'error' && (
                  <div className="bg-danger-light border border-danger text-danger rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%]">
                    <span className="font-medium">Error: </span>
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            {/* Live streaming bubble */}
            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%]">
                  <div className="prose prose-sm max-w-none">
                    <Markdown remarkPlugins={[remarkGfm]}>{streamingText}</Markdown>
                  </div>
                  {activeTool && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-text-tertiary italic">
                      <span className="inline-block w-1.5 h-1.5 bg-text-tertiary rounded-full animate-pulse" />
                      {getToolLabel(activeTool)}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Tool activity indicator before first text token */}
            {isStreaming && !streamingText && activeTool && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-text-tertiary italic">
                  <span className="inline-block w-1.5 h-1.5 bg-text-tertiary rounded-full animate-pulse" />
                  {getToolLabel(activeTool)}
                </div>
              </div>
            )}
            {/* Bouncing dots — only before first text token and no tool active */}
            {isStreaming && !streamingText && !activeTool && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 px-4 py-3">
                  <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-surface px-4 pt-3 pb-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {/* Model selector row */}
          <div className="flex items-center gap-3">
            <select
              value={selectedModel}
              onChange={handleModelChange}
              disabled={isStreaming}
              className="rounded-lg border border-border-heavy text-base md:text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(models ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <span className="text-xs text-text-secondary">
              {models?.find((m) => m.id === selectedModel)?.description ?? ''}
            </span>
          </div>
          {/* Input row */}
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your finances..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-lg border border-border-heavy px-4 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              className="px-4 py-2 rounded-lg bg-accent text-text-invert text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      </div>{/* end chat area */}
    </div>
  );
}
