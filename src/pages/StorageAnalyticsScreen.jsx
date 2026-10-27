import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PieChart, RefreshCw } from 'lucide-react';
import { auth } from '../services/firebase/firebaseClient';
import { STORAGE_LIMIT_GB, CATEGORY_META } from '../config';
import { syncUserStorage } from '../services/firebase/backupService';
import { useBackNavigation } from '../context/BackNavigationContext';

export default function StorageAnalyticsScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) { setLoading(false); setError('Please sign in.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await syncUserStorage(user.uid);
      if (!data || !data.summary) throw new Error('Sync failed');
      setSummary(data.summary);
    } catch (e) {
      setError('Could not load storage directly from AWS S3.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const limitBytes = STORAGE_LIMIT_GB * 1024 ** 3;
  const used = summary?.totalBytes || 0;
  const cats = Object.entries(CATEGORY_META);

  return (
    <div className="p-4 space-y-5 pb-24">
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Storage Analytics</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Live usage directly from AWS S3</p>
        </div>
        <button onClick={load} className="p-2 cursor-pointer" title="Refresh">
          <RefreshCw size={18} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase">Total Utilization</h4>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {summary?.totalLabel || '0 B'} <span className="text-sm font-normal text-slate-400">/ {STORAGE_LIMIT_GB} GB</span>
            </h3>
          </div>
          <div className="w-10 h-10 bg-blue-50 dark:bg-slate-900 text-blue-600 rounded-2xl flex items-center justify-center"><PieChart size={20} /></div>
        </div>

        {/* Stacked bar: one colour per category, widths relative to the plan limit */}
        <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
          {summary && cats.map(([k, m]) => (
            <div key={k} className={m.bar} style={{ width: `${Math.min((summary.categories[k].sizeBytes / limitBytes) * 100, 100)}%` }} />
          ))}
        </div>

        <div className="space-y-2 pt-2">
          {cats.map(([k, m]) => {
            const c = summary?.categories?.[k];
            const pct = used ? Math.round((c?.sizeBytes / used) * 100) : 0;
            return (
              <div key={k} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${m.bar}`} />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{m.label}</h4>
                    <p className="text-[10px] text-slate-400">{c?.count ?? 0} files{used ? ` • ${pct}% of used` : ''}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{c?.sizeLabel || '0 B'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
