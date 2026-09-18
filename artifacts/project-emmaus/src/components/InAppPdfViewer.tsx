import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Minus, Plus, X } from 'lucide-react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

interface InAppPdfViewerProps {
  url: string;
  filename: string;
  presenterPage: number;
  isLeader: boolean;
  onLeaderPrevious: () => void;
  onLeaderNext: () => void;
  onClose: () => void;
}

export function InAppPdfViewer({
  url,
  filename,
  presenterPage,
  isLeader,
  onLeaderPrevious,
  onLeaderNext,
  onClose,
}: InAppPdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(Math.max(1, presenterPage));
  const [following, setFollowing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(320);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const task = getDocument({ url, withCredentials: true });
    setLoading(true);
    task.promise
      .then(document => {
        setPdf(document);
        setPage(current => Math.min(Math.max(1, current), document.numPages));
        setError('');
      })
      .catch(() => setError('This PDF could not be displayed inside Emmaus. It may be unavailable or your access may have expired.'))
      .finally(() => setLoading(false));
    return () => { void task.destroy(); };
  }, [url]);

  useEffect(() => {
    if (following || isLeader) setPage(Math.max(1, presenterPage));
  }, [following, isLeader, presenterPage]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(240, element.clientWidth - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<typeof pdf.getPage>>['render']> | null = null;
    setRendering(true);
    void pdf.getPage(Math.min(page, pdf.numPages)).then(pdfPage => {
      if (cancelled || !canvasRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: (width / base.width) * zoom });
      const canvas = canvasRef.current;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      return renderTask.promise;
    }).catch(reason => {
      if (!cancelled && reason?.name !== 'RenderingCancelledException') setError('Emmaus could not render this PDF page.');
    }).finally(() => {
      if (!cancelled) setRendering(false);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, page, width, zoom]);

  const total = pdf?.numPages ?? 0;
  const previous = () => {
    if (isLeader) onLeaderPrevious();
    else { setFollowing(false); setPage(value => Math.max(1, value - 1)); }
  };
  const next = () => {
    if (isLeader) onLeaderNext();
    else { setFollowing(false); setPage(value => Math.min(total || value + 1, value + 1)); }
  };

  const openExternally = () => {
    if (window.confirm('Opening externally will leave the Emmaus meeting view. Continue?')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={`Viewing ${filename}`}>
      <header className="flex items-center gap-2 border-b bg-card px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{filename}</p>
          <p className="text-xs text-muted-foreground">Page {page}{total ? ` of ${total}` : ''}</p>
        </div>
        <button type="button" onClick={() => setZoom(value => Math.max(0.75, value - 0.25))} className="flex h-10 w-10 items-center justify-center rounded-lg border" aria-label="Zoom out"><Minus size={17} /></button>
        <button type="button" onClick={() => setZoom(value => Math.min(2, value + 0.25))} className="flex h-10 w-10 items-center justify-center rounded-lg border" aria-label="Zoom in"><Plus size={17} /></button>
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg border" aria-label="Back to group"><X size={19} /></button>
      </header>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto bg-muted/60 p-3">
        {(loading || rendering) && <div className="absolute inset-x-0 top-5 z-10 flex justify-center"><span className="flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs shadow"><Loader2 size={15} className="animate-spin" />{loading ? 'Loading PDF…' : 'Rendering page…'}</span></div>}
        {error ? (
          <div className="mx-auto mt-8 max-w-sm rounded-2xl border bg-card p-5 text-center">
            <p role="alert" className="text-sm font-medium">{error}</p>
            <div className="mt-4 flex flex-col gap-2">
              <a href={url} download={filename} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold"><Download size={16} />Download PDF</a>
              <button type="button" onClick={openExternally} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm"><ExternalLink size={16} />Open externally</button>
            </div>
          </div>
        ) : (
          <canvas ref={canvasRef} className="mx-auto block max-w-none bg-white shadow-md" />
        )}
      </div>

      <footer className="border-t bg-card p-3">
        {!isLeader && (
          <button type="button" onClick={() => { setFollowing(true); setPage(presenterPage); }} className="mb-2 w-full rounded-lg border px-3 py-2 text-xs font-semibold">
            {following ? 'Following presenter' : 'Resume following presenter'}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={previous} disabled={page <= 1} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border disabled:opacity-40"><ChevronLeft size={17} />Previous</button>
          <button type="button" onClick={next} disabled={Boolean(total) && page >= total} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border disabled:opacity-40">Next<ChevronRight size={17} /></button>
        </div>
      </footer>
    </div>
  );
}