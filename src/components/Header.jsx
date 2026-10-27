import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useResolution } from '../context/ResolutionContext';

/** iOS glass header — colors switch with the .dark class (Settings toggle). */
export default function Header() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isSimulated, setViewMode } = useResolution();
  const [imgFailed, setImgFailed] = useState(false);

  const email = currentUser?.email || '';
  const name = currentUser?.displayName || (email ? email.split('@')[0] : 'User');
  const initial = (name || email || 'U')[0].toUpperCase();
  const photoURL = currentUser?.photoURL;

  return (
    <header
      style={{
        paddingTop: 'var(--status-bar-height, 0px)',
      }}
      className="glass glass-header absolute top-0 left-0 right-0 px-4 flex flex-col justify-end z-30"
    >
      <div className="w-full h-14 flex items-center justify-between">
        {/* Left side: Branding */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_10px_-2px_rgba(59,130,246,0.5)]">
            iC
          </div>
          <span className="glass-title text-[17px] font-semibold tracking-tight">iCloud</span>
          {isSimulated && (
            <button
              onClick={() => setViewMode('auto')}
              className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded-full font-bold shadow-sm transition-transform active:scale-95"
              title="Return to automatic screen resolution mode"
            >
              Exit Sim
            </button>
          )}
        </div>

        {/* Right side: Styled Notification Bell & Ringed Profile Avatar */}
        <div className="flex items-center gap-2.5">
          {/* Modern Bell Button with Unread Indicator */}
          <button
            onClick={() => navigate('/notifications')}
            aria-label="Notifications"
            className="relative w-9 h-9 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all shadow-sm active:scale-95 border border-slate-200/60 dark:border-slate-700/60"
          >
            <Bell size={17} strokeWidth={2} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
          </button>

          {/* Profile Avatar with Gradient Ring */}
          <button
            onClick={() => navigate('/profile')}
            aria-label="Profile"
            className="relative w-9 h-9 rounded-full p-[2px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 focus:outline-none transition-transform active:scale-95"
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-slate-900 flex items-center justify-center">
              {photoURL && !imgFailed ? (
                <img
                  src={photoURL}
                  alt={name}
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                  {initial}
                </div>
              )}
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
