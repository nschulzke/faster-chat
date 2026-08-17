import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import MessageItem from "@/components/chat/MessageItem";

vi.mock("@/components/markdown/MarkdownRenderer", () => ({
  MarkdownContent: ({ content }) => <div>{content}</div>,
}));

vi.mock("@/components/chat/ModelAvatar", () => ({
  default: () => <div />,
}));

vi.mock("@/components/chat/MessageAttachment", () => ({
  default: ({ fileId }) => <div>{fileId}</div>,
}));

const userMessage = {
  id: "m1",
  role: "user",
  content: "original question",
  parts: [{ type: "text", text: "original question" }],
  fileIds: ["file-1"],
};

const assistantMessage = {
  id: "m2",
  role: "assistant",
  content: "an answer",
  parts: [{ type: "text", text: "an answer" }],
  model: "gpt-4o",
};

describe("MessageItem editing", () => {
  test("offers editing on user messages", () => {
    render(<MessageItem message={userMessage} onEdit={vi.fn()} />);
    expect(screen.getByLabelText("Edit message")).toBeTruthy();
  });

  test("does not offer editing on assistant messages", () => {
    render(<MessageItem message={assistantMessage} onEdit={vi.fn()} />);
    expect(screen.queryByLabelText("Edit message")).toBeNull();
  });

  test("does not offer editing when no handler is passed (streaming)", () => {
    render(<MessageItem message={userMessage} />);
    expect(screen.queryByLabelText("Edit message")).toBeNull();
  });

  test("swaps the message for an editor and reports the edit with its attachments", () => {
    const onEdit = vi.fn();
    render(<MessageItem message={userMessage} onEdit={onEdit} />);

    fireEvent.click(screen.getByLabelText("Edit message"));
    const textarea = screen.getByLabelText("Edit message content");
    expect(textarea.value).toBe("original question");

    fireEvent.input(textarea, { target: { value: "corrected question" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledWith({
      messageId: "m1",
      content: "corrected question",
      fileIds: ["file-1"],
    });
  });

  test("cancelling restores the message untouched", () => {
    const onEdit = vi.fn();
    render(<MessageItem message={userMessage} onEdit={onEdit} />);

    fireEvent.click(screen.getByLabelText("Edit message"));
    fireEvent.input(screen.getByLabelText("Edit message content"), {
      target: { value: "discarded" },
    });
    fireEvent.click(screen.getByText("Cancel"));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("original question")).toBeTruthy();
    expect(screen.queryByLabelText("Edit message content")).toBeNull();
  });
});
