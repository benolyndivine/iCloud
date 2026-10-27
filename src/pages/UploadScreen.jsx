import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { ArrowLeft, UploadCloud, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { auth } from '../services/firebase/firebaseClient';
import { CATEGORY_META } from '../config';
import { backupFileToAWSAndFirebase, formatBytes } from '../services/firebase/backupService';

export default function UploadScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const [items, setItems] = useState([]); // {name,size,progress,status,category,error,compressed,finalSize,savedPercent}
  const [busy, setBusy] = useState(false);

  const patch = (i, p) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)));

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const user = auth.currentUser;
    if (!user) {
      alert('You must be logged in to upload files to AWS S3.');
      navigate('/login');
      return;
    }

    setItems(files.map((f) => ({ name: f.name, size: f.size, progress: 0, status: 'queued' })));
    setBusy(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        patch(i, { status: 'uploading' });
        const token = await user.getIdToken(true);

        const res = await backupFileToAWSAndFirebase({
          file,
          userId: user.uid,
          token,
          onProgress: (progress) => patch(i, { progress }),
        });

        patch(i, {
          status: 'done',
          progress: 100,
          compressed: res?.compressed,
          finalSize: res?.size,
          savedBytes: res?.savedBytes,
          savedPercent: res?.savedPercent,
        });
      } catch (err) {
        console.error('Upload error:', err);
        patch(i, { status: 'error', error: err.message });
      }
    }
    setBusy(false);
  };

  const done = items.filter((i) => i.status === 'done').length;

  return (
    <div className="p-4 space-y-5 pb-24">
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">AWS S3 Upload</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Photos, videos, music, documents &amp; any other file</p>
        </div>
      </div>

      <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-6 text-center space-y-3 bg-slate-50 dark:bg-slate-800/50">
        <div className="w-12 h-12 bg-blue-50 dark:bg-slate-900 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
          <UploadCloud size={24} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">Select one or more files</h4>
          <p className="text-[10px] text-slate-400 mt-0.5">Files are sorted automatically into Photos, Videos, Music, Docs and Other</p>
        </div>
        <label className={`inline-block text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-md ${busy ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}>
          <span>{busy ? 'Uploading to AWS…' : 'Browse Files'}</span>
          <input type="file" multiple onChange={handleFiles} className="hidden" disabled={busy} />
        </label>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-1.5">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{it.name}</p>
                  {it.compressed && (
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0 flex items-center space-x-0.5">
                      <Zap size={9} />
                      <span>-{it.savedPercent}%</span>
                    </span>
                  )}
                </div>
                {it.status === 'done' && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                {it.status === 'error' && <AlertCircle size={16} className="text-red-500 shrink-0" />}
                {it.status === 'uploading' && <span className="text-[10px] text-slate-500">{it.progress}%</span>}
              </div>
              <p className="text-[10px] text-slate-400">
                {it.compressed ? `${formatBytes(it.finalSize)} in AWS S3 (was ${formatBytes(it.size)})` : formatBytes(it.size)}
                {it.category && ` • ${CATEGORY_META[it.category]?.label || it.category}`}
                {it.status === 'queued' && ' • waiting'}
                {it.status === 'error' && ` • ${it.error}`}
              </p>
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                <div style={{ width: `${it.progress}%` }} className={`${it.status === 'error' ? 'bg-red-500' : 'bg-blue-600'} h-full transition-all duration-200`} />
              </div>
            </div>
          ))}
          {!busy && (
            <button onClick={() => navigate('/files')} className="w-full bg-blue-600 text-white text-xs font-semibold py-2.5 rounded-xl cursor-pointer">
              {done} of {items.length} uploaded — view files
            </button>
          )}
        </div>
      )}
    </div>
  );
}
