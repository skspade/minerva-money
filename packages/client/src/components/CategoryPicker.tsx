import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc';

interface CategoryPickerProps {
  value: number | null;
  onChange: (categoryId: number | null) => void;
  className?: string;
}

export default memo(function CategoryPicker({ value, onChange, className }: CategoryPickerProps) {
  const trpc = useTRPC();
  const { data: groups } = useQuery(trpc.categories.groups.list.queryOptions());

  return (
    <select
      value={value ?? ''}
      onChange={e => {
        const val = e.target.value;
        onChange(val === '' ? null : parseInt(val, 10));
      }}
      className={`text-base border border-border-heavy rounded px-1 py-0.5 bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent ${className ?? ''}`}
    >
      <option value="">Uncategorized</option>
      {groups?.map(group => (
        <optgroup key={group.id} label={group.name}>
          {group.categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
});
