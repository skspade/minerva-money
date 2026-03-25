import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [respondedConfirmations, setRespondedConfirmations] = useState<Set<number>>(new Set());
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-20250514');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const trpc = useTRPC();
  const { data: models } = useQuery(trpc.agent.models.queryOptions());

  const chatMutation = useMutation(
    trpc.agent.chat.mutationOptions({
      onSuccess: (data) => {
        setSessionId(data.sessionId);
        const { textContent, confirmation } = parseConfirmation(data.response);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: textContent, confirmation },
        ]);
      },
      onError: (error) => {
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: error.message, confirmation: null },
        ]);
      },
    }),
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatMutation.isPending]);

  function handleSend(text?: string) {
    const messageText = text ?? input.trim();
    if (!messageText) return;
    if (!text) setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: messageText, confirmation: null },
    ]);
    chatMutation.mutate({ message: messageText, sessionId, model: selectedModel });
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
    setSessionId(undefined);
    setRespondedConfirmations(new Set());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="h-[calc(100dvh-56px)] md:h-[calc(100vh-56px)] -mx-4 -mt-6 flex flex-col">
      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">
              Ask Minerva anything about your finances
            </h2>
            <p className="text-gray-500 mb-6">
              Get instant answers about balances, spending, budgets, and more.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {exampleQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="px-4 py-2 text-sm rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
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
                  <div className="ml-auto bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%]">
                    {msg.content}
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%]">
                    <div className="prose prose-sm max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                    </div>
                    {msg.confirmation && !respondedConfirmations.has(i) && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 items-center">
                        <button
                          onClick={() => handleConfirm(i)}
                          disabled={chatMutation.isPending}
                          className="px-4 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleCancel(i)}
                          disabled={chatMutation.isPending}
                          className="px-4 py-1.5 text-sm rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                        <span className="text-sm text-gray-500">
                          {msg.confirmation.description}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {msg.role === 'error' && (
                  <div className="bg-red-50 border border-red-300 text-red-800 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%]">
                    <span className="font-medium">Error: </span>
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 px-4 py-3">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl space-y-2">
          {/* Model selector row */}
          <div className="flex items-center gap-3">
            <select
              value={selectedModel}
              onChange={handleModelChange}
              disabled={chatMutation.isPending}
              className="rounded-lg border border-gray-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(models ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
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
              disabled={chatMutation.isPending}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => handleSend()}
              disabled={chatMutation.isPending || !input.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
