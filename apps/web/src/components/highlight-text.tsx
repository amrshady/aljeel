interface HighlightTextProps {
  text: string;
  query: string;
}

export function HighlightText({ text, query }: HighlightTextProps) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;
  let matchIndex = lowerText.indexOf(lowerQuery, start);

  while (matchIndex !== -1) {
    if (matchIndex > start) {
      parts.push(text.slice(start, matchIndex));
    }
    parts.push(
      <mark
        key={matchIndex}
        className="rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40"
      >
        {text.slice(matchIndex, matchIndex + trimmed.length)}
      </mark>,
    );
    start = matchIndex + trimmed.length;
    matchIndex = lowerText.indexOf(lowerQuery, start);
  }

  if (start < text.length) {
    parts.push(text.slice(start));
  }

  return <>{parts}</>;
}

export function textMatchesQuery(text: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  return text.toLowerCase().includes(trimmed.toLowerCase());
}
