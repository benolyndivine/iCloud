import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Trash2, CheckCircle2, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { runAiCleanupScan, moveItemsToTrash } from '../services/aiCleanupService';
import { formatBytes } from '../services/firebase/backupService';
import SmartImage from '../components/SmartImage';
import { useBackNavigation } from '../context/BackNavigationContext';

export default function DuplicateFilesScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [duplicates, setDuplicates] = useState([]);
  const [cleaned, setCleaned] = useState(false);

  useEffect(() => {
    runAiCleanupScan(userId).then((res) => {
      setDuplicates(res.categories.duplicates || []);
      setLoading(false);
    });
  }, [userId]);

  const handleCleanAllDuplicates = async () => {
    if (!duplicates.length) return;
    await moveItemsToTrash(userId, duplicates);
    setDuplicates([]);
    setCleaned(true);
  };

  const totalBytes = duplicates.reduce((acc, curr) => acc + (curr.size || 0), 0);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-24 select-none">
      <div className="flex items-center space-x-3">
        <button 
          onClick={smartGoBack} 
          className="p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer"
        >
          <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Duplicate Files</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Recover space by removing exact redundant copies</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-5 text-white flex items-center justify-between shadow-lg shadow-blue-500/20">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">AI Duplicate Analysis</span>
          <h4 className="text-xl font-extrabold mt-0.5">{duplicates.length > 0 ? `${formatBytes(totalBytes)} Potential Recovery` : '0 B Cleaned'}</h4>
          <p className="text-xs text-blue-100 mt-0.5">
            {duplicates.length > 0 ? `${duplicates.length} duplicate copies detected using perceptual hash & size matching.` : 'All duplicate copies cleaned and moved to Trash.'}
          </p>
        </div>
        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
          <Copy size={22} className="text-white" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 space-y-3">
          <RefreshCw size={26} className="animate-spin text-blue-500 mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Scanning for duplicate images...</p>
        </div>
      ) : duplicates.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-8 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Duplicate Files</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {cleaned ? 'All duplicate copies were successfully moved to Trash.' : 'Your cloud repository has zero redundant duplicate copies.'}
          </p>
          <button
            onClick={() => navigate('/cleanup')}
            className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Return to AI Cleanup Studio</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2.5">
            {duplicates.map((item, idx) => (
              <div 
                key={item.id || idx} 
                className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {item.downloadUrl ? (
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 shrink-0 border relative">
                      <SmartImage src={item.downloadUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-slate-900 text-blue-600 flex items-center justify-center shrink-0">
                      <Copy size={20} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">
                      {item.name}
                    </h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {item.sizeLabel} • Original: <span className="text-blue-500 font-semibold">{item.originalName || 'Stored photo'}</span>
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 italic">
                      {item.reason}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-bold px-2.5 py-1 rounded-xl shrink-0">
                  Duplicate
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={handleCleanAllDuplicates}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2 text-xs transition-all cursor-pointer"
          >
            <Trash2 size={15} />
            <span>Keep Originals & Move {duplicates.length} Duplicates to Trash ({formatBytes(totalBytes)})</span>
          </button>
        </div>
      )}
    </div>
  );
}
