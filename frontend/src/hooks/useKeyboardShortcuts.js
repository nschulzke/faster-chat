import { useEffect } from "@preact/compat";
import { useUiState } from "@/state/useUiState";
import { useChatNavigation } from "./useChatNavigation";
import { useCreateChatMutation } from "./useChatsQuery";
import { useIsMobile } from "./useIsMobile";
import { getShortcut } from "@faster-chat/shared";

/**
 * Global keyboard shortcuts hook.
 * Shortcut definitions live in @faster-chat/shared/constants/shortcuts.js
 */
export function useKeyboardShortcuts() {
  const { navigateToChat } = useChatNavigation();
  const createChatMutation = useCreateChatMutation();
  const isMobile = useIsMobile();

  const toggleSidebar = useUiState((state) => state.toggleSidebar);
  const toggleSidebarCollapse = useUiState((state) => state.toggleSidebarCollapse);
  const sidebarCollapsed = useUiState((state) => state.sidebarCollapsed);
  const setSearchOpen = useUiState((state) => state.setSearchOpen);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle sidebar - Ctrl+B
      if (getShortcut("toggleSidebar").check(e)) {
        e.preventDefault();
        if (isMobile) {
          toggleSidebar();
        } else {
          toggleSidebarCollapse();
        }
        return;
      }

      // New chat - Ctrl+Shift+O
      if (getShortcut("newChat").check(e)) {
        e.preventDefault();
        createChatMutation.mutateAsync({}).then((newChat) => {
          navigateToChat(newChat.id);
          if (!isMobile && sidebarCollapsed) {
            toggleSidebarCollapse();
          }
        });
        return;
      }

      // Open search - Ctrl+K
      if (getShortcut("focusSearch").check(e)) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isMobile,
    sidebarCollapsed,
    toggleSidebar,
    toggleSidebarCollapse,
    setSearchOpen,
    navigateToChat,
    createChatMutation,
  ]);
}
