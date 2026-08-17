import { useChatNavigation } from "@/hooks/useChatNavigation";
import { useRewindMessageMutation } from "@/hooks/useChatsQuery";
import { useUiState } from "@/state/useUiState";

export function useEditResubmit({ chatId, resetStream }) {
  const rewindMessageMutation = useRewindMessageMutation();
  const setPendingResubmit = useUiState((state) => state.setPendingResubmit);
  const { navigateToChat } = useChatNavigation();

  async function resubmitEdit(target, mode) {
    if (rewindMessageMutation.isPending) {
      return;
    }

    const result = await rewindMessageMutation.mutateAsync({
      chatId,
      messageId: target.messageId,
      mode,
    });

    resetStream();
    setPendingResubmit({
      chatId: result.chatId,
      content: target.content,
      fileIds: target.fileIds,
    });

    if (result.chatId !== chatId) {
      navigateToChat(result.chatId);
    }
  }

  return { resubmitEdit, isPending: rewindMessageMutation.isPending };
}
