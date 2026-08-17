import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEditResubmit } from "@/hooks/useEditResubmit";
import { useUiState } from "@/state/useUiState";
import { chatsClient } from "@/lib/chatsClient";

vi.mock("@/lib/chatsClient", () => ({
  chatsClient: { rewindMessage: vi.fn() },
}));

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (selector) => selector({ user: { id: 7 } }),
}));

const navigateToChat = vi.fn();
vi.mock("@/hooks/useChatNavigation", () => ({
  useChatNavigation: () => ({ navigateToChat }),
}));

const CHAT_ID = "chat-1";
const TARGET = { messageId: "m3", content: "corrected question", fileIds: ["file-1"] };

describe("useEditResubmit", () => {
  let queryClient, resetStream;

  beforeEach(() => {
    vi.clearAllMocks();
    useUiState.getState().clearPendingResubmit();
    resetStream = vi.fn();
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  });

  function setup() {
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useEditResubmit({ chatId: CHAT_ID, resetStream }), { wrapper });
  }

  test("replace queues the resubmit in the same chat without navigating", async () => {
    chatsClient.rewindMessage.mockResolvedValue({ chatId: CHAT_ID, removedCount: 2 });
    const { result } = setup();

    await act(() => result.current.resubmitEdit(TARGET, "replace"));

    expect(chatsClient.rewindMessage).toHaveBeenCalledWith(CHAT_ID, "m3", "replace");
    expect(useUiState.getState().pendingResubmit).toEqual({
      chatId: CHAT_ID,
      content: "corrected question",
      fileIds: ["file-1"],
    });
    expect(navigateToChat).not.toHaveBeenCalled();
  });

  test("copy queues the resubmit in the new chat and navigates there", async () => {
    chatsClient.rewindMessage.mockResolvedValue({ chatId: "chat-copy", removedCount: 0 });
    const { result } = setup();

    await act(() => result.current.resubmitEdit(TARGET, "copy"));

    expect(useUiState.getState().pendingResubmit.chatId).toBe("chat-copy");
    expect(navigateToChat).toHaveBeenCalledWith("chat-copy");
  });

  test("clears the stream's own message list so rewound turns are not re-sent", async () => {
    chatsClient.rewindMessage.mockResolvedValue({ chatId: CHAT_ID, removedCount: 2 });
    const { result } = setup();

    await act(() => result.current.resubmitEdit(TARGET, "replace"));

    expect(resetStream).toHaveBeenCalledTimes(1);
  });

  test("queues nothing when the rewind fails", async () => {
    chatsClient.rewindMessage.mockRejectedValue(new Error("boom"));
    const { result } = setup();

    await act(async () => {
      await expect(result.current.resubmitEdit(TARGET, "replace")).rejects.toThrow("boom");
    });

    expect(useUiState.getState().pendingResubmit).toBeNull();
    expect(resetStream).not.toHaveBeenCalled();
    expect(navigateToChat).not.toHaveBeenCalled();
  });
});
