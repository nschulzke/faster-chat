/**
 * Renders `{ text, match }` segments from the search API. Matches become real <mark> elements —
 * search results are never injected as HTML.
 */
const MatchSegments = ({ segments, fallback = "" }) => {
  if (!segments?.length) {
    return <>{fallback}</>;
  }

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="bg-theme-yellow/30 text-theme-text rounded-sm">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
};

export default MatchSegments;
