import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/preact";

const sdk = { transportOptions: null, messages: [] };

vi.mock("ai", () => ({
  DefaultChatTransport: class {
    constructor(options) {
      sdk.transportOptions = options;
    }
  },
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: sdk.messages,
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    status: "ready",
    error: null,
    stop: vi.fn(),
    clearError: vi.fn(),
    setMessages: (next) => {
      sdk.messages = typeof next === "function" ? next(sdk.messages) : next;
    },
  }),
}));

const { useChatStream } = await import("@/hooks/useChatStream");

function sdkMessage(id, role, text) {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("useChatStream", () => {
  beforeEach(() => {
    sdk.messages = [];
    sdk.transportOptions = null;
  });

  function setup(persistedMessages) {
    return renderHook(() =>
      useChatStream({ chatId: "chat-1", model: "gpt-4o", persistedMessages })
    );
  }

  test("re-sends outgoing messages the cache no longer knows about", () => {
    // This is why reset() exists: after a rewind trims the cache, anything the
    // SDK still holds is treated as new and appended to the request.
    setup([{ id: "m3", role: "user", content: "hola", fileIds: [] }]);

    const { body } = sdk.transportOptions.prepareSendMessagesRequest({
      messages: [sdkMessage("m1", "user", "hello"), sdkMessage("m2", "assistant", "hi there")],
    });

    expect(body.messages.map((m) => m.content)).toEqual(["hola", "hello", "hi there"]);
  });

  test("reset drops the messages the SDK is holding", () => {
    const { result } = setup([{ id: "m3", role: "user", content: "hola", fileIds: [] }]);
    sdk.messages = [sdkMessage("m1", "user", "hello"), sdkMessage("m2", "assistant", "hi there")];

    result.current.reset();

    expect(sdk.messages).toEqual([]);

    const { body } = sdk.transportOptions.prepareSendMessagesRequest({ messages: sdk.messages });
    expect(body.messages.map((m) => m.content)).toEqual(["hola"]);
  });

  test("sends the persisted history for an ordinary send", () => {
    setup([
      { id: "m1", role: "user", content: "hello", fileIds: [] },
      { id: "m2", role: "assistant", content: "hi there", fileIds: [] },
    ]);

    const { body } = sdk.transportOptions.prepareSendMessagesRequest({
      messages: [sdkMessage("m1", "user", "hello"), sdkMessage("m2", "assistant", "hi there")],
    });

    expect(body.messages.map((m) => m.content)).toEqual(["hello", "hi there"]);
  });
});
