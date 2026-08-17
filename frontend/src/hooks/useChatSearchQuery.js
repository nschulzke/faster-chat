import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { chatsClient } from "@/lib/chatsClient";
import { useAuthState } from "@/state/useAuthState";
import { useDebouncedValue } from "./useDebouncedValue";
import { chatKeys } from "./queryKeys";

const DEBOUNCE_MS = 150;
const MIN_QUERY_LENGTH = 2;

export function useChatSearchQuery(query) {
  const userId = useAuthState((state) => state.user?.id ?? null);
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const enabled = userId !== null && debounced.length >= MIN_QUERY_LENGTH;

  const { data, isFetching } = useQuery({
    queryKey: chatKeys.search(userId, debounced),
    queryFn: ({ signal }) => chatsClient.searchChats(debounced, { signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return {
    results: enabled ? (data?.results ?? []) : [],
    hasMore: enabled ? !!data?.hasMore : false,
    isSearching: enabled && isFetching,
    isTooShort: query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH,
  };
}
