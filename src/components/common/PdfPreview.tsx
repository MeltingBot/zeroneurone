import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask, TextLayer } from 'pdfjs-dist';
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileWarning, MoveHorizontal, MoveVertical, Search, X,
} from 'lucide-react';
import { ZoomControls } from './ZoomControls';
import { ZOOM_STEP, clampScale } from './zoom';
import { buildPageText, findMatches, type MatchRange, type PageText, type PdfMatch } from './pdfSearch';
import { registerTextLayer } from './pdfTextSelection';
import { loadPdfjs } from '../../services/pdfjsLoader';

/** Matches the scroll container's p-4. */
const PADDING = 16;
/** Matches the pages' mb-4. */
const PAGE_GAP = 16;

/** Fraction of the viewport height, from the top, that decides the current page. */
const READING_LINE = 0.25;

const ICON_BUTTON =
  'p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-tertiary';

type FitMode = 'width' | 'page';

interface PageSize {
  width: number;
  height: number;
}

/** A match as one page sees it: its rank among all matches, and its spans. */
interface PageMatch {
  index: number;
  ranges: MatchRange[];
}

const NO_MATCHES: PageMatch[] = [];

/** Offset of each page's top edge inside the scroll container. */
function computePageTops(sizes: PageSize[], scale: number): number[] {
  const tops: number[] = [];
  let y = PADDING;
  for (const size of sizes) {
    tops.push(y);
    y += size.height * scale + PAGE_GAP;
  }
  return tops;
}

/** Index of the last page starting at or above `y`. */
function pageIndexAt(tops: number[], y: number): number {
  let index = 0;
  for (let i = 0; i < tops.length && tops[i] <= y; i++) index = i;
  return index;
}

/** Scale at which the widest page, or the whole of `page`, fits the container. */
function computeFitScale(mode: FitMode, container: HTMLElement, sizes: PageSize[], page: number): number {
  const width = container.clientWidth - 2 * PADDING;
  if (mode === 'width') {
    return clampScale(width / Math.max(...sizes.map((s) => s.width)));
  }
  const size = sizes[page - 1];
  return clampScale(Math.min(width / size.width, (container.clientHeight - 2 * PADDING) / size.height));
}

interface PdfPreviewProps {
  file: Blob;
}

/**
 * Renders a PDF via pdfjs-dist onto canvases instead of the browser's native
 * PDF plugin. Avoids the iframe/sandbox tradeoffs (Chrome refuses to run its
 * PDF plugin inside a sandboxed iframe at all; without sandbox, a mislabeled
 * file gets same-origin script execution). pdf.js parses PDF bytes directly
 * and never executes them as a document.
 *
 * Takes the bytes, not a blob: URL. Given a URL, pdf.js loads it with fetch(),
 * which the production CSP (connect-src without blob:) refuses: the load fails
 * with an opaque "Unexpected server response (0)".
 *
 * Pages are stacked for continuous scrolling. Every page holds its final box
 * from the start (sizes are read up front), but only those near the viewport
 * are drawn: a long document at high zoom would otherwise hold hundreds of
 * megabytes of canvas.
 */
export function PdfPreview({ file }: PdfPreviewProps) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<FitMode | null>('width');
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [textIndex, setTextIndex] = useState<PageText[] | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [matches, setMatches] = useState<PdfMatch[]>([]);
  const [currentMatch, setCurrentMatch] = useState(-1);
  // Bumped on each jump to a match, so a page re-rendered later (zoom, or
  // scrolled away and back) does not yank the view back to it.
  const [revealToken, setRevealToken] = useState(0);
  const numPages = sizes.length;

  // A new file starts from a blank state; reset while rendering rather than
  // in the load effect, so the stale document never paints.
  const [shownFile, setShownFile] = useState(file);
  if (file !== shownFile) {
    setShownFile(file);
    setIsLoading(true);
    setError(false);
    setDoc(null);
    setSizes([]);
    setPageNum(1);
    setScale(null);
    setFitMode('width');
    setVisiblePages(new Set());
    setSearchOpen(false);
    setQuery('');
    setTextIndex(null);
    setIndexing(false);
    setMatches([]);
    setCurrentMatch(-1);
  }

  // Load the document, read every page's size and compute a fit-to-width scale
  useEffect(() => {
    let cancelled = false;
    docRef.current = null;

    // Local to this effect run, never a ref: in StrictMode the effect runs
    // twice, and a ref shared between runs let the first run's late promise
    // destroy the second run's task — leaving a live document whose transport
    // was already torn down.
    let task: PDFDocumentLoadingTask | null = null;

    Promise.all([loadPdfjs(), file.arrayBuffer()])
      .then(([pdfjsLib, data]) => {
        // pdf.js 6 dropped PDFDocumentProxy.destroy(); tearing down the worker
        // transport now goes through the loading task.
        task = pdfjsLib.getDocument({ data });
        if (cancelled) {
          void task.destroy();
          return null;
        }
        return task.promise;
      })
      .then(async (loaded) => {
        if (!loaded || cancelled) return;
        // getViewport() applies /Rotate, so landscape pages get their real box.
        const pageSizes = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, i) =>
            loaded.getPage(i + 1).then((page) => {
              const { width, height } = page.getViewport({ scale: 1 });
              return { width, height };
            })
          )
        );
        if (cancelled) return;
        const container = containerRef.current;
        docRef.current = loaded;
        setDoc(loaded);
        setSizes(pageSizes);
        setScale(container ? computeFitScale('width', container, pageSizes, 1) : 1);
        setIsLoading(false);
      })
      .catch((err) => {
        // Destroying the task rejects its pending promise: expected here.
        if (cancelled) return;
        console.error('Erreur de chargement du PDF:', err);
        setError(true);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [file]);

  const pageTops = useMemo(() => computePageTops(sizes, scale ?? 1), [sizes, scale]);

  // Draw only the pages within about one screen of the viewport. The root must
  // be the scroll container: the preview sits inside other scrolling contexts.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const n = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { root: container, rootMargin: '100% 0px' }
    );
    for (const el of pageRefs.current.slice(0, numPages)) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [numPages]);

  // A fit mode outlives a resize of the panel or window: refit when it changes
  const fitRef = useRef({ fitMode, sizes, pageNum });
  useEffect(() => {
    fitRef.current = { fitMode, sizes, pageNum };
  }, [fitMode, sizes, pageNum]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;
    const observer = new ResizeObserver(() => {
      const { fitMode: mode, sizes: pageSizes, pageNum: page } = fitRef.current;
      if (mode) setScale(computeFitScale(mode, container, pageSizes, page));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [numPages]);

  // Keep the same spot of the same page on the reading line when zooming,
  // instead of jumping to the top. Fitting a whole page aligns it instead.
  const prevScaleRef = useRef<number | null>(null);
  const alignPageRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const prev = prevScaleRef.current;
    prevScaleRef.current = scale;
    const alignPage = alignPageRef.current;
    alignPageRef.current = null;
    if (!container || scale === null || sizes.length === 0) return;
    const newTops = computePageTops(sizes, scale);
    if (alignPage !== null) {
      container.scrollTop = newTops[alignPage - 1] - PADDING;
      return;
    }
    if (prev === null || prev === scale) return;
    const offset = container.clientHeight * READING_LINE;
    const line = container.scrollTop + offset;
    const oldTops = computePageTops(sizes, prev);
    const i = pageIndexAt(oldTops, line);
    const ratio = Math.min(1, Math.max(0, (line - oldTops[i]) / (sizes[i].height * prev)));
    container.scrollTop = newTops[i] + ratio * sizes[i].height * scale - offset;
  }, [scale, sizes]);

  // The current page is the one crossing the reading line; once scrolled to
  // the end, the last one (it may never reach that line).
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || pageTops.length === 0) return;
    const { scrollTop, clientHeight, scrollHeight } = container;
    if (scrollHeight > clientHeight && scrollTop + clientHeight >= scrollHeight - 1) {
      setPageNum(pageTops.length);
      return;
    }
    setPageNum(pageIndexAt(pageTops, scrollTop + clientHeight * READING_LINE) + 1);
  }, [pageTops]);

  const goToPage = (n: number) => {
    const container = containerRef.current;
    if (!container || n < 1 || n > numPages) return;
    setPageNum(n);
    container.scrollTo({ top: pageTops[n - 1] - PADDING });
  };

  const zoomOut = () => {
    setFitMode(null);
    setScale((s) => clampScale((s ?? 1) - ZOOM_STEP));
  };
  const zoomIn = () => {
    setFitMode(null);
    setScale((s) => clampScale((s ?? 1) + ZOOM_STEP));
  };
  const fit = (mode: FitMode) => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;
    setFitMode(mode);
    if (mode === 'page') alignPageRef.current = pageNum;
    const next = computeFitScale(mode, container, sizes, pageNum);
    // Same scale: the layout effect will not run, so align here.
    if (next === scale && mode === 'page') {
      alignPageRef.current = null;
      container.scrollTop = pageTops[pageNum - 1] - PADDING;
    }
    setScale(next);
  };

  // --- Search -------------------------------------------------------------

  /** Selects match `index` and brings it into view. */
  const goToMatch = (index: number, list: PdfMatch[] = matches) => {
    if (list.length === 0) return;
    const i = (index + list.length) % list.length;
    setCurrentMatch(i);
    setRevealToken((n) => n + 1);
    // An undrawn page has no span to reveal yet: scroll to it first, and the
    // page reveals the match once its text layer is in.
    const page = list[i].page;
    const container = containerRef.current;
    if (container && !visiblePages.has(page)) {
      container.scrollTo({ top: pageTops[page - 1] - PADDING });
    }
  };

  const runSearch = (text: string, index: PageText[] | null = textIndex) => {
    if (!index) return;
    const found = findMatches(index, text);
    setMatches(found);
    if (found.length === 0) {
      setCurrentMatch(-1);
      return;
    }
    // Start from the page being read, like a browser's find bar
    const first = found.findIndex((m) => m.page >= pageNum);
    goToMatch(first < 0 ? 0 : first, found);
  };

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.select());
    const loaded = docRef.current;
    if (!loaded || textIndex || indexing) return;
    setIndexing(true);
    Promise.all(
      Array.from({ length: loaded.numPages }, (_, i) =>
        loaded.getPage(i + 1)
          .then((page) => page.getTextContent())
          .then((content) => buildPageText(content.items.filter((item) => 'str' in item)))
      )
    )
      .then((pages) => {
        if (docRef.current !== loaded) return;
        setTextIndex(pages);
        setIndexing(false);
        const pending = searchInputRef.current?.value ?? '';
        if (pending) runSearch(pending, pages);
      })
      .catch((err) => {
        if (docRef.current !== loaded) return;
        console.error("Erreur d'indexation du PDF:", err);
        setIndexing(false);
      });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    setMatches([]);
    setCurrentMatch(-1);
  };

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goToMatch(currentMatch + (e.shiftKey ? -1 : 1));
    } else if (e.key === 'Escape') {
      // Close the search bar, not the preview around it
      e.stopPropagation();
      closeSearch();
    }
  };

  const handleRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearch();
    }
  };

  // Each page only gets its own matches, under a stable reference
  const matchesByPage = useMemo(() => {
    const byPage = new Map<number, PageMatch[]>();
    matches.forEach((m, index) => {
      const list = byPage.get(m.page) ?? [];
      list.push({ index, ranges: m.ranges });
      byPage.set(m.page, list);
    });
    return byPage;
  }, [matches]);

  const revealMatch = useCallback((el: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    const box = el.getBoundingClientRect();
    const frame = container.getBoundingClientRect();
    container.scrollTop += box.top - frame.top - container.clientHeight / 2 + box.height / 2;
    if (box.left < frame.left || box.right > frame.left + container.clientWidth) {
      container.scrollLeft += box.left - frame.left - container.clientWidth / 2 + box.width / 2;
    }
  }, []);

  const currentPage = currentMatch >= 0 ? matches[currentMatch]?.page : undefined;
  let searchStatus = '';
  if (indexing) searchStatus = t('pdfPreview.indexing');
  else if (query.trim() && textIndex) {
    searchStatus = matches.length > 0 ? `${currentMatch + 1} / ${matches.length}` : t('pdfPreview.noMatch');
  }

  const fitButtonClass = (mode: FitMode) =>
    `${ICON_BUTTON} rounded ${fitMode === mode ? 'bg-bg-tertiary text-text-primary' : ''}`;

  return (
    <div className="w-full h-full flex flex-col outline-none" tabIndex={-1} onKeyDown={handleRootKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1.5 border-b border-border-default bg-bg-secondary flex-shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => goToPage(pageNum - 1)}
            disabled={pageNum <= 1}
            className={ICON_BUTTON}
            title={t('pdfPreview.previousPage')}
            aria-label={t('pdfPreview.previousPage')}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-text-secondary tabular-nums min-w-[3.5rem] text-center">
            {numPages > 0 ? `${pageNum} / ${numPages}` : '—'}
          </span>
          <button
            onClick={() => goToPage(pageNum + 1)}
            disabled={pageNum >= numPages}
            className={ICON_BUTTON}
            title={t('pdfPreview.nextPage')}
            aria-label={t('pdfPreview.nextPage')}
          >
            <ChevronRight size={14} />
          </button>
          <span className="w-px h-4 bg-border-default mx-1" />
          {searchOpen ? (
            <>
              <input
                ref={searchInputRef}
                type="text"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  runSearch(e.target.value);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('pdfPreview.searchPlaceholder')}
                aria-label={t('pdfPreview.search')}
                data-testid="pdf-preview-search"
                className="w-36 min-w-0 px-2 py-0.5 text-xs rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent sketchy-border"
              />
              <span className="text-text-secondary tabular-nums whitespace-nowrap px-1 empty:hidden" aria-live="polite">
                {searchStatus}
              </span>
              <button
                onClick={() => goToMatch(currentMatch - 1)}
                disabled={matches.length === 0}
                className={ICON_BUTTON}
                title={t('pdfPreview.previousMatch')}
                aria-label={t('pdfPreview.previousMatch')}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => goToMatch(currentMatch + 1)}
                disabled={matches.length === 0}
                className={ICON_BUTTON}
                title={t('pdfPreview.nextMatch')}
                aria-label={t('pdfPreview.nextMatch')}
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={closeSearch}
                className={ICON_BUTTON}
                title={t('pdfPreview.closeSearch')}
                aria-label={t('pdfPreview.closeSearch')}
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={openSearch}
              disabled={numPages === 0}
              className={ICON_BUTTON}
              title={t('pdfPreview.search')}
              aria-label={t('pdfPreview.search')}
            >
              <Search size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fit('width')}
            disabled={numPages === 0}
            className={fitButtonClass('width')}
            title={t('pdfPreview.fitWidth')}
            aria-label={t('pdfPreview.fitWidth')}
            aria-pressed={fitMode === 'width'}
          >
            <MoveHorizontal size={14} />
          </button>
          <button
            onClick={() => fit('page')}
            disabled={numPages === 0}
            className={fitButtonClass('page')}
            title={t('pdfPreview.fitPage')}
            aria-label={t('pdfPreview.fitPage')}
            aria-pressed={fitMode === 'page'}
          >
            <MoveVertical size={14} />
          </button>
          <span className="w-px h-4 bg-border-default mx-1" />
          <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} />
        </div>
      </div>
      {/* Block layout, not flex centering: mx-auto centers a narrow page but
          left-aligns a wide one, whose left edge flex would clip out of reach.
          The stable gutter keeps the scrollbar from eating into the fit width. */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        data-testid="pdf-preview-scroll"
        className="flex-1 overflow-auto bg-bg-tertiary p-4 [scrollbar-gutter:stable]"
      >
        {error ? (
          <div className="flex flex-col items-center justify-center gap-2 text-text-tertiary py-8">
            <FileWarning size={32} />
            <p className="text-xs">{t('pdfPreview.loadError')}</p>
          </div>
        ) : isLoading || !doc || scale === null ? (
          <div className="flex items-center justify-center p-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          sizes.map((size, i) => (
            <div
              key={i}
              ref={(el) => { pageRefs.current[i] = el; }}
              data-page={i + 1}
              className="relative bg-white mx-auto mb-4 last:mb-0"
              style={{ width: size.width * scale, height: size.height * scale }}
            >
              <PdfPage
                doc={doc}
                pageNum={i + 1}
                scale={scale}
                visible={visiblePages.has(i + 1)}
                matches={matchesByPage.get(i + 1) ?? NO_MATCHES}
                currentMatch={currentPage === i + 1 ? currentMatch : -1}
                revealToken={currentPage === i + 1 ? revealToken : 0}
                onReveal={revealMatch}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNum: number;
  scale: number;
  visible: boolean;
  matches: PageMatch[];
  /** Rank of the selected match if it is on this page, -1 otherwise. */
  currentMatch: number;
  /** Changes when the selected match on this page must be scrolled to. */
  revealToken: number;
  onReveal: (el: HTMLElement) => void;
}

function PdfPage({ doc, pageNum, scale, visible, matches, currentMatch, revealToken, onReveal }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  // The text layer's spans and their strings, for highlighting; the version
  // tells the highlight effect a fresh layer is in.
  const textRef = useRef<{ divs: HTMLElement[]; strs: string[] } | null>(null);
  const [textVersion, setTextVersion] = useState(0);
  const revealedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textDiv = textLayerRef.current;
    if (!canvas || !textDiv) return;
    textRef.current = null;
    if (!visible) {
      // Release the bitmap of pages scrolled far away
      canvas.width = 0;
      canvas.height = 0;
      textDiv.replaceChildren();
      return;
    }
    let cancelled = false;

    // Held so the effect cleanup can cancel it: without this, changing zoom
    // leaves the previous render running against the same canvas, and pdf.js
    // aborts it on its own with a RenderingCancelledException.
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    let unregisterSelection: (() => void) | null = null;

    Promise.all([loadPdfjs(), doc.getPage(pageNum)])
      .then(async ([pdfjsLib, page]) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        // Transparent spans laid over the canvas, at the glyphs' positions, so
        // the text can be selected and copied. The layer sizes itself from
        // CSS variables: viewport.scale, not the zoom state, since it already
        // includes the page's UserUnit.
        textDiv.replaceChildren();
        textDiv.style.setProperty('--total-scale-factor', String(viewport.scale));
        textDiv.style.setProperty('--scale-round-x', '1px');
        textDiv.style.setProperty('--scale-round-y', '1px');
        const layer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        });
        textLayer = layer;

        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        const textReady = layer.render().then(() => {
          if (cancelled) return;
          unregisterSelection = registerTextLayer(textDiv);
          textRef.current = { divs: layer.textDivs, strs: [...layer.textContentItemsStr] };
          setTextVersion((v) => v + 1);
        });
        await Promise.all([renderTask.promise, textReady]);
      })
      .catch((err: unknown) => {
        // Cancelling is how this component switches zoom level or drops a
        // page scrolled out of range; it is control flow, not a failure.
        if (cancelled || (err as { name?: string })?.name === 'RenderingCancelledException') return;
        console.error('Erreur de rendu de la page PDF:', err);
        setError(true);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      unregisterSelection?.();
    };
  }, [doc, pageNum, scale, visible]);

  // Wrap matched text in highlight spans, inside the text layer's own spans.
  // Indices line up: the layer makes one span per text item, in order.
  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const byItem = new Map<number, { from: number; to: number; current: boolean }[]>();
    for (const m of matches) {
      for (const r of m.ranges) {
        const list = byItem.get(r.item) ?? [];
        list.push({ from: r.from, to: r.to, current: m.index === currentMatch });
        byItem.set(r.item, list);
      }
    }

    let currentEl: HTMLElement | null = null;
    for (const [item, parts] of byItem) {
      const div = text.divs[item];
      const str = text.strs[item];
      if (!div || str === undefined) continue;
      parts.sort((a, b) => a.from - b.from);
      const nodes: Node[] = [];
      let pos = 0;
      for (const part of parts) {
        if (part.from > pos) nodes.push(document.createTextNode(str.slice(pos, part.from)));
        const mark = document.createElement('span');
        mark.className = part.current ? 'pdf-match pdf-match-current' : 'pdf-match';
        mark.textContent = str.slice(part.from, part.to);
        nodes.push(mark);
        if (part.current && !currentEl) currentEl = mark;
        pos = part.to;
      }
      if (pos < str.length) nodes.push(document.createTextNode(str.slice(pos)));
      div.replaceChildren(...nodes);
    }

    if (currentEl && revealToken !== revealedRef.current) {
      revealedRef.current = revealToken;
      onReveal(currentEl);
    }

    return () => {
      // Back to plain strings, for the next set of matches
      for (const item of byItem.keys()) {
        const div = text.divs[item];
        if (div) div.textContent = text.strs[item];
      }
    };
  }, [textVersion, matches, currentMatch, revealToken, onReveal]);

  return (
    <>
      <canvas ref={canvasRef} data-testid="pdf-preview-canvas" className="block" />
      <div ref={textLayerRef} data-testid="pdf-preview-text" className="textLayer" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-text-tertiary">
          <FileWarning size={24} />
        </div>
      )}
    </>
  );
}
