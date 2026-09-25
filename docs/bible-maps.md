# Interactive Bible maps — first version

Entry: My Bible → Bible Maps → `/bible/maps`.

Includes six Gospel places with searchable names/passages, Galilee/Judea filtering,
3D terrain, 2D view, touch/keyboard controls, reduced-motion support, and links to
the existing chapter reader with verse range and return destination. Emmaus is
labelled as one possible site; no conjectural historical routes are drawn.

MapLibre loads only on the map page. GPU/import failures leave the place list and
Scripture links usable. Network errors show a retry message. No device location
permission, AI API, database migration, or native Android change is required.

## Sources and hosting

Coordinates: OpenBible.info (CC BY 4.0), source links in the place data.
Emmaus Nicopolis coordinate source:
https://www.openbible.info/geo/modern/m77574e/emmaus-nicopolis

Descriptions are original summaries of the linked passages. Map geography is
modern, not a reconstruction of first-century buildings or borders.

Renderer: maplibre-gl 5.6.2. Elevation: AWS Open Data Terrain Tiles, Terrarium,
Mapzen/Tilezen (USGS SRTM/GMTED and NOAA ETOPO1 in this region). Attribution links
are visible. Basemap: OpenStreetMap standard tiles, normal on-demand browser
requests/caching only. There is no bulk download or offline map feature.
https://operations.osmfoundation.org/policies/tiles/
https://registry.opendata.aws/terrain-tiles/

No paid provider or subscription was activated. Public tile services have no
availability guarantee. Before rollout, assess usage and the OSM policy; a
licensed/self-hosted provider can replace the URL through VITE_BIBLE_MAP_TILES.
If replacing the provider, update its attribution as required too.

## Validation and release

- Vite production build passed (existing bundle warnings remain).
- Four focused tests passed: existing Bible Library, GPU fallback with passage
  links, combined filtering, and selected-place restoration/disputed-site label.
- Full project TypeScript check reports errors in unrelated existing files;
  there are no reported errors in the added map files.
- Browser visual check could not run: Chromium was unavailable and its download failed.
- Actual Android/WebView GPU performance and network tile loading still need
  device verification before release.
- Built against GitHub main 08b482f. Reconcile with any newer Replit work before
  merging. This change has not been deployed and does not update Google Play.
