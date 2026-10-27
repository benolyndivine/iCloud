import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  Search,
  Plus,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Folder,
  Play,
  CheckCircle2,
  RefreshCw,
  Upload,
  Cloud,
  Calendar,
  LayoutGrid,
  X,
  Layers,
  Zap,
  Clock,
  Check,
  Minus,
  Maximize2,
  FolderInput,
  Trash2,
  Share2,
  MoreVertical,
  FolderPlus,
  CheckSquare,
  Pencil,
  Copy,
  Download
} from 'lucide-react';
import { auth } from '../services/firebase/firebaseClient';
import {
  getUserStoredFiles,
  getCachedUserFiles,
  setCachedUserFiles,
  removeFileFromUserCache,
  deleteStoredFile,
  formatBytes,
  saveFileDuration,
} from '../services/firebase/backupService';
import { directCopyFileInS3 } from '../services/aws/directS3Service';
import { extractThumbnailFromVideoUrl, getCachedThumbnail } from '../services/thumbnailService';
import { extractFileDateTime } from '../utils/fileDateUtils';
import ErrorBoundary from '../components/ErrorBoundary';
import SmartImage from '../components/SmartImage';
import LazyGridTile from '../components/LazyGridTile';
import ScrollSentinel from '../components/ScrollSentinel';
import CopyMoveModal from '../components/CopyMoveModal';
import FileDetailsModal from '../components/FileDetailsModal';
import { useBackHandler } from '../context/BackNavigationContext';

// =====================================================================
// DURATION FORMATTER & VIDEO TILE
// =====================================================================
export function formatDuration(duration) {
  if (duration === null || duration === undefined || duration === '') return '';
  if (typeof duration === 'string' && duration.includes(':')) return duration;

  const sec = Number(duration);
  if (isNaN(sec) || sec < 0 || !isFinite(sec)) return '';

  const total = Math.max(1, Math.round(sec));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const durationMemoryCache = new Map();

function VideoGridTile({ file }) {
  const fileKey = file?.key || file?.name || '';
  const cacheKey = `vid_dur_${fileKey}`;
  const thumbKey = `vid_thumb_${fileKey}`;

  const [thumbnail, setThumbnail] = useState(() => {
    if (!file) return null;
    if (file.thumbnail) return file.thumbnail;
    const fastCached = getCachedThumbnail(fileKey, file.downloadUrl);
    if (fastCached) return fastCached;
    try {
      const stored = localStorage.getItem(thumbKey);
      if (stored) return stored;
    } catch {}
    return null;
  });

  const [duration, setDuration] = useState(() => {
    if (!file) return '';
    // 1. Direct property from file
    if (file.duration) return formatDuration(file.duration);
    // 2. Memory cache
    if (durationMemoryCache.has(fileKey)) return durationMemoryCache.get(fileKey);
    // 3. LocalStorage cache
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        durationMemoryCache.set(fileKey, stored);
        return stored;
      }
    } catch {}
    return '';
  });

  const saveDuration = useCallback(
    (rawSeconds) => {
      if (!rawSeconds || !isFinite(rawSeconds) || rawSeconds <= 0) return;
      const formatted = formatDuration(rawSeconds);
      if (!formatted) return;

      setDuration(formatted);
      durationMemoryCache.set(fileKey, formatted);

      try {
        localStorage.setItem(cacheKey, formatted);
      } catch {}

      // Asynchronously sync duration to AWS S3 & localStorage
      const user = auth.currentUser;
      if (user?.uid && file?.key) {
        saveFileDuration(user.uid, file.key, formatted);
      }
    },
    [fileKey, cacheKey, file?.key]
  );

  const handleLoadedMetadata = (e) => {
    saveDuration(e.target.duration);
    try {
      e.target.currentTime = 0.001;
    } catch {}
  };

  const handleVideoError = (e) => {
    // When ERR_NETWORK_CHANGED or transient drop happens, schedule retry upon network restore
    const videoEl = e.currentTarget;
    const retry = () => {
      try {
        videoEl.load();
      } catch {}
    };
    window.addEventListener('online', retry, { once: true });
    window.addEventListener('app:network-restored', retry, { once: true });
  };

  // Background thumbnail extraction if not cached yet
  useEffect(() => {
    if (thumbnail || !file?.downloadUrl) return;
    let active = true;

    extractThumbnailFromVideoUrl(file.downloadUrl, fileKey, auth.currentUser?.uid)
      .then((dataUrl) => {
        if (active && dataUrl) {
          setThumbnail(dataUrl);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [file?.downloadUrl, fileKey, thumbnail]);

  // Background fallback if onLoadedMetadata hasn't fired yet
  useEffect(() => {
    if (duration || !file?.downloadUrl) return;

    let active = true;
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.playsInline = true;

    const onMeta = () => {
      if (active && tempVideo.duration && isFinite(tempVideo.duration) && tempVideo.duration > 0) {
        saveDuration(tempVideo.duration);
      }
      cleanup();
    };

    const cleanup = () => {
      tempVideo.removeEventListener('loadedmetadata', onMeta);
      try {
        tempVideo.removeAttribute('src');
        tempVideo.load();
      } catch {}
    };

    tempVideo.addEventListener('loadedmetadata', onMeta);
    tempVideo.src = file.downloadUrl;

    return () => {
      active = false;
      cleanup();
    };
  }, [file?.downloadUrl, duration, saveDuration]);

  if (!file) return null;

  const videoUrlWithFragment = file.downloadUrl
    ? (file.downloadUrl.includes('#') ? file.downloadUrl : `${file.downloadUrl}#t=0.001`)
    : '';

  return (
    <div className="relative w-full h-full bg-slate-900 flex items-center justify-center overflow-hidden group select-none">
      {thumbnail ? (
        <SmartImage
          src={thumbnail}
          alt={file.name || 'Video'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="eager"
        />
      ) : (
        <div className="relative w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 flex items-center justify-center overflow-hidden">
          <video
            src={videoUrlWithFragment}
            preload="metadata"
            muted
            playsInline
            autoPlay={false}
            webkit-playsinline="true"
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleVideoError}
            className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300 pointer-events-none"
          />
        </div>
      )}

      {/* Subtle bottom shadow to make duration badge stand out */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

      {/* Center Frosted Glass Play Pill (Apple Photos Style) */}
      <div className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/45 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shadow-xl group-hover:scale-110 group-hover:bg-blue-600 transition-all pointer-events-none">
        <Play size={15} fill="white" className="ml-0.5 text-white drop-shadow" />
      </div>

      {/* Native video duration badge with blur pill */}
      <div className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-md border border-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center space-x-1 shadow-md pointer-events-none">
        <Play size={8} fill="white" className="shrink-0" />
        <span>{duration || '--:--'}</span>
      </div>
    </div>
  );
}

// Safe helpers for file metadata and classification
const getFileName = (f) => f?.name || f?.fileName || f?.originalName || (typeof f?.key === 'string' ? f.key.split('/').pop() : '') || '';
const isVideoFile = (f) => f?.type === 'videos' || f?.category === 'videos' || /\.(mp4|mov|webm|mkv|3gp)$/i.test(getFileName(f));
const isPhotoFile = (f) => f?.type === 'photos' || f?.category === 'photos' || /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(getFileName(f));
const isAudioFile = (f) => f?.type === 'music' || f?.category === 'music' || f?.category === 'audio' || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(getFileName(f));
const isDocFile = (f) => f?.type === 'docs' || f?.category === 'docs' || /\.(pdf|doc|docx|xls|xlsx|txt|csv)$/i.test(getFileName(f));

function FilesScreenContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCat = searchParams.get('category') || 'all';

  // Navigation & View Mode: 'timeline' | 'albums' | 'grid' (Persisted across route switches)
  const [activeTab, setActiveTab] = useState(() => {
    if (initialCat !== 'all') return 'grid';
    try {
      return sessionStorage.getItem('files_active_tab') || 'timeline';
    } catch {}
    return 'timeline';
  });
  const [selectedAlbum, setSelectedAlbum] = useState(initialCat !== 'all' ? initialCat : null);

  // Fast Instant Hydration from Memory / Local Cache (Zero reload when coming back)
  const [files, setFiles] = useState(() => {
    const user = auth.currentUser;
    if (user?.uid) {
      const cached = getCachedUserFiles(user.uid);
      if (Array.isArray(cached) && cached.length > 0) return cached;
    }
    return [];
  });

  const [loading, setLoading] = useState(() => {
    const user = auth.currentUser;
    if (user?.uid) {
      const cached = getCachedUserFiles(user.uid);
      if (Array.isArray(cached) && cached.length > 0) return false;
    }
    return true;
  });

  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);

  // Multi-Select Mode State (Matching User Reference Image)
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [copyMoveModalState, setCopyMoveModalState] = useState({ isOpen: false, mode: 'copy' });
  const [showBatchMoreMenu, setShowBatchMoreMenu] = useState(false);
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [selectedDetailFile, setSelectedDetailFile] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Progressive scroll batching to eliminate lag & freeze on large galleries
  const [gridLimit, setGridLimit] = useState(30);
  const [groupLimits, setGroupLimits] = useState({});

  // Tab scroll positions cache to provide instant, seamless switching between tabs without jump
  const scrollPositionsRef = useRef({ timeline: 0, albums: 0, grid: 0 });

  const handleTabSwitch = useCallback((newTab) => {
    if (newTab === activeTab) return;
    scrollPositionsRef.current[activeTab] = window.scrollY;
    setActiveTab(newTab);
    requestAnimationFrame(() => {
      const targetPos = scrollPositionsRef.current[newTab] || 0;
      window.scrollTo({ top: targetPos, behavior: 'instant' });
    });
  }, [activeTab]);

  // Persist active tab selection
  useEffect(() => {
    if (!selectedAlbum) {
      try {
        sessionStorage.setItem('files_active_tab', activeTab);
      } catch {}
    }
  }, [activeTab, selectedAlbum]);

  // Track and persist scroll position continuously
  useEffect(() => {
    let scrollTimeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        try {
          sessionStorage.setItem('files_scroll_pos', String(window.scrollY));
        } catch {}
      }, 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Restore scroll position after returning from preview or other screens
  useEffect(() => {
    const savedPos = sessionStorage.getItem('files_scroll_pos');
    if (savedPos !== null && Number(savedPos) > 0) {
      const pos = Number(savedPos);
      const timer = setTimeout(() => {
        window.scrollTo({ top: pos, behavior: 'instant' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, []);

  // Reset batch limits ONLY when searching or changing drilled-down album (preserve on activeTab switch!)
  useEffect(() => {
    setGridLimit(30);
    setGroupLimits({});
  }, [selectedAlbum, searchTerm]);

  const loadFiles = useCallback(async (userOverride = null, force = false) => {
    const user = userOverride || auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const currentCached = getCachedUserFiles(user.uid);
    const hasFiles = files.length > 0 || currentCached.length > 0;

    // Only show full loading spinner if we literally have 0 files rendered (cold boot)
    if (!hasFiles && !force) {
      setLoading(true);
    }

    try {
      const storedFiles = await getUserStoredFiles(user.uid, { forceRefresh: force });
      if (Array.isArray(storedFiles) && storedFiles.length > 0) {
        setFiles((prev) => {
          // If length and keys match, retain exact same array reference to prevent re-renders!
          if (prev.length === storedFiles.length) {
            const isSame = prev.every((f, i) => (f.key || f.name) === (storedFiles[i].key || storedFiles[i].name));
            if (isSame) return prev;
          }
          return storedFiles;
        });
      }
    } catch (err) {
      console.warn('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  }, [files.length]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        const cached = getCachedUserFiles(user.uid);
        if (cached && cached.length > 0) {
          setFiles((prev) => (prev.length > 0 ? prev : cached));
          setLoading(false);
        }
        // Silently revalidate in background without wiping UI
        loadFiles(user, false);
      } else {
        setFiles([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [loadFiles]);

  // Automatically refresh files when network connectivity is restored
  useEffect(() => {
    const handleNetworkRestored = () => {
      if (auth.currentUser) {
        loadFiles(null, false);
      }
    };
    window.addEventListener('online', handleNetworkRestored);
    window.addEventListener('app:network-restored', handleNetworkRestored);
    return () => {
      window.removeEventListener('online', handleNetworkRestored);
      window.removeEventListener('app:network-restored', handleNetworkRestored);
    };
  }, [loadFiles]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFiles(null, true);
    setRefreshing(false);
  };

  // Ensure only valid file objects are processed
  const validFiles = useMemo(() => {
    if (!Array.isArray(files)) return [];
    return files.filter((f) => f && typeof f === 'object');
  }, [files]);

  // Filter files by search term
  const searchedFiles = useMemo(() => {
    if (!searchTerm.trim()) return validFiles;
    const lower = searchTerm.toLowerCase();
    return validFiles.filter((f) => {
      const name = getFileName(f);
      return (
        name.toLowerCase().includes(lower) ||
        (f?.folder && typeof f.folder === 'string' && f.folder.toLowerCase().includes(lower)) ||
        (f?.category && typeof f.category === 'string' && f.category.toLowerCase().includes(lower))
      );
    });
  }, [validFiles, searchTerm]);

  // Files filtered by selected album (if drilled down)
  const albumFiles = useMemo(() => {
    if (!selectedAlbum || selectedAlbum === 'all') return searchedFiles;
    if (selectedAlbum === 'videos') {
      return searchedFiles.filter(isVideoFile);
    }
    if (selectedAlbum === 'photos') {
      return searchedFiles.filter(isPhotoFile);
    }
    if (selectedAlbum === 'music' || selectedAlbum === 'audios') {
      return searchedFiles.filter(isAudioFile);
    }
    if (selectedAlbum === 'docs') {
      return searchedFiles.filter(isDocFile);
    }
    const lowerAlbum = String(selectedAlbum).toLowerCase();
    return searchedFiles.filter((f) => typeof f?.folder === 'string' && f.folder.toLowerCase() === lowerAlbum);
  }, [searchedFiles, selectedAlbum]);

  const activeFileList = selectedAlbum ? albumFiles : searchedFiles;
  const displayedGridFiles = useMemo(() => {
    return activeFileList.slice(0, gridLimit);
  }, [activeFileList, gridLimit]);
  const hasMoreGrid = activeFileList.length > gridLimit;

  // Group files by real captured/saved date and calculate timing ranges
  const timelineGroups = useMemo(() => {
    const groups = {};
    const listToGroup = selectedAlbum ? albumFiles : searchedFiles;

    for (const file of listToGroup) {
      if (!file) continue;
      const { date, dateKey, dateLabel, timeStr, timestamp } = extractFileDateTime(file);

      // Attach parsed info to file for tiles and previews
      file._captureDate = date;
      file._captureTimeStr = timeStr;
      file._captureTimestamp = timestamp;

      if (!groups[dateKey]) {
        groups[dateKey] = {
          key: dateKey,
          label: dateLabel,
          dateObj: date,
          files: [],
          minTimestamp: timestamp,
          maxTimestamp: timestamp,
          minTime: timeStr,
          maxTime: timeStr,
        };
      }

      const g = groups[dateKey];
      g.files.push(file);

      if (timestamp < g.minTimestamp) {
        g.minTimestamp = timestamp;
        g.minTime = timeStr;
      }
      if (timestamp > g.maxTimestamp) {
        g.maxTimestamp = timestamp;
        g.maxTime = timeStr;
      }
    }

    const result = Object.values(groups).map((g) => {
      // Sort files in each date group by capture time (latest first)
      g.files.sort((a, b) => (b._captureTimestamp || 0) - (a._captureTimestamp || 0));

      let timeRange = '';
      if (g.minTime && g.maxTime) {
        timeRange = g.minTime === g.maxTime ? g.minTime : `${g.minTime} – ${g.maxTime}`;
      } else if (g.minTime) {
        timeRange = g.minTime;
      }

      return {
        ...g,
        timeRange,
      };
    });

    // Sort date groups latest first
    return result.sort((a, b) => b.dateObj - a.dateObj);
  }, [searchedFiles, albumFiles, selectedAlbum]);

  // Album category definitions for the Albums view
  const albumCategories = useMemo(() => {
    const photos = searchedFiles.filter(isPhotoFile);
    const videos = searchedFiles.filter(isVideoFile);
    const audios = searchedFiles.filter(isAudioFile);
    const docs = searchedFiles.filter(isDocFile);

    const folderMap = new Map();
    for (const f of searchedFiles) {
      if (f?.folder && typeof f.folder === 'string' && !['photos', 'videos', 'music', 'docs', 'other'].includes(f.folder.toLowerCase())) {
        folderMap.set(f.folder, (folderMap.get(f.folder) || 0) + 1);
      }
    }

    const firstValidPhoto = photos[0]?.downloadUrl;
    const bestVideo = videos.find((v) => v.thumbnail || (v.key && localStorage.getItem(`vid_thumb_${v.key}`))) || videos[0];
    const videoThumb = bestVideo?.thumbnail || (bestVideo?.key ? localStorage.getItem(`vid_thumb_${bestVideo.key}`) : null);

    const list = [
      {
        id: 'all',
        title: 'All Media',
        count: searchedFiles.length,
        cover: firstValidPhoto || videoThumb || searchedFiles[0]?.downloadUrl,
      },
      {
        id: 'photos',
        title: 'Camera & Photos',
        count: photos.length,
        cover: firstValidPhoto,
      },
      {
        id: 'videos',
        title: 'Videos',
        count: videos.length,
        cover: bestVideo?.downloadUrl,
        coverThumb: videoThumb,
        isVideo: true,
      },
      {
        id: 'audios',
        title: 'Audio & Voice',
        count: audios.length,
        isAudio: true,
      },
      {
        id: 'docs',
        title: 'Documents',
        count: docs.length,
        isDoc: true,
      },
    ];

    folderMap.forEach((count, name) => {
      const folderFiles = searchedFiles.filter((f) => f?.folder === name);
      const pMatch = folderFiles.find(isPhotoFile);
      const vMatch = folderFiles.find(isVideoFile);
      const isOnlyVid = !pMatch && !!vMatch;
      const isOnlyDoc = !pMatch && !vMatch && folderFiles.some(isDocFile);
      const isOnlyAud = !pMatch && !vMatch && folderFiles.some(isAudioFile);

      if (pMatch) {
        list.push({ id: name, title: name, count, cover: pMatch.downloadUrl });
      } else if (isOnlyVid) {
        const vThumb = vMatch?.thumbnail || (vMatch?.key ? localStorage.getItem(`vid_thumb_${vMatch.key}`) : null);
        list.push({
          id: name,
          title: name,
          count,
          cover: vMatch.downloadUrl,
          coverThumb: vThumb,
          isVideo: true,
        });
      } else if (isOnlyDoc) {
        list.push({ id: name, title: name, count, isDoc: true });
      } else if (isOnlyAud) {
        list.push({ id: name, title: name, count, isAudio: true });
      } else {
        list.push({ id: name, title: name, count, cover: folderFiles[0]?.downloadUrl });
      }
    });

    return list;
  }, [searchedFiles]);

  // Open native gallery preview
  const openPreview = useCallback((file) => {
    if (!file) return;
    try {
      sessionStorage.setItem('files_scroll_pos', String(window.scrollY));
    } catch {}
    const listToPass = selectedAlbum ? albumFiles : searchedFiles;
    const fileKey = file?.key || getFileName(file);
    const isVid = isVideoFile(file);
    navigate(`/preview/${encodeURIComponent(fileKey)}`, {
      state: { files: listToPass, initialKey: fileKey, autoPlay: isVid },
    });
  }, [selectedAlbum, albumFiles, searchedFiles, navigate]);

  // Selection helpers
  const toggleSelect = useCallback((file) => {
    const key = file?.key || getFileName(file);
    if (!key) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleLongPress = useCallback((file) => {
    const key = file?.key || getFileName(file);
    if (!key) return;
    setIsSelectMode(true);
    setSelectedKeys(new Set([key]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedKeys(new Set());
    setShowBatchMoreMenu(false);
    setShowCreateAlbumModal(false);
    setSelectedDetailFile(null);
  }, []);

  // Prioritized Back Handlers for Android Back Button & Escape
  // 1. Modals & Sheets (Priority 80)
  useBackHandler(() => setCopyMoveModalState({ isOpen: false, mode: 'copy' }), 80, copyMoveModalState.isOpen);
  useBackHandler(() => setShowCreateAlbumModal(false), 80, showCreateAlbumModal);
  useBackHandler(() => setShowBatchMoreMenu(false), 80, showBatchMoreMenu);
  useBackHandler(() => setSelectedDetailFile(null), 80, Boolean(selectedDetailFile));

  // 2. Multi-Select Mode (Priority 60) - Exit select mode on back press
  useBackHandler(exitSelectMode, 60, isSelectMode);

  // 3. Sub-views inside FilesScreen (Priority 40)
  useBackHandler(() => setSelectedAlbum(null), 40, Boolean(selectedAlbum));
  useBackHandler(() => { setShowSearchInput(false); setSearchTerm(''); }, 30, showSearchInput || Boolean(searchTerm));

  const selectedFilesList = useMemo(() => {
    return files.filter((f) => selectedKeys.has(f?.key || getFileName(f)));
  }, [files, selectedKeys]);

  const visibleGalleryFiles = useMemo(() => {
    return selectedAlbum ? albumFiles : searchedFiles;
  }, [selectedAlbum, albumFiles, searchedFiles]);

  const isAllSelected = visibleGalleryFiles.length > 0 && selectedKeys.size === visibleGalleryFiles.length;
  const isSomeSelected = selectedKeys.size > 0 && !isAllSelected;

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(visibleGalleryFiles.map((f) => f?.key || getFileName(f))));
    }
  }, [isAllSelected, visibleGalleryFiles]);

  // Batch Share Action
  const handleBatchShare = async () => {
    if (selectedKeys.size === 0) return;
    const urls = selectedFilesList.map((f) => f.downloadUrl).filter(Boolean);
    if (urls.length > 0) {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Shared ${selectedFilesList.length} items from iCloud`,
            text: `Check out these ${selectedFilesList.length} photos and videos!`,
            url: urls[0],
          });
          return;
        } catch {}
      }
      try {
        await navigator.clipboard.writeText(urls.join('\n'));
        showToast(`Copied ${urls.length} download links to clipboard!`);
      } catch {
        showToast('Shared links generated!');
      }
    }
  };

  // Batch Delete Action
  const handleBatchDelete = async () => {
    if (selectedKeys.size === 0) return;
    const user = auth.currentUser;
    if (!user) return;
    const count = selectedKeys.size;
    if (!window.confirm(`Permanently delete ${count} selected ${count === 1 ? 'file' : 'files'} from AWS S3?`)) {
      return;
    }

    setBatchActionLoading(true);
    showToast(`Deleting ${count} items from AWS S3...`);

    try {
      const keysToDelete = Array.from(selectedKeys);
      for (const k of keysToDelete) {
        try {
          await deleteStoredFile(k, user.uid);
          removeFileFromUserCache(user.uid, k);
        } catch (e) {
          console.warn('Failed to delete key:', k, e);
        }
      }

      setFiles((prev) => prev.filter((f) => !selectedKeys.has(f?.key || getFileName(f))));
      showToast(`Successfully deleted ${count} items from AWS S3!`);
      exitSelectMode();
    } catch (err) {
      showToast('Error deleting some items: ' + err.message);
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Batch Move / Copy Action
  const handleOpenBatchMoveCopy = (mode = 'move') => {
    if (selectedKeys.size === 0) return;
    setCopyMoveModalState({ isOpen: true, mode });
  };

  const handleBatchCopyMoveSuccess = ({ action, targetFolder, results }) => {
    const user = auth.currentUser;
    if (action === 'move') {
      const movedKeySet = new Set(results.map((r) => r.sourceKey));
      setFiles((prev) => {
        const remaining = prev.filter((f) => !movedKeySet.has(f.key || f.name));
        const newFiles = results.map((r) => r.file);
        const updated = [...newFiles, ...remaining];
        if (user?.uid) setCachedUserFiles(user.uid, updated);
        return updated;
      });
      showToast(`Moved ${results.length} items to "${targetFolder}"!`);
    } else {
      setFiles((prev) => {
        const newFiles = results.map((r) => r.file);
        const updated = [...newFiles, ...prev];
        if (user?.uid) setCachedUserFiles(user.uid, updated);
        return updated;
      });
      showToast(`Copied ${results.length} items to "${targetFolder}"!`);
    }
    exitSelectMode();
  };

  // Batch Create Album Action
  const handleCreateAlbum = async () => {
    const albumName = newAlbumName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
    if (!albumName) {
      showToast('Please enter an album name');
      return;
    }
    const user = auth.currentUser;
    if (!user) return;

    setBatchActionLoading(true);
    showToast(`Creating album "${albumName}" with ${selectedKeys.size} items...`);

    try {
      const selected = selectedFilesList;
      for (const item of selected) {
        const sKey = item.key || item.name;
        await directCopyFileInS3({
          sourceKey: sKey,
          targetFolder: albumName,
          userId: user.uid,
        });
      }
      showToast(`Album "${albumName}" created successfully!`);
      setShowCreateAlbumModal(false);
      setNewAlbumName('');
      exitSelectMode();
      loadFiles(null, true);
    } catch (err) {
      showToast('Failed to create album: ' + err.message);
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Batch Download to Device Action
  const handleBatchDownload = async () => {
    setShowBatchMoreMenu(false);
    showToast(`Downloading ${selectedFilesList.length} items to device...`);
    for (const f of selectedFilesList) {
      if (f.downloadUrl) {
        const a = document.createElement('a');
        a.href = f.downloadUrl;
        a.download = f.name || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    showToast('Downloaded selected files to device!');
  };

  // Render a sleek square thumbnail tile with viewport-aware lazy loading
  const renderSquareTile = (file, idx) => {
    if (!file) return null;
    const fileName = getFileName(file);
    const fileKey = file?.key || fileName;
    const isVid = isVideoFile(file);
    const isImg = isPhotoFile(file);
    const isAud = isAudioFile(file);
    const ext = (fileName.split('.').pop() || '').toUpperCase();
    const isPdf = ext === 'PDF';
    const timeStr = file._captureTimeStr || (file ? extractFileDateTime(file).timeStr : '');
    const isSelected = selectedKeys.has(fileKey);

    return (
      <LazyGridTile
        key={file.id || file.key || idx}
        file={file}
        idx={idx}
        onClick={openPreview}
        isImg={isImg}
        isVid={isVid}
        isAud={isAud}
        isPdf={isPdf}
        fileName={fileName}
        ext={ext}
        timeStr={timeStr}
        VideoComponent={VideoGridTile}
        isSelectMode={isSelectMode}
        isSelected={isSelected}
        onToggleSelect={toggleSelect}
        onLongPress={handleLongPress}
        onExpand={openPreview}
      />
    );
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-white pb-24 select-none flex flex-col relative font-sans transition-colors duration-200">
      {/* Ambient Top Glow for high-end Apple/Samsung atmosphere */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-28 bg-blue-500/10 dark:bg-blue-600/10 blur-3xl pointer-events-none rounded-full" />

      {/* ======================================================== */}
      {/* 1. TOP HEADER & MODERN GLASS SEGMENTED CONTROLS          */}
      {/* ======================================================== */}
      <div className="sticky top-0 z-40 bg-slate-50/90 dark:bg-[#090d16]/90 backdrop-blur-xl px-3 pt-2 pb-2.5 space-y-2.5 border-b border-slate-200/80 dark:border-white/5 transition-colors duration-200">
        {isSelectMode ? (
          /* Multi-Select Header (Matching User Reference Image) */
          <div className="flex items-center justify-between h-9 px-1 animate-in fade-in duration-150">
            {/* Left: Square Toggle Button (- when partial, check when all, empty when 0) */}
            <button
              onClick={handleToggleSelectAll}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-white/15 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
              title={isAllSelected ? 'Deselect All' : 'Select All'}
            >
              {isAllSelected ? (
                <div className="w-4 h-4 rounded bg-[#84cc16] flex items-center justify-center shadow-sm">
                  <Check size={11} strokeWidth={3} className="text-black" />
                </div>
              ) : isSomeSelected ? (
                <div className="w-4 h-4 rounded bg-slate-600 dark:bg-slate-500 flex items-center justify-center shadow-sm">
                  <Minus size={11} strokeWidth={3} className="text-white" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded border-2 border-slate-500 dark:border-white/70" />
              )}
            </button>

            {/* Center: Dynamic Count */}
            <div className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              {selectedKeys.size} selected
            </div>

            {/* Right: Exit Select Mode X */}
            <button
              onClick={exitSelectMode}
              className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-white/15 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-all active:scale-90 cursor-pointer"
              title="Close Selection"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          /* Standard Header */
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {selectedAlbum ? (
                <button
                  onClick={() => {
                    setSelectedAlbum(null);
                    requestAnimationFrame(() => {
                      window.scrollTo({ top: scrollPositionsRef.current[activeTab] || 0, behavior: 'instant' });
                    });
                  }}
                  className="flex items-center space-x-1.5 text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 active:scale-95 transition-all cursor-pointer"
                >
                  <ChevronLeft size={22} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-base font-bold capitalize text-slate-900 dark:text-white tracking-tight">{selectedAlbum}</span>
                </button>
              ) : (
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Photos</h1>
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-500/20">
                    Cloud
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSearchInput(!showSearchInput)}
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-white/10 flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Search"
              >
                <Search size={15} />
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-white/10 flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Refresh AWS S3 files"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600 dark:text-blue-400' : ''} />
              </button>
              <button
                onClick={() => navigate('/backup')}
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center transition-all shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer"
                title="Backup Files"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setIsSelectMode(true)}
                className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300/60 dark:border-white/10 transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                Select
              </button>
            </div>
          </div>
        )}

        {/* Expandable Search Input */}
        {!isSelectMode && showSearchInput && (
          <div className="relative pt-0.5 animate-in fade-in duration-150">
            <Search size={14} className="absolute left-3 top-3 text-slate-400 dark:text-white/50" />
            <input
              type="text"
              placeholder="Search by name, folder or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-white/15 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 dark:text-white/50 dark:hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Sleek iOS Glass Segmented Switcher (Timeline, Albums, All Photos) */}
        {!selectedAlbum && !isSelectMode && (
          <div className="flex max-w-md mx-auto w-full p-1 bg-slate-200/80 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-300/60 dark:border-white/10 shadow-inner">
            {[
              { id: 'timeline', label: 'Timeline', icon: Calendar },
              { id: 'albums', label: 'Albums', icon: Folder },
              { id: 'grid', label: 'All files', icon: LayoutGrid },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabSwitch(tab.id)}
                  className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 font-bold scale-[1.01]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. MAIN GALLERY CONTENT                                  */}
      {/* ======================================================== */}
      <div className="flex-1 px-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <RefreshCw size={28} className="animate-spin text-blue-600 dark:text-blue-500" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Fetching media from AWS S3...</p>
          </div>
        ) : (selectedAlbum ? albumFiles : searchedFiles).length === 0 ? (
          /* Sleek Empty State */
          <div className="text-center py-20 px-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-600/15 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 mx-auto shadow-inner">
              <Cloud size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Cloud Files Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                Back up photos, videos, or mobile folders from your device to see them in your cloud gallery.
              </p>
            </div>
            <button
              onClick={() => navigate('/backup')}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
            >
              <Upload size={14} />
              <span>Back up Files from Device</span>
            </button>
          </div>
        ) : selectedAlbum ? (
          /* ======================================================== */
          /* DRILLED-DOWN ALBUM VIEW (Grid with infinite scroll)       */
          /* ======================================================== */
          <div className="pt-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 px-1">
              {displayedGridFiles.map((file, idx) => renderSquareTile(file, idx))}
            </div>
            {hasMoreGrid && (
              <ScrollSentinel
                onIntersect={() => setGridLimit((prev) => prev + 30)}
              />
            )}
          </div>
        ) : (
          /* ======================================================== */
          /* CONCURRENT PERSISTENT TABS (Zero DOM unmount on switch!)  */
          /* ======================================================== */
          <>
            {/* 1. Timeline Tab (Preserved in memory) */}
            <div className={activeTab === 'timeline' ? 'space-y-4 pt-1 block' : 'hidden'}>
              {timelineGroups.map((group) => {
                const limit = groupLimits[group.label] || 30;
                const visibleFiles = group.files.slice(0, limit);
                const hasMore = group.files.length > limit;

                return (
                  <div key={group.label} className="space-y-1.5">
                    {/* Date Header: Clean Modern Sans with item count & captured timing */}
                    <div className="flex items-center justify-between px-2 pt-3 pb-1">
                      <div className="flex flex-col">
                        <div className="flex items-baseline space-x-2">
                          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{group.label}</h3>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            • {group.files.length} {group.files.length === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                        {group.timeRange && (
                          <div className="flex items-center space-x-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                            <Clock size={11} className="shrink-0 text-blue-500" />
                            <span>{group.timeRange}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-200 dark:border-sky-500/20 flex items-center space-x-1">
                        <Cloud size={10} />
                        <span>AWS S3</span>
                      </span>
                    </div>

                    {/* Multi-Resolution Responsive Thumbnail Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 px-1">
                      {visibleFiles.map((file, idx) => renderSquareTile(file, idx))}
                    </div>

                    {activeTab === 'timeline' && hasMore && (
                      <ScrollSentinel
                        onIntersect={() => {
                          setGroupLimits((prev) => ({
                            ...prev,
                            [group.label]: (prev[group.label] || 30) + 30,
                          }));
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* 2. Albums Tab (Preserved in memory) */}
            <div className={activeTab === 'albums' ? 'pt-2 px-1 block' : 'hidden'}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {albumCategories.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => {
                      scrollPositionsRef.current[activeTab] = window.scrollY;
                      setSelectedAlbum(album.id);
                      setActiveTab('grid');
                      window.scrollTo({ top: 0, behavior: 'instant' });
                    }}
                    className="group flex flex-col cursor-pointer active:scale-95 transition-all duration-200"
                  >
                    {/* Rounded Square Album Card */}
                    <div className="relative aspect-square rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 shadow-sm hover:shadow-md dark:shadow-lg dark:hover:border-white/20 transition-all">
                      {album.isAudio ? (
                        <div className="w-full h-full bg-gradient-to-tr from-pink-500/20 via-purple-600/30 to-indigo-600/40 flex items-center justify-center text-pink-500 dark:text-pink-400">
                          <Music size={32} />
                        </div>
                      ) : album.isDoc ? (
                        <div className="w-full h-full bg-gradient-to-tr from-emerald-500/20 via-teal-600/30 to-cyan-600/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <FileText size={32} />
                        </div>
                      ) : album.isVideo ? (
                        <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                          {album.coverThumb ? (
                            <SmartImage src={album.coverThumb} alt={album.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="relative w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 flex items-center justify-center">
                              <video
                                src={album.cover ? `${album.cover}#t=0.001` : ''}
                                preload="metadata"
                                muted
                                playsInline
                                webkit-playsinline="true"
                                onLoadedMetadata={(e) => { try { e.target.currentTime = 0.001; } catch {} }}
                                className="w-full h-full object-cover opacity-80"
                              />
                            </div>
                          )}
                          <div className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/45 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shadow-xl">
                            <Play size={16} fill="white" className="ml-0.5" />
                          </div>
                        </div>
                      ) : album.cover ? (
                        <SmartImage
                          src={album.cover}
                          alt={album.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-blue-500/20 via-indigo-600/20 to-purple-600/20 flex items-center justify-center text-blue-500 dark:text-blue-400">
                          <Folder size={32} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                    </div>

                    {/* Album Name & File Count */}
                    <div className="pt-1.5 px-0.5">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {album.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {album.count} {album.count === 1 ? 'item' : 'items'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. All Photos Continuous Dense Grid Tab (Preserved in memory) */}
            <div className={activeTab === 'grid' ? 'pt-2 block' : 'hidden'}>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5 px-1">
                {displayedGridFiles.map((file, idx) => renderSquareTile(file, idx))}
              </div>
              {activeTab === 'grid' && hasMoreGrid && (
                <ScrollSentinel
                  onIntersect={() => setGridLimit((prev) => prev + 30)}
                />
              )}
            </div>
          </>
        )}

        {/* ======================================================== */}
        {/* 6. GALLERY STATUS FOOTER (Like Apple Photos)             */}
        {/* ======================================================== */}
        {(selectedAlbum ? albumFiles : searchedFiles).length > 0 && (
          <div className="py-10 text-center space-y-1.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 tracking-tight">
              {(selectedAlbum ? albumFiles : searchedFiles).length}{' '}
              {(selectedAlbum ? albumFiles : searchedFiles).length === 1 ? 'Photo / File' : 'Photos & Files'}
            </p>
            <div className="inline-flex items-center space-x-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
              <span>Backed up to AWS S3</span>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 7. FIXED BOTTOM MULTI-SELECT BAR (Matching Reference)    */}
      {/* ======================================================== */}
      {isSelectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#121620]/95 dark:bg-[#0c1017]/95 backdrop-blur-xl border-t border-white/10 px-4 pt-2.5 pb-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center justify-around max-w-lg mx-auto">
            {/* 1. Share */}
            <button
              onClick={handleBatchShare}
              disabled={selectedKeys.size === 0}
              className="flex flex-col items-center space-y-1 text-slate-300 hover:text-white disabled:opacity-30 active:scale-90 transition-all cursor-pointer"
            >
              <Share2 size={21} className="text-slate-300" />
              <span className="text-[10px] font-medium tracking-tight">Share</span>
            </button>

            {/* 2. Move/Copy */}
            <button
              onClick={() => handleOpenBatchMoveCopy('move')}
              disabled={selectedKeys.size === 0}
              className="flex flex-col items-center space-y-1 text-slate-300 hover:text-white disabled:opacity-30 active:scale-90 transition-all cursor-pointer"
            >
              <FolderInput size={21} className="text-slate-300" />
              <span className="text-[10px] font-medium tracking-tight">Move/Copy</span>
            </button>

            {/* 3. Create */}
            <button
              onClick={() => {
                setNewAlbumName('');
                setShowCreateAlbumModal(true);
              }}
              disabled={selectedKeys.size === 0}
              className="flex flex-col items-center space-y-1 text-slate-300 hover:text-white disabled:opacity-30 active:scale-90 transition-all cursor-pointer"
            >
              <FolderPlus size={21} className="text-slate-300" />
              <span className="text-[10px] font-medium tracking-tight">Create</span>
            </button>

            {/* 4. Delete */}
            <button
              onClick={handleBatchDelete}
              disabled={selectedKeys.size === 0}
              className="flex flex-col items-center space-y-1 text-rose-400 hover:text-rose-300 disabled:opacity-30 active:scale-90 transition-all cursor-pointer"
            >
              <Trash2 size={21} className="text-rose-400" />
              <span className="text-[10px] font-medium tracking-tight text-rose-400">Delete</span>
            </button>

            {/* 5. More */}
            <button
              onClick={() => setShowBatchMoreMenu(true)}
              className="flex flex-col items-center space-y-1 text-slate-300 hover:text-white active:scale-90 transition-all cursor-pointer"
            >
              <MoreVertical size={21} className="text-slate-300" />
              <span className="text-[10px] font-medium tracking-tight">More</span>
            </button>
          </div>
        </div>
      )}

      {/* Batch Copy / Move Modal */}
      <CopyMoveModal
        isOpen={copyMoveModalState.isOpen}
        mode={copyMoveModalState.mode}
        files={selectedFilesList}
        userUid={auth.currentUser?.uid}
        allFiles={files}
        onClose={() => setCopyMoveModalState({ isOpen: false, mode: 'copy' })}
        onSuccess={handleBatchCopyMoveSuccess}
        showToast={showToast}
      />

      {/* Create New Album Modal */}
      {showCreateAlbumModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FolderPlus size={20} className="text-blue-400" />
                <h3 className="text-sm font-bold text-white">Create New Album</h3>
              </div>
              <button
                onClick={() => setShowCreateAlbumModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Add {selectedKeys.size} selected {selectedKeys.size === 1 ? 'item' : 'items'} into a new album in AWS S3.
            </p>
            <input
              type="text"
              placeholder="Album Name (e.g. Vacation, Family)"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setShowCreateAlbumModal(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAlbum}
                disabled={batchActionLoading || !newAlbumName.trim()}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-1"
              >
                {batchActionLoading ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <span>Create Album</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch More Action Sheet */}
      {showBatchMoreMenu && (
        <div
          onClick={() => setShowBatchMoreMenu(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-xs p-4 space-y-1.5 shadow-2xl animate-in slide-in-from-bottom-4 duration-200 text-white"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10 px-1">
              <span className="text-xs font-bold text-slate-300">More Actions</span>
              <button
                onClick={() => setShowBatchMoreMenu(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            </div>

            <button
              onClick={handleBatchDownload}
              disabled={selectedKeys.size === 0}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Download size={16} className="text-sky-400 shrink-0" />
              <span>Download to Device ({selectedKeys.size})</span>
            </button>

            <button
              onClick={() => {
                setShowBatchMoreMenu(false);
                handleOpenBatchMoveCopy('copy');
              }}
              disabled={selectedKeys.size === 0}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Copy size={16} className="text-indigo-400 shrink-0" />
              <span>Copy to Album...</span>
            </button>

            <button
              onClick={() => {
                setShowBatchMoreMenu(false);
                handleOpenBatchMoveCopy('move');
              }}
              disabled={selectedKeys.size === 0}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <FolderInput size={16} className="text-amber-400 shrink-0" />
              <span>Move to Album...</span>
            </button>

            {selectedFilesList.length > 0 && (
              <button
                onClick={() => {
                  setShowBatchMoreMenu(false);
                  setSelectedDetailFile(selectedFilesList[0]);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                <Info size={16} className="text-blue-400 shrink-0" />
                <span>View Details &amp; Info ({selectedFilesList.length === 1 ? selectedFilesList[0]?.name : `${selectedFilesList.length} files`})</span>
              </button>
            )}

            <div className="pt-1 border-t border-white/10">
              <button
                onClick={() => {
                  setShowBatchMoreMenu(false);
                  handleToggleSelectAll();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                <CheckSquare size={16} className="text-emerald-400 shrink-0" />
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Pill */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xl border border-white/15 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* File Details & Metadata Modal */}
      <FileDetailsModal
        isOpen={Boolean(selectedDetailFile)}
        file={selectedDetailFile}
        downloadUrl={selectedDetailFile?.downloadUrl}
        onClose={() => setSelectedDetailFile(null)}
      />

      {/* Batch Action Loading Spinner */}
      {batchActionLoading && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center space-y-3">
          <RefreshCw size={32} className="animate-spin text-blue-400" />
          <p className="text-xs font-semibold text-white">Processing AWS S3 action...</p>
        </div>
      )}
    </div>
  );
}

export default function FilesScreen(props) {
  return (
    <ErrorBoundary
      title="Unable to display cloud photos"
      message="There was an issue rendering your files. Tap Try Again to reload your cloud gallery."
    >
      <FilesScreenContent {...props} />
    </ErrorBoundary>
  );
}
