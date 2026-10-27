import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Cloud, ShieldCheck, Sparkles, HardDrive, CheckCircle2 } from 'lucide-react';
import { STORAGE_LIMIT_GB } from '../config';

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  if (currentUser) return <Navigate to="/home" replace />;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl sm:rounded-4xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col md:flex-row min-h-[580px]">
        {/* Left Side: Gradient Hero Showcase (Expanded on Tablet / Desktop) */}
        <div className="md:w-1/2 bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-48 h-48 bg-sky-400/20 rounded-full blur-2xl pointer-events-none" />

          {/* Top Logo */}
          <div className="flex items-center space-x-2.5 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Cloud size={22} className="text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">iCloud</span>
          </div>

          {/* Center Graphic */}
          <div className="my-8 md:my-0 text-center md:text-left space-y-4 relative z-10">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-sky-200">
              <Sparkles size={13} />
              <span>Personal Cloud Storage</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              All your files. <br />Every resolution.
            </h1>
            <p className="text-sm text-blue-100 leading-relaxed max-w-sm">
              Safely backed up to AWS S3, optimized with AI cleanup tools, and accessible across phone, tablet, and desktop.
            </p>
          </div>

          {/* Storage Quota Bullet */}
          <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-center justify-between text-xs relative z-10">
            <div className="flex items-center space-x-2">
              <HardDrive size={16} className="text-sky-300" />
              <span className="font-semibold">{STORAGE_LIMIT_GB} GB Free Storage</span>
            </div>
            <span className="text-emerald-300 font-bold flex items-center space-x-1">
              <CheckCircle2 size={13} />
              <span>Active</span>
            </span>
          </div>
        </div>

        {/* Right Side: Action Form Section */}
        <div className="md:w-1/2 p-8 sm:p-10 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Get Started</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Access your files seamlessly from any browser, phone, or tablet.
              </p>
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Secure S3</h4>
                  <p className="text-[10px] text-slate-400">Encrypted Cloud</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">AI Cleanup</h4>
                  <p className="text-[10px] text-slate-400">Smart Storage</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-blue-500/25 transition-all text-sm cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="w-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] text-slate-800 dark:text-slate-200 font-semibold py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 transition-all text-sm cursor-pointer"
            >
              Create Account
            </button>
            <p className="text-[11px] text-slate-400 text-center pt-2">
              Protected with AWS S3 Direct Encryption & Firebase Authentication
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
