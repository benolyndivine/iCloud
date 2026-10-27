import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Scan,
  Sparkles,
  Cloud,
  Share2,
  HardDrive,
  RefreshCw,
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  Folder,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Plus,
  Play,
  LayoutGrid,
  List,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { auth } from '../services/firebase/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { STORAGE_LIMIT_GB } from '../config';
import { syncUserStorage, getUserStoredFiles, getCachedUserFiles, formatBytes } from '../services/firebase/backupService';
import { isDirectAwsConfigured } from '../services/aws/directS3Service';
import { extractThumbnailFromVideoUrl } from '../services/thumbnailService';
import SmartImage from '../components/SmartImage';

const HomeVideoThumb = React.memo(function HomeVideoThumb({ file, userUid }) {
  const fileKey = file.key || file.name || '';
  const thumbKey = `vid_thumb_${fileKey}`;
  const [thumb, setThumb] = useState(() => {
    if (file.thumbnail) return file.thumbnail;
    try {
      const stored = localStorage.getItem(thumbKey);
      if (stored) return stored;
    } catch {}
    return null;
  });

  useEffect(() => {
    if (thumb || !file.downloadUrl) return;
    let active = true;
    extractThumbnailFromVideoUrl(file.downloadUrl, fileKey, userUid)
      .then((dataUrl) => {
        if (active && dataUrl) setThumb(dataUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [file.downloadUrl, fileKey, userUid, thumb]);

  if (thumb) {
    return <SmartImage src={thumb} alt={file.name} className="w-full h-full object-cover" loading="lazy" />;
  }

  return (
    <video
      src={file.downloadUrl ? `${file.downloadUrl}#t=0.001` : ''}
      preload="metadata"
      muted
      playsInline
      webkit-playsinline="true"
      onError={(e) => {
        const v = e.currentTarget;
        const retry = () => { try { v.load(); } catch {} };
        window.addEventListener('online', retry, { once: true });
        window.addEventListener('app:network-restored', retry, { once: true });
      }}
      className="w-full h-full object-cover opacity-80"
    />
  );
});

export default function HomeScreen() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [viewStyle, setViewStyle] = useState('list'); // 'list' | 'grid'

  const [storageData, setStorageData] = useState(() => {
    const user = currentUser || auth.currentUser;
    const cached = user?.uid ? getCachedUserFiles(user.uid) : [];
    if (cached && cached.length > 0) {
      const GB = 1024 ** 3;
      let totalBytes = 0;
      const categories = {
        photos: { sizeBytes: 0, count: 0 },
        videos: { sizeBytes: 0, count: 0 },
        music: { sizeBytes: 0, count: 0 },
        docs: { sizeBytes: 0, count: 0 },
        other: { sizeBytes: 0, count: 0 },
      };
      for (const f of cached) {
        const cat = categories[f.category] ? f.category : 'other';
        categories[cat].sizeBytes += f.size || 0;
        categories[cat].count += 1;
        totalBytes += f.size || 0;
      }
      return {
        totalGB: (totalBytes / GB).toFixed(2),
        totalLabel: formatBytes(totalBytes),
        categories: Object.fromEntries(
          Object.entries(categories).map(([k, v]) => [
            k,
            {
              sizeGB: (v.sizeBytes / GB).toFixed(2),
              sizeLabel: formatBytes(v.sizeBytes),
              count: v.count,
            },
          ])
        ),
      };
    }
    return {
      totalGB: '0.00',
      totalLabel: '0 B',
      categories: {
        photos: { sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
        videos: { sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
        music: { sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
        docs: { sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
        other: { sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
      },
    };
  });

  // Real files stored in AWS S3 (Initialized instantly from cache)
  const [awsFiles, setAwsFiles] = useState(() => {
    const user = currentUser || auth.currentUser;
    return user?.uid ? getCachedUserFiles(user.uid) : [];
  });
  const [activeCategory, setActiveCategory] = useState('all');
  const [syncing, setSyncing] = useState(false);

  const fetchHomeData = useCallback(async () => {
    setSyncing(true);
    const user = currentUser || auth.currentUser;
    const uid = user ? user.uid : null;

    try {
      if (uid) {
        // Query real files and storage directly from AWS S3
        const data = await syncUserStorage(uid);

        if (data && data.summary) {
          setStorageData(data.summary);
        }
        if (data && Array.isArray(data.files)) {
          setAwsFiles(data.files);
        }
      }
    } catch (err) {
      console.warn('Direct AWS storage sync note:', err.message);
    } finally {
      setSyncing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  // Automatically refresh home data when network connectivity is restored
  useEffect(() => {
    const handleNetworkRestored = () => {
      fetchHomeData();
    };
    window.addEventListener('online', handleNetworkRestored);
    window.addEventListener('app:network-restored', handleNetworkRestored);
    return () => {
      window.removeEventListener('online', handleNetworkRestored);
      window.removeEventListener('app:network-restored', handleNetworkRestored);
    };
  }, [fetchHomeData]);

  // Filter files by active category
  const filteredFiles = useMemo(() => {
    if (activeCategory === 'all') return awsFiles;
    if (activeCategory === 'music') {
      return awsFiles.filter((f) => f.type === 'music' || f.category === 'music' || f.category === 'audio');
    }
    if (activeCategory === 'other') {
      return awsFiles.filter((f) => f.type === 'other' || f.category === 'other' || (f.folder && f.folder !== f.type));
    }
    return awsFiles.filter((f) => f.type === activeCategory || f.category === activeCategory);
  }, [awsFiles, activeCategory]);

  const totalUsedNum = parseFloat(storageData.totalGB || 0);
  const usagePercentage = Math.min((totalUsedNum / STORAGE_LIMIT_GB) * 100, 100);

  const getFileIcon = (type) => {
    switch (type) {
      case 'photos':
        return <ImageIcon size={18} className="text-sky-500" />;
      case 'videos':
        return <Video size={18} className="text-indigo-500" />;
      case 'music':
      case 'audio':
        return <Music size={18} className="text-pink-500" />;
      case 'docs':
        return <FileText size={18} className="text-emerald-500" />;
      default:
        return <Folder size={18} className="text-blue-500" />;
    }
  };

  const getFileIconBg = (type) => {
    switch (type) {
      case 'photos':
        return 'bg-sky-50 dark:bg-sky-950/50 border-sky-100 dark:border-sky-900/40';
      case 'videos':
        return 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-100 dark:border-indigo-900/40';
      case 'music':
      case 'audio':
        return 'bg-pink-50 dark:bg-pink-950/50 border-pink-100 dark:border-pink-900/40';
      case 'docs':
        return 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-100 dark:border-emerald-900/40';
      default:
        return 'bg-blue-50 dark:bg-blue-950/50 border-blue-100 dark:border-blue-900/40';
    }
  };

  return (
    <div className="p-3 sm:p-5 space-y-6 pb-28 select-none">
      {/* AWS S3 Configuration Prompt if environment variables missing on deployment */}
      {!isDirectAwsConfigured() && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">AWS S3 Credentials Required</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Set <code className="bg-amber-100/80 dark:bg-amber-900/50 px-1 rounded text-amber-800 dark:text-amber-200 font-mono text-[11px]">VITE_AWS_ACCESS_KEY_ID</code> in Netlify Environment Variables, or enter your AWS keys in settings.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/backup')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all shrink-0 cursor-pointer text-center"
          >
            Configure Keys
          </button>
        </div>
      )}

      {/* Top Section: Responsive Grid on Tablet / Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Storage Overview Card - 50 GB Limit */}
        <div className="lg:col-span-7 xl:col-span-8 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-blue-500/20 space-y-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-6 -bottom-6 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex justify-between items-start relative z-10">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">AWS S3 Direct Storage</p>
                {syncing && <RefreshCw size={12} className="animate-spin text-blue-200" />}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold mt-1">
                {storageData.totalLabel || `${storageData.totalGB} GB`}{' '}
                <span className="text-sm font-normal text-blue-200">/ {STORAGE_LIMIT_GB} GB Total</span>
              </h2>
              <p className="text-xs text-blue-100/80 mt-0.5">
                {STORAGE_LIMIT_GB - totalUsedNum > 0
                  ? `${(STORAGE_LIMIT_GB - totalUsedNum).toFixed(2)} GB available for your media and documents`
                  : 'Storage limit reached'}
              </p>
            </div>
            <button
              onClick={fetchHomeData}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center backdrop-blur-md justify-center transition-all cursor-pointer shadow-sm active:scale-95"
              title="Sync with AWS S3"
            >
              <HardDrive size={22} className="text-white" />
            </button>
          </div>

          {/* Progress Bar with capacity stats */}
          <div className="space-y-1.5 relative z-10">
            <div className="flex justify-between text-[11px] text-blue-100 font-medium">
              <span>Used: {usagePercentage.toFixed(1)}%</span>
              <span>Capacity: {STORAGE_LIMIT_GB} GB</span>
            </div>
            <div className="w-full bg-white/20 h-3 rounded-full overflow-hidden flex p-0.5">
              <div
                style={{ width: `${Math.max(usagePercentage, 2)}%` }}
                className="bg-gradient-to-r from-sky-300 to-white h-full rounded-full transition-all duration-500 shadow-sm"
              />
            </div>
          </div>

          {/* Interactive Category Storage Pills (Tap to filter / view in AWS) */}
          <div className="grid grid-cols-5 gap-2 pt-1 text-center relative z-10">
            {[
              ['photos', 'Photos', 'photos'],
              ['videos', 'Videos', 'videos'],
              ['music', 'Music', 'music'],
              ['docs', 'Docs', 'docs'],
              ['other', 'Other', 'folders'],
            ].map(([k, label, routeCat]) => {
              const isSelected = activeCategory === k;
              return (
                <button
                  key={k}
                  onClick={() => {
                    if (activeCategory === k) {
                      navigate(`/files?category=${routeCat}`);
                    } else {
                      setActiveCategory(k);
                    }
                  }}
                  title={`View ${label} stored in AWS S3`}
                  className={`rounded-2xl p-2 backdrop-blur-sm transition-all cursor-pointer text-left sm:text-center ${
                    isSelected
                      ? 'bg-white text-blue-700 shadow-lg scale-[1.03] font-bold'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <p className={`text-[10px] truncate ${isSelected ? 'text-blue-600 font-bold' : 'text-blue-100 font-medium'}`}>
                    {label}
                  </p>
                  <p className="text-xs font-extrabold truncate mt-0.5">
                    {storageData.categories?.[k]?.sizeLabel || '0 B'}
                  </p>
                  <p className={`text-[9px] truncate ${isSelected ? 'text-blue-500 font-semibold' : 'text-blue-200'}`}>
                    {storageData.categories?.[k]?.count ?? 0} files
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Quick Cloud Actions
            </h3>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
              <ShieldCheck size={13} /> Encrypted
            </span>
          </div>

          <div className="grid grid-cols-5 lg:grid-cols-2 xl:grid-cols-3 gap-2">
            {[
              { label: 'Upload', desc: 'Direct to S3', icon: Upload, path: '/upload', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60' },
              { label: 'Scanner', desc: 'Analyze space', icon: Scan, path: '/scanner', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60' },
              { label: 'AI Clean', desc: 'Auto clean', icon: Sparkles, path: '/cleanup', color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60' },
              { label: 'Backup', desc: 'Sync device', icon: Cloud, path: '/backup', color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/60' },
              { label: 'Share', desc: 'QR & Links', icon: Share2, path: '/shared', color: 'text-pink-600 bg-pink-50 dark:bg-pink-950/60' },
            ].map((act, idx) => {
              const Icon = act.icon;
              return (
                <button
                  key={idx}
                  onClick={() => navigate(act.path)}
                  className="flex flex-col items-center justify-center p-2.5 bg-slate-50 dark:bg-slate-900/60 hover:bg-blue-50/50 dark:hover:bg-slate-700/60 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all cursor-pointer group hover:border-blue-200 dark:hover:border-blue-800 active:scale-95 text-center"
                >
                  <div className={`w-10 h-10 ${act.color} rounded-xl flex items-center justify-center mb-1 transition-transform group-hover:scale-105`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{act.label}</span>
                  <span className="hidden lg:block text-[9px] text-slate-400 truncate mt-0.5">{act.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stored Files in AWS S3 */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Files in AWS S3</h3>
            <p className="text-xs text-slate-400">
              {awsFiles.length > 0 ? `${awsFiles.length} file(s) synchronized in your personal AWS bucket` : 'Personal cloud repository'}
            </p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            {/* View Switcher on Tablet & Desktop */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <button
                onClick={() => setViewStyle('list')}
                title="List View"
                className={`p-1.5 rounded-lg transition-colors ${
                  viewStyle === 'list'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <List size={15} />
              </button>
              <button
                onClick={() => setViewStyle('grid')}
                title="Grid View"
                className={`p-1.5 rounded-lg transition-colors ${
                  viewStyle === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <LayoutGrid size={15} />
              </button>
            </div>

            <button
              onClick={() => navigate('/files')}
              className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Category Quick Filter Bar */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Files' },
            { id: 'photos', label: 'Photos' },
            { id: 'videos', label: 'Videos' },
            { id: 'music', label: 'Audios' },
            { id: 'docs', label: 'Docs' },
            { id: 'other', label: 'Folders' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* File Display: Responsive Grid or List */}
        {filteredFiles.length === 0 ? (
          <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-8 space-y-3">
            <Cloud className="mx-auto text-slate-300 dark:text-slate-600" size={42} />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No files in AWS S3 yet</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Back up photos, videos, or documents to store them securely in your AWS S3 bucket.
            </p>
            <button
              onClick={() => navigate('/backup')}
              className="mt-2 inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer transition-transform active:scale-95"
            >
              <Upload size={14} />
              <span>Back up Now</span>
            </button>
          </div>
        ) : viewStyle === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {filteredFiles.slice(0, 18).map((file, idx) => {
              const isVid = file.type === 'videos' || file.category === 'videos' || /\.(mp4|mov|webm|mkv|3gp|m4v|avi)$/i.test(file.name || '');
              return (
                <div
                  key={file.id || file.key || idx}
                  onClick={() =>
                    navigate(`/preview/${encodeURIComponent(file.key || file.name)}`, {
                      state: { files: filteredFiles, initialKey: file.key || file.name, autoPlay: isVid },
                    })
                  }
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer flex flex-col group"
                >
                  <div className="w-full aspect-square bg-slate-100 dark:bg-slate-900 overflow-hidden relative flex items-center justify-center">
                    {file.type === 'photos' && file.downloadUrl ? (
                      <SmartImage src={file.downloadUrl} alt={file.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    ) : file.type === 'videos' && file.downloadUrl ? (
                      <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                        <HomeVideoThumb file={file} userUid={currentUser?.uid || auth.currentUser?.uid} />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Play size={16} fill="white" className="text-white ml-0.5" />
                        </div>
                      </div>
                    ) : (
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getFileIconBg(file.type || file.category)}`}>
                        {getFileIcon(file.type || file.category)}
                      </div>
                    )}
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-semibold text-white">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                  <div className="p-2.5 flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate mt-0.5">
                      {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Backed up'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.slice(0, 12).map((file, idx) => {
              const isVid = file.type === 'videos' || file.category === 'videos' || /\.(mp4|mov|webm|mkv|3gp|m4v|avi)$/i.test(file.name || '');
              return (
                <div
                  key={file.id || file.key || idx}
                  onClick={() =>
                    navigate(`/preview/${encodeURIComponent(file.key || file.name)}`, {
                      state: { files: filteredFiles, initialKey: file.key || file.name, autoPlay: isVid },
                    })
                  }
                  className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/80 flex items-center justify-between shadow-sm active:scale-[0.99] hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border overflow-hidden relative ${getFileIconBg(
                        file.type || file.category
                      )}`}
                    >
                      {file.type === 'photos' && file.downloadUrl ? (
                        <SmartImage src={file.downloadUrl} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : file.type === 'videos' && file.downloadUrl ? (
                        <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                          <HomeVideoThumb file={file} userUid={currentUser?.uid || auth.currentUser?.uid} />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                            <Play size={10} fill="white" className="text-white ml-0.5" />
                          </div>
                        </div>
                      ) : (
                        getFileIcon(file.type || file.category)
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md lg:max-w-xl">
                        {file.name}
                      </h4>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
                        <span className="font-medium text-slate-600 dark:text-slate-300">{formatBytes(file.size)}</span>
                        <span>•</span>
                        <span className="truncate">
                          {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Backed up'}
                        </span>
                        {file.folder && file.folder !== file.type && (
                          <>
                            <span>•</span>
                            <span className="text-blue-500 font-medium truncate">{file.folder}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <span className="hidden sm:inline-flex text-[10px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900 items-center space-x-1">
                      <CheckCircle2 size={11} />
                      <span>AWS S3</span>
                    </span>
                    <ExternalLink size={14} className="text-slate-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
