import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "@/pages/authenticated/Home";
import { chatsClient } from "@/lib/chatsClient";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/lib/chatsClient", () => ({
  chatsClient: {
    getChats: vi.fn(),
    createChat: vi.fn(),
  },
}));

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (selector) => selector({ user: { id: 7 } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const NOW = Date.now();
const CHATS = [
  { id: "c1", title: "Pinned one", updatedAt: NOW, pinnedAt: NOW },
  { id: "c2", title: "Recent one", updatedAt: NOW },
];

describe("Home", () => {
  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    chatsClient.createChat.mockResolvedValue({ id: "new-chat" });
  });

  function renderHome() {
    return render(
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    );
  }

  test("lists chats without navigating away or creating one", async () => {
    chatsClient.getChats.mockResolvedValue(CHATS);

    renderHome();

    await waitFor(() => expect(screen.getByText("Recent one")).toBeTruthy());
    expect(screen.getByText("Pinned one")).toBeTruthy();
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("shows an empty state instead of creating a first chat", async () => {
    chatsClient.getChats.mockResolvedValue([]);

    renderHome();

    await waitFor(() => expect(screen.getByText("No chats yet")).toBeTruthy());
    expect(chatsClient.createChat).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  test("opens the chat you pick", async () => {
    chatsClient.getChats.mockResolvedValue(CHATS);

    renderHome();

    await waitFor(() => expect(screen.getByText("Recent one")).toBeTruthy());
    fireEvent.click(screen.getByText("Recent one"));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/chat/$chatId", params: { chatId: "c2" } })
    );
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("New Chat creates a chat and opens it", async () => {
    chatsClient.getChats.mockResolvedValue(CHATS);

    renderHome();

    await waitFor(() => expect(screen.getByTitle("New Chat")).toBeTruthy());
    fireEvent.click(screen.getByTitle("New Chat"));

    await waitFor(() => expect(chatsClient.createChat).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/chat/$chatId", params: { chatId: "new-chat" } })
    );
  });
});
