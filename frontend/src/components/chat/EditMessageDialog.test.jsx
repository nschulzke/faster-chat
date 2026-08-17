import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import EditMessageDialog from "@/components/chat/EditMessageDialog";

describe("EditMessageDialog", () => {
  function setup(removedCount = 3) {
    const handlers = { onCancel: vi.fn(), onCopy: vi.fn(), onReplace: vi.fn() };
    render(<EditMessageDialog removedCount={removedCount} isPending={false} {...handlers} />);
    return handlers;
  }

  test("counts the messages that follow the edited one", () => {
    setup(3);
    expect(screen.getByText("3 later messages follow this one.")).toBeTruthy();
  });

  test("uses the singular for a single follower", () => {
    setup(1);
    expect(screen.getByText("1 later message follows this one.")).toBeTruthy();
  });

  test("says nothing about removal when nothing follows", () => {
    setup(0);
    expect(
      screen.getByText("The edited message will be resent to the current model.")
    ).toBeTruthy();
  });

  test("wires each choice to its own handler", () => {
    const { onCopy, onReplace, onCancel } = setup();

    fireEvent.click(screen.getByText("Copy to new chat"));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Replace in this chat"));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("Escape cancels", () => {
    const { onCancel, onCopy, onReplace } = setup();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
  });

  test("both choices are disabled while the rewind is in flight", () => {
    const handlers = { onCancel: vi.fn(), onCopy: vi.fn(), onReplace: vi.fn() };
    render(<EditMessageDialog removedCount={2} isPending={true} {...handlers} />);

    expect(screen.getByText("Copy to new chat").closest("button").disabled).toBe(true);
    expect(screen.getByText("Replace in this chat").closest("button").disabled).toBe(true);
  });
});
