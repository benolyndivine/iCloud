import React, { useEffect, useRef } from 'react';

/**
 * ScrollSentinel
 * Invisible trigger element placed near the bottom of media lists.
 * Fires onIntersect when within rootMargin of the screen to smoothly expand visible batches.
 */
export default function ScrollSentinel({ onIntersect, rootMargin = '350px 0px 350px 0px' }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof onIntersect !== 'function') return;

    if (!('IntersectionObserver' in window)) {
      onIntersect();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0.01,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [onIntersect, rootMargin]);

  return <div ref={sentinelRef} className="h-6 w-full pointer-events-none opacity-0" aria-hidden="true" />;
}
