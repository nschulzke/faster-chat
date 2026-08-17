import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IndexRouteGuard } from "@/components/layout/IndexRouteGuard";
import { chatsClient } from "@/lib/chatsClient";

const { navigate, auth } = vi.hoisted(() => ({
  navigate: vi.fn(),
  auth: { user: { id: 7, role: "user" } },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/lib/chatsClient", () => ({
  chatsClient: { getChats: vi.fn(), createChat: vi.fn() },
}));

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (selector) => (selector ? selector(auth) : auth),
}));

vi.mock("@/pages/authenticated/Home", () => ({
  default: () => <div data-testid="home" />,
}));

describe("IndexRouteGuard", () => {
  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    auth.user = { id: 7, role: "user" };
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  function renderGuard() {
    return render(
      <QueryClientProvider client={queryClient}>
        <IndexRouteGuard />
      </QueryClientProvider>
    );
  }

  test("renders the chat list instead of redirecting into a chat", async () => {
    chatsClient.getChats.mockResolvedValue([{ id: "c1", title: "First", updatedAt: 1 }]);

    renderGuard();

    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("renders the chat list for a user with no chats, creating nothing", async () => {
    chatsClient.getChats.mockResolvedValue([]);

    renderGuard();

    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("still sends a fresh admin to the connections onboarding", async () => {
    auth.user = { id: 7, role: "admin" };
    chatsClient.getChats.mockResolvedValue([]);

    renderGuard();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/admin",
        search: { tab: "connections" },
        replace: true,
      })
    );
    expect(chatsClient.createChat).not.toHaveBeenCalled();
  });

  test("does not repeat the admin onboarding once it has been seen", async () => {
    auth.user = { id: 7, role: "admin" };
    chatsClient.getChats.mockResolvedValue([]);

    renderGuard();
    await waitFor(() => expect(navigate).toHaveBeenCalled());

    navigate.mockClear();
    queryClient.clear();
    renderGuard();

    await waitFor(() => expect(screen.getAllByTestId("home").length).toBeGreaterThan(0));
    expect(navigate).not.toHaveBeenCalled();
  });
});
