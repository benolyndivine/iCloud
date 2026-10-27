import React, { useState, useMemo } from 'react';
import {
  X,
  Folder,
  FolderPlus,
  Copy,
  Move,
  Check,
  RefreshCw,
  Image as ImageIcon,
  Video,
  FileText,
  Music
} from 'lucide-react';
import { directCopyFileInS3, directMoveFileInS3 } from '../services/aws/directS3Service';
import { useBackHandler } from '../context/BackNavigationContext';

const STANDARD_FOLDERS = [
  { id: 'photos', label: 'Photos', icon: ImageIcon, color: 'text-blue-500 bg-blue-500/10' },
  { id: 'videos', label: 'Videos', icon: Video, color: 'text-purple-500 bg-purple-500/10' },
  { id: 'docs', label: 'Documents', icon: FileText, color: 'text-emerald-500 bg-emerald-500/10' },
  { id: 'music', label: 'Music', icon: Music, color: 'text-pink-500 bg-pink-500/10' },
];

export default function CopyMoveModal({
  isOpen,
  mode = 'copy', // 'copy' | 'move'
  file = null,
  files = null,
  userUid,
  allFiles = [],
  onClose,
  onSuccess,
  showToast = () => {},
}) {
  useBackHandler(onClose, 100, isOpen);

  const isMove = mode === 'move';
  const targetItems = useMemo(() => {
    if (Array.isArray(files) && files.length > 0) return files;
    if (file) return [file];
    return [];
  }, [files, file]);

  const isBatch = targetItems.length > 1;
  const firstItem = targetItems[0];
  const rawFileName = firstItem?.name || firstItem?.key?.split('/').pop() || 'file';
  const cleanFileName = rawFileName.replace(/^\d+-/, '');

  // Extract all unique custom folders from existing user files
  const availableFolders = useMemo(() => {
    const custom = new Set();
    for (const f of allFiles) {
      if (f.folder && !['photos', 'videos', 'docs', 'music', 'other'].includes(f.folder)) {
        custom.add(f.folder);
      }
    }
    return Array.from(custom);
  }, [allFiles]);

  const currentFolder = firstItem?.folder || firstItem?.category || 'photos';
  const [selectedFolder, setSelectedFolder] = useState(() => currentFolder);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || targetItems.length === 0) return null;

  const handleAction = async () => {
    const targetFolder = isCreatingNew
      ? newFolderName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '')
      : selectedFolder;

    if (!targetFolder) {
      showToast('Please specify a destination folder');
      return;
    }

    if (!userUid) {
      showToast('User authentication required');
      return;
    }

    setLoading(true);
    showToast(`${isMove ? 'Moving' : 'Copying'} ${targetItems.length} ${targetItems.length === 1 ? 'file' : 'files'} to "${targetFolder}"...`);

    try {
      const results = [];
      for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        const sourceKey = item.key || item.name;
        if (!sourceKey) continue;

        let res;
        if (isMove) {
          res = await directMoveFileInS3({
            sourceKey,
            targetFolder,
            userId: userUid,
          });
        } else {
          res = await directCopyFileInS3({
            sourceKey,
            targetFolder,
            userId: userUid,
          });
        }

        results.push({
          sourceKey,
          targetKey: res.key,
          file: {
            ...item,
            key: res.key,
            folder: targetFolder,
            name: res.name || (item.name || sourceKey).split('/').pop().replace(/^\d+-/, ''),
            downloadUrl: res.downloadUrl || item.downloadUrl,
            lastModified: res.lastModified || new Date().toISOString(),
          },
        });
      }

      showToast(`${isMove ? 'Moved' : 'Copied'} ${results.length} ${results.length === 1 ? 'file' : 'files'} to "${targetFolder}"!`);

      if (onSuccess) {
        onSuccess({
          action: mode,
          targetFolder,
          results,
          sourceKey: results[0]?.sourceKey,
          targetKey: results[0]?.targetKey,
          file: results[0]?.file,
        });
      }

      onClose();
    } catch (err) {
      console.error(`Failed to ${mode} files:`, err);
      showToast(`Failed to ${mode} files: ${err.message || 'AWS S3 Error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            {isMove ? (
              <Move size={18} className="text-purple-500 dark:text-purple-400" />
            ) : (
              <Copy size={18} className="text-blue-500 dark:text-blue-400" />
            )}
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isMove
                ? isBatch ? `Move ${targetItems.length} Files` : 'Move File'
                : isBatch ? `Copy ${targetItems.length} Files` : 'Copy File'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:text-white/60 dark:hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Selected File Card */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/60 dark:border-white/5 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden text-slate-600 dark:text-slate-300">
            {isBatch ? (
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">+{targetItems.length}</span>
            ) : firstItem?.downloadUrl ? (
              <img src={firstItem.downloadUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Folder size={18} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {isBatch ? `${targetItems.length} items selected` : cleanFileName}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-white/50">
              Target folder: <span className="font-semibold text-blue-500 dark:text-blue-400">{selectedFolder || currentFolder}</span>
            </p>
          </div>
        </div>

        {/* Destination Selection */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 dark:text-white/50 uppercase tracking-wider">
            Select Destination Folder
          </p>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5 scrollbar-thin">
            {/* Standard Category Folders */}
            {STANDARD_FOLDERS.map((cat) => {
              const Icon = cat.icon;
              const isSelected = !isCreatingNew && selectedFolder === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setIsCreatingNew(false);
                    setSelectedFolder(cat.id);
                  }}
                  className={`w-full p-2.5 rounded-2xl border flex items-center justify-between text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-700 dark:text-blue-300 font-semibold shadow-sm'
                      : 'bg-white dark:bg-slate-800/40 border-slate-200/80 dark:border-white/5 text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cat.color}`}>
                      <Icon size={16} />
                    </div>
                    <span className="text-xs truncate">{cat.label}</span>
                  </div>
                  {isSelected && <Check size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                </button>
              );
            })}

            {/* Custom Folders */}
            {availableFolders.map((folderName) => {
              const isSelected = !isCreatingNew && selectedFolder === folderName;
              return (
                <button
                  key={folderName}
                  onClick={() => {
                    setIsCreatingNew(false);
                    setSelectedFolder(folderName);
                  }}
                  className={`w-full p-2.5 rounded-2xl border flex items-center justify-between text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-700 dark:text-blue-300 font-semibold shadow-sm'
                      : 'bg-white dark:bg-slate-800/40 border-slate-200/80 dark:border-white/5 text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-500">
                      <Folder size={16} />
                    </div>
                    <span className="text-xs truncate">{folderName}</span>
                  </div>
                  {isSelected && <Check size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                </button>
              );
            })}

            {/* Create New Folder Card */}
            <div className="pt-1">
              {!isCreatingNew ? (
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="w-full p-2.5 rounded-2xl border border-dashed border-slate-300 dark:border-white/20 hover:border-blue-400 text-slate-600 dark:text-white/70 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center space-x-2 text-xs font-semibold cursor-pointer transition-all active:scale-95"
                >
                  <FolderPlus size={16} />
                  <span>Create New Folder</span>
                </button>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-blue-400 space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-white">
                    <span>New Folder Name</span>
                    <button
                      onClick={() => setIsCreatingNew(false)}
                      className="text-slate-400 hover:text-slate-600 text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newFolderName}
                    autoFocus
                    placeholder="e.g. Vacation, Documents 2026"
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center space-x-2">
          <button
            onClick={onClose}
            className="w-1/2 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white/80 hover:bg-slate-200 dark:hover:text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAction}
            disabled={loading || (isCreatingNew && !newFolderName.trim())}
            className="w-1/2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer flex items-center justify-center space-x-1.5 transition-all active:scale-95"
          >
            {loading ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : isMove ? (
              <>
                <Move size={14} />
                <span>Move Here</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy Here</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
