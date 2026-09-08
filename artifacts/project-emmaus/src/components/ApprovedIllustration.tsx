import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { listApprovedIllustrations, type Illustration } from '@/lib/illustrations-api';

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function ApprovedIllustration({
  contentType, contentId, stepId, placement,
}: { contentType: string; contentId: string; stepId?: string; placement?: string }) {
  const [illustration, setIllustration] = useState<Illustration | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let mounted = true;
    listApprovedIllustrations(contentType, contentId, stepId).then((items) => {
      const item = items.find((candidate) => !placement || candidate.placement === placement);
      if (mounted) setIllustration(item ?? null);
    }).catch(() => { if (mounted) setIllustration(null); });
    return () => { mounted = false; };
  }, [contentType, contentId, stepId, placement]);
  if (!illustration) return null;
  const src = illustration.displayObjectPath ?? (illustration.sourceSvg ? svgDataUrl(illustration.sourceSvg) : null);
  if (!src) return null;
  return (
    <>
      <figure className="my-5">
        <button type="button" className="block w-full overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm" onClick={() => setOpen(true)} aria-label="Enlarge illustration">
          <img src={src} alt={illustration.alternativeText} loading="lazy" className="block aspect-[16/10] w-full object-contain" />
        </button>
        {illustration.caption && <figcaption className="mt-2 text-center text-sm text-gray-500">{illustration.caption}</figcaption>}
      </figure>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Enlarged illustration">
          <button type="button" aria-label="Close enlarged illustration" onClick={() => setOpen(false)} className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow">
            <X size={20} />
          </button>
          <img src={src} alt={illustration.alternativeText} className="max-h-[90vh] max-w-full object-contain" />
        </div>
      )}
    </>
  );
}