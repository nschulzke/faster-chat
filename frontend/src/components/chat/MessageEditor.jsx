import { useState } from "preact/hooks";

const MessageEditor = ({ initialContent, onSave, onCancel }) => {
  const [value, setValue] = useState(initialContent);
  const trimmed = value.trim();

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
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={value}
        onInput={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        aria-label="Edit message content"
        className="text-theme-text bg-theme-canvas border-theme-border max-h-[40vh] w-full resize-y rounded-lg border px-3 py-2 text-base focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-theme-border text-theme-text-muted hover:text-theme-text ease-snappy rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-75">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(trimmed)}
          disabled={!trimmed}
          className="border-theme-border text-theme-peach ease-snappy rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-75 disabled:opacity-50">
          Save
        </button>
      </div>
    </div>
  );
};

export default MessageEditor;
