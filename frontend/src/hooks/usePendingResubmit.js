import { useEffect } from "preact/hooks";
import { useUiState } from "@/state/useUiState";

// Fires a queued edit resubmit once the rewound (or freshly copied) history is on screen
export function usePendingResubmit({ chatId, isMessagesLoading, submitMessage }) {
  const pendingResubmit = useUiState((state) => state.pendingResubmit);
  const clearPendingResubmit = useUiState((state) => state.clearPendingResubmit);

  useEffect(() => {
    if (!pendingResubmit || pendingResubmit.chatId !== chatId || isMessagesLoading) {
      return;
    }
    clearPendingResubmit();
    submitMessage({ content: pendingResubmit.content, fileIds: pendingResubmit.fileIds });
  }, [pendingResubmit, chatId, isMessagesLoading]);
}
