import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Folder,
  Sparkles,
  Cloud,
  Scan,
  Copy,
  Layers,
  Zap,
  Share2,
  Trash2,
  PieChart,
  Settings,
  User,
  ChevronLeft,
  ChevronRight,
  LogOut,
  HardDrive,
  RefreshCw,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STORAGE_LIMIT_GB } from '../config';
import { getCachedUserFiles } from '../services/firebase/backupService';
import { auth } from '../services/firebase/firebaseClient';

export default function DesktopSidebar({ isCollapsed, onToggleCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const [imgFailed, setImgFailed] = useState(false);

  // Storage info from cache / sync
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    const user = currentUser || auth.currentUser;
    if (user?.uid) {
      const cached = getCachedUserFiles(user.uid);
      setFileCount(cached.length || 0);
    }
  }, [currentUser]);

  const email = currentUser?.email || '';
  const name = currentUser?.displayName || (email ? email.split('@')[0] : 'User');
  const initial = (name || email || 'U')[0].toUpperCase();
  const photoURL = currentUser?.photoURL;

  const mainNav = [
    { label: 'Overview', path: '/home', icon: Home },
    { label: 'All Files', path: '/files', icon: Folder },
    { label: 'AI Cleanup', path: '/cleanup', icon: Sparkles },
    { label: 'Cloud Backup', path: '/backup', icon: Cloud },
  ];

  const toolsNav = [
    { label: 'Storage Scanner', path: '/scanner', icon: Scan },
    { label: 'Duplicates', path: '/duplicates', icon: Copy },
    { label: 'Large Files', path: '/large-files', icon: Layers },
    { label: 'Compression', path: '/compression', icon: Zap },
    { label: 'Shared Files', path: '/shared', icon: Share2 },
    { label: 'Trash Bin', path: '/trash', icon: Trash2 },
    { label: 'Analytics', path: '/analytics', icon: PieChart },
  ];

  return (
    <aside
      className={`h-screen flex flex-col shrink-0 select-none border-r border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl transition-all duration-300 z-30 ${
        isCollapsed ? 'w-[76px]' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div
          onClick={() => navigate('/home')}
          className="flex items-center gap-3 cursor-pointer overflow-hidden min-w-0"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 shadow-md shadow-blue-500/25 shrink-0">
            iC
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight leading-none">
                iCloud
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold tracking-wider uppercase mt-1">
                Cloud Workspace
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Scrollable Body */}
      <div className="flex-1 overflow-y-auto custom-scroll py-4 px-3 space-y-6">
        {/* Main Section */}
        <div>
          {!isCollapsed && (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Workspace
            </p>
          )}
          <nav className="space-y-1">
            {mainNav.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.3 : 1.8} className="shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tools Section */}
        <div>
          {!isCollapsed && (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Cloud Tools
            </p>
          )}
          <nav className="space-y-1">
            {toolsNav.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-900/60'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                >
                  <Icon size={17} strokeWidth={isActive ? 2.2 : 1.7} className="shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Storage Quota Card (Expanded only) */}
        {!isCollapsed && (
          <div className="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800/80 dark:to-indigo-950/30 rounded-2xl border border-blue-100 dark:border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <HardDrive size={14} className="text-blue-600 dark:text-blue-400" />
                AWS Storage
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                {STORAGE_LIMIT_GB} GB
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full w-[28%] rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {fileCount} files secured
              </span>
              <button
                onClick={() => navigate('/upload')}
                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
              >
                <Plus size={10} /> Upload
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer / User Profile & Settings */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <button
          onClick={() => navigate('/settings')}
          title={isCollapsed ? 'Settings' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
            isCollapsed ? 'justify-center px-0' : ''
          }`}
        >
          <Settings size={17} />
          {!isCollapsed && <span>Settings</span>}
        </button>

        <div
          className={`pt-1 flex items-center gap-2.5 ${
            isCollapsed ? 'justify-center' : 'justify-between px-1'
          }`}
        >
          <div
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2.5 cursor-pointer min-w-0"
          >
            <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-sky-400 to-indigo-600 shrink-0">
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
                  <div className="w-full h-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                    {initial}
                  </div>
                )}
              </div>
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex flex-col">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {name}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  {email}
                </span>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
