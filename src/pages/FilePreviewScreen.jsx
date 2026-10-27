import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Info,
  Share2,
  Download,
  Trash2,
  MoreVertical,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Music,
  FileText,
  FileArchive,
  RefreshCw,
  X,
  Check,
  Zap,
  Pencil,
  RotateCw,
  Repeat,
  FlipHorizontal,
  Video,
  AlertCircle,
  Copy,
  Move
} from 'lucide-react';
import { auth } from '../services/firebase/firebaseClient';
import {
  getUserStoredFiles,
  formatBytes,
  deleteStoredFile,
  directGetDownloadUrl,
  saveFileDuration,
  updateFileInUserCache,
  removeFileFromUserCache,
} from '../services/firebase/backupService';
import { extractThumbnailFromVideoUrl, getCachedThumbnail } from '../services/thumbnailService';
import SmartImage from '../components/SmartImage';
import { extractFileDateTime } from '../utils/fileDateUtils';
import { useBackNavigation, useBackHandler } from '../context/BackNavigationContext';

// Code-split heavy modals and PDF worker engine to ensure zero-lag photo/video viewing
const PdfViewer = React.lazy(() => import('../components/PdfViewer'));
const PhotoEditorModal = React.lazy(() => import('../components/PhotoEditorModal'));
const CopyMoveModal = React.lazy(() => import('../components/CopyMoveModal'));
const FileDetailsModal = React.lazy(() => import('../components/FileDetailsModal'));

function FilmstripVideoThumb({ item, itemUrl, fileKey, userId }) {
  const [thumb, setThumb] = useState(() => {
    if (item?.thumbnail) return item.thumbnail;
    const fast = getCachedThumbnail(fileKey, itemUrl || item?.downloadUrl);
    if (fast) return fast;
    try {
      return localStorage.getItem(`vid_thumb_${fileKey}`) || null;
    } catch {}
    return null;
  });

  useEffect(() => {
    if (thumb) return;
    const url = itemUrl || item?.downloadUrl;
    if (!url) return;
    let active = true;
    extractThumbnailFromVideoUrl(url, fileKey, userId)
      .then((t) => {
        if (active && t) setThumb(t);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [itemUrl, item?.downloadUrl, fileKey, userId, thumb]);

  return (
    <div className="relative w-full h-full bg-slate-900 flex items-center justify-center overflow-hidden">
      {thumb ? (
        <SmartImage src={thumb} alt="" className="w-full h-full object-cover" loading="eager" />
      ) : (
        <div className="relative w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 flex items-center justify-center">
          {itemUrl && (
            <video
              src={`${itemUrl}#t=0.001`}
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
              className="w-full h-full object-cover opacity-80 pointer-events-none"
            />
          )}
        </div>
      )}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
      <Play size={10} fill="white" className="absolute text-white drop-shadow pointer-events-none" />
    </div>
  );
}

function formatDuration(duration) {
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

export default function FilePreviewScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { smartGoBack } = useBackNavigation();
  const { fileId } = useParams();
  const decodedKey = decodeURIComponent(fileId || '');

  // Files & Key
  const [allFiles, setAllFiles] = useState(location.state?.files || []);
  const [currentKey, setCurrentKey] = useState(decodedKey);

  // URL Caching for instantaneous slide transitions
  const [cachedUrls, setCachedUrls] = useState(() => {
    const map = {};
    if (location.state?.files) {
      for (const f of location.state.files) {
        if (f.downloadUrl) map[f.key || f.name] = f.downloadUrl;
      }
    }
    return map;
  });

  // UI & Playback State
  const shouldAutoPlayRef = useRef(Boolean(location.state?.autoPlay));
  const [showControls, setShowControls] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPlaying, setIsPlaying] = useState(Boolean(location.state?.autoPlay));
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [videoRotation, setVideoRotation] = useState(0);
  const [videoFlipped, setVideoFlipped] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Landscape Tilt Fullscreen Mode
  const [isLandscapeMode, setIsLandscapeMode] = useState(false);
  const [viewportOrientation, setViewportOrientation] = useState(() => {
    return typeof window !== 'undefined' && window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  });

  // Track viewport orientation dynamically
  useEffect(() => {
    const handleResize = () => {
      const isLand = window.innerWidth >= window.innerHeight;
      setViewportOrientation(isLand ? 'landscape' : 'portrait');
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Exit landscape mode if user exits native fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isLandscapeMode && viewportOrientation === 'landscape') {
        setIsLandscapeMode(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isLandscapeMode, viewportOrientation]);

  // Handle hardware/browser back button smoothly when in landscape mode
  useEffect(() => {
    if (!isLandscapeMode) return;
    const handlePopState = () => {
      setIsLandscapeMode(false);
    };
    window.history.pushState({ landscapeFullscreen: true }, '');
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isLandscapeMode]);

  // Image Pinch-to-Zoom & Pan State
  const [imageScale, setImageScale] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const pinchStartDistRef = useRef(null);
  const pinchStartScaleRef = useRef(1);
  const panStartXRef = useRef(0);
  const panStartYRef = useRef(0);
  const lastTapRef = useRef(0);

  // Photo Editor & Copy/Move Modals
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [copyMoveModal, setCopyMoveModal] = useState({ isOpen: false, mode: 'copy' });

  // Prioritized Back Navigation Handlers (Android Back & Hardware Back sequence)
  useBackHandler(() => setCopyMoveModal({ isOpen: false, mode: 'copy' }), 100, copyMoveModal.isOpen);
  useBackHandler(() => setShowPhotoEditor(false), 100, showPhotoEditor);
  useBackHandler(() => setShowInfoModal(false), 100, showInfoModal);
  useBackHandler(() => setShowEditMenu(false), 90, showEditMenu);
  useBackHandler(() => setShowMoreMenu(false), 90, showMoreMenu);
  useBackHandler(() => setIsLandscapeMode(false), 80, isLandscapeMode);
  useBackHandler(() => { setImageScale(1); setImagePan({ x: 0, y: 0 }); }, 70, imageScale > 1);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Slide Animation & Drag State
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideSlotTarget, setSlideSlotTarget] = useState({ prev: null, next: null });

  // Refs
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const activeThumbRef = useRef(null);
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const hasMovedRef = useRef(false);

  // Load all user files from S3 if opened directly by URL
  const loadFilesList = useCallback(async () => {
    if (allFiles.length > 0) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const files = await getUserStoredFiles(user.uid, token);
      if (files && files.length > 0) {
        setAllFiles(files);
        setCachedUrls((prev) => {
          const updated = { ...prev };
          for (const f of files) {
            if (f.downloadUrl) updated[f.key || f.name] = f.downloadUrl;
          }
          return updated;
        });
      }
    } catch (e) {
      console.warn('Could not load files list:', e);
    }
  }, [allFiles.length]);

  useEffect(() => {
    loadFilesList();
  }, [loadFilesList]);

  // Reset video & zoom state when switching slides
  useEffect(() => {
    setVideoError(false);
    setIsBuffering(false);
    setIsPlaying(false);
    setImageScale(1);
    setImagePan({ x: 0, y: 0 });
    setIsPinching(false);
    setIsLandscapeMode(false);
  }, [currentKey]);

  // Find currently active file
  const currentIndex = allFiles.findIndex((f) => (f.key || f.name) === currentKey);
  const currentFile = useMemo(() => {
    if (currentIndex >= 0) return allFiles[currentIndex];
    return {
      key: currentKey,
      name: currentKey.split('/').pop().replace(/^\d+-/, ''),
      size: 0,
      type: 'other',
      lastModified: new Date().toISOString(),
      s3Bucket: 'icloud-android-storage-2026',
    };
  }, [allFiles, currentIndex, currentKey]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allFiles.length - 1;

  // Pre-fetch presigned URL helper (Direct S3 client-side presigning)
  const fetchPresignedUrl = useCallback(
    async (fileKey) => {
      if (!fileKey || cachedUrls[fileKey]) return cachedUrls[fileKey];
      const user = auth.currentUser;
      if (!user) return null;

      try {
        const downloadUrl = await directGetDownloadUrl(fileKey, user.uid);
        if (downloadUrl) {
          setCachedUrls((prev) => ({ ...prev, [fileKey]: downloadUrl }));
          return downloadUrl;
        }
      } catch (err) {
        console.warn('Failed direct presign download URL for', fileKey, err);
      }
      return null;
    },
    [cachedUrls]
  );

  // Pre-fetch URLs for current, previous, and next files so transitions have zero lag
  useEffect(() => {
    if (currentFile?.key && !cachedUrls[currentFile.key]) {
      fetchPresignedUrl(currentFile.key);
    }
    if (hasPrev) {
      const prev = allFiles[currentIndex - 1];
      const pKey = prev?.key || prev?.name;
      if (pKey && !cachedUrls[pKey]) fetchPresignedUrl(pKey);
    }
    if (hasNext) {
      const next = allFiles[currentIndex + 1];
      const nKey = next?.key || next?.name;
      if (nKey && !cachedUrls[nKey]) fetchPresignedUrl(nKey);
    }
    if (!shouldAutoPlayRef.current) {
      setIsPlaying(false);
    }
  }, [currentFile?.key, hasPrev, hasNext, currentIndex, allFiles, cachedUrls, fetchPresignedUrl]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentKey]);

  // File metadata helpers
  const rawFileName = currentFile?.name || currentKey.split('/').pop() || 'Media';
  const cleanFileName = rawFileName.replace(/^\d+-/, '');
  const extension = (cleanFileName.split('.').pop() || '').toLowerCase();
  const isVideo = ['mp4', 'mov', 'webm', 'm4v', '3gp', 'mkv', 'ogv', 'avi'].includes(extension);

  const [extractedThumb, setExtractedThumb] = useState(null);

  const currentThumbnail = useMemo(() => {
    const fKey = currentFile?.key || currentFile?.name;
    const fUrl = cachedUrls[fKey] || currentFile?.downloadUrl;
    const fastCached = getCachedThumbnail(fKey, fUrl);
    if (fastCached) return fastCached;
    return currentFile?.thumbnail || (fKey ? localStorage.getItem(`vid_thumb_${fKey}`) : null);
  }, [currentFile, cachedUrls]);

  // Extract thumbnail in background if missing
  useEffect(() => {
    const fKey = currentFile?.key || currentFile?.name;
    const fUrl = cachedUrls[fKey] || currentFile?.downloadUrl;
    if (!fUrl || currentThumbnail || extractedThumb || !isVideo) return;

    let active = true;
    extractThumbnailFromVideoUrl(fUrl, fKey, auth.currentUser?.uid)
      .then((t) => {
        if (active && t) setExtractedThumb(t);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [currentFile, cachedUrls, currentThumbnail, extractedThumb, isVideo]);

  const activePoster = currentThumbnail || extractedThumb;

  // Formatted header timestamp based on photo capture or saved date and time
  const headerTime = useMemo(() => {
    if (!currentFile) return { dateStr: 'Today', timeStr: '' };
    const { dateLabel, timeStr } = extractFileDateTime(currentFile);
    return { dateStr: dateLabel, timeStr };
  }, [currentFile]);

  // ==========================================================
  // SLIDE TRANSITION ACTIONS
  // ==========================================================
  const triggerSlideNext = useCallback(
    (customTarget = null) => {
      if (isAnimating) return;
      const target = customTarget || (hasNext ? allFiles[currentIndex + 1] : null);
      if (!target) return;

      const targetKey = target.key || target.name;
      if (targetKey === currentKey) return;

      setSlideSlotTarget({ prev: null, next: target });
      const width = containerRef.current?.offsetWidth || window.innerWidth;
      shouldAutoPlayRef.current = false;
      setIsPlaying(false);
      setImageScale(1);
      setImagePan({ x: 0, y: 0 });
      setIsPinching(false);
      setIsAnimating(true);
      setDragOffset(-width);

      setTimeout(() => {
        setCurrentKey(targetKey);
        window.history.replaceState(null, '', `/preview/${encodeURIComponent(targetKey)}`);
        setDragOffset(0);
        setIsAnimating(false);
        setSlideSlotTarget({ prev: null, next: null });
      }, 300);
    },
    [isAnimating, hasNext, allFiles, currentIndex, currentKey]
  );

  const triggerSlidePrev = useCallback(
    (customTarget = null) => {
      if (isAnimating) return;
      const target = customTarget || (hasPrev ? allFiles[currentIndex - 1] : null);
      if (!target) return;

      const targetKey = target.key || target.name;
      if (targetKey === currentKey) return;

      setSlideSlotTarget({ prev: target, next: null });
      const width = containerRef.current?.offsetWidth || window.innerWidth;
      shouldAutoPlayRef.current = false;
      setIsPlaying(false);
      setImageScale(1);
      setImagePan({ x: 0, y: 0 });
      setIsPinching(false);
      setIsAnimating(true);
      setDragOffset(width);

      setTimeout(() => {
        setCurrentKey(targetKey);
        window.history.replaceState(null, '', `/preview/${encodeURIComponent(targetKey)}`);
        setDragOffset(0);
        setIsAnimating(false);
        setSlideSlotTarget({ prev: null, next: null });
      }, 300);
    },
    [isAnimating, hasPrev, allFiles, currentIndex, currentKey]
  );

  // Jump from filmstrip with slide transition
  const handleFilmstripSelect = (fileItem, targetIndex) => {
    const itemKey = fileItem.key || fileItem.name;
    if (itemKey === currentKey || isAnimating) return;
    setImageScale(1);
    setImagePan({ x: 0, y: 0 });
    setIsPinching(false);
    if (targetIndex > currentIndex) {
      triggerSlideNext(fileItem);
    } else {
      triggerSlidePrev(fileItem);
    }
  };

  // ==========================================================
  // TOUCH & MOUSE SWIPE & PINCH-TO-ZOOM GESTURE HANDLERS
  // ==========================================================
  const handleTouchStart = (e) => {
    if (isAnimating) return;

    if (e.touches.length === 2) {
      // 2 fingers: Pinch to zoom in/out
      setIsPinching(true);
      setIsDragging(false);
      setDragOffset(0);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartDistRef.current = dist;
      pinchStartScaleRef.current = imageScale;
      return;
    }

    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      panStartXRef.current = imagePan.x;
      panStartYRef.current = imagePan.y;
      hasMovedRef.current = false;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e) => {
    // 2-finger pinch gesture
    if (e.touches.length === 2 && isPinching && pinchStartDistRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / pinchStartDistRef.current;
      const nextScale = Math.min(5, Math.max(1, pinchStartScaleRef.current * factor));
      setImageScale(nextScale);
      if (nextScale <= 1.02) {
        setImagePan({ x: 0, y: 0 });
      }
      return;
    }

    if (!isDragging || touchStartXRef.current === null || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartXRef.current;
    const deltaY = currentY - touchStartYRef.current;

    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
      hasMovedRef.current = true;
    }

    // When zoomed in, pan around the zoomed image without changing slides
    if (imageScale > 1.05) {
      setImagePan({
        x: panStartXRef.current + deltaX,
        y: panStartYRef.current + deltaY,
      });
      return;
    }

    // Dominant horizontal swipe when at 1x scale
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if ((!hasPrev && deltaX > 0) || (!hasNext && deltaX < 0)) {
        setDragOffset(deltaX * 0.25); // Rubber-band resistance at boundary
      } else {
        setDragOffset(deltaX);
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (isPinching) {
      if (!e.touches || e.touches.length < 2) {
        setIsPinching(false);
        pinchStartDistRef.current = null;
        if (imageScale < 1.05) {
          setImageScale(1);
          setImagePan({ x: 0, y: 0 });
        }
      }
      return;
    }

    if (!isDragging) return;
    setIsDragging(false);

    // If zoomed in, preserve pan position and do not trigger slide switch
    if (imageScale > 1.05) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    const width = containerRef.current?.offsetWidth || window.innerWidth;
    const threshold = Math.min(width * 0.16, 70);

    if (dragOffset < -threshold && hasNext) {
      triggerSlideNext();
    } else if (dragOffset > threshold && hasPrev) {
      triggerSlidePrev();
    } else {
      // Spring back to center
      setIsAnimating(true);
      setDragOffset(0);
      setTimeout(() => setIsAnimating(false), 260);
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Double-tap on image to toggle zoom
  const handleImageTap = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      e.stopPropagation();
      if (imageScale > 1.05) {
        setImageScale(1);
        setImagePan({ x: 0, y: 0 });
      } else {
        setImageScale(2.5);
        setImagePan({ x: 0, y: 0 });
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  // Mouse gestures for desktop preview
  const handleMouseDown = (e) => {
    if (isAnimating || e.button !== 0) return;
    touchStartXRef.current = e.clientX;
    touchStartYRef.current = e.clientY;
    panStartXRef.current = imagePan.x;
    panStartYRef.current = imagePan.y;
    hasMovedRef.current = false;
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || touchStartXRef.current === null) return;
    const deltaX = e.clientX - touchStartXRef.current;
    const deltaY = e.clientY - touchStartYRef.current;

    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
      hasMovedRef.current = true;
    }

    if (imageScale > 1.05) {
      setImagePan({
        x: panStartXRef.current + deltaX,
        y: panStartYRef.current + deltaY,
      });
      return;
    }

    if ((!hasPrev && deltaX > 0) || (!hasNext && deltaX < 0)) {
      setDragOffset(deltaX * 0.25);
    } else {
      setDragOffset(deltaX);
    }
  };

  const handleMouseUp = () => {
    if (isDragging) handleTouchEnd();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' && hasNext) triggerSlideNext();
      if (e.key === 'ArrowLeft' && hasPrev) triggerSlidePrev();
      if (e.key === 'Escape') smartGoBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasNext, hasPrev, triggerSlideNext, triggerSlidePrev, smartGoBack]);

  // Video Controls with auto-buffer resilience & automatic autoplay
  const attemptAutoPlay = useCallback(() => {
    if (!videoRef.current || !shouldAutoPlayRef.current) return;
    const v = videoRef.current;
    shouldAutoPlayRef.current = false;
    const playPromise = v.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
          setVideoError(false);
        })
        .catch((err) => {
          console.warn('Autoplay failed with audio, attempting muted autoplay:', err);
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current
              .play()
              .then(() => {
                setIsPlaying(true);
                setIsBuffering(false);
                setVideoError(false);
              })
              .catch((e) => {
                console.warn('Autoplay blocked by browser policy:', e);
                setIsPlaying(false);
                setIsBuffering(false);
              });
          }
        });
    }
  }, []);

  // Attempt autoplay when video component is mounted and ready
  useEffect(() => {
    if (isVideo && shouldAutoPlayRef.current && videoRef.current) {
      attemptAutoPlay();
    }
  }, [isVideo, attemptAutoPlay]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsBuffering(false);
    } else {
      // If network buffer is not ready yet, display buffer indicator while starting
      if (videoRef.current.readyState < 3) {
        setIsBuffering(true);
      }
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
          setVideoError(false);
        })
        .catch((err) => {
          console.warn('Playback error or interrupted:', err);
          setIsBuffering(false);
          if (err.name === 'NotSupportedError') {
            setVideoError(true);
          }
        });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
    showToast(next ? 'Sound Muted' : 'Sound ON');
  };

  const handleRotateVideo = () => {
    const nextRot = (videoRotation + 90) % 360;
    setVideoRotation(nextRot);
    showToast(`Rotated ${nextRot}°`);
  };

  const handleFlipVideo = () => {
    const nextFlip = !videoFlipped;
    setVideoFlipped(nextFlip);
    showToast(nextFlip ? 'Flipped Horizontally' : 'Original Orientation');
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    showToast(`Speed: ${speed}x`);
  };

  const handleToggleLoop = () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    if (videoRef.current) {
      videoRef.current.loop = nextLoop;
    }
    showToast(nextLoop ? 'Looping ON' : 'Looping OFF');
  };

  // Action Bar Handlers
  const currentUrl = cachedUrls[currentKey] || currentFile?.downloadUrl || '';

  const handleShare = async () => {
    if (!currentUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: cleanFileName,
          text: `AWS S3 Backup: ${cleanFileName}`,
          url: currentUrl,
        });
        return;
      } catch {}
    }
    navigator.clipboard.writeText(currentUrl);
    alert('File link copied to clipboard!');
  };

  const handleDownload = () => {
    if (!currentUrl) return;
    const a = document.createElement('a');
    a.href = currentUrl;
    a.download = cleanFileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleLandscapeFullscreen = useCallback(async () => {
    if (!isLandscapeMode) {
      setIsLandscapeMode(true);
      try {
        if (!document.fullscreenElement) {
          if (containerRef.current?.requestFullscreen) {
            await containerRef.current.requestFullscreen();
          } else if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          }
        }
      } catch (err) {
        console.warn('Native requestFullscreen note:', err);
      }

      try {
        if (window.screen?.orientation?.lock) {
          await window.screen.orientation.lock('landscape');
        } else if (window.screen?.lockOrientation) {
          window.screen.lockOrientation('landscape');
        }
      } catch (err) {
        console.warn('Screen orientation lock note:', err);
      }

      showToast('Landscape Fullscreen');
    } else {
      setIsLandscapeMode(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch {}

      try {
        if (window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        } else if (window.screen?.unlockOrientation) {
          window.screen.unlockOrientation();
        }
      } catch {}

      showToast('Portrait Mode');
    }
  }, [isLandscapeMode, showToast]);

  const toggleFullscreen = toggleLandscapeFullscreen;

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${cleanFileName}" permanently from AWS S3?`)) return;

    setDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Authentication required');

      await deleteStoredFile(currentKey, user.uid);

      const updated = allFiles.filter((f) => (f.key || f.name) !== currentKey);
      setAllFiles(updated);
      if (updated.length > 0) {
        const nextIdx = Math.min(currentIndex, updated.length - 1);
        const nextTarget = updated[nextIdx];
        setCurrentKey(nextTarget.key || nextTarget.name);
      } else {
        navigate('/files');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete file.');
    } finally {
      setDeleting(false);
    }
  };

  // ==========================================================
  // RENDER A SINGLE MEDIA SLIDE
  // ==========================================================
  const renderMediaSlide = (file, isCurrent) => {
    if (!file) return null;
    const fKey = file.key || file.name;
    const fUrl = cachedUrls[fKey] || file.downloadUrl || '';
    const fName = (file.name || fKey).split('/').pop().replace(/^\d+-/, '');
    const fExt = (fName.split('.').pop() || '').toLowerCase();

    const isFVideo = ['mp4', 'mov', 'webm', 'm4v', '3gp', 'mkv', 'ogv', 'avi'].includes(fExt);
    const isFAudio = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma'].includes(fExt);
    const isFImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'tiff'].includes(fExt);
    const isFPdf = fExt === 'pdf';

    return (
      <div className="w-full h-full flex items-center justify-center relative p-1 select-none pointer-events-auto">
        {!fUrl ? (
          <div className="flex flex-col items-center justify-center space-y-2">
            <RefreshCw size={26} className="animate-spin text-blue-500" />
            <span className="text-[11px] text-white/50">Loading from AWS S3...</span>
          </div>
        ) : isFVideo ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {isCurrent ? (
              videoError ? (
                /* Sleek fallback card if video codec is not directly supported by browser HTML5 */
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-sm p-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl border border-slate-200 dark:border-white/10 text-center space-y-4 shadow-2xl animate-in fade-in duration-200"
                >
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
                    <Video size={32} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{fName}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                      This video format ({fExt.toUpperCase()}) could not be played directly inside the browser. You can open it in your device's video player or download it.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                    <button
                      onClick={() => window.open(fUrl, '_blank')}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer flex items-center justify-center space-x-1.5 active:scale-95 transition-all"
                    >
                      <Play size={14} fill="white" />
                      <span>Play in Video Player</span>
                    </button>
                    <button
                      onClick={handleDownload}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer flex items-center justify-center space-x-1.5 active:scale-95 transition-all"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    ref={videoRef}
                    src={fUrl}
                    playsInline
                    webkit-playsinline="true"
                    autoPlay={Boolean(location.state?.autoPlay)}
                    preload="auto"
                    poster={activePoster || undefined}
                    style={{
                      transform: `rotate(${videoRotation}deg) scaleX(${videoFlipped ? -1 : 1}) translateZ(0)`,
                      transition: 'transform 0.3s ease',
                    }}
                    className="w-full max-h-full object-contain"
                    onError={(e) => {
                      console.warn('Video element reported playback error:', e);
                      setVideoError(true);
                      setIsBuffering(false);
                      setIsPlaying(false);
                    }}
                    onLoadedMetadata={(e) => {
                      setVideoError(false);
                      setIsBuffering(false);
                      attemptAutoPlay();
                      const d = e.target.duration;
                      if (d && isFinite(d) && d > 0) {
                        setVideoDuration(d);
                        const formatted = formatDuration(d);
                        try {
                          const user = auth.currentUser;
                          if (user?.uid && file.key) {
                            saveFileDuration(user.uid, file.key, formatted);
                          } else {
                            localStorage.setItem(`vid_dur_${fKey}`, formatted);
                          }
                        } catch {}
                      }
                    }}
                    onLoadedData={() => {
                      setIsBuffering(false);
                      setVideoError(false);
                      attemptAutoPlay();
                    }}
                    onCanPlay={() => {
                      setIsBuffering(false);
                      setVideoError(false);
                      attemptAutoPlay();
                    }}
                    onCanPlayThrough={() => {
                      setIsBuffering(false);
                      setVideoError(false);
                      attemptAutoPlay();
                    }}
                    onWaiting={() => {
                      if (isPlaying) setIsBuffering(true);
                    }}
                    onStalled={() => {
                      // Do not show buffering modal while idle/paused
                    }}
                    onPlaying={() => {
                      setIsPlaying(true);
                      setIsBuffering(false);
                      setVideoError(false);
                    }}
                    onPause={() => {
                      setIsPlaying(false);
                      setIsBuffering(false);
                    }}
                    onTimeUpdate={() => {
                      if (videoRef.current) {
                        const v = videoRef.current;
                        setVideoCurrentTime(v.currentTime);
                        if (v.duration && isFinite(v.duration) && v.duration > 0) {
                          setVideoDuration(v.duration);
                        }

                        // Track progressive buffer ahead
                        if (v.buffered && v.buffered.length > 0 && v.duration > 0) {
                          for (let i = 0; i < v.buffered.length; i++) {
                            if (v.buffered.start(i) <= v.currentTime && v.currentTime <= v.buffered.end(i)) {
                              const pct = Math.min(100, Math.round((v.buffered.end(i) / v.duration) * 100));
                              setBufferedPercent(pct);
                              break;
                            }
                          }
                        }
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlayPause();
                    }}
                  />

                  {/* High-Resolution Full-Width Video Poster / Thumbnail overlay before playing */}
                  {!isPlaying && activePoster && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlayPause();
                      }}
                      className="absolute inset-0 flex items-center justify-center cursor-pointer pointer-events-auto"
                    >
                      <img
                        src={activePoster}
                        alt={fName}
                        style={{
                          transform: `rotate(${videoRotation}deg) scaleX(${videoFlipped ? -1 : 1})`,
                        }}
                        className="w-full max-h-full object-contain drop-shadow-md"
                      />
                    </div>
                  )}

                  {/* Video center play button - ALWAYS visible when paused so user can tap play */}
                  {!isPlaying && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlayPause();
                      }}
                      className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center shadow-2xl active:scale-95 transition-all hover:bg-blue-600 cursor-pointer pointer-events-auto z-10"
                    >
                      <Play size={28} fill="white" className="ml-1" />
                    </button>
                  )}
                </div>
              )
            ) : (
              /* Non-current slide: Lightweight placeholder with thumbnail if available */
              <div className="relative w-full h-full flex items-center justify-center bg-slate-950/60 pointer-events-none">
                {file?.thumbnail || (file?.key ? (getCachedThumbnail(file.key) || localStorage.getItem(`vid_thumb_${file.key}`)) : null) ? (
                  <img
                    src={file.thumbnail || (file.key ? (getCachedThumbnail(file.key) || localStorage.getItem(`vid_thumb_${file.key}`)) : null)}
                    alt=""
                    className="w-full max-h-full object-contain opacity-70"
                  />
                ) : null}
                <div className="absolute w-14 h-14 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/50">
                  <Play size={24} fill="currentColor" className="ml-1" />
                </div>
              </div>
            )}

            {/* Centered Buffering Spinner - ONLY shown when actively playing and network stalls */}
            {isCurrent && isPlaying && isBuffering && (
              <div className="absolute inset-0 m-auto w-20 h-20 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 flex flex-col items-center justify-center text-white pointer-events-none shadow-2xl z-20 animate-in fade-in duration-150">
                <RefreshCw size={24} className="animate-spin text-blue-400" />
                <span className="text-[10px] font-bold mt-1.5 text-slate-200">Buffering</span>
              </div>
            )}

            {/* Video scrub bar with dual buffer layer & Fullscreen Landscape Tilt Button */}
            {isCurrent && !isLandscapeMode && showControls && videoDuration > 0 && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-2 left-4 right-4 flex items-center space-x-2 text-[10px] text-white/90 z-20 pointer-events-auto bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15 shadow-2xl"
              >
                <span className="font-mono text-[10px]">
                  {formatDuration(videoCurrentTime) || '00:00'}
                </span>

                <div className="relative flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden flex items-center mx-1">
                  {/* Buffer Ahead Bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-white/35 transition-all duration-300"
                    style={{ width: `${bufferedPercent}%` }}
                  />
                  {/* Played Bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-blue-500"
                    style={{ width: `${(videoCurrentTime / (videoDuration || 1)) * 100}%` }}
                  />
                  {/* Invisible Range Input on Top */}
                  <input
                    type="range"
                    min="0"
                    max={videoDuration}
                    step="0.1"
                    value={videoCurrentTime}
                    onChange={(e) => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = Number(e.target.value);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                <span className="font-mono text-[10px] text-white/60">
                  {formatDuration(videoDuration)}
                </span>

                {/* Fullscreen / Tilt Landscape Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLandscapeFullscreen();
                  }}
                  className="p-1 hover:bg-white/20 rounded-full transition-all text-white active:scale-95 cursor-pointer ml-1 flex items-center justify-center shrink-0"
                  title="Tilt to Landscape Fullscreen"
                >
                  <Maximize2 size={13} className="text-white" />
                </button>
              </div>
            )}
          </div>
        ) : isFImage ? (
          <div
            className="relative w-full h-full flex items-center justify-center overflow-hidden touch-none"
            onClick={isCurrent ? handleImageTap : undefined}
            onWheel={
              isCurrent
                ? (e) => {
                    const delta = e.deltaY > 0 ? -0.25 : 0.25;
                    setImageScale((prev) => {
                      const next = Math.min(5, Math.max(1, prev + delta));
                      if (next <= 1.02) setImagePan({ x: 0, y: 0 });
                      return next;
                    });
                  }
                : undefined
            }
          >
            <img
              src={fUrl}
              alt={fName}
              style={{
                transform: isCurrent
                  ? `translate3d(${imagePan.x}px, ${imagePan.y}px, 0px) scale(${imageScale})`
                  : 'none',
                transition:
                  isDragging || isPinching
                    ? 'none'
                    : 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)',
                maxHeight: '100%',
                maxWidth: '100%',
              }}
              onError={(e) => {
                const el = e.currentTarget;
                const retry = () => {
                  const separator = fUrl.includes('?') ? '&' : '?';
                  el.src = `${fUrl}${separator}_retry=${Date.now()}`;
                };
                window.addEventListener('online', retry, { once: true });
                window.addEventListener('app:network-restored', retry, { once: true });
              }}
              className="object-contain pointer-events-none select-none"
              draggable={false}
            />

            {/* Subtle Zoom Badge when Zoomed In */}
            {isCurrent && imageScale > 1.05 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImageScale(1);
                  setImagePan({ x: 0, y: 0 });
                }}
                className="absolute top-4 bg-black/75 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg flex items-center space-x-1.5 cursor-pointer active:scale-95 transition-all z-20 pointer-events-auto"
              >
                <span>{Math.round(imageScale * 10) / 10}x</span>
                <span className="text-white/60">• Tap to Reset</span>
              </button>
            )}
          </div>
        ) : isFAudio ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm p-6 bg-white/90 dark:bg-slate-900/90 rounded-3xl border border-slate-200 dark:border-white/10 text-center space-y-4 shadow-2xl"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-pink-500/25">
              <Music size={36} className="text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{fName}</h4>
              <p className="text-[11px] text-pink-500 dark:text-pink-400 font-semibold mt-0.5">AWS S3 Audio Stream</p>
            </div>
            {isCurrent && <audio src={fUrl} controls className="w-full" autoPlay={false} />}
          </div>
        ) : isFPdf ? (
          /* GOOGLE DRIVE STYLE IN-PAGE PDF VIEWER */
          isCurrent ? (
            <div className="w-full h-full flex flex-col pointer-events-auto overflow-hidden">
              <React.Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center bg-slate-950">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  </div>
                }
              >
                <PdfViewer
                  url={fUrl}
                  fileName={fName}
                  onToggleControls={() => setShowControls((prev) => !prev)}
                />
              </React.Suspense>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <div className="w-full max-w-xs p-6 bg-white/90 dark:bg-slate-900/90 rounded-3xl border border-slate-200 dark:border-white/10 text-center space-y-2 shadow-lg">
                <FileText size={36} className="text-rose-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{fName}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">PDF Document</p>
              </div>
            </div>
          )
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="text-center space-y-3 p-6 max-w-sm bg-white/90 dark:bg-slate-900/80 rounded-3xl border border-slate-200 dark:border-white/10 shadow-lg"
          >
            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-500 dark:text-blue-400 flex items-center justify-center mx-auto">
              <FileArchive size={32} />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{fName}</h4>
            <p className="text-xs text-slate-500 dark:text-white/60">
              {formatBytes(file.size)} • {fExt.toUpperCase()} File
            </p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer flex items-center justify-center space-x-1.5 mx-auto"
            >
              <Download size={14} />
              <span>Download &amp; Open</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Adjacent slots for smooth 3-stage slider
  const prevTarget = slideSlotTarget.prev || (hasPrev ? allFiles[currentIndex - 1] : null);
  const nextTarget = slideSlotTarget.next || (hasNext ? allFiles[currentIndex + 1] : null);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between select-none overflow-hidden touch-none">
      {/* ======================================================== */}
      {/* 1. TOP HEADER BAR (Matching Samsung/Android Gallery)     */}
      {/* ======================================================== */}
      {!isLandscapeMode && (
        <div
          style={{
            paddingTop: 'calc(var(--status-bar-height, 0px) + 12px)',
          }}
          className={`w-full px-4 pb-3 flex items-center justify-between z-30 transition-opacity duration-300 bg-gradient-to-b from-black/90 via-black/50 to-transparent no-glow text-white ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <button
              onClick={smartGoBack}
              className="p-1.5 rounded-full hover:bg-white/10 active:scale-95 transition-all cursor-pointer text-white"
              title="Back to files"
            >
              <ChevronLeft size={28} />
            </button>
            <div className="min-w-0 leading-tight">
              <h3 className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {headerTime.dateStr}
              </h3>
              <p className="text-xs text-white/70 font-medium">{headerTime.timeStr}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-white">
            {/* Landscape Fullscreen Tilt Button in Header */}
            {isVideo && (
              <button
                onClick={toggleLandscapeFullscreen}
                className="p-1.5 hover:bg-white/10 rounded-full transition-all cursor-pointer text-white active:scale-95"
                title="Tilt to Landscape Fullscreen"
              >
                <Maximize2 size={20} />
              </button>
            )}

            {/* Favorite Heart toggle */}
            <button
              onClick={() => setIsFavorite(!isFavorite)}
              className="p-1.5 hover:bg-white/10 rounded-full transition-all cursor-pointer active:scale-110 text-white"
              title={isFavorite ? 'Favorited' : 'Add to favorites'}
            >
              <Heart size={20} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-white'} />
            </button>

            {/* Info details modal button */}
            <button
              onClick={() => setShowInfoModal(true)}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-white"
              title="File details"
            >
              <Info size={20} />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. CENTER IMMERSIVE SLIDER STAGE WITH SLIDE TRANSITION   */}
      {/* ======================================================== */}
      <div
        ref={containerRef}
        onClick={() => {
          if (!hasMovedRef.current) setShowControls((prev) => !prev);
        }}
        onTouchStart={isLandscapeMode ? undefined : handleTouchStart}
        onTouchMove={isLandscapeMode ? undefined : handleTouchMove}
        onTouchEnd={isLandscapeMode ? undefined : handleTouchEnd}
        onMouseDown={isLandscapeMode ? undefined : handleMouseDown}
        onMouseMove={isLandscapeMode ? undefined : handleMouseMove}
        onMouseUp={isLandscapeMode ? undefined : handleMouseUp}
        onMouseLeave={isLandscapeMode ? undefined : handleMouseUp}
        style={
          isLandscapeMode && viewportOrientation === 'portrait'
            ? {
                position: 'fixed',
                top: '50%',
                left: '50%',
                width: '100dvh',
                height: '100dvw',
                transform: 'translate(-50%, -50%) rotate(90deg)',
                transformOrigin: 'center center',
                zIndex: 60,
                backgroundColor: '#000000',
              }
            : isLandscapeMode
            ? {
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 60,
                backgroundColor: '#000000',
              }
            : {
                backgroundColor: '#000000',
              }
        }
        className={
          isLandscapeMode
            ? 'flex items-center justify-center select-none overflow-hidden touch-none'
            : 'flex-1 w-full relative overflow-hidden cursor-pointer flex items-center justify-center select-none bg-black'
        }
      >
        {/* 3-Slot Horizontal Sliding Track */}
        <div
          className="flex w-full h-full bg-black"
          style={{
            transform: isLandscapeMode ? 'none' : `translateX(calc(-100% + ${dragOffset}px))`,
            transition: isAnimating ? 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
            willChange: 'transform',
          }}
        >
          {/* Slot 0: Previous File */}
          {!isLandscapeMode && (
            <div className="w-full h-full shrink-0 flex items-center justify-center overflow-hidden bg-black">
              {prevTarget ? renderMediaSlide(prevTarget, false) : <div className="w-full h-full" />}
            </div>
          )}

          {/* Slot 1: Current File */}
          <div className="w-full h-full shrink-0 flex items-center justify-center overflow-hidden bg-black">
            {renderMediaSlide(currentFile, true)}
          </div>

          {/* Slot 2: Next File */}
          {!isLandscapeMode && (
            <div className="w-full h-full shrink-0 flex items-center justify-center overflow-hidden bg-black">
              {nextTarget ? renderMediaSlide(nextTarget, false) : <div className="w-full h-full" />}
            </div>
          )}
        </div>

        {/* Dedicated Landscape Overlay Controls */}
        {isLandscapeMode && (
          <div className="absolute inset-0 z-30 pointer-events-none">
            {/* Landscape Top Bar */}
            <div
              className={`absolute top-0 left-0 right-0 px-6 py-4 flex items-center justify-between z-30 transition-opacity duration-300 bg-gradient-to-b from-black/90 via-black/40 to-transparent no-glow ${
                showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              <div className="flex items-center space-x-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLandscapeFullscreen();
                  }}
                  className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition-all cursor-pointer text-white flex items-center space-x-2"
                >
                  <ChevronLeft size={24} />
                  <span className="text-xs font-bold truncate max-w-xs">{cleanFileName}</span>
                </button>
              </div>

              <div className="flex items-center space-x-3">
                {/* Playback speed */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const speeds = [1, 1.25, 1.5, 2];
                    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                    handleSpeedChange(speeds[nextIdx]);
                  }}
                  className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold text-white transition-all cursor-pointer"
                >
                  {playbackSpeed}x
                </button>

                {/* Rotate video */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRotateVideo();
                  }}
                  className="p-2 hover:bg-white/15 rounded-full transition-all cursor-pointer text-white"
                  title="Rotate"
                >
                  <RotateCw size={18} />
                </button>

                {/* Sound toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  className="p-2 hover:bg-white/15 rounded-full transition-all cursor-pointer text-white"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX size={18} className="text-amber-400" /> : <Volume2 size={18} />}
                </button>

                {/* Exit Landscape Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLandscapeFullscreen();
                  }}
                  className="p-2 hover:bg-white/15 rounded-full transition-all cursor-pointer text-white"
                  title="Exit Landscape"
                >
                  <Minimize2 size={18} />
                </button>
              </div>
            </div>

            {/* Landscape Bottom Bar */}
            <div
              className={`absolute bottom-0 left-0 right-0 px-6 pb-6 pt-10 flex flex-col space-y-2 z-30 transition-opacity duration-300 bg-gradient-to-t from-black/90 via-black/40 to-transparent no-glow ${
                showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              <div className="flex items-center space-x-3 text-xs text-white pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlayPause();
                  }}
                  className="p-1 hover:bg-white/15 rounded-full transition-all cursor-pointer text-white"
                >
                  {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
                </button>

                <span className="font-mono text-xs text-white/90">
                  {formatDuration(videoCurrentTime) || '00:00'}
                </span>

                {/* Scrubber bar */}
                <div className="relative flex-1 h-2 bg-white/20 rounded-full overflow-hidden flex items-center">
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-white/35 transition-all duration-300"
                    style={{ width: `${bufferedPercent}%` }}
                  />
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-blue-500"
                    style={{ width: `${(videoCurrentTime / (videoDuration || 1)) * 100}%` }}
                  />
                  <input
                    type="range"
                    min="0"
                    max={videoDuration}
                    step="0.1"
                    value={videoCurrentTime}
                    onChange={(e) => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = Number(e.target.value);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                <span className="font-mono text-xs text-white/70">
                  {formatDuration(videoDuration)}
                </span>

                {/* Exit Landscape Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLandscapeFullscreen();
                  }}
                  className="p-1.5 hover:bg-white/15 rounded-full transition-all cursor-pointer text-white"
                  title="Exit Landscape"
                >
                  <Minimize2 size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. BOTTOM SECTION: FILMSTRIP + ACTION BAR               */}
      {/* ======================================================== */}
      {!isLandscapeMode && (
        <div
          className={`w-full flex flex-col z-30 transition-opacity duration-300 bg-gradient-to-t from-black via-black/95 to-transparent no-glow text-white ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Horizontal Filmstrip Carousel (Matching screenshot!) */}
          {allFiles.length > 1 && (
            <div className="w-full px-3 py-2 overflow-x-auto scrollbar-none flex items-center space-x-2">
              {allFiles.map((item, idx) => {
                const itemKey = item?.key || item?.name || '';
                const isSelected = itemKey === currentKey;
                const itemUrl = cachedUrls[itemKey] || item?.downloadUrl;
                const itemName = item?.name || item?.fileName || itemKey;
                const isItemVid =
                  item?.type === 'videos' ||
                  item?.category === 'videos' ||
                  /\.(mp4|mov|webm|mkv|3gp)$/i.test(itemName);
                const isItemImg =
                  item?.type === 'photos' ||
                  item?.category === 'photos' ||
                  /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(itemName);

                return (
                  <button
                    key={item?.id || item?.key || idx}
                    ref={isSelected ? activeThumbRef : null}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFilmstripSelect(item, idx);
                    }}
                    className={`relative w-11 h-14 rounded-lg overflow-hidden shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-2 border-white scale-105 z-10 opacity-100 shadow-xl'
                        : 'opacity-50 hover:opacity-90 scale-95 border border-white/20'
                    }`}
                  >
                    {isItemImg && itemUrl ? (
                      <SmartImage
                        src={itemUrl}
                        alt={itemName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : isItemVid ? (
                      <FilmstripVideoThumb
                        item={item}
                        itemUrl={itemUrl}
                        fileKey={item.key || item.name}
                        userId={auth.currentUser?.uid}
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-300">
                        <FileText size={16} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Native Mobile Bottom Action Bar (Matching User Reference Image 2 for Video) */}
          <div
            style={{
              paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)',
            }}
            className="w-full px-4 pt-3 flex items-center justify-between border-t border-white/10 text-white bg-black/95 backdrop-blur-xl"
          >
            {isVideo ? (
              <>
                {/* 1. Share */}
                <button
                  onClick={handleShare}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <Share2 size={20} />
                  <span className="text-[10px] font-medium tracking-tight">Share</span>
                </button>

                {/* 2. Edit (Rotate, Flip, Speed, Loop) */}
                <button
                  onClick={() => setShowEditMenu(true)}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <Pencil size={20} />
                  <span className="text-[10px] font-medium tracking-tight">Edit</span>
                </button>

                {/* 3. Pause / Play Toggle (Direct Center Control from Image 2) */}
                <button
                  onClick={togglePlayPause}
                  className="flex flex-col items-center justify-center space-y-1 text-white hover:text-blue-400 cursor-pointer active:scale-95 transition-all w-12"
                >
                  {isPlaying ? (
                    <Pause size={22} fill="currentColor" />
                  ) : (
                    <Play size={22} fill="currentColor" className="ml-0.5" />
                  )}
                  <span className="text-[10px] font-semibold tracking-tight">
                    {isPlaying ? 'Pause' : 'Play'}
                  </span>
                </button>

                {/* 4. Sound (Mute / Unmute Toggle from Image 2) */}
                <button
                  onClick={toggleMute}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  {isMuted ? <VolumeX size={20} className="text-amber-400" /> : <Volume2 size={20} />}
                  <span className="text-[10px] font-medium tracking-tight">Sound</span>
                </button>

                {/* 5. Delete */}
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-rose-400 cursor-pointer active:scale-95 transition-all disabled:opacity-40 w-12"
                >
                  <Trash2 size={20} />
                  <span className="text-[10px] font-medium tracking-tight">Delete</span>
                </button>

                {/* 6. More (Menu for download, speed, loop, info) */}
                <button
                  onClick={() => setShowMoreMenu(true)}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <MoreVertical size={20} />
                  <span className="text-[10px] font-medium tracking-tight">More</span>
                </button>
              </>
            ) : (
              <>
                {/* Share */}
                <button
                  onClick={handleShare}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <Share2 size={20} />
                  <span className="text-[10px] font-medium tracking-tight">Share</span>
                </button>

                {/* Edit (Replaced Full) */}
                <button
                  onClick={() => setShowPhotoEditor(true)}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <Pencil size={20} />
                  <span className="text-[10px] font-medium tracking-tight">Edit</span>
                </button>

                {/* Save / Download */}
                <button
                  onClick={handleDownload}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <Download size={20} />
                  <span className="text-[10px] font-medium tracking-tight">Save</span>
                </button>

                {/* Favorite */}
                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <Heart size={20} className={isFavorite ? 'fill-red-500 text-red-500' : ''} />
                  <span className="text-[10px] font-medium tracking-tight">Favorite</span>
                </button>

                {/* Delete */}
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-rose-400 cursor-pointer active:scale-95 transition-all disabled:opacity-40 w-12"
                >
                  <Trash2 size={20} />
                  <span className="text-[10px] font-medium tracking-tight">Delete</span>
                </button>

                {/* More */}
                <button
                  onClick={() => setShowMoreMenu(true)}
                  className="flex flex-col items-center justify-center space-y-1 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all w-12"
                >
                  <MoreVertical size={20} />
                  <span className="text-[10px] font-medium tracking-tight">More</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. DETAILS / INFO SHEET MODAL                            */}
      {/* ======================================================== */}
      {showInfoModal && (
        <React.Suspense fallback={null}>
          <FileDetailsModal
            isOpen={showInfoModal}
            onClose={() => setShowInfoModal(false)}
            file={currentFile}
            downloadUrl={cachedUrls[currentKey] || currentFile?.downloadUrl}
          />
        </React.Suspense>
      )}

      {/* Video Quick Edit Bottom Sheet Modal (Samsung OneUI Style) */}
      {showEditMenu && (
        <div
          onClick={() => setShowEditMenu(false)}
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Pencil size={18} className="text-blue-500 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Video Quick Edit</h3>
              </div>
              <button
                onClick={() => setShowEditMenu(false)}
                className="text-slate-400 hover:text-slate-700 dark:text-white/60 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Rotate & Flip Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleRotateVideo}
                  className="p-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-white/5"
                >
                  <RotateCw size={20} className="text-blue-500 dark:text-blue-400" />
                  <span className="text-[11px] font-semibold text-slate-800 dark:text-white">Rotate 90°</span>
                  <span className="text-[9px] text-slate-500 dark:text-white/50">{videoRotation}°</span>
                </button>

                <button
                  onClick={handleFlipVideo}
                  className="p-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-white/5"
                >
                  <FlipHorizontal size={20} className="text-purple-500 dark:text-purple-400" />
                  <span className="text-[11px] font-semibold text-slate-800 dark:text-white">Flip Mirror</span>
                  <span className="text-[9px] text-slate-500 dark:text-white/50">{videoFlipped ? 'Flipped' : 'Normal'}</span>
                </button>
              </div>

              {/* Playback Speed */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] text-slate-700 dark:text-white/70 font-semibold">
                  <span>Playback Speed</span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold">{playbackSpeed}x</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[0.5, 0.75, 1, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={`py-1.5 rounded-xl text-center text-[10px] font-bold transition-all cursor-pointer ${
                        playbackSpeed === s
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Loop Video */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5">
                <div className="flex items-center space-x-2">
                  <Repeat size={16} className={isLooping ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-white/40'} />
                  <span className="text-xs font-semibold text-slate-800 dark:text-white">Loop Video Continuously</span>
                </div>
                <button
                  onClick={handleToggleLoop}
                  className={`px-3 py-1 rounded-xl text-[10px] font-bold cursor-pointer transition-all ${
                    isLooping ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-white/50'
                  }`}
                >
                  {isLooping ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowEditMenu(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors shadow-md"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Video / File More Actions Bottom Sheet Modal (Matching Image 2) */}
      {showMoreMenu && (
        <div
          onClick={() => setShowMoreMenu(false)}
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-3xl p-5 w-full max-w-sm space-y-3 shadow-2xl"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">More Options</h3>
              <button
                onClick={() => setShowMoreMenu(false)}
                className="text-slate-400 hover:text-slate-700 dark:text-white/60 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1">
              {/* Copy File to Folder */}
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  setCopyMoveModal({ isOpen: true, mode: 'copy' });
                }}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center space-x-3 text-left transition-colors cursor-pointer"
              >
                <Copy size={18} className="text-blue-500 dark:text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Copy to Album / Folder</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">Duplicate or copy file to another folder in AWS S3</p>
                </div>
              </button>

              {/* Move File to Folder */}
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  setCopyMoveModal({ isOpen: true, mode: 'move' });
                }}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center space-x-3 text-left transition-colors cursor-pointer"
              >
                <Move size={18} className="text-purple-500 dark:text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Move to Album / Folder</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">Relocate file to another album or folder</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  handleDownload();
                }}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center space-x-3 text-left transition-colors cursor-pointer"
              >
                <Download size={18} className="text-blue-500 dark:text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Download to Device</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">Save full resolution copy to mobile storage</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowInfoModal(true);
                }}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center space-x-3 text-left transition-colors cursor-pointer"
              >
                <Info size={18} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Details &amp; Metadata</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">View size, format, compression, S3 key</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  toggleFullscreen();
                }}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center space-x-3 text-left transition-colors cursor-pointer"
              >
                <Maximize2 size={18} className="text-amber-500 dark:text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Toggle Fullscreen</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">Immersive theater mode view</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  if (currentUrl) {
                    navigator.clipboard.writeText(currentUrl);
                    showToast('Link copied to clipboard!');
                  }
                }}
                className="w-full p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center space-x-3 text-left transition-colors cursor-pointer"
              >
                <Share2 size={18} className="text-purple-500 dark:text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Copy Shareable Link</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">Direct secure AWS pre-signed link</p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowMoreMenu(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white/80 hover:bg-slate-200 dark:hover:text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Photo Editor Modal */}
      {showPhotoEditor && (
        <React.Suspense fallback={null}>
          <PhotoEditorModal
            isOpen={showPhotoEditor}
            onClose={() => setShowPhotoEditor(false)}
            file={currentFile}
            imageUrl={currentUrl}
            userUid={auth.currentUser?.uid}
            onSaveSuccess={(newFile) => {
              setAllFiles((prev) => [newFile, ...prev]);
              if (newFile.downloadUrl) {
                setCachedUrls((prev) => ({ ...prev, [newFile.key]: newFile.downloadUrl }));
              }
              if (auth.currentUser?.uid) {
                updateFileInUserCache(auth.currentUser.uid, newFile);
              }
              setCurrentKey(newFile.key);
              window.history.replaceState(null, '', `/preview/${encodeURIComponent(newFile.key)}`);
            }}
            showToast={showToast}
          />
        </React.Suspense>
      )}

      {/* Copy / Move Modal */}
      {copyMoveModal.isOpen && (
        <React.Suspense fallback={null}>
          <CopyMoveModal
            isOpen={copyMoveModal.isOpen}
            mode={copyMoveModal.mode}
            file={currentFile}
            userUid={auth.currentUser?.uid}
            allFiles={allFiles}
            onClose={() => setCopyMoveModal({ isOpen: false, mode: 'copy' })}
            onSuccess={({ action, sourceKey, targetKey, targetFolder, file: updatedFile }) => {
              const uid = auth.currentUser?.uid;
              if (action === 'move') {
                setAllFiles((prev) =>
                  prev.map((f) => ((f.key || f.name) === sourceKey ? updatedFile : f))
                );
                if (updatedFile.downloadUrl) {
                  setCachedUrls((prev) => ({ ...prev, [targetKey]: updatedFile.downloadUrl }));
                }
                if (uid) {
                  removeFileFromUserCache(uid, sourceKey);
                  updateFileInUserCache(uid, updatedFile);
                }
                setCurrentKey(targetKey);
                window.history.replaceState(null, '', `/preview/${encodeURIComponent(targetKey)}`);
              } else {
                setAllFiles((prev) => [updatedFile, ...prev]);
                if (updatedFile.downloadUrl) {
                  setCachedUrls((prev) => ({ ...prev, [targetKey]: updatedFile.downloadUrl }));
                }
                if (uid) {
                  updateFileInUserCache(uid, updatedFile);
                }
              }
            }}
            showToast={showToast}
          />
        </React.Suspense>
      )}

      {/* Floating Center Toast Notification (Samsung OneUI Style) */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-xl border border-white/20 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-150 pointer-events-none">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
