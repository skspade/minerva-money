import { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../lib/format';

export function AllocationCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (cents: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setText((value / 100).toFixed(2));
    setEditing(true);
  };

  const save = () => {
    const parsed = parseFloat(text);
    if (isNaN(parsed)) {
      setEditing(false);
      return;
    }
    const cents = Math.round(parsed * 100);
    onSave(cents);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      save();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className="w-24 px-2 py-1 border border-blue-400 rounded text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <span
      className="cursor-pointer hover:text-blue-600 hover:underline"
      onClick={startEditing}
      title="Click to edit allocation"
    >
      {formatCurrency(value)}
    </span>
  );
}
