import { MessageSquare, PanelLeft, Pin, SquarePen } from "lucide-preact";
import { toast } from "sonner";
import { useChatNavigation } from "@/hooks/useChatNavigation";
import { useChatsQuery, useCreateChatMutation } from "@/hooks/useChatsQuery";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUiState } from "@/state/useUiState";
import { formatRelativeDate } from "@/lib/formatters";

const SectionLabel = ({ children }) => (
  <div className="text-theme-overlay px-2 py-2 text-xs font-bold tracking-widest uppercase opacity-70">
    {children}
  </div>
);

const ChatRow = ({ chat, onClick }) => (
  <button
    onClick={onClick}
    className="hover:bg-theme-surface ease-snappy border-theme-border/50 flex w-full items-center gap-3 border-b px-2 py-3.5 text-left transition-colors duration-75 last:border-b-0">
    {chat.pinnedAt ? (
      <Pin size={16} className="text-theme-accent shrink-0 fill-current" />
    ) : (
      <MessageSquare size={16} className="text-theme-text-muted shrink-0" />
    )}
    <span className="text-theme-text min-w-0 flex-1 truncate font-medium">
      {chat.title || "New Chat"}
    </span>
    <span className="text-theme-text-muted shrink-0 text-xs">
      {formatRelativeDate(chat.updatedAt || chat.createdAt)}
    </span>
  </button>
);

const EmptyState = ({ onNewChat }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
    <div className="bg-theme-surface rounded-full p-4">
      <MessageSquare size={32} className="text-theme-text-muted" />
    </div>
    <div className="text-center">
      <h3 className="text-theme-text mb-1 text-lg font-medium">No chats yet</h3>
      <p className="text-theme-text-muted text-sm">Start your first conversation</p>
    </div>
    <button
      onClick={onNewChat}
      className="btn btn-primary flex items-center gap-2 rounded-xl px-4 py-2.5 font-medium shadow-lg">
      <SquarePen size={18} />
      New Chat
    </button>
  </div>
);

export default function Home() {
  const { data: chats, isLoading } = useChatsQuery();
  const createChatMutation = useCreateChatMutation();
  const { navigateToChat } = useChatNavigation();

  const sidebarCollapsed = useUiState((state) => state.sidebarCollapsed);
  const toggleSidebarCollapse = useUiState((state) => state.toggleSidebarCollapse);
  const toggleSidebar = useUiState((state) => state.toggleSidebar);
  const isMobile = useIsMobile();

  const pinnedChats = (chats ?? []).filter((chat) => chat.pinnedAt);
  const recentChats = (chats ?? []).filter((chat) => !chat.pinnedAt);

  const handleNewChat = async () => {
    try {
      const newChat = await createChatMutation.mutateAsync({});
      navigateToChat(newChat.id);
    } catch (err) {
      toast.error(err.message || "Failed to create chat");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-6 pt-8">
        <div className="flex items-center gap-3 pb-6">
          {(isMobile || sidebarCollapsed) && (
            <button
              onClick={isMobile ? toggleSidebar : toggleSidebarCollapse}
              className="text-theme-text-muted hover:text-theme-text hover:bg-theme-surface ease-snappy -ml-2 rounded-lg p-2 transition-colors"
              title="Open sidebar">
              <PanelLeft size={20} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-theme-text truncate text-2xl font-bold">All Chats</h1>
            <p className="text-theme-text-muted mt-0.5 text-sm">Pick up where you left off</p>
          </div>

          <button
            onClick={handleNewChat}
            disabled={createChatMutation.isPending}
            className="btn btn-primary flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 font-medium shadow-lg disabled:opacity-60"
            title="New Chat">
            <SquarePen size={18} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="text-theme-text-muted">Loading chats...</div>
            </div>
          ) : pinnedChats.length > 0 || recentChats.length > 0 ? (
            <div className="pb-8">
              {pinnedChats.length > 0 && (
                <>
                  <SectionLabel>Pinned</SectionLabel>
                  <div className="mb-4">
                    {pinnedChats.map((chat) => (
                      <ChatRow key={chat.id} chat={chat} onClick={() => navigateToChat(chat.id)} />
                    ))}
                  </div>
                </>
              )}

              {recentChats.length > 0 && (
                <>
                  <SectionLabel>Recent</SectionLabel>
                  <div>
                    {recentChats.map((chat) => (
                      <ChatRow key={chat.id} chat={chat} onClick={() => navigateToChat(chat.id)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <EmptyState onNewChat={handleNewChat} />
          )}
        </div>
      </div>
    </div>
  );
}
