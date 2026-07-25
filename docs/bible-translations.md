# Emmaus Bible Translations

## Translation Catalogue Architecture

Emmaus serves Bible text from two provider types:

1. **Local public-domain provider** — text bundled with the API server for BSB, ASV, and KJV
2. **API.Bible licensed provider** — text proxied server-side for NIV, GNT, and MSG (requires `API_BIBLE_KEY`)

The frontend never knows which provider serves a translation. It fetches `GET /api/bible/translations` for the live catalogue and `GET /api/bible/:translationId/:bookId/:chapter` for text — both routes are provider-neutral.

---

## Public-Domain Translations

### Berean Standard Bible (BSB)
- **ID**: `bsb`
- **Source**: [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) — BSB.json
- **Licence**: CC0 (Public Domain). Free to use, copy, and distribute without restriction.
- **Coverage**: All 66 books
- **Attribution**: Not required (CC0).
- **Download**: `node artifacts/api-server/scripts/download-bible.mjs`

### American Standard Version (ASV)
- **ID**: `asv`
- **Source**: [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) — ASV.json
- **Licence**: Public Domain (1901). No copyright restrictions.
- **Coverage**: All 66 books
- **Download**: `node artifacts/api-server/scripts/download-bible.mjs`

### King James Version (KJV)
- **ID**: `kjv`
- **Source**: [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) — KJV.json
- **Licence**: Public Domain. The KJV is in the public domain worldwide (original 1611; standardised 1769 Blayney text).
- **Coverage**: All 66 books
- **Download**: `node artifacts/api-server/scripts/download-bible.mjs`

---

## Licensed Translations (API.Bible)

Licensed translations are served via [API.Bible](https://scripture.api.bible) as a server-side proxy. The API key (`API_BIBLE_KEY`) never leaves the API server. Text is not permanently cached or redistributed in bulk.

### Configuration

The `API_BIBLE_KEY` environment secret must be set. At startup, the server verifies each confirmed Bible ID is accessible on the account. Only verified translations appear in the selector.

### Confirmed Bible IDs

The Bible IDs below are the confirmed API.Bible Bible IDs for the configured account.

| Internal ID | Abbreviation | Name | API.Bible Bible ID |
|-------------|-------------|------|-------------------|
| `niv` | NIV | New International Version | `78a9f6124f344018-01` |
| `gnt` | GNT | Good News Translation | `61fd76eafa1577c2-02` |
| `msg` | MSG | The Message | `61f1fa7de016f942e-01` |

> **Do not substitute these IDs.** Each API.Bible account receives a specific set of Bible IDs; the same translation has a different ID on a different account. If the account changes, update `CONFIRMED_BIBLES` in `artifacts/api-server/src/lib/api-bible-provider.ts` with the IDs confirmed for the new account.

### New International Version (NIV)
- **ID**: `niv`
- **Provider**: API.Bible (`78a9f6124f344018-01`)
- **Copyright**: © 1973, 1978, 1984, 2011 by Biblica, Inc.® All rights reserved worldwide.
- **Caching restriction**: Short-term in-process cache only (`private, max-age=300`). Do not persist to disk or redistribute text in bulk.
- **Attribution**: Required. Must display Biblica copyright notice.

### Good News Translation (GNT)
- **ID**: `gnt`
- **Provider**: API.Bible (`61fd76eafa1577c2-02`)
- **Copyright**: © 1992 American Bible Society. All rights reserved.
- **Caching restriction**: Short-term in-process cache only. Do not persist or redistribute.
- **Attribution**: Required. Must credit American Bible Society.

### The Message (MSG)
- **ID**: `msg`
- **Provider**: API.Bible (`61f1fa7de016f942e-01`)
- **Copyright**: © 1993, 2002, 2018 by Eugene H. Peterson. All rights reserved.
- **Caching restriction**: Short-term in-process cache only. Do not persist or redistribute.
- **Attribution**: Required. Must credit Eugene H. Peterson / NavPress.

---

## Caching Policy

| Provider | Cache header | Disk persistence | Redistribution |
|----------|-------------|-----------------|----------------|
| Local (BSB, ASV, KJV) | `public, max-age=86400` | Permitted | Permitted (PD) |
| API.Bible (NIV, GNT, MSG) | `private, max-age=300` | **Not permitted** | **Not permitted** |

Licensed text lives only in the API server's in-process memory cache (`Map<string, ApiBibleChapter>`), cleared on restart.

---

## Do Not Add

The following translations are copyright-protected and **must not** be added without a valid licence and authorised source:

- ESV (English Standard Version) — © Crossway
- NLT (New Living Translation) — © Tyndale House Foundation
- CSB (Christian Standard Bible) — © Holman Bible Publishers
- AMP (Amplified Bible) — © Lockman Foundation

Do not scrape, copy, or embed text from any of the above without written permission from the rights holder.
