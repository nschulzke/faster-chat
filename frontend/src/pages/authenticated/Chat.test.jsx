import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Chat from "@/pages/authenticated/Chat";
import { chatsClient } from "@/lib/chatsClient";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
}));

vi.mock("@/lib/chatsClient", () => ({
  chatsClient: {
    getChat: vi.fn(),
    createChat: vi.fn(),
  },
}));

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (selector) => selector({ user: { id: 7 } }),
}));

vi.mock("@/state/useAppSettings", () => ({
  useAppSettingsQuery: () => ({ data: { appName: "Faster Chat" } }),
}));

vi.mock("@/components/chat/ChatInterface", () => ({
  default: ({ chatId }) => <div data-testid="chat-interface">{chatId}</div>,
}));

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

describe("Chat page", () => {
  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    chatsClient.createChat.mockResolvedValue({ id: "new-chat" });
  });

  function renderChat(chatId = "c1") {
    return render(
      <QueryClientProvider client={queryClient}>
        <Chat chatId={chatId} />
      </QueryClientProvider>
    );
  }

  test("sends you to the chat list when the chat is gone, without creating one", async () => {
    chatsClient.getChat.mockRejectedValue(httpError("Chat not found", 404));

    renderChat();

    await waitFor(() => expect(screen.getByTestId("navigate")).toBeTruthy());
    expect(screen.getByTestId("navigate").textContent).toBe("/");
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("surfaces other load failures instead of creating a chat", async () => {
    chatsClient.getChat.mockRejectedValue(httpError("Server unreachable (500)", 500));

    renderChat();

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Server unreachable (500)")).toBeTruthy();
    expect(screen.queryByTestId("navigate")).toBeNull();
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("renders the chat when it loads", async () => {
    chatsClient.getChat.mockResolvedValue({ id: "c1", title: "First" });

    renderChat();

    await waitFor(() => expect(screen.getByTestId("chat-interface")).toBeTruthy());
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });
});
