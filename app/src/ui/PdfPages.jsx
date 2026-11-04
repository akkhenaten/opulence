// The pages of a PDF drawn as paper on screen (uploaded contracts). pdf.js loads only where this is used; each page
// gets its real height straight away and is drawn when it comes near the screen, so long files stay light.
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileWarning } from 'lucide-react';
import { cx } from './index.jsx';

let lib;
async function pdfjs() {
  if (!lib) {
    lib = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
      m.GlobalWorkerOptions.workerSrc = w.default;
      return m;
    });
  }
  return lib;
}

function Page({ pdf, n, width, ratio }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (drawn || !width) return undefined;
    let task;
    let gone = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const page = await pdf.getPage(n);
      if (gone) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * dpr });
      const c = canvas.current;
      c.width = vp.width; c.height = vp.height;
      task = page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp });
      task.promise.then(() => !gone && setDrawn(true), () => {});
    }, { rootMargin: '800px 0px' });
    io.observe(box.current);
    return () => { gone = true; io.disconnect(); task?.cancel(); };
  }, [pdf, n, width, drawn]);
  return (
    <div ref={box} className={cx('relative overflow-hidden rounded-xl bg-white shadow-tile', !drawn && 'skeleton')} style={{ aspectRatio: String(ratio) }}>
      <canvas ref={canvas} className="block h-full w-full" aria-label={`Page ${n}`} />
    </div>
  );
}

/** src: a URL (or bytes) of the PDF. onReady(pages) once the page sizes are known. */
export default function PdfPages({ src, onReady, className }) {
  const wrap = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [ratios, setRatios] = useState([]);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let gone = false;
    let doc;
    setPdf(null); setRatios([]); setError(false);
    (async () => {
      const m = await pdfjs();
      doc = await m.getDocument(typeof src === 'string' ? { url: src } : { data: src }).promise;
      const sizes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const v = (await doc.getPage(i)).getViewport({ scale: 1 });
        sizes.push(v.width / v.height);
      }
      if (gone) return;
      setPdf(doc); setRatios(sizes);
      onReady?.(doc.numPages);
    })().catch(() => !gone && setError(true));
    return () => { gone = true; doc?.destroy(); };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className={cx('space-y-3', className)}>
      {error ? (
        <div className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-footnote shadow-tile">
          <FileWarning size={18} className="mt-0.5 shrink-0 text-amber" />
          <div className="min-w-0">
            <p className="font-semibold">The document could not be shown here.</p>
            {typeof src === 'string' && <a href={src} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-blue">Open the PDF <ExternalLink size={13} /></a>}
          </div>
        </div>
      ) : !pdf ? (
        <div className="skeleton rounded-xl" style={{ aspectRatio: '0.707' }} aria-label="Loading document" />
      ) : ratios.map((r, i) => <Page key={i} pdf={pdf} n={i + 1} width={width} ratio={r} />)}
    </div>
  );
}
