import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Search } from "lucide-preact";
import { useChatSearchQuery } from "@/hooks/useChatSearchQuery";
import { useUiState } from "@/state/useUiState";
import { formatRelativeDate } from "@/lib/formatters";
import MatchSegments from "./MatchSegments";

function toRows(results) {
  return results.flatMap((result) => [
    { key: result.chatId, kind: "chat", chatId: result.chatId, result },
    ...result.messages.map((message) => ({
      key: `${result.chatId}:${message.messageId}`,
      kind: "message",
      chatId: result.chatId,
      messageId: message.messageId,
      message,
    })),
  ]);
}

const SearchPalette = () => {
  const navigate = useNavigate();
  const setSearchOpen = useUiState((state) => state.setSearchOpen);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const { results, hasMore, isSearching, isTooShort } = useChatSearchQuery(query);

  const rows = toRows(results);
  const active = Math.min(activeIndex, Math.max(rows.length - 1, 0));

  const close = () => setSearchOpen(false);

  const open = (row) => {
    if (!row) {
      return;
    }
    close();
    navigate({
      to: "/chat/$chatId",
      params: { chatId: row.chatId },
      search: { q: query.trim(), m: row.messageId },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(rows.length ? (active + 1) % rows.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(rows.length ? (active - 1 + rows.length) % rows.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(rows[active]);
    }
  };

  // The click that opened the palette wins over autoFocus, so claim focus explicitly.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape listens on the document: focus may still be on whatever opened the palette.
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [setSearchOpen]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const renderRow = (row, index) => {
    const isActive = index === active;
    const base = `ease-snappy flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 text-left transition-colors duration-75 ${
      isActive ? "bg-theme-primary/10" : "hover:bg-white/5"
    }`;

    if (row.kind === "chat") {
      return (
        <div
          key={row.key}
          data-index={index}
          role="option"
          aria-selected={isActive}
          tabIndex={-1}
          onClick={() => open(row)}
          onMouseEnter={() => setActiveIndex(index)}
          className={`${base} mt-3 py-2 first:mt-0`}>
          <Search size={14} className="text-theme-text-muted mt-1 flex-shrink-0" />
          <span className="text-theme-text min-w-0 flex-1 truncate text-sm font-medium">
            <MatchSegments segments={row.result.title} fallback="New Chat" />
          </span>
          <span className="text-theme-text-muted flex-shrink-0 text-xs">
            {formatRelativeDate(row.result.updatedAt)}
          </span>
        </div>
      );
    }

    return (
      <div
        key={row.key}
        data-index={index}
        role="option"
        aria-selected={isActive}
        tabIndex={-1}
        onClick={() => open(row)}
        onMouseEnter={() => setActiveIndex(index)}
        className={`${base} ml-6 py-1.5`}>
        <MessageSquare size={12} className="text-theme-text-muted mt-1 flex-shrink-0" />
        <span className="text-theme-text-muted min-w-0 flex-1 text-xs leading-relaxed">
          <MatchSegments segments={row.message.snippet} />
        </span>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="bg-theme-overlay/40 absolute inset-0 backdrop-blur-sm" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search chats"
        className="bg-theme-canvas border-theme-border relative z-10 mx-4 flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-xl">
        <div className="border-theme-border flex items-center gap-3 border-b px-4 py-3">
          <Search size={18} className="text-theme-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search chats and messages..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="text-theme-text placeholder-theme-text-muted flex-1 bg-transparent text-base outline-none"
          />
          <kbd className="text-theme-text-muted border-theme-border rounded border px-1.5 py-0.5 text-xs">
            Esc
          </kbd>
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="flex-1 overflow-y-auto p-2"
          style={{ scrollbarGutter: "stable" }}>
          {rows.map(renderRow)}

          {rows.length === 0 && (
            <div className="text-theme-text-muted px-3 py-8 text-center text-sm">
              {isTooShort
                ? "Keep typing..."
                : isSearching
                  ? "Searching..."
                  : query.trim()
                    ? "No matches found."
                    : "Search titles and message contents."}
            </div>
          )}
        </div>

        {hasMore && (
          <div className="border-theme-border text-theme-text-muted border-t px-4 py-2 text-xs">
            More matches exist — refine your search to narrow them down.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SearchPalette;
