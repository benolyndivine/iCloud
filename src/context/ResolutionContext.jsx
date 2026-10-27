import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const ResolutionContext = createContext();

const VIEW_MODE_STORAGE_KEY = 'icloud_view_mode'; // 'auto' | 'mobile' | 'tablet' | 'desktop'

export function ResolutionProvider({ children }) {
  // Real window dimensions
  const [windowDimensions, setWindowDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    screenWidth: typeof window !== 'undefined' ? window.screen.width : 1200,
    screenHeight: typeof window !== 'undefined' ? window.screen.height : 800,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  }));

  // View mode simulation option ('auto' uses real window, or user can preview a specific device view)
  const [viewMode, setViewModeState] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (['auto', 'mobile', 'tablet', 'desktop'].includes(saved)) return saved;
    } catch {}
    return 'auto';
  });

  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {}
  }, []);

  // Listen for real window resize and orientation changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId = null;
    const handleResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setWindowDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          devicePixelRatio: window.devicePixelRatio || 1,
        });
      });
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Compute effective width based on view mode
  const effectiveWidth = useMemo(() => {
    if (viewMode === 'mobile') return 390;
    if (viewMode === 'tablet') return 820;
    if (viewMode === 'desktop') return Math.max(1280, windowDimensions.width);
    return windowDimensions.width;
  }, [viewMode, windowDimensions.width]);

  const effectiveHeight = useMemo(() => {
    if (viewMode === 'mobile') return 844;
    if (viewMode === 'tablet') return 1080;
    return windowDimensions.height;
  }, [viewMode, windowDimensions.height]);

  // Breakpoints
  const isMobile = effectiveWidth < 768;
  const isTablet = effectiveWidth >= 768 && effectiveWidth < 1024;
  const isDesktop = effectiveWidth >= 1024;
  const isUltrawide = effectiveWidth >= 1536;

  const breakpoint = useMemo(() => {
    if (effectiveWidth < 640) return 'xs';
    if (effectiveWidth < 768) return 'sm';
    if (effectiveWidth < 1024) return 'md';
    if (effectiveWidth < 1280) return 'lg';
    if (effectiveWidth < 1536) return 'xl';
    return '2xl';
  }, [effectiveWidth]);

  const orientation = effectiveWidth > effectiveHeight ? 'landscape' : 'portrait';

  const isTouch = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || (navigator.maxTouchPoints > 0);
  }, []);

  // Suggested columns for photo & file grids based on resolution
  const gridColumns = useMemo(() => {
    if (effectiveWidth < 480) return 3;
    if (effectiveWidth < 768) return 4;
    if (effectiveWidth < 1024) return 4;
    if (effectiveWidth < 1280) return 5;
    if (effectiveWidth < 1536) return 6;
    return 8;
  }, [effectiveWidth]);

  // Human-readable resolution string
  const resolutionLabel = useMemo(() => {
    const scale = windowDimensions.devicePixelRatio ? `@${Math.round(windowDimensions.devicePixelRatio * 10) / 10}x` : '';
    const typeLabel = isUltrawide ? 'Ultrawide' : isDesktop ? 'Desktop' : isTablet ? 'Tablet' : 'Mobile';
    return `${windowDimensions.width}×${windowDimensions.height} (${typeLabel} ${scale})`.trim();
  }, [windowDimensions, isDesktop, isTablet, isUltrawide]);

  const value = useMemo(() => ({
    // Dimensions
    width: effectiveWidth,
    height: effectiveHeight,
    realWidth: windowDimensions.width,
    realHeight: windowDimensions.height,
    screenWidth: windowDimensions.screenWidth,
    screenHeight: windowDimensions.screenHeight,
    devicePixelRatio: windowDimensions.devicePixelRatio,
    
    // Categorization
    isMobile,
    isTablet,
    isDesktop,
    isUltrawide,
    breakpoint,
    orientation,
    isTouch,
    gridColumns,
    resolutionLabel,

    // Simulation / view mode
    viewMode,
    setViewMode,
    isSimulated: viewMode !== 'auto',
  }), [
    effectiveWidth,
    effectiveHeight,
    windowDimensions,
    isMobile,
    isTablet,
    isDesktop,
    isUltrawide,
    breakpoint,
    orientation,
    isTouch,
    gridColumns,
    resolutionLabel,
    viewMode,
    setViewMode
  ]);

  return (
    <ResolutionContext.Provider value={value}>
      {children}
    </ResolutionContext.Provider>
  );
}

export function useResolution() {
  const context = useContext(ResolutionContext);
  if (!context) {
    throw new Error('useResolution must be used within a ResolutionProvider');
  }
  return context;
}
