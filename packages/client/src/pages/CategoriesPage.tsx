import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import InlineConfirm from '../components/InlineConfirm';

interface Category {
  id: number;
  name: string;
  sort_order: number;
}

interface CategoryGroup {
  id: number;
  name: string;
  sort_order: number;
  categories: Category[];
}

function InlineEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = text.trim();
      if (trimmed) onSave(trimmed);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="px-2 py-1 border border-accent rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
    />
  );
}

function SortableCategory({
  category,
  onRename,
  onDelete,
}: {
  category: Category;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between py-2 px-4 border-b border-border-light last:border-b-0 bg-surface"
    >
      <div className="flex items-center gap-2 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-text-tertiary hover:text-text-secondary max-md:min-h-[44px] max-md:min-w-[44px] max-md:flex max-md:items-center max-md:justify-center"
          title="Drag to reorder"
        >
          ⠿
        </button>
        {editing ? (
          <InlineEdit
            value={category.name}
            onSave={name => {
              onRename(category.id, name);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            className="text-sm cursor-pointer hover:text-accent"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {category.name}
          </span>
        )}
      </div>
      <InlineConfirm message={`Delete "${category.name}"? Transactions become uncategorized.`} onConfirm={() => onDelete(category.id)}>
        <button className="text-text-tertiary hover:text-danger text-sm ml-2" title="Delete category">✕</button>
      </InlineConfirm>
    </div>
  );
}

function SortableGroup({
  group,
  onRenameGroup,
  onDeleteGroup,
  onRenameCategory,
  onDeleteCategory,
  onReorderCategories,
  onAddCategory,
}: {
  group: CategoryGroup;
  onRenameGroup: (id: number, name: string) => void;
  onDeleteGroup: (id: number) => void;
  onRenameCategory: (id: number, name: string) => void;
  onDeleteCategory: (id: number) => void;
  onReorderCategories: (groupId: number, ids: number[]) => void;
  onAddCategory: (groupId: number, name: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `group-${group.id}` });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = group.categories.findIndex(c => c.id === active.id);
    const newIndex = group.categories.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(group.categories, oldIndex, newIndex);
    onReorderCategories(group.id, reordered.map(c => c.id));
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-surface-alt border-b border-border">
        <div className="flex items-center gap-2 flex-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-text-tertiary hover:text-text-secondary max-md:min-h-[44px] max-md:min-w-[44px] max-md:flex max-md:items-center max-md:justify-center"
            title="Drag to reorder group"
          >
            ⠿
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-text-secondary text-xs w-4"
          >
            {collapsed ? '▸' : '▾'}
          </button>
          {editingName ? (
            <InlineEdit
              value={group.name}
              onSave={name => {
                onRenameGroup(group.id, name);
                setEditingName(false);
              }}
              onCancel={() => setEditingName(false)}
            />
          ) : (
            <span
              className="font-semibold text-sm cursor-pointer hover:text-accent"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {group.name}
            </span>
          )}
          <span className="text-xs text-text-tertiary">({group.categories.length})</span>
        </div>
        <InlineConfirm
          message={group.categories.length > 0 ? `Delete "${group.name}" and ${group.categories.length} categories? Transactions become uncategorized.` : `Delete "${group.name}"?`}
          onConfirm={() => onDeleteGroup(group.id)}
        >
          <button className="text-text-tertiary hover:text-danger text-sm ml-2" title="Delete group">✕</button>
        </InlineConfirm>
      </div>

      {!collapsed && (
        <div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
            <SortableContext items={group.categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {group.categories.map(cat => (
                <SortableCategory
                  key={cat.id}
                  category={cat}
                  onRename={onRenameCategory}
                  onDelete={onDeleteCategory}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="px-4 py-2 border-t border-border-light">
            {addingCategory ? (
              <InlineEdit
                value=""
                onSave={name => {
                  onAddCategory(group.id, name);
                  setAddingCategory(false);
                }}
                onCancel={() => setAddingCategory(false)}
              />
            ) : (
              <button
                onClick={() => setAddingCategory(true)}
                className="text-sm text-accent hover:text-accent-hover"
              >
                + Add Category
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: groups, isLoading, error } = useQuery(trpc.categories.groups.list.queryOptions());

  const [addingGroup, setAddingGroup] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.categories.groups.list.queryKey() });

  const createGroupMut = useMutation(trpc.categories.groups.create.mutationOptions({ onSuccess: invalidate }));
  const renameGroupMut = useMutation(trpc.categories.groups.rename.mutationOptions({ onSuccess: invalidate }));
  const reorderGroupsMut = useMutation(trpc.categories.groups.reorder.mutationOptions({ onSuccess: invalidate }));
  const deleteGroupMut = useMutation(trpc.categories.groups.delete.mutationOptions({ onSuccess: invalidate }));
  const createCategoryMut = useMutation(trpc.categories.create.mutationOptions({ onSuccess: invalidate }));
  const renameCategoryMut = useMutation(trpc.categories.rename.mutationOptions({ onSuccess: invalidate }));
  const reorderCategoriesMut = useMutation(trpc.categories.reorder.mutationOptions({ onSuccess: invalidate }));
  const deleteCategoryMut = useMutation(trpc.categories.delete.mutationOptions({ onSuccess: invalidate }));

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !groups || active.id === over.id) return;

    const activeId = typeof active.id === 'string' ? parseInt(active.id.toString().replace('group-', '')) : active.id;
    const overId = typeof over.id === 'string' ? parseInt(over.id.toString().replace('group-', '')) : over.id;

    const oldIndex = groups.findIndex(g => g.id === activeId);
    const newIndex = groups.findIndex(g => g.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(groups, oldIndex, newIndex);
    reorderGroupsMut.mutate({ ids: reordered.map(g => g.id) });
  };

  if (isLoading) {
    return <p className="text-text-secondary">Loading categories...</p>;
  }

  if (error) {
    return <p className="text-danger">Error loading categories: {error.message}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Categories</h2>
        {addingGroup ? (
          <InlineEdit
            value=""
            onSave={name => {
              createGroupMut.mutate({ name });
              setAddingGroup(false);
            }}
            onCancel={() => setAddingGroup(false)}
          />
        ) : (
          <button
            onClick={() => setAddingGroup(true)}
            className="px-3 py-1.5 bg-accent text-text-invert text-sm rounded hover:bg-accent-hover"
          >
            Add Group
          </button>
        )}
      </div>

      {!groups || groups.length === 0 ? (
        <p className="text-text-secondary">No categories yet. Create your first category group to get started.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
          <SortableContext items={groups.map(g => `group-${g.id}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {groups.map(group => (
                <SortableGroup
                  key={group.id}
                  group={group}
                  onRenameGroup={(id, name) => renameGroupMut.mutate({ id, name })}
                  onDeleteGroup={id => deleteGroupMut.mutate({ id })}
                  onRenameCategory={(id, name) => renameCategoryMut.mutate({ id, name })}
                  onDeleteCategory={id => deleteCategoryMut.mutate({ id })}
                  onReorderCategories={(groupId, ids) => reorderCategoriesMut.mutate({ groupId, ids })}
                  onAddCategory={(groupId, name) => createCategoryMut.mutate({ groupId, name })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
