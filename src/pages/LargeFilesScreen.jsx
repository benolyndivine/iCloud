import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Film, Trash2, CheckCircle2, Sparkles, FileText, Layers } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { moveItemsToTrash } from '../services/aiCleanupService';
import { useBackNavigation } from '../context/BackNavigationContext';

export default function LargeFilesScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;

  const [files, setFiles] = useState([
    { id: 'large_1', name: '4K Drone Capture.mp4', size: 850000000, sizeLabel: '850 MB', date: 'May 12, 2026', type: 'video' },
    { id: 'large_2', name: 'Raw_Video_Export.mov', size: 480000000, sizeLabel: '480 MB', date: 'Mar 15, 2026', type: 'video' },
    { id: 'large_3', name: 'Project_Archive_Backup.zip', size: 620000000, sizeLabel: '620 MB', date: 'Apr 28, 2026', type: 'doc' },
  ]);

  const handleDelete = async (file) => {
    await moveItemsToTrash(userId, [file]);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
  };

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
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Large Files</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Media & archives exceeding 100 MB</p>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-8 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Oversized Files</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            All large media files have been cleaned or optimized with AI compression.
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
          {files.map((file) => (
            <div 
              key={file.id} 
              className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="w-11 h-11 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center shrink-0">
                  {file.type === 'video' ? <Film size={20} /> : <FileText size={20} />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">
                    {file.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">{file.sizeLabel} • {file.date}</p>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(file)} 
                className="p-2.5 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-xl transition-colors cursor-pointer"
                title="Move to Trash"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
