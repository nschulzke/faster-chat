import { useEffect, useState } from "@preact/compat";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, X } from "lucide-preact";
import { useTextHighlight } from "@/hooks/useTextHighlight";

const FLASH_MS = 1200;

function scrollRangeIntoView(range) {
  const element = range?.startContainer?.parentElement;
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
}

const SearchHighlightBar = ({ containerRef, messageCount }) => {
  const navigate = useNavigate();
  const { q, m } = useSearch({ strict: false });

  const [index, setIndex] = useState(0);

  const ranges = useTextHighlight(containerRef, q, [messageCount]);
  const active = ranges.length ? Math.min(index, ranges.length - 1) : 0;

  const step = (delta) => {
    if (!ranges.length) {
      return;
    }
    const next = (active + delta + ranges.length) % ranges.length;
    setIndex(next);
    scrollRangeIntoView(ranges[next]);
  };

  // Jump to the message the result pointed at, then flash it.
  useEffect(() => {
    if (!m || !messageCount) {
      return;
    }
    const element = containerRef.current?.querySelector(`[data-message-id="${CSS.escape(m)}"]`);
    if (!element) {
      return;
    }
    element.scrollIntoView({ block: "center" });
    element.classList.add("search-flash");
    const timer = setTimeout(() => element.classList.remove("search-flash"), FLASH_MS);
    return () => clearTimeout(timer);
  }, [m, messageCount, containerRef]);

  if (!q) {
    return null;
  }

  return (
    <div className="border-theme-border bg-theme-surface text-theme-text absolute top-20 right-4 z-20 flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs shadow-lg">
      <span className="text-theme-text-muted mr-1">
        {ranges.length ? `${active + 1} of ${ranges.length}` : "No matches"}
      </span>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!ranges.length}
        title="Previous match"
        className="hover:bg-theme-surface-strong rounded p-1 transition-colors disabled:opacity-40">
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={!ranges.length}
        title="Next match"
        className="hover:bg-theme-surface-strong rounded p-1 transition-colors disabled:opacity-40">
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        onClick={() => navigate({ to: ".", search: {}, replace: true })}
        title="Clear search highlight"
        className="hover:bg-theme-surface-strong rounded p-1 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
};

export default SearchHighlightBar;
