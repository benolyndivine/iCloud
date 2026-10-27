import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Settings, LogOut, HardDrive, ChevronRight, Mail, ShieldCheck } from 'lucide-react';
import { STORAGE_LIMIT_GB } from '../config';

function Avatar({ photoURL, name, email }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoURL]);
  const initial = (name || email || 'U')[0].toUpperCase();

  return (
    <div className="mx-auto w-[96px] h-[96px] rounded-full p-[3px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-600 shadow-[0_10px_28px_-8px_rgba(59,130,246,0.65)]">
      {photoURL && !failed ? (
        <img
          src={photoURL}
          alt={name || 'Profile'}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full rounded-full object-cover border-[3px] border-white dark:border-slate-900"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl font-bold border-[3px] border-white dark:border-slate-900">
          {initial}
        </div>
      )}
    </div>
  );
}

export default function ProfileScreen() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const email = currentUser?.email || '';
  const name = currentUser?.displayName || (email ? email.split('@')[0] : 'User');

  return (
    <div className="w-full max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-24 select-none">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">User Profile</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Account details and cloud preferences</p>
        </div>
        <span className="text-xs bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold px-3 py-1 rounded-full border border-blue-200/60 dark:border-blue-900/60 flex items-center gap-1">
          <ShieldCheck size={14} /> {STORAGE_LIMIT_GB} GB Plan
        </span>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm text-center space-y-4">
        <Avatar photoURL={currentUser?.photoURL} name={currentUser?.displayName} email={email} />
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{name}</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-full px-3 py-1">
            <Mail size={12} /> {email || 'No email attached'}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-2 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-1">
        <button 
          onClick={() => navigate('/analytics')} 
          className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-2xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center">
            <HardDrive size={18} className="mr-3 text-blue-600 dark:text-blue-400" />
            Storage Analytics & Usage
          </span>
          <ChevronRight size={16} className="text-slate-400" />
        </button>

        <button 
          onClick={() => navigate('/settings')} 
          className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-2xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center">
            <Settings size={18} className="mr-3 text-blue-600 dark:text-blue-400" />
            Settings & Preferences
          </span>
          <ChevronRight size={16} className="text-slate-400" />
        </button>

        <button 
          onClick={async () => { await logout(); navigate('/welcome'); }} 
          className="w-full flex items-center justify-between p-3.5 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-2xl text-xs font-semibold text-red-600 dark:text-red-400 transition-colors cursor-pointer"
        >
          <span className="flex items-center">
            <LogOut size={18} className="mr-3" />
            Sign Out
          </span>
        </button>
      </div>
    </div>
  );
}
