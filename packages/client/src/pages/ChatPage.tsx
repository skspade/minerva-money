import { useState } from 'react';

const exampleQuestions = [
  "What's my account balance?",
  "How much did I spend on groceries this month?",
  "Show my budget summary",
  "Any uncategorized transactions?",
];

export default function ChatPage() {
  const [input, setInput] = useState('');

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    // Message flow wired in Plan 02
  }

  function handleExampleClick(question: string) {
    setInput(question);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="h-[calc(100vh-56px)] -mx-4 -mt-6 flex flex-col">
      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4">
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
                onClick={() => handleExampleClick(q)}
                className="px-4 py-2 text-sm rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-3xl flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your finances..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
