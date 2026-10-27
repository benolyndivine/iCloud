import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Upload,
  Bell,
  Sun,
  Moon,
  Monitor,
  Smartphone,
  Tablet,
  ChevronDown,
  Check,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useResolution } from '../context/ResolutionContext';
import { useBackNavigation } from '../context/BackNavigationContext';

const ROUTE_NAMES = {
  '/home': 'Overview',
  '/files': 'All Files & Folders',
  '/cleanup': 'AI Cleanup Studio',
  '/backup': 'Cloud Backup & Sync',
  '/scanner': 'Storage Scanner',
  '/duplicates': 'Duplicate Files Cleaner',
  '/large-files': 'Large Files Management',
  '/compression': 'Media Compression',
  '/shared': 'Shared Files & Links',
  '/trash': 'Trash Bin',
  '/analytics': 'Storage Analytics',
  '/settings': 'System Settings',
  '/profile': 'User Profile',
  '/notifications': 'Notifications',
  '/upload': 'Upload to Cloud',
  '/search': 'Global Search',
};

export default function DesktopHeader({ showBackButton = false, customTitle = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { smartGoBack } = useBackNavigation();
  const { currentUser } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const { viewMode, setViewMode, resolutionLabel, width, height, breakpoint } = useResolution();

  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const currentTitle = customTitle || ROUTE_NAMES[location.pathname] || 'Cloud Workspace';

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchInput.trim())}`);
    } else {
      navigate('/search');
    }
  };

  const email = currentUser?.email || '';
  const name = currentUser?.displayName || (email ? email.split('@')[0] : 'User');
  const initial = (name || email || 'U')[0].toUpperCase();
  const photoURL = currentUser?.photoURL;

  return (
    <header className="h-16 px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl flex items-center justify-between shrink-0 select-none z-20">
      {/* Left: Breadcrumbs / Title with back button if applicable */}
      <div className="flex items-center gap-3">
        {showBackButton && (
          <button
            onClick={smartGoBack}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            <span>iCloud</span>
            <span>/</span>
            <span className="text-slate-600 dark:text-slate-300 capitalize">{breakpoint} resolution</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
            {currentTitle}
          </h1>
        </div>
      </div>

      {/* Center: Search Bar */}
      <form
        onSubmit={handleSearchSubmit}
        className="hidden md:flex items-center relative w-72 lg:w-96"
      >
        <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search files, photos, backups..."
          className="w-full pl-10 pr-14 py-2 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
        />
        <span className="absolute right-3 text-[10px] font-semibold text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 pointer-events-none">
          Ctrl K
        </span>
      </form>

      {/* Right Controls: Device Mode Switcher, Upload, Theme Toggle, Notifications, Avatar */}
      <div className="flex items-center gap-3">
        {/* Device Resolution / View Mode Switcher Pill */}
        <div className="relative">
          <button
            onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all"
            title="Adjust resolution view"
          >
            {viewMode === 'mobile' ? (
              <Smartphone size={14} className="text-blue-500" />
            ) : viewMode === 'tablet' ? (
              <Tablet size={14} className="text-indigo-500" />
            ) : (
              <Monitor size={14} className="text-emerald-500" />
            )}
            <span className="hidden xl:inline">{resolutionLabel}</span>
            <span className="xl:hidden capitalize">{viewMode}</span>
            <ChevronDown size={12} className="opacity-60" />
          </button>

          {/* Dropdown Menu */}
          {viewDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setViewDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1 animate-in fade-in duration-150">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Display & Resolution
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Live Screen: {width} × {height} px
                  </p>
                </div>

                {[
                  { id: 'auto', label: 'Auto (Screen Resolution)', desc: 'Fluid layout based on screen width', icon: Monitor },
                  { id: 'desktop', label: 'Desktop View', desc: 'Full-width dashboard & sidebar', icon: Monitor },
                  { id: 'tablet', label: 'Tablet View (820px)', desc: 'Optimized 2-column layout', icon: Tablet },
                  { id: 'mobile', label: 'Mobile View (390px)', desc: 'Phone layout with bottom tab bar', icon: Smartphone },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = viewMode === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setViewMode(item.id);
                        setViewDropdownOpen(false);
                      }}
                      className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span>{item.label}</span>
                          {isSelected && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
                        </div>
                        <p className="text-[10px] text-slate-400 font-normal leading-tight mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Quick Upload Button */}
        <button
          onClick={() => navigate('/upload')}
          className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
        >
          <Upload size={14} />
          <span>Upload</span>
        </button>

        {/* Dark / Light Toggle */}
        <button
          onClick={toggleDarkMode}
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all cursor-pointer"
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
        </button>

        {/* Notification Bell */}
        <button
          onClick={() => navigate('/notifications')}
          className="relative w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all cursor-pointer"
          title="Notifications"
        >
          <Bell size={16} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
        </button>

        {/* User Avatar */}
        <button
          onClick={() => navigate('/profile')}
          className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-sky-400 to-indigo-600 focus:outline-none transition-transform active:scale-95 shrink-0"
          title="Profile"
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-slate-900 flex items-center justify-center">
            {photoURL ? (
              <img
                src={photoURL}
                alt={name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                {initial}
              </div>
            )}
          </div>
        </button>
      </div>
    </header>
  );
}
