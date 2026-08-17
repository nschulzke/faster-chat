import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRewindMessageMutation } from "@/hooks/useChatsQuery";
import { chatKeys } from "@/hooks/queryKeys";
import { chatsClient } from "@/lib/chatsClient";

vi.mock("@/lib/chatsClient", () => ({
  chatsClient: { rewindMessage: vi.fn() },
}));

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (selector) => selector({ user: { id: 7 } }),
}));

const USER_ID = 7;
const CHAT_ID = "chat-1";
const CACHED = [
  { id: "m1", role: "user", content: "first question" },
  { id: "m2", role: "assistant", content: "first answer" },
  { id: "m3", role: "user", content: "second question" },
  { id: "m4", role: "assistant", content: "second answer" },
];

describe("useRewindMessageMutation", () => {
  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(chatKeys.messages(USER_ID, CHAT_ID), CACHED);
  });

  function setup() {
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useRewindMessageMutation(), { wrapper });
  }

  function cachedMessages() {
    return queryClient.getQueryData(chatKeys.messages(USER_ID, CHAT_ID));
  }

  test("replace mode drops the edited message and everything after it", async () => {
    chatsClient.rewindMessage.mockResolvedValue({ chatId: CHAT_ID, removedCount: 2 });
    const { result } = setup();

    await act(() =>
      result.current.mutateAsync({ chatId: CHAT_ID, messageId: "m3", mode: "replace" })
    );

    expect(cachedMessages().map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  test("copy mode leaves the source chat's cached messages alone", async () => {
    chatsClient.rewindMessage.mockResolvedValue({ chatId: "chat-copy", removedCount: 0 });
    const { result } = setup();

    await act(() => result.current.mutateAsync({ chatId: CHAT_ID, messageId: "m3", mode: "copy" }));

    expect(cachedMessages().map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  test("leaves the cache untouched when the message is not cached", async () => {
    chatsClient.rewindMessage.mockResolvedValue({ chatId: CHAT_ID, removedCount: 0 });
    const { result } = setup();

    await act(() =>
      result.current.mutateAsync({ chatId: CHAT_ID, messageId: "unknown", mode: "replace" })
    );

    expect(cachedMessages()).toHaveLength(4);
  });

  test("does not trim the cache when the request fails", async () => {
    chatsClient.rewindMessage.mockRejectedValue(new Error("boom"));
    const { result } = setup();

    await act(async () => {
      await expect(
        result.current.mutateAsync({ chatId: CHAT_ID, messageId: "m3", mode: "replace" })
      ).rejects.toThrow("boom");
    });

    expect(cachedMessages()).toHaveLength(4);
  });
});
