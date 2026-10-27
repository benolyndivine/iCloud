import React, { useState, useEffect, useRef } from 'react';
import { Play, Image as ImageIcon, Music, FileText, Zap, Check, Maximize2 } from 'lucide-react';
import SmartImage from './SmartImage';

// Module-level persistent cache of tile keys that have entered view.
// Once a tile is marked in-view, it NEVER drops back to skeleton placeholder even when remounted!
const globalLoadedTiles = new Set();

/**
 * LazyGridTile
 * Highly optimized viewport-aware grid tile that defers mounting and network fetching
 * of media (images/videos) until the tile is within the screen preview or prefetch margin.
 * Initial screen preview files (idx < 20) load instantly with 0ms delay.
 * Supports multi-select checkbox, quick expand preview, and long-press selection.
 */
function LazyGridTileComponent({
  file,
  idx = 0,
  onClick,
  isImg,
  isVid,
  isAud,
  isPdf,
  fileName,
  ext,
  timeStr,
  VideoComponent,
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPress,
  onExpand,
}) {
  const containerRef = useRef(null);
  const fileKey = file?.key || fileName || file?.name || (file?.downloadUrl ? file.downloadUrl.split('?')[0] : '') || String(idx);

  // 1. Instant view for screen preview files (idx < 20) or already loaded tiles!
  const [inView, setInView] = useState(() => {
    return idx < 20 || Boolean(fileKey && globalLoadedTiles.has(fileKey));
  });

  const longPressTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const isLongPressRef = useRef(false);

  useEffect(() => {
    if (inView) {
      if (fileKey) globalLoadedTiles.add(fileKey);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      setInView(true);
      if (fileKey) globalLoadedTiles.add(fileKey);
      return;
    }

    // Aggressive prefetch: 600px margin so tiles load while scrolling BEFORE appearing on screen!
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setInView(true);
          if (fileKey) globalLoadedTiles.add(fileKey);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: '600px 0px 600px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [inView, fileKey]);

  const handleTouchStart = (e) => {
    isLongPressRef.current = false;
    touchStartPosRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (onLongPress) {
        if ('vibrate' in navigator) {
          try { navigator.vibrate(40); } catch {}
        }
        onLongPress(file);
      }
    }, 450);
  };

  const handleTouchMove = (e) => {
    const moveX = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
    const moveY = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
    if (moveX > 10 || moveY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleClick = (e) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    if (isSelectMode) {
      onToggleSelect?.(file);
    } else {
      onClick?.(file);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress?.(file);
      }}
      className={`relative aspect-square overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900 border transition-all duration-200 select-none shadow-sm cursor-pointer ${
        isSelected
          ? 'ring-3 ring-[#84cc16] border-[#84cc16] scale-[0.96] shadow-md z-10'
          : 'border-slate-200/80 dark:border-white/10 hover:shadow-md dark:shadow-md dark:hover:shadow-xl hover:border-blue-400/50 active:scale-95'
      }`}
    >
      {!inView ? (
        // Lightweight skeleton placeholder while offscreen (0 network / 0 decode cost)
        <div className="w-full h-full bg-slate-200/40 dark:bg-slate-800/40 animate-pulse flex items-center justify-center pointer-events-none">
          {isVid ? (
            <Play size={16} className="text-slate-400/40 dark:text-white/20" />
          ) : isImg ? (
            <ImageIcon size={16} className="text-slate-400/40 dark:text-white/20" />
          ) : isAud ? (
            <Music size={16} className="text-pink-400/40 dark:text-pink-400/20" />
          ) : (
            <FileText size={16} className="text-emerald-400/40 dark:text-emerald-400/20" />
          )}
        </div>
      ) : (
        <>
          {isImg && file.downloadUrl ? (
            <SmartImage
              src={file.downloadUrl}
              alt={fileName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading={idx < 20 ? 'eager' : 'lazy'}
            />
          ) : isVid && file.downloadUrl ? (
            <div className="relative w-full h-full">
              <VideoComponent file={file} />
            </div>
          ) : isAud ? (
            <div className="w-full h-full bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-purple-950/90 dark:via-slate-900 dark:to-slate-950 flex flex-col items-center justify-center p-2.5 text-pink-600 dark:text-pink-400 group-hover:scale-105 transition-transform duration-300">
              <div className="w-10 h-10 rounded-2xl bg-pink-500/15 border border-pink-500/20 flex items-center justify-center text-pink-500 dark:text-pink-400 mb-1.5 shadow-inner">
                <Music size={20} />
              </div>
              <span className="text-[10px] font-bold text-slate-800 dark:text-white/90 truncate max-w-full px-1">{fileName}</span>
              <span className="text-[8px] font-semibold text-pink-500 dark:text-pink-400 uppercase mt-0.5 tracking-wider">Audio</span>
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-850 dark:to-slate-950 flex flex-col items-center justify-center p-2.5 text-slate-700 dark:text-slate-300 group-hover:scale-105 transition-transform duration-300">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-1.5 shadow-inner ${
                  isPdf
                    ? 'bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/25'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                }`}
              >
                <FileText size={20} />
              </div>
              <span className="text-[10px] font-bold text-slate-800 dark:text-white/90 truncate max-w-full px-1">{fileName}</span>
              <span
                className={`text-[8px] font-bold uppercase mt-0.5 px-2 py-0.5 rounded-full ${
                  isPdf
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {ext || 'DOC'}
              </span>
            </div>
          )}

          {/* Selection Mode Top-Right Checkbox Badge */}
          {isSelectMode && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(file);
              }}
              className="absolute top-2 right-2 z-20 cursor-pointer active:scale-90 transition-transform"
            >
              {isSelected ? (
                <div className="w-5 h-5 rounded-md bg-[#84cc16] border border-white flex items-center justify-center shadow-lg">
                  <Check size={13} strokeWidth={3} className="text-black" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-md bg-black/40 backdrop-blur-md border-2 border-white/85 shadow-md hover:bg-black/60" />
              )}
            </div>
          )}

          {/* Selection Mode Bottom-Right Quick Expand Button */}
          {isSelectMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand?.(file);
              }}
              className="absolute bottom-2 right-2 w-6 h-6 rounded-md bg-black/55 backdrop-blur-md border border-white/30 text-white flex items-center justify-center shadow-md hover:bg-black/80 active:scale-95 transition-all z-20 cursor-pointer"
              title="Open preview"
            >
              <Maximize2 size={11} className="text-white" />
            </button>
          )}

          {/* Lossless Compression Savings Badge */}
          {file.compressed && !isSelectMode && (
            <div
              title={`Compressed for AWS S3: -${file.savedPercent || Math.round(((file.originalSize - file.size) / file.originalSize) * 100)}% size saved (100% quality preserved)`}
              className="absolute top-2 right-2 bg-black/60 backdrop-blur-md border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center space-x-0.5 shadow-sm"
            >
              <Zap size={9} className="text-emerald-400" />
              <span>-{file.savedPercent || Math.round(((file.originalSize - file.size) / file.originalSize) * 100)}%</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const LazyGridTile = React.memo(LazyGridTileComponent, (prev, next) => {
  return (
    prev.file?.key === next.file?.key &&
    prev.file?.downloadUrl === next.file?.downloadUrl &&
    prev.isSelected === next.isSelected &&
    prev.isSelectMode === next.isSelectMode &&
    prev.idx === next.idx
  );
});

export default LazyGridTile;
