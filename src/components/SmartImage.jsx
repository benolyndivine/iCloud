import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';

// In-memory cache of successfully loaded image URLs across the entire application session.
// Once an image has been decoded and loaded, subsequent mounts render with 0 delay and no pulse skeleton.
const loadedImageUrls = new Set();

/**
 * SmartImage
 * A resilient, high-speed image component that automatically recovers from transient network drops,
 * IP shifts (net::ERR_NETWORK_CHANGED), and socket timeouts with backoff retries and
 * instant rendering from in-memory cache.
 */
export default function SmartImage({
  src,
  alt = '',
  className = '',
  fallbackClassName = '',
  maxRetries = 3,
  retryDelay = 1200,
  showPlaceholder = true,
  loading = 'eager',
  onClick,
  ...props
}) {
  const isInitiallyLoaded = Boolean(src && loadedImageUrls.has(src));
  const [status, setStatus] = useState(isInitiallyLoaded ? 'loaded' : 'loading'); // 'loading' | 'loaded' | 'error'
  const [retryCount, setRetryCount] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const retryTimerRef = useRef(null);
  const imgRef = useRef(null);

  // When src changes, check memory cache
  useEffect(() => {
    setCurrentSrc(src);
    const cached = Boolean(src && loadedImageUrls.has(src));
    setStatus(cached ? 'loaded' : 'loading');
    setRetryCount(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [src]);

  // If the browser already has the image completed (e.g. from browser disk cache or pre-render)
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      if (src) loadedImageUrls.add(src);
      setStatus('loaded');
    }
  }, [currentSrc, src]);

  const attemptReload = useCallback(() => {
    if (!src) return;
    setStatus('loading');
    // Append or update cache-busting timestamp to establish a fresh TCP socket
    const [baseUrl, fragment] = src.split('#');
    const separator = baseUrl.includes('?') ? '&' : '?';
    const retryParam = `_retry=${Date.now()}`;
    const cleanUrl = baseUrl.replace(/([?&])_retry=\d+/, '');
    const newBase = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}${retryParam}`;
    const newSrc = fragment ? `${newBase}#${fragment}` : newBase;
    setCurrentSrc(newSrc);
  }, [src]);

  // Listen for network recovery events to auto-reload any failed image
  useEffect(() => {
    const handleOnline = () => {
      if (status === 'error' || retryCount > 0) {
        setRetryCount(0);
        attemptReload();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('app:network-restored', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('app:network-restored', handleOnline);
    };
  }, [status, retryCount, attemptReload]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const handleError = () => {
    if (retryCount < maxRetries) {
      const nextAttempt = retryCount + 1;
      setRetryCount(nextAttempt);
      const delay = retryDelay * Math.pow(1.5, retryCount);
      retryTimerRef.current = setTimeout(() => {
        attemptReload();
      }, delay);
    } else {
      setStatus('error');
    }
  };

  const handleLoad = () => {
    if (src) loadedImageUrls.add(src);
    setStatus('loaded');
    setRetryCount(0);
  };

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 ${className} ${fallbackClassName}`}>
        <ImageOff size={16} />
      </div>
    );
  }

  const isCached = loadedImageUrls.has(src);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {status === 'loading' && showPlaceholder && !isCached && (
        <div className="absolute inset-0 bg-slate-200/50 dark:bg-slate-800/50 animate-pulse pointer-events-none" />
      )}

      {status === 'error' ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setRetryCount(0);
            attemptReload();
          }}
          className={`w-full h-full flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-xs text-slate-300 cursor-pointer select-none group p-2 ${fallbackClassName}`}
          title="Network error. Click to reload"
        >
          <RefreshCw size={14} className="group-hover:rotate-180 transition-transform text-slate-300 group-hover:text-white mb-1" />
          <span className="text-[10px] text-slate-300 group-hover:text-white font-medium">Retry</span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={handleError}
          onLoad={handleLoad}
          onClick={onClick}
          className={`w-full h-full object-cover ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          } ${isCached ? '' : 'transition-opacity duration-200'}`}
          {...props}
        />
      )}
    </div>
  );
}
