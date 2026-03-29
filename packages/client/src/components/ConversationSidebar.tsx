import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { SquarePen, Pencil, Trash2 } from 'lucide-react';
import {
  formatRelativeTime,
  groupConversationsByRecency,
  getModelBadge,
} from '../utils/chat-sidebar-helpers';

interface ConversationSidebarProps {
  conversationId?: string;
  isStreaming: boolean;
  onClose?: () => void;
}

export default function ConversationSidebar({
  conversationId,
  isStreaming,
  onClose,
}: ConversationSidebarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { data: conversations } = useQuery(trpc.chatHistory.list.queryOptions());

  const updateTitle = useMutation(trpc.chatHistory.updateTitle.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.chatHistory.list.queryKey() });
    },
  }));

  const deleteConversation = useMutation(trpc.chatHistory.delete.mutationOptions({
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.chatHistory.list.queryKey() });
      if (variables.conversationId === conversationId) {
        navigate('/chat');
        onClose?.();
      }
    },
  }));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  function handleNewChat() {
    navigate('/chat');
    onClose?.();
  }

  function handleSelectConversation(id: string) {
    if (isStreaming && id !== conversationId) return;
    navigate(`/chat/${id}`);
    onClose?.();
  }

  function startRename(id: string, title: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(title);
  }

  function saveRename() {
    if (editingId && editTitle.trim() && editTitle.trim() !== getOriginalTitle(editingId)) {
      updateTitle.mutate({ conversationId: editingId, title: editTitle.trim() });
    }
    setEditingId(null);
  }

  function cancelRename() {
    setEditingId(null);
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm('Delete this conversation?')) {
      deleteConversation.mutate({ conversationId: id });
    }
  }

  function getOriginalTitle(id: string): string {
    return conversations?.find(c => c.id === id)?.title ?? '';
  }

  const groups = groupConversationsByRecency(conversations ?? []);

  return (
    <div className="flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-3 pb-1">
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <SquarePen size={16} />
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-1">
        {groups.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-gray-400">
            No conversations yet
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {group.label}
            </div>

            {group.conversations.map((conv) => {
              const isActive = conv.id === conversationId;
              const isDisabled = isStreaming && !isActive;
              const badge = getModelBadge(conv.model);

              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`
                    flex items-center gap-2 w-full pr-2 py-2 rounded-r-lg text-left transition-colors group cursor-pointer
                    ${isActive
                      ? 'bg-blue-50 border-l-2 border-blue-600 pl-[10px]'
                      : 'pl-3 hover:bg-gray-100 border-l-2 border-transparent'
                    }
                    ${isDisabled ? 'opacity-50 pointer-events-none' : ''}
                  `}
                >
                  {/* Title area */}
                  <div className="flex-1 min-w-0">
                    {editingId === conv.id ? (
                      <input
                        className="w-full text-sm border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={saveRename}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <div
                        className="truncate text-sm text-gray-800"
                        title={conv.title}
                      >
                        {conv.title}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                      <span>{formatRelativeTime(conv.updated_at)}</span>
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold ${badge.colorClass}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Action icons */}
                  <div
                    className={`flex items-center gap-0.5 ${
                      isActive ? '' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <button
                      onClick={(e) => startRename(conv.id, conv.title, e)}
                      className="p-1 rounded hover:bg-gray-200"
                      aria-label="Rename conversation"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(conv.id, e)}
                      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
