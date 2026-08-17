import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSidebarState } from "@/hooks/useSidebarState";
import { chatsClient } from "@/lib/chatsClient";

const { navigate, router } = vi.hoisted(() => ({
  navigate: vi.fn(),
  router: { pathname: "/" },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }) => select({ location: { pathname: router.pathname } }),
}));

vi.mock("@/lib/chatsClient", () => ({
  chatsClient: {
    getChats: vi.fn(),
    createChat: vi.fn(),
    deleteChat: vi.fn(),
  },
}));

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (selector) => selector({ user: { id: 7 } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CHATS = [
  { id: "c1", title: "First", updatedAt: 3 },
  { id: "c2", title: "Second", updatedAt: 2 },
];

const noopEvent = { preventDefault: () => {}, stopPropagation: () => {} };

describe("useSidebarState", () => {
  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    router.pathname = "/";
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    chatsClient.getChats.mockResolvedValue(CHATS);
    chatsClient.deleteChat.mockResolvedValue({});
    chatsClient.createChat.mockResolvedValue({ id: "new-chat", title: null, updatedAt: 4 });
  });

  async function setup() {
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const rendered = renderHook(() => useSidebarState(), { wrapper });
    await waitFor(() => expect(rendered.result.current.chats).toBeTruthy());
    return rendered;
  }

  test("deleting the chat you are viewing sends you to the chat list", async () => {
    router.pathname = "/chat/c1";
    const { result } = await setup();

    await act(() => result.current.handleDeleteChat(noopEvent, "c1"));

    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  test("deleting the last chat does not auto-create a replacement", async () => {
    router.pathname = "/chat/c1";
    chatsClient.getChats.mockResolvedValue([CHATS[0]]);
    const { result } = await setup();

    await act(() => result.current.handleDeleteChat(noopEvent, "c1"));

    expect(chatsClient.createChat).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  test("deleting a chat you are not viewing leaves you where you are", async () => {
    router.pathname = "/chat/c2";
    const { result } = await setup();

    await act(() => result.current.handleDeleteChat(noopEvent, "c1"));

    expect(navigate).not.toHaveBeenCalled();
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("New Chat still creates a chat and opens it", async () => {
    const { result } = await setup();

    await act(() => result.current.handleNewChat());

    expect(chatsClient.createChat).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/chat/$chatId", params: { chatId: "new-chat" } })
    );
  });
});
