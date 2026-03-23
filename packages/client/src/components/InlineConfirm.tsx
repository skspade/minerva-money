import { useState, useEffect, useCallback } from 'react';

interface InlineConfirmProps {
  message: string;
  onConfirm: () => void;
  children: React.ReactNode;
}

export default function InlineConfirm({ message, onConfirm, children }: InlineConfirmProps) {
  const [confirming, setConfirming] = useState(false);

  const reset = useCallback(() => setConfirming(false), []);

  useEffect(() => {
    if (!confirming) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') reset();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [confirming, reset]);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <span className="text-gray-700">{message}</span>
        <button
          onClick={() => {
            onConfirm();
            reset();
          }}
          className="text-red-600 hover:text-red-800 font-medium"
        >
          Delete
        </button>
        <button
          onClick={reset}
          className="text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span onClick={() => setConfirming(true)}>
      {children}
    </span>
  );
}
