import { useEffect, useState } from "@preact/compat";

const HIGHLIGHT_NAME = "chat-search";

// Terms the FTS query would have matched, minus the operator characters the server strips.
function toTerms(query) {
  return (query?.match(/"[^"]*"|\S+/g) ?? [])
    .map((token) =>
      token
        .replace(/"/g, " ")
        .replace(/[^\p{L}\p{N}_\-\s]/gu, " ")
        .trim()
    )
    .filter(Boolean)
    .map((term) => term.toLowerCase());
}

function findRanges(root, terms) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const haystack = node.textContent.toLowerCase();
    for (const term of terms) {
      let from = haystack.indexOf(term);
      while (from !== -1) {
        const range = new Range();
        range.setStart(node, from);
        range.setEnd(node, from + term.length);
        ranges.push(range);
        from = haystack.indexOf(term, from + term.length);
      }
    }
  }

  return ranges;
}

/**
 * Paints search matches inside `containerRef` using the CSS Custom Highlight API. Range-based
 * highlighting leaves the DOM untouched, so it neither fights the markdown renderer nor Shiki.
 * Returns the ranges so callers can step through matches; empty where unsupported.
 */
export function useTextHighlight(containerRef, query, deps = []) {
  const [ranges, setRanges] = useState([]);

  useEffect(() => {
    const terms = toTerms(query);
    if (!CSS.highlights || !containerRef.current || terms.length === 0) {
      setRanges([]);
      return;
    }

    const found = findRanges(containerRef.current, terms);
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...found));
    setRanges(found);

    return () => CSS.highlights.delete(HIGHLIGHT_NAME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, containerRef, ...deps]);

  return ranges;
}
