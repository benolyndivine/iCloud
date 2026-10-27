import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function NetworkStatusNotifier() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);

  useEffect(() => {
    let timer = null;

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestoredNotice(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestoredNotice(true);
      // Notify application components (media galleries, file lists) to recover
      window.dispatchEvent(new CustomEvent('app:network-restored'));

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setShowRestoredNotice(false);
      }, 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (isOnline && !showRestoredNotice) {
    return null;
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300">
      {!isOnline ? (
        <div className="bg-amber-600/95 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full shadow-lg flex items-center space-x-2 text-xs font-medium border border-amber-400/30 animate-bounce">
          <WifiOff size={14} className="shrink-0" />
          <span>Network disconnected. Waiting for signal...</span>
        </div>
      ) : showRestoredNotice ? (
        <div className="bg-emerald-600/95 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full shadow-lg flex items-center space-x-2 text-xs font-medium border border-emerald-400/30 animate-fade-in">
          <Wifi size={14} className="shrink-0" />
          <span>Connection restored. Updating media...</span>
        </div>
      ) : null}
    </div>
  );
}
