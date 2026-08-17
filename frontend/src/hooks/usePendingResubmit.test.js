import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { usePendingResubmit } from "@/hooks/usePendingResubmit";
import { useUiState } from "@/state/useUiState";

const PENDING = { chatId: "chat-1", content: "edited text", fileIds: ["file-1"] };

describe("usePendingResubmit", () => {
  beforeEach(() => {
    useUiState.getState().clearPendingResubmit();
  });

  function setup({ chatId = "chat-1", isMessagesLoading = false } = {}) {
    const submitMessage = vi.fn();
    const view = renderHook((props) => usePendingResubmit({ submitMessage, ...props }), {
      initialProps: { chatId, isMessagesLoading },
    });
    return { submitMessage, view };
  }

  test("resubmits the queued edit and clears it", () => {
    const { submitMessage } = setup();

    act(() => useUiState.getState().setPendingResubmit(PENDING));

    expect(submitMessage).toHaveBeenCalledWith({
      content: "edited text",
      fileIds: ["file-1"],
    });
    expect(useUiState.getState().pendingResubmit).toBeNull();
  });

  test("clears the queue before submitting, so a re-entrant render cannot send twice", () => {
    let queuedDuringSubmit;
    const submitMessage = vi.fn(() => {
      queuedDuringSubmit = useUiState.getState().pendingResubmit;
    });
    const view = renderHook((props) => usePendingResubmit({ submitMessage, ...props }), {
      initialProps: { chatId: "chat-1", isMessagesLoading: false },
    });

    act(() => useUiState.getState().setPendingResubmit(PENDING));
    view.rerender({ chatId: "chat-1", isMessagesLoading: false });

    expect(queuedDuringSubmit).toBeNull();
    expect(submitMessage).toHaveBeenCalledTimes(1);
  });

  test("ignores a resubmit queued for a different chat", () => {
    const { submitMessage } = setup({ chatId: "chat-2" });

    act(() => useUiState.getState().setPendingResubmit(PENDING));

    expect(submitMessage).not.toHaveBeenCalled();
    expect(useUiState.getState().pendingResubmit).toEqual(PENDING);
  });

  test("waits for the message history to load", () => {
    const { submitMessage, view } = setup({ isMessagesLoading: true });

    act(() => useUiState.getState().setPendingResubmit(PENDING));
    expect(submitMessage).not.toHaveBeenCalled();

    view.rerender({ chatId: "chat-1", isMessagesLoading: false });
    expect(submitMessage).toHaveBeenCalledTimes(1);
  });

  test("does nothing when nothing is queued", () => {
    const { submitMessage, view } = setup();

    view.rerender({ chatId: "chat-1", isMessagesLoading: false });

    expect(submitMessage).not.toHaveBeenCalled();
  });
});
