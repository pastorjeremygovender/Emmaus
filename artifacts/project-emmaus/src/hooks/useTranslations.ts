/**
 * useTranslations — shared, cached translation catalogue.
 *
 * Fetches /api/bible/translations once per session.
 * Returns only translations the server confirms are available and authorised.
 * Licensed translations (NIV, GNT, NKJV) appear only when API.Bible confirms access.
 *
 * Falls back to the three public-domain translations while loading or if the
 * request fails, so the UI is never empty.
 */

import { useState, useEffect } from 'react';

export type TranslationMeta = {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  copyright: string;
  provider?: 'local' | 'api.bible';
  attributionUrl?: string;
};

// Shown immediately while the catalogue loads, and as a hard fallback on error.
// Local public-domain translations only — licensed translations are not
// included here because they require server verification. They will appear
// once the catalogue fetch resolves.
const FALLBACK_TRANSLATIONS: TranslationMeta[] = [
  {
    id: 'bsb',
    name: 'Berean Standard Bible',
    abbreviation: 'BSB',
    language: 'en',
    copyright: 'Public Domain (CC0)',
    provider: 'local',
  },
  {
    id: 'asv',
    name: 'American Standard Version',
    abbreviation: 'ASV',
    language: 'en',
    copyright: 'Public Domain (1901)',
    provider: 'local',
  },
  {
    id: 'kjv',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'en',
    copyright: 'Public Domain',
    provider: 'local',
  },
];

// Module-level cache — one fetch shared across all component instances.
let catalogueCache: TranslationMeta[] | null = null;
let cataloguePromise: Promise<TranslationMeta[]> | null = null;

async function fetchCatalogue(): Promise<TranslationMeta[]> {
  if (catalogueCache) return catalogueCache;
  if (cataloguePromise) return cataloguePromise;

  cataloguePromise = (async () => {
    try {
      const apiBase =
        (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL?.replace(/\/$/, '') ?? '';
      const res = await fetch(`${apiBase}/api/bible/translations`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { translations: TranslationMeta[] };
      if (!Array.isArray(data.translations) || data.translations.length === 0) {
        throw new Error('Empty catalogue');
      }
      catalogueCache = data.translations;
      return data.translations;
    } catch {
      // Don't cache failures — allow a retry on next mount
      return FALLBACK_TRANSLATIONS;
    } finally {
      cataloguePromise = null;
    }
  })();

  return cataloguePromise;
}

/** Invalidate the module-level cache (e.g. after login or key rotation). */
export function invalidateTranslationCatalogue(): void {
  catalogueCache = null;
}

export function useTranslations(): { translations: TranslationMeta[]; loading: boolean } {
  const [translations, setTranslations] = useState<TranslationMeta[]>(
    catalogueCache ?? FALLBACK_TRANSLATIONS,
  );
  const [loading, setLoading] = useState(!catalogueCache);

  useEffect(() => {
    if (catalogueCache) {
      setTranslations(catalogueCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchCatalogue().then(result => {
      setTranslations(result);
      setLoading(false);
    });
  }, []);

  return { translations, loading };
}
