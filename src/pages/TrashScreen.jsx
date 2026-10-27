import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, RefreshCw, CheckCircle2, AlertCircle, FileText, Film, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getTrashItems, restoreFromTrash, emptyTrash } from '../services/aiCleanupService';
import { formatBytes } from '../services/firebase/backupService';
import { useBackNavigation } from '../context/BackNavigationContext';

export default function TrashScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;

  const [trashItems, setTrashItems] = useState([]);

  const loadTrash = useCallback(() => {
    if (userId) {
      setTrashItems(getTrashItems(userId));
    }
  }, [userId]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const handleRestore = (id) => {
    if (restoreFromTrash(userId, id)) {
      loadTrash();
    }
  };

  const handleEmptyTrash = () => {
    if (window.confirm('Are you sure you want to permanently delete all items in the Trash? This action cannot be undone.')) {
      emptyTrash(userId);
      loadTrash();
    }
  };

  const getFileIcon = (item) => {
    if (item.type === 'photos' || item.category === 'blurry' || item.category === 'duplicates') {
      return <ImageIcon size={18} className="text-blue-500" />;
    }
    if (item.type === 'videos') {
      return <Film size={18} className="text-purple-500" />;
    }
    return <FileText size={18} className="text-slate-500" />;
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-24 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button 
            onClick={smartGoBack} 
            className="p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer hover:bg-slate-50"
            title="Go back"
          >
            <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Trash Bin</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Items auto-delete permanently after 30 days</p>
          </div>
        </div>

        {trashItems.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            className="px-3.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Empty Trash</span>
          </button>
        )}
      </div>

      {trashItems.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-8 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Trash Bin is Empty</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Cleaned files and deleted items will appear here before being permanently purged.
          </p>
          <button
            onClick={() => navigate('/cleanup')}
            className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-transform active:scale-95"
          >
            <Sparkles size={14} />
            <span>Open AI Cleanup Studio</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-slate-400 font-medium">
            <span>{trashItems.length} items in trash</span>
            <span>Click restore to recover</span>
          </div>

          <div className="space-y-2">
            {trashItems.map((item, idx) => (
              <div 
                key={item.id || item.key || idx} 
                className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/80 flex items-center justify-between shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                    {getFileIcon(item)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">
                      {item.name}
                    </h4>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {item.sizeLabel || formatBytes(item.size)}
                      </span>
                      <span>•</span>
                      <span className="capitalize">{item.category || 'Cleaned File'}</span>
                      {item.reason && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline text-blue-500 truncate max-w-xs">{item.reason}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => handleRestore(item.id || item.key)} 
                  className="p-2 bg-slate-100 dark:bg-slate-700/80 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-600 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Restore File"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
