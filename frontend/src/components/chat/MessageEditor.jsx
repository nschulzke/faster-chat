import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { UI_CONSTANTS } from "@faster-chat/shared";

const adjustHeight = (element) => {
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, UI_CONSTANTS.INPUT_MAX_HEIGHT)}px`;
};

const MessageEditor = ({ initialContent, onSave, onCancel }) => {
  const [value, setValue] = useState(initialContent);
  const textareaRef = useRef(null);
  const trimmed = value.trim();

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    adjustHeight(textarea);
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  const handleInput = (e) => {
    adjustHeight(e.target);
    setValue(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (trimmed) {
        onSave(trimmed);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="bg-theme-surface border-theme-border focus-within:border-theme-primary/50 w-full rounded-2xl border p-2 shadow-lg transition-colors duration-150">
      <textarea
        ref={textareaRef}
        autoFocus
        value={value}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        rows={1}
        aria-label="Edit message content"
        className="text-theme-text max-h-[200px] w-full resize-none border-none bg-transparent px-4 py-3 text-base focus:ring-0 focus:outline-none"
      />

      <div className="flex items-center justify-end gap-2 px-2 pb-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-theme-muted hover:text-theme-text ease-snappy rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-75">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(trimmed)}
          disabled={!trimmed}
          className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
            trimmed
              ? "bg-theme-primary hover:bg-theme-accent text-white shadow-sm hover:scale-105 active:scale-95"
              : "bg-theme-surface-strong text-theme-muted cursor-not-allowed"
          }`}>
          Save
        </button>
      </div>
    </div>
  );
};

export default MessageEditor;
