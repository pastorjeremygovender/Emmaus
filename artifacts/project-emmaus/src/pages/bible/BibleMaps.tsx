import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowLeft, BookOpen, MapPin, Mountain, RotateCcw } from 'lucide-react';
import type { Map as TerrainMap, Marker } from 'maplibre-gl';
import { bibleMapPlaces, bibleMapPassageUrl } from '@/data/bible-map-places';
import './bible-maps.css';

const overview = { center: [35.35, 32.35] as [number, number], zoom: 7.8, bearing: -12, pitch: 48 };
const terrainAttribution = 'Terrain: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen / Tilezen, USGS SRTM & GMTED, NOAA ETOPO1</a>';

export default function BibleMaps() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const requested = new URLSearchParams(search).get('place');
  const selected = bibleMapPlaces.find(p => p.id === requested);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All places');
  const [flat, setFlat] = useState(false);
  const [status, setStatus] = useState('Loading the map…');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<TerrainMap | null>(null);
  const markers = useRef<{ id: string; marker: Marker }[]>([]);
  const visible = bibleMapPlaces.filter(p => (region === 'All places' || p.region === region) && `${p.name} ${p.description} ${p.passage.label}`.toLowerCase().includes(query.toLowerCase().trim()));
  const visibleIds = visible.map(p => p.id).join(',');

  useEffect(() => {
    let disposed = false;
    let instance: TerrainMap | undefined;
    let resize: ResizeObserver | undefined;
    setReady(false);
    setFlat(false);
    setStatus('Loading the map…');
    const timer = window.setTimeout(() => {
      if (!disposed) setStatus('The map is taking longer to load. You can explore the places below, or retry.');
    }, 15000);
    // Load the renderer only on this page. Import/WebGL failures never block Bible reading.
    Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([lib]) => {
      if (disposed || !container.current) return;
      instance = new lib.Map({
        container: container.current,
        ...overview,
        maxZoom: 14, minZoom: 6, maxPitch: 65,
        maxBounds: [[33.8, 30.7], [36.7, 34]],
        renderWorldCopies: false,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            basemap: { type: 'raster', tiles: [import.meta.env.VITE_BIBLE_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' },
            terrain: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 14, attribution: terrainAttribution },
          },
          layers: [{ id: 'base', type: 'raster', source: 'basemap', paint: { 'raster-saturation': -0.45 } }],
          terrain: { source: 'terrain', exaggeration: 1.3 },
        },
      });
      map.current = instance;
      instance.addControl(new lib.NavigationControl({ visualizePitch: true }), 'top-right');
      instance.addControl(new lib.AttributionControl({ compact: false }), 'bottom-right');
      instance.addControl(new lib.ScaleControl({ unit: 'metric' }), 'bottom-left');
      instance.on('load', () => {
        if (disposed) return;
        window.clearTimeout(timer);
        setReady(true);
        setStatus('');
      });
      instance.on('error', () => {
        if (!disposed) setStatus('Some map detail could not load. Try 2D view, retry, or use the places below.');
      });
      instance.on('webglcontextlost', () => {
        if (!disposed) { setReady(false); setStatus('3D display was interrupted. Your Bible places are still available below.'); }
      });
      markers.current = bibleMapPlaces.map(place => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bible-map-pin';
        button.textContent = place.id === 'emmaus' ? 'Emmaus ?' : place.name;
        button.setAttribute('aria-label', `Explore ${place.name}`);
        button.addEventListener('click', () => navigate(`/bible/maps?place=${place.id}`, { replace: true }));
        return { id: place.id, marker: new lib.Marker({ element: button }).setLngLat(place.coordinates).addTo(instance!) };
      });
      resize = new ResizeObserver(() => instance?.resize());
      resize.observe(container.current);
    }).catch(() => {
      if (!disposed) { window.clearTimeout(timer); setStatus('This device could not open the 3D map. You can still explore every place and Bible passage below.'); }
    });
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      resize?.disconnect();
      markers.current.forEach(({ marker }) => marker.remove());
      markers.current = [];
      instance?.remove();
      map.current = null;
    };
  }, [attempt, navigate]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.current.easeTo({ ...(selected ? { center: selected.coordinates, zoom: selected.id === 'sea-of-galilee' ? 10 : 12 } : overview), pitch: flat ? 0 : 48, duration: reduceMotion ? 0 : 900 });
  }, [selected, ready, flat]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setTerrain(flat ? null : { source: 'terrain', exaggeration: 1.3 });
  }, [flat, ready]);

  useEffect(() => {
    const ids = new Set(visibleIds.split(','));
    markers.current.forEach(({ id, marker }) => {
      marker.getElement().style.display = ids.has(id) ? '' : 'none';
      marker.getElement().setAttribute('aria-pressed', String(id === selected?.id));
    });
  }, [visibleIds, selected, ready]);

  return (
    <main className="bible-atlas min-h-[100dvh] bg-background text-foreground pb-8">
      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
        <Link href="/bible" aria-label="Back to My Bible" className="p-3 rounded-xl bg-muted"><ArrowLeft size={20} /></Link>
        <div><p className="text-xs tracking-widest text-muted-foreground">EMMAUS · ISIPINGO COMMUNITY CHURCH</p><h1 className="text-2xl font-medium">Explore the Bible lands</h1></div>
      </header>
      <div className="max-w-5xl mx-auto px-4 space-y-4">
        <p className="text-sm text-muted-foreground">Discover places from Jesus’ life. Touch a place to explore its story in Scripture.</p>
        <div className="flex flex-wrap gap-2">
          <label className="grow"><span className="sr-only">Search Bible places</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search places or passages…" className="w-full min-h-11 rounded-xl border bg-background px-3" /></label>
          <label><span className="sr-only">Filter by region</span><select value={region} onChange={e => setRegion(e.target.value)} className="min-h-11 rounded-xl border bg-background px-3">{['All places', 'Galilee', 'Judea'].map(r => <option key={r}>{r}</option>)}</select></label>
        </div>
        <section aria-label="Interactive Bible map" className="rounded-2xl overflow-hidden border bg-muted">
          <div ref={container} className="bible-atlas-canvas" aria-label="Map of Bible lands. Use the place buttons below as an alternative to map gestures." />
          <div className="flex flex-wrap gap-2 px-3 py-2 bg-card border-t">
            <button className="atlas-control" disabled={!ready} aria-pressed={!flat} onClick={() => setFlat(!flat)}><Mountain size={16} />{flat ? 'Show 3D terrain' : 'Show 2D map'}</button>
            <button className="atlas-control" disabled={!ready} onClick={() => { navigate('/bible/maps', { replace: true }); map.current?.easeTo({ ...overview, pitch: flat ? 0 : 48, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 }); }}><RotateCcw size={16} />Overview</button>
          </div>
        </section>
        {status && <div role="status" className="rounded-xl bg-muted p-3 text-sm">{status}<button className="ml-3 underline min-h-11" onClick={() => setAttempt(a => a + 1)}>Retry map</button></div>}
        <p className="text-xs text-muted-foreground">Drag to move; pinch to zoom; use two fingers to tilt or rotate. Modern terrain and map labels provide geographic context. Terrain height is slightly exaggerated.</p>
        {selected && <section aria-labelledby="selected-place-title" className="rounded-2xl border border-primary/25 bg-card p-5 space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{selected.region}</p>
          <h2 id="selected-place-title" className="text-xl font-medium">{selected.name}</h2>
          <p>{selected.description}</p><p className="text-sm text-muted-foreground">{selected.locationNote}</p>
          <Link className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 min-h-11" href={bibleMapPassageUrl(selected)}><BookOpen size={18} />Read {selected.passage.label}</Link>
          <p className="text-xs"><a className="underline" href={selected.source} target="_blank" rel="noopener noreferrer">Location source: OpenBible.info</a></p>
        </section>}
        <section aria-label="Bible places"><h2 className="font-medium mb-2">Places to explore</h2><div className="grid sm:grid-cols-2 gap-2">
          {visible.map(place => <button key={place.id} aria-label={`Explore ${place.name}`} aria-pressed={selected?.id === place.id} onClick={() => navigate(`/bible/maps?place=${place.id}`, { replace: true })} className={`text-left rounded-xl border p-3 flex gap-3 items-center min-h-16 ${selected?.id === place.id ? 'border-primary bg-primary/5' : 'bg-card'}`}><MapPin size={18} className="shrink-0 text-primary" /><span><span className="block font-medium">{place.name}</span><span className="text-xs text-muted-foreground">{place.region} · {place.passage.label}</span></span></button>)}
          {!visible.length && <p className="text-sm text-muted-foreground">No matching places. Try another search or region.</p>}
        </div></section>
        <footer className="text-xs text-muted-foreground space-y-2"><p>Place coordinates adapted from <a className="underline" href="https://www.openbible.info/geo/">OpenBible.info</a> under <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Descriptions summarise the linked Bible passages. Markers identify places, not exact event sites.</p><p>Map imagery requires an internet connection. <a className="underline" href="https://www.openstreetmap.org/fixthemap">Report a base map issue</a>.</p></footer>
      </div>
    </main>
  );
}
