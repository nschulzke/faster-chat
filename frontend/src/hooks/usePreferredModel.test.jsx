import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePreferredModel } from "@/hooks/usePreferredModel";
import { useUiState } from "@/state/useUiState";
import { providersClient } from "@/lib/providersClient";

vi.mock("@/lib/providersClient", () => ({
  providersClient: { getEnabledModelsByType: vi.fn() },
}));

const ENABLED_MODELS = [
  { model_id: "claude-sonnet-5", display_name: "Sonnet 5", is_default: true },
  { model_id: "gpt-5.1-flagship", display_name: "GPT-5.1", is_default: false },
];

describe("usePreferredModel", () => {
  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    providersClient.getEnabledModelsByType.mockResolvedValue({ models: ENABLED_MODELS });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function setup(storedPreference) {
    useUiState.getState().setPreferredModel(storedPreference);
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => usePreferredModel(), { wrapper });
  }

  test("keeps a stored preference that is still enabled", async () => {
    const { result } = setup("gpt-5.1-flagship");

    await waitFor(() => expect(result.current.models).toHaveLength(2));
    expect(result.current.modelId).toBe("gpt-5.1-flagship");
  });

  test("falls back to the configured default when the stored preference is not enabled", async () => {
    // A preference left over from a previous install, or the shipped placeholder
    const { result } = setup("claude-sonnet-4-5");

    await waitFor(() => expect(result.current.models).toHaveLength(2));
    expect(result.current.modelId).toBe("claude-sonnet-5");
  });

  test("uses the configured default when nothing is stored yet", async () => {
    const { result } = setup(null);

    await waitFor(() => expect(result.current.models).toHaveLength(2));
    expect(result.current.modelId).toBe("claude-sonnet-5");
  });

  test("falls back to the first enabled model when none is marked default", async () => {
    providersClient.getEnabledModelsByType.mockResolvedValue({
      models: [
        { model_id: "ollama-llama", display_name: "Llama", is_default: false },
        { model_id: "gpt-4o", display_name: "GPT-4o", is_default: false },
      ],
    });
    const { result } = setup("claude-sonnet-4-5");

    await waitFor(() => expect(result.current.models).toHaveLength(2));
    expect(result.current.modelId).toBe("ollama-llama");
  });

  test("exposes the resolved model's record, not the stale one", async () => {
    const { result } = setup("claude-sonnet-4-5");

    await waitFor(() => expect(result.current.models).toHaveLength(2));
    expect(result.current.model?.display_name).toBe("Sonnet 5");
  });

  test("holds the stored preference until the model list arrives", () => {
    const { result } = setup("gpt-5.1-flagship");

    expect(result.current.modelId).toBe("gpt-5.1-flagship");
  });
});
