import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LogOut } from 'lucide-react';

const BackNavigationContext = createContext(null);

/**
 * Global Back Navigation Provider
 * Manages:
 * 1. Native Android hardware & gesture navigation bar back button
 * 2. LIFO / Priority-based modal, drawer, and selection-mode dismissal stack
 * 3. Smart route back sequence across all app views
 * 4. Double-tap to exit on Root screens (/home, /welcome) with native-style toast
 * 5. Keyboard 'Escape' handling for desktop / laptop displays
 */
export function BackNavigationProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Priority handler stack: Array<{ id, handler, priority, registeredAt }>
  const handlersRef = useRef([]);
  const lastBackPressRef = useRef(0);
  const [exitToastMessage, setExitToastMessage] = useState(null);
  const exitToastTimerRef = useRef(null);

  const showExitToast = useCallback((msg = 'Press back again to exit') => {
    if (exitToastTimerRef.current) clearTimeout(exitToastTimerRef.current);
    setExitToastMessage(msg);
    exitToastTimerRef.current = setTimeout(() => {
      setExitToastMessage(null);
    }, 2000);
  }, []);

  /**
   * Register a custom back handler with priority.
   * Priority guideline:
   *  100: Top modals (PhotoEditor, FileDetails, CopyMove)
   *   90: Sub-modals & bottom sheets (EditMenu, MoreMenu, HistoryModal)
   *   70: Screen modes (Landscape tilt, Zoomed in)
   *   60: Selection mode (Multi-select in FilesScreen)
   *   40: In-screen sub-views (Selected album view, search filter)
   */
  const registerBackHandler = useCallback((handler, priority = 50) => {
    const id = Symbol('back_handler');
    const entry = {
      id,
      handler,
      priority,
      registeredAt: Date.now(),
    };

    handlersRef.current.push(entry);

    return () => {
      handlersRef.current = handlersRef.current.filter((item) => item.id !== id);
    };
  }, []);

  /**
   * Main Smart Back Sequence Executor
   */
  const smartGoBack = useCallback(() => {
    // 1. Check if any priority handler wants to consume the back event
    const sorted = [...handlersRef.current].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.registeredAt - a.registeredAt; // LIFO for identical priorities
    });

    for (const item of sorted) {
      try {
        const result = item.handler();
        // If handler didn't explicitly return false, it was handled
        if (result !== false) {
          return true;
        }
      } catch (err) {
        console.warn('[BackNav] Error in back handler:', err);
      }
    }

    const path = location.pathname;

    // 2. Root Home Screen: double-tap to exit Android app
    if (path === '/home') {
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        if (Capacitor.isNativePlatform()) {
          CapApp.exitApp();
        } else {
          showExitToast('Already at Home screen');
        }
      } else {
        lastBackPressRef.current = now;
        showExitToast('Press back again to exit');
      }
      return true;
    }

    // 3. Welcome Screen: double-tap to exit
    if (path === '/welcome') {
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        if (Capacitor.isNativePlatform()) {
          CapApp.exitApp();
        }
      } else {
        lastBackPressRef.current = now;
        showExitToast('Press back again to exit');
      }
      return true;
    }

    // 4. Login or Register Screen: return to Welcome
    if (path === '/login' || path === '/register') {
      navigate('/welcome');
      return true;
    }

    // 5. File Preview Screen: return to referrer, /files, or /home
    if (path.startsWith('/preview/')) {
      if (location.state?.from) {
        navigate(location.state.from);
      } else {
        navigate('/files');
      }
      return true;
    }

    // 6. Folder view: return to Files screen
    if (path.startsWith('/folder/')) {
      navigate('/files');
      return true;
    }

    // 7. Sub-features of Cleanup: return to Cleanup studio
    if (['/trash', '/duplicates', '/large-files', '/scanner', '/compression'].includes(path)) {
      if (location.state?.from && location.state.from !== path) {
        navigate(location.state.from);
      } else {
        navigate('/cleanup');
      }
      return true;
    }

    // 8. Utility & Secondary Screens: return to referrer or Home
    if (
      ['/analytics', '/notifications', '/search', '/upload', '/shared', '/settings'].includes(path) ||
      path.startsWith('/qr-share/')
    ) {
      if (location.state?.from && location.state.from !== path) {
        navigate(location.state.from);
      } else if (window.history.state?.idx > 0) {
        navigate(-1);
      } else {
        navigate('/home');
      }
      return true;
    }

    // 9. Main Navigation Tabs (/files, /cleanup, /backup, /profile): return to Home
    if (['/files', '/cleanup', '/backup', '/profile'].includes(path)) {
      navigate('/home');
      return true;
    }

    // 10. Default fallback
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/home');
    }
    return true;
  }, [location.pathname, location.state, navigate, showExitToast]);

  // Hook into Capacitor Native Android Hardware/Gesture Back Button
  useEffect(() => {
    const backListenerPromise = CapApp.addListener('backButton', () => {
      smartGoBack();
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [smartGoBack]);

  // Hook into Desktop 'Escape' key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        smartGoBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [smartGoBack]);

  return (
    <BackNavigationContext.Provider
      value={{
        smartGoBack,
        triggerBack: smartGoBack,
        registerBackHandler,
      }}
    >
      {children}

      {/* Floating Samsung OneUI / iOS Exit Toast Indicator */}
      {exitToastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center space-x-2.5 px-4 py-2.5 rounded-full bg-slate-900/95 dark:bg-black/95 text-white shadow-2xl border border-white/10 backdrop-blur-xl">
            <LogOut size={14} className="text-blue-400 rotate-180" />
            <span className="text-xs font-semibold tracking-wide">{exitToastMessage}</span>
          </div>
        </div>
      )}
    </BackNavigationContext.Provider>
  );
}

/**
 * Hook to access smart back navigation controls
 */
export function useBackNavigation() {
  const context = useContext(BackNavigationContext);
  if (!context) {
    throw new Error('useBackNavigation must be used within a BackNavigationProvider');
  }
  return context;
}

/**
 * Hook for components, modals, and screens to easily register back handlers
 * @param handler Function to execute when back is triggered (return true to consume)
 * @param priority Number (higher number runs first)
 * @param isActive Boolean indicating whether this handler is currently active
 */
export function useBackHandler(handler, priority = 50, isActive = true) {
  const { registerBackHandler } = useBackNavigation();

  useEffect(() => {
    if (!isActive) return;
    return registerBackHandler(handler, priority);
  }, [registerBackHandler, handler, priority, isActive]);
}
