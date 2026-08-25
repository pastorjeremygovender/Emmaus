import React from 'react';
import { useLocation } from 'wouter';
import type { ScriptureRef } from '@/lib/emmaus-client';
import { parseScriptureRef } from '@/lib/scripture-ref';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routeFor(ref: ScriptureRef): string | null {
  const parsed = parseScriptureRef(ref.reference) ??
    parseScriptureRef(`${ref.book} ${ref.chapter}`);
  if (!parsed) return null;
  const start = ref.verseStart;
  const end = ref.verseEnd;
  return `/bible/read/${parsed.bookId}/${parsed.chapter}${
    start ? `?startVerse=${start}${end && end >= start ? `&endVerse=${end}` : ''}` : ''
  }`;
}

function referenceLabels(ref: ScriptureRef): string[] {
  const labels = new Set<string>();
  if (ref.reference) labels.add(ref.reference);
  if (ref.displayText) labels.add(ref.displayText);
  const start = ref.verseStart;
  const end = ref.verseEnd;
  if (start) {
    labels.add(`${ref.book} ${ref.chapter}:${start}${end && end !== start ? `-${end}` : ''}`);
    labels.add(`${ref.book} ${ref.chapter}:${start}${end && end !== start ? `–${end}` : ''}`);
  }
  return Array.from(labels).sort((a, b) => b.length - a.length);
}

function Citation({ ref, text }: { ref: ScriptureRef; text: string }) {
  const [, setLocation] = useLocation();
  const route = routeFor(ref);
  if (!route) return <>{text}</>;
  return (
    <button
      type="button"
      onClick={() => setLocation(route)}
      className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
      aria-label={`Open ${ref.reference} in My Bible`}
    >
      {text}
    </button>
  );
}

function InlineParagraph({ text, references }: { text: string; references: ScriptureRef[] }) {
  const matches = references
    .map((ref) => {
      const match = referenceLabels(ref)
        .map(label => ({ label, match: text.match(new RegExp(escapeRegExp(label), 'i')) }))
        .filter((candidate): candidate is { label: string; match: RegExpMatchArray } => !!candidate.match)
        .sort((a, b) => b.label.length - a.label.length)[0]?.match;
      return match && match.index !== undefined ? { ref, start: match.index, end: match.index + match[0].length, text: match[0] } : null;
    })
    .filter((match): match is { ref: ScriptureRef; start: number; end: number; text: string } => !!match)
    .sort((a, b) => a.start - b.start);

  const nonOverlapping = matches.filter((match, i) => i === 0 || match.start >= matches[i - 1].end);
  if (nonOverlapping.length === 0) return <>{text}</>;

  const output: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of nonOverlapping) {
    if (match.start > cursor) output.push(text.slice(cursor, match.start));
    output.push(<Citation key={`${match.start}-${match.ref.reference}`} ref={match.ref} text={match.text} />);
    cursor = match.end;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return <>{output}</>;
}

export function InlineScriptureProse({
  text,
  references = [],
}: {
  text: string;
  references?: ScriptureRef[];
}) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const validRefs = references.filter((ref) => !!routeFor(ref));
  const proseContainsReference = validRefs.some((ref) => {
    return referenceLabels(ref).some(label => text.toLowerCase().includes(label.toLowerCase()));
  });
  return (
    <div className={paragraphs.length > 1 ? 'space-y-4' : undefined}>
      {paragraphs.map((paragraph, index) => (
        <React.Fragment key={index}>
          <p className="text-[16px] text-foreground leading-[1.75] font-sans">
            <InlineParagraph text={paragraph} references={validRefs} />
          </p>
          {index === paragraphs.length - 1 && validRefs.length > 0 &&
            !proseContainsReference && (
              <div className="flex flex-wrap gap-2 pt-1">
                {validRefs.map((ref) => (
                  <Citation key={ref.reference} ref={ref} text={ref.displayText || ref.reference} />
                ))}
              </div>
            )}
        </React.Fragment>
      ))}
    </div>
  );
}