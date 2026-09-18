import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BibleStudyBulkImporter from '../BibleStudyBulkImporter';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validPreview() {
  return {
    valid: true,
    books: [
      {
        bookId: 'john',
        valid: true,
        chapters: [
          {
            key: 'john:1',
            chapterNumber: 1,
            title: 'The Word Became Flesh',
            chapterOverview: 'John introduces Jesus as the eternal Word.',
            valid: true,
            passages: [
              {
                verseStart: 1,
                verseEnd: 5,
                referenceRaw: 'John 1:1-5',
                fields: {
                  content: 'Jesus is the eternal Word.',
                  original_language_note: 'Logos carries rich meaning.',
                  key_truth: 'The Word is God.',
                },
                valid: true,
                conflict: { exists: false },
              },
            ],
            conflicts: {
              overview: { exists: false },
              existingPassages: 0,
              publishedPassages: 0,
            },
          },
        ],
      },
    ],
    totalPassages: 1,
    totalFieldValues: 3,
    fieldCounts: { content: 1, original_language_note: 1, key_truth: 1 },
    errors: [],
    warnings: [],
    conflicts: {
      existingOverviews: 0,
      existingPassages: 0,
      publishedRecords: 0,
    },
  };
}

const sourceText = `
BOOK: John
CHAPTER: 1
TITLE: The Word Became Flesh
PASSAGE: John 1:1-5
EXPLANATION: Jesus is the eternal Word.
ORIGINAL_LANGUAGE_NOTE: Logos carries rich meaning.
KEY_TRUTH: The Word is God.
`.trim();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BibleStudyBulkImporter workflow', () => {
  it('ignores a stale preview response after the source text changes', async () => {
    const stalePreview = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/bible/study-import/history')) {
        return Promise.resolve(jsonResponse({ history: [] }));
      }
      if (url.endsWith('/api/bible/study-import/preview')) {
        return stalePreview.promise;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BibleStudyBulkImporter />);
    fireEvent.click(screen.getByTestId('button-bulk-import-trigger'));
    const textarea = await screen.findByTestId('textarea-import-content');
    fireEvent.change(textarea, { target: { value: sourceText } });
    fireEvent.click(screen.getByTestId('button-parse-preview'));

    const revisedText = sourceText.replace('The Word Became Flesh', 'A revised title');
    fireEvent.change(textarea, { target: { value: revisedText } });
    await act(async () => {
      stalePreview.resolve(jsonResponse(validPreview()));
      await Promise.resolve();
    });

    expect(screen.getByTestId('textarea-import-content')).toHaveValue(revisedText);
    expect(screen.queryByTestId('view-preview')).not.toBeInTheDocument();
  });

  it('previews, confirms publishing, imports, and returns to Notes', async () => {
    const onReturnToNotes = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/bible/study-import/history')) {
        return Promise.resolve(jsonResponse({ history: [] }));
      }
      if (url.endsWith('/api/bible/study-import/preview')) {
        return Promise.resolve(jsonResponse(validPreview()));
      }
      if (
        url.endsWith('/api/bible/study-import') &&
        init?.method === 'POST'
      ) {
        return Promise.resolve(
          jsonResponse(
            {
              importId: 'import-1',
              status: 'Completed',
              counts: {
                created: 2,
                replaced: 0,
                merged: 0,
                skipped: 0,
                published: 2,
                errored: 0,
              },
              chapters: [
                {
                  key: 'john:1',
                  bookId: 'john',
                  chapter: 1,
                  status: 'Completed',
                },
              ],
              firstChapter: { bookId: 'john', chapter: 1 },
            },
            201,
          ),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BibleStudyBulkImporter onReturnToNotes={onReturnToNotes} />);
    fireEvent.click(screen.getByTestId('button-bulk-import-trigger'));
    expect(screen.getByText('ORIGINAL_LANGUAGE_NOTE:')).toBeInTheDocument();
    fireEvent.change(await screen.findByTestId('textarea-import-content'), {
      target: { value: sourceText },
    });
    fireEvent.click(screen.getByTestId('button-parse-preview'));

    await screen.findByTestId('view-preview');
    expect(screen.getByTestId('checkbox-chapter-john:1')).toBeChecked();
    expect(screen.getByTestId('field-count-content')).toHaveTextContent('1');
    expect(screen.getByTestId('field-count-original_language_note')).toHaveTextContent('1');
    expect(screen.getByTestId('button-import-draft')).toBeEnabled();

    fireEvent.click(screen.getByTestId('button-import-publish'));
    expect(
      await screen.findByTestId('dialog-confirm-publish-import'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-confirm-publish-import'));

    await screen.findByTestId('view-result');
    expect(screen.getByText('Import Completed')).toBeInTheDocument();
    expect(screen.getByTestId('result-count-created')).toHaveTextContent('2');
    expect(screen.getByTestId('result-count-published')).toHaveTextContent('2');

    const importCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/bible/study-import') &&
        init?.method === 'POST',
    );
    expect(importCall).toBeDefined();
    expect(JSON.parse(String(importCall?.[1]?.body))).toMatchObject({
      text: sourceText,
      selectedChapterKeys: ['john:1'],
      mode: 'skip',
      targetStatus: 'Published',
    });

    fireEvent.click(screen.getByTestId('button-return-to-notes'));
    await waitFor(() => expect(onReturnToNotes).toHaveBeenCalledOnce());
  });

  it('shows line diagnostics and blocks imports while validation errors exist', async () => {
    const invalid = {
      ...validPreview(),
      valid: false,
      errors: [
        {
          lineNumber: 4,
          code: 'OVERLAPPING_PASSAGE_RANGE',
          message: 'Passage overlaps another range.',
        },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/bible/study-import/history')) {
        return Promise.resolve(jsonResponse({ history: [] }));
      }
      if (url.endsWith('/api/bible/study-import/preview')) {
        return Promise.resolve(jsonResponse(invalid));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BibleStudyBulkImporter />);
    fireEvent.click(screen.getByTestId('button-bulk-import-trigger'));
    fireEvent.change(await screen.findByTestId('textarea-import-content'), {
      target: { value: sourceText },
    });
    fireEvent.click(screen.getByTestId('button-parse-preview'));

    expect(await screen.findByTestId('diagnostic-error-0')).toHaveTextContent('L4');
    expect(screen.getByTestId('button-import-draft')).toBeDisabled();
    expect(screen.getByTestId('button-import-publish')).toBeDisabled();
  });
});