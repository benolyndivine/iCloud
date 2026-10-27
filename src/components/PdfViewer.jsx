import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  FileText,
  BookOpen,
  ScrollText,
  RotateCcw
} from 'lucide-react';
import { useBackHandler } from '../context/BackNavigationContext';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// =====================================================================
// INDIVIDUAL PDF PAGE COMPONENT
// =====================================================================
function PdfPage({
  pageNum,
  numPages,
  pdfDoc,
  scale,
  pageWidth,
  defaultAspectRatio,
  onInView,
}) {
  const cardRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderedScaleRef = useRef(0);
  const renderedWidthRef = useRef(0);

  // First 2 pages initialize as in-view for instant visual load
  const [isInView, setIsInView] = useState(pageNum <= 2);
  const [isRendered, setIsRendered] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [pageRatio, setPageRatio] = useState(defaultAspectRatio || 1.414);

  // Fetch page aspect ratio if document has varied orientation
  useEffect(() => {
    let active = true;
    if (pdfDoc) {
      pdfDoc
        .getPage(pageNum)
        .then((page) => {
          if (active) {
            const vp = page.getViewport({ scale: 1 });
            if (vp.width && vp.height) {
              setPageRatio(vp.height / vp.width);
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum]);

  // Observer to trigger rendering when page nears viewport
  useEffect(() => {
    if (!cardRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            onInView?.(pageNum);
          }
        });
      },
      {
        rootMargin: '600px 0px 600px 0px', // Preload buffer
        threshold: [0.01, 0.4],
      }
    );

    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [pageNum, onInView]);

  // Render canvas with high-DPI sharpness and proper task cancellation
  useEffect(() => {
    if (!isInView || !pdfDoc) return;

    let isCancelled = false;

    async function renderPageCanvas() {
      // Avoid re-rendering if dimensions and scale haven't changed
      if (
        renderedScaleRef.current === scale &&
        renderedWidthRef.current === pageWidth &&
        isRendered
      ) {
        return;
      }

      // Cancel previous in-flight render task if any
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancellation
        }
        renderTaskRef.current = null;
      }

      try {
        setIsRendering(true);
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled || !canvasRef.current) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const fitScale = pageWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: fitScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        // High-DPI crisp rendering capped safely at 2.5x to preserve GPU memory
        const dpr = Math.min(window.devicePixelRatio || 2, 2.5);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;

        await task.promise;
        if (isCancelled) return;

        renderedScaleRef.current = scale;
        renderedWidthRef.current = pageWidth;
        setIsRendered(true);
        setIsRendering(false);
      } catch (err) {
        if (err?.name === 'RenderingCancelledException') {
          return;
        }
        console.warn(`Error rendering PDF page ${pageNum}:`, err);
        setIsRendering(false);
      }
    }

    renderPageCanvas();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [isInView, pdfDoc, pageNum, pageWidth, scale, isRendered]);

  const pageHeight = Math.floor(pageWidth * pageRatio);

  return (
    <div
      ref={cardRef}
      data-page-card={pageNum}
      style={{
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        minHeight: `${pageHeight}px`,
      }}
      className="shrink-0 relative bg-white rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.6)] border border-slate-300/30 overflow-hidden select-text transition-[width,height] duration-150 mx-auto"
    >
      {/* 1. Underlying Crisp Document Canvas */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 block transition-opacity duration-200 select-text ${
          isRendered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 2. Realistic Document Skeleton Placeholder (shown before canvas completes) */}
      {!isRendered && (
        <div className="absolute inset-0 flex flex-col justify-between p-6 bg-white animate-pulse pointer-events-none">
          <div className="w-1/3 h-3 bg-slate-200 rounded" />
          <div className="space-y-3 my-auto px-2">
            <div className="w-full h-2.5 bg-slate-100 rounded" />
            <div className="w-5/6 h-2.5 bg-slate-100 rounded" />
            <div className="w-11/12 h-2.5 bg-slate-100 rounded" />
            <div className="w-3/4 h-2.5 bg-slate-100 rounded" />
            <div className="w-full h-2.5 bg-slate-100 rounded" />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
            <span>Loading Page {pageNum}...</span>
            <span>{numPages > 0 ? `${pageNum} / ${numPages}` : ''}</span>
          </div>
        </div>
      )}

      {/* 3. Sleek Floating Page Corner Badge */}
      <div className="absolute bottom-2.5 right-2.5 bg-slate-900/80 backdrop-blur-md text-white/95 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white/10 pointer-events-none z-10">
        {pageNum} / {numPages}
      </div>
    </div>
  );
}

// =====================================================================
// MAIN GOOGLE DRIVE STYLE PDF VIEWER
// =====================================================================
export default function PdfViewer({ url, fileName, onToggleControls }) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [viewMode, setViewMode] = useState('continuous'); // 'continuous' | 'single'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(1.414); // Default A4
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [jumpInputValue, setJumpInputValue] = useState('1');

  // Dismiss jump modal on Android back
  useBackHandler(() => setShowJumpModal(false), 90, showJumpModal);

  const containerRef = useRef(null);
  const pagesContainerRef = useRef(null);
  const pdfDocRef = useRef(null);

  const [containerWidth, setContainerWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 390
  );

  // Keep track of container width with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const measure = () => {
      if (containerRef.current?.clientWidth) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
  }, []);

  // Load the PDF Document
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    async function loadPdf() {
      try {
        let pdf = null;
        try {
          // Strategy 1: Direct URL loading
          const task = pdfjsLib.getDocument({
            url,
            cMapUrl: 'https://unpkg.com/pdfjs-dist@6.4.299/cmaps/',
            cMapPacked: true,
          });
          pdf = await task.promise;
        } catch (directErr) {
          console.warn('Direct URL loading failed, trying arrayBuffer fetch:', directErr);
          // Strategy 2: ArrayBuffer fetch fallback
          const res = await fetch(url);
          const data = await res.arrayBuffer();
          const task = pdfjsLib.getDocument({
            data,
            cMapUrl: 'https://unpkg.com/pdfjs-dist@6.4.299/cmaps/',
            cMapPacked: true,
          });
          pdf = await task.promise;
        }

        if (isCancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);

        // Fetch page 1 to establish baseline aspect ratio
        try {
          const page1 = await pdf.getPage(1);
          const vp = page1.getViewport({ scale: 1 });
          if (vp.width && vp.height) {
            setAspectRatio(vp.height / vp.width);
          }
        } catch (e) {}

        setLoading(false);
      } catch (err) {
        if (isCancelled) return;
        console.error('All PDF.js loading strategies failed:', err);
        setError('Could not render PDF directly.');
        setLoading(false);
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [url]);

  // Compute optimal page width based on container width and zoom scale
  const availableWidth = Math.max(containerWidth - 24, 280);
  const maxBaseWidth = Math.min(availableWidth, 840);
  const pageWidth = Math.floor(maxBaseWidth * scale);

  // Page Scroll Tracker in Continuous Mode
  const handleScroll = () => {
    if (!pagesContainerRef.current || viewMode !== 'continuous') return;
    const container = pagesContainerRef.current;
    const containerTop = container.scrollTop + 90;

    const pageEls = container.querySelectorAll('[data-page-card]');
    let active = 1;

    pageEls.forEach((el) => {
      const top = el.offsetTop;
      if (containerTop >= top - 30) {
        active = Number(el.getAttribute('data-page-card'));
      }
    });

    if (active) {
      setCurrentPage(active);
    }
  };

  const handlePageVisible = useCallback((pageNum) => {
    // Keep currentPage synced
  }, []);

  // Jump to specific page
  const scrollToPage = (targetPage) => {
    const pageNum = Math.max(1, Math.min(targetPage, numPages));
    setCurrentPage(pageNum);

    if (viewMode === 'continuous') {
      const el = pagesContainerRef.current?.querySelector(`[data-page-card="${pageNum}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const zoomIn = (e) => {
    e?.stopPropagation();
    setScale((prev) => Math.min(Number((prev + 0.2).toFixed(2)), 3.0));
  };

  const zoomOut = (e) => {
    e?.stopPropagation();
    setScale((prev) => Math.max(Number((prev - 0.2).toFixed(2)), 0.5));
  };

  const resetZoom = (e) => {
    e?.stopPropagation();
    setScale(1.0);
  };

  const handleJumpSubmit = (e) => {
    e?.preventDefault();
    const target = parseInt(jumpInputValue, 10);
    if (!isNaN(target)) {
      scrollToPage(target);
    }
    setShowJumpModal(false);
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="w-full h-full flex flex-col bg-slate-100 dark:bg-[#111318] text-slate-900 dark:text-white relative overflow-hidden select-none transition-colors duration-200"
    >
      {/* ======================================================== */}
      {/* 1. GOOGLE DRIVE STYLE FLOATING TOOLBAR                   */}
      {/* ======================================================== */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-300/80 dark:border-white/15 px-3 py-1.5 rounded-full shadow-lg dark:shadow-2xl flex items-center space-x-1.5 text-xs font-medium max-w-[95vw] transition-colors"
      >
        {/* Page Nav: Previous Page */}
        <button
          onClick={() => scrollToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1 hover:bg-slate-200/80 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white disabled:opacity-30 cursor-pointer active:scale-90"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page Indicator (Clickable to jump) */}
        <button
          onClick={() => {
            setJumpInputValue(String(currentPage));
            setShowJumpModal((prev) => !prev);
          }}
          className="text-slate-800 dark:text-slate-100 font-bold px-2 py-0.5 rounded-md hover:bg-slate-200/80 dark:hover:bg-white/10 transition-colors text-[11px] whitespace-nowrap cursor-pointer"
          title="Click to jump to page"
        >
          {numPages > 0 ? `${currentPage} / ${numPages}` : '1 / 1'}
        </button>

        {/* Page Nav: Next Page */}
        <button
          onClick={() => scrollToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
          className="p-1 hover:bg-slate-200/80 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white disabled:opacity-30 cursor-pointer active:scale-90"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>

        <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-white/20 mx-0.5" />

        {/* Zoom Out */}
        <button
          onClick={zoomOut}
          className="p-1 hover:bg-slate-200/80 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer active:scale-90"
          title="Zoom out"
        >
          <ZoomOut size={15} />
        </button>

        {/* Zoom Level Indicator */}
        <button
          onClick={resetZoom}
          className="text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-200/80 dark:hover:bg-white/10 cursor-pointer"
          title="Reset zoom to 100%"
        >
          {Math.round(scale * 100)}%
        </button>

        {/* Zoom In */}
        <button
          onClick={zoomIn}
          className="p-1 hover:bg-slate-200/80 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer active:scale-90"
          title="Zoom in"
        >
          <ZoomIn size={15} />
        </button>

        <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-white/20 mx-0.5" />

        {/* View Mode Toggle: Continuous vs Single Page */}
        <button
          onClick={() =>
            setViewMode((prev) => (prev === 'continuous' ? 'single' : 'continuous'))
          }
          className={`p-1 rounded-full transition-colors cursor-pointer active:scale-90 ${
            viewMode === 'continuous'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-500/15 hover:bg-blue-500/25'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-white/10'
          }`}
          title={
            viewMode === 'continuous'
              ? 'Current: Continuous Scroll (Click for Single Page)'
              : 'Current: Single Page (Click for Continuous Scroll)'
          }
        >
          {viewMode === 'continuous' ? <ScrollText size={14} /> : <BookOpen size={14} />}
        </button>

        {/* Fit Width / Reset */}
        <button
          onClick={resetZoom}
          className="p-1 hover:bg-slate-200/80 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer active:scale-90"
          title="Fit width"
        >
          <Maximize2 size={13} />
        </button>

        {/* External Link */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-slate-200/80 dark:hover:bg-white/10 rounded-full transition-colors text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
          title="Open original PDF in browser"
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {/* ======================================================== */}
      {/* JUMP TO PAGE POPUP MODAL                                 */}
      {/* ======================================================== */}
      {showJumpModal && (
        <form
          onSubmit={handleJumpSubmit}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-300 dark:border-white/20 p-2.5 rounded-2xl shadow-2xl flex items-center space-x-2 text-slate-800 dark:text-white animate-in fade-in zoom-in-95 duration-150"
        >
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Page:</span>
          <input
            type="number"
            min="1"
            max={numPages}
            value={jumpInputValue}
            onChange={(e) => setJumpInputValue(e.target.value)}
            autoFocus
            className="w-14 px-2 py-1 bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 rounded-lg text-xs font-bold text-center text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">/ {numPages}</span>
          <button
            type="submit"
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform cursor-pointer"
          >
            Go
          </button>
          <button
            type="button"
            onClick={() => setShowJumpModal(false)}
            className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </form>
      )}

      {/* ======================================================== */}
      {/* 2. MAIN DOCUMENT STAGE: GOOGLE DRIVE STYLE WHITE PAGES   */}
      {/* ======================================================== */}
      <div
        ref={pagesContainerRef}
        onScroll={handleScroll}
        onClick={onToggleControls}
        className="flex-1 w-full overflow-y-auto overflow-x-auto custom-scroll pt-14 pb-20 select-text"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center my-auto py-32 space-y-3">
            <RefreshCw size={28} className="animate-spin text-blue-400" />
            <p className="text-xs font-semibold text-slate-200">Opening PDF Document...</p>
            <p className="text-[11px] text-slate-400 max-w-xs truncate">{fileName}</p>
          </div>
        ) : error ? (
          /* High-fidelity Fallback: Embedded Google Docs Viewer */
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex flex-col items-center justify-center p-3 space-y-3"
          >
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
              title={fileName}
              className="w-full h-[68vh] rounded-2xl border border-white/10 shadow-2xl bg-white"
            />
            <div className="flex items-center space-x-3">
              <a
                href={url}
                download={fileName}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-lg active:scale-95 transition-all"
              >
                <Download size={14} />
                <span>Download PDF</span>
              </a>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 active:scale-95 transition-all"
              >
                <ExternalLink size={14} />
                <span>Open in New Tab</span>
              </a>
            </div>
          </div>
        ) : viewMode === 'continuous' ? (
          /* Continuous Vertical Scroll (Google Drive Style) */
          <div className="min-w-fit w-full flex flex-col items-center space-y-6 px-3 py-4">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <PdfPage
                key={pageNum}
                pageNum={pageNum}
                numPages={numPages}
                pdfDoc={pdfDocRef.current}
                scale={scale}
                pageWidth={pageWidth}
                defaultAspectRatio={aspectRatio}
                onInView={handlePageVisible}
              />
            ))}
          </div>
        ) : (
          /* Single Page View */
          <div className="w-full min-h-full flex flex-col items-center justify-center p-3">
            <PdfPage
              key={currentPage}
              pageNum={currentPage}
              numPages={numPages}
              pdfDoc={pdfDocRef.current}
              scale={scale}
              pageWidth={pageWidth}
              defaultAspectRatio={aspectRatio}
              onInView={handlePageVisible}
            />
            {/* Single page navigation controls */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center space-x-4 mt-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full border border-slate-300 dark:border-white/10 text-slate-800 dark:text-white shadow-lg"
            >
              <button
                onClick={() => scrollToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white disabled:opacity-30 cursor-pointer active:scale-90"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs font-bold text-slate-800 dark:text-white">
                Page {currentPage} of {numPages}
              </span>
              <button
                onClick={() => scrollToPage(currentPage + 1)}
                disabled={currentPage >= numPages}
                className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white disabled:opacity-30 cursor-pointer active:scale-90"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
