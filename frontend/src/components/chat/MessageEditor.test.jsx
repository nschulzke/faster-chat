import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import MessageEditor from "@/components/chat/MessageEditor";

describe("MessageEditor", () => {
  function setup(initialContent = "original") {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<MessageEditor initialContent={initialContent} onSave={onSave} onCancel={onCancel} />);
    return { onSave, onCancel, textarea: screen.getByLabelText("Edit message content") };
  }

  test("saves the trimmed value on Enter", () => {
    const { onSave, textarea } = setup();
    fireEvent.input(textarea, { target: { value: "  edited  " } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("edited");
  });

  test("Shift+Enter does not save", () => {
    const { onSave, textarea } = setup();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  test("Escape cancels without saving", () => {
    const { onSave, onCancel, textarea } = setup();
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("does not save an empty message", () => {
    const { onSave, textarea } = setup();
    fireEvent.input(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Save").disabled).toBe(true);
  });
});
