import { useQuery } from "@tanstack/react-query";
import { providersClient } from "@/lib/providersClient";
import { CACHE_DURATIONS } from "@faster-chat/shared";
import { useUiState } from "@/state/useUiState";

export function usePreferredModel() {
  const preferredModel = useUiState((state) => state.preferredModel);
  const setPreferredModel = useUiState((state) => state.setPreferredModel);

  const { data, isLoading } = useQuery({
    queryKey: ["models", "text"],
    queryFn: () => providersClient.getEnabledModelsByType("text"),
    staleTime: CACHE_DURATIONS.IMAGE_MODELS,
  });

  const models = data?.models || [];
  // A stored preference only counts while it is still an enabled model — otherwise
  // fall back the same way the selector displays it, so sent and shown agree
  const model =
    models.find((m) => m.model_id === preferredModel) ||
    models.find((m) => m.is_default) ||
    models[0];

  return {
    modelId: model?.model_id ?? preferredModel,
    model,
    models,
    isLoading,
    setModel: setPreferredModel,
  };
}
