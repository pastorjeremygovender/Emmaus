import {
  normalizeEmmausStreamingUnit,
  type StreamingGrounding,
} from "./response-normalization.js";

export interface TypedStreamOptions extends StreamingGrounding {}

export interface TypedStreamConsumer {
  push(text: string): void;
  flush(): void;
}

/**
 * Find complete prose units without treating punctuation inside URLs or
 * Markdown links as a boundary. The conservative remainder is retained so a
 * reference such as "1 Cor" + " 13:4–7." can never be emitted in pieces.
 */
export function takeSafeTextUnits(
  input: string,
  flush = false,
): { units: string[]; remainder: string } {
  const units: string[] = [];
  let start = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let urlEnd = -1;

  const isClosingMarkdownCharacter = (character: string) =>
    character === "]" || character === ")" || character === "}" ||
    character === ">" || character === '"' || character === "'" ||
    character === "\u201d" || character === "\u2019";

  const commit = (end: number) => {
    const candidate = input.slice(start, end);
    if (candidate.trim()) units.push(candidate);
    start = end;
  };

  for (let index = 0; index < input.length; index += 1) {
    if (index < urlEnd) continue;
    if (
      (input.startsWith("https://", index) || input.startsWith("http://", index)) &&
      bracketDepth === 0
    ) {
      const whitespace = input.slice(index).search(/\s/u);
      urlEnd = whitespace === -1 ? input.length : index + whitespace;
      continue;
    }

    const character = input[index];
    if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === "(") parenDepth += 1;
    else if (character === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (bracketDepth !== 0 || parenDepth !== 0 || urlEnd > index) continue;

    if (character === "\n" && input[index + 1] === "\n") {
      commit(index + 2);
      index += 1;
      continue;
    }

    if (!/[.!?]/u.test(character)) continue;
    let boundaryEnd = index + 1;
    while (
      boundaryEnd < input.length &&
      isClosingMarkdownCharacter(input[boundaryEnd])
    ) {
      boundaryEnd += 1;
    }

    const next = input[boundaryEnd];
    const followedByWhitespace = next == null || /\s/u.test(next);
    if (!followedByWhitespace) continue;

    // Keep common abbreviations in the buffer. This is mostly defensive; a
    // later chunk will still release the sentence promptly.
    const before = input.slice(start, index + 1);
    if (
      character === "." &&
      /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|rev|dr)\.$/iu.test(before)
    ) {
      continue;
    }

    commit(boundaryEnd);
    index = boundaryEnd - 1;
  }

  if (flush && start < input.length) {
    commit(input.length);
  }

  return { units, remainder: input.slice(start) };
}

export function createTypedStreamConsumer(
  options: TypedStreamOptions,
  emit: (content: string) => void,
): TypedStreamConsumer {
  let buffer = "";

  return {
    push(text: string) {
      buffer += text;
      const result = takeSafeTextUnits(buffer);
      buffer = result.remainder;
      for (const unit of result.units) {
        const safe = normalizeEmmausStreamingUnit(unit, options);
        if (safe) emit(`${safe} `);
      }
    },
    flush() {
      const result = takeSafeTextUnits(buffer, true);
      buffer = result.remainder;
      for (const unit of result.units) {
        const safe = normalizeEmmausStreamingUnit(unit, options);
        if (safe) emit(`${safe} `);
      }
    },
  };
}
