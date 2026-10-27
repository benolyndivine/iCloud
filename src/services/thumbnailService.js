import { directPutJsonToS3, directGetJsonFromS3 } from './aws/directS3Service';

const memoryCache = new Map();
const pendingPromises = new Map();

// Concurrency queue to prevent socket exhaustion and ERR_NETWORK_CHANGED
const extractionQueue = [];
let activeExtractions = 0;
const MAX_CONCURRENT_EXTRACTIONS = 2;

function enqueueExtraction(runTask) {
  return new Promise((resolve) => {
    extractionQueue.push({ runTask, resolve });
    drainExtractionQueue();
  });
}

function drainExtractionQueue() {
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS || extractionQueue.length === 0) {
    return;
  }
  activeExtractions++;
  const { runTask, resolve } = extractionQueue.shift();

  runTask()
    .then(resolve)
    .catch(() => resolve(null))
    .finally(() => {
      activeExtractions--;
      drainExtractionQueue();
    });
}

// Clear in-flight promise cache when network recovers
if (typeof window !== 'undefined') {
  const clearFailedPending = () => {
    pendingPromises.clear();
  };
  window.addEventListener('online', clearFailedPending);
  window.addEventListener('app:network-restored', clearFailedPending);
}

/**
 * Synchronously retrieve cached thumbnail from Memory or LocalStorage
 */
export function getCachedThumbnail(fileKey = '', videoUrl = '') {
  const cacheKey = `vid_thumb_${fileKey || videoUrl}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached && cached.startsWith('data:image/')) {
      memoryCache.set(cacheKey, cached);
      return cached;
    }
  } catch {}
  return null;
}

/**
 * Generate a thumbnail from a video URL using an offscreen HTML5 video & canvas
 */
export function extractThumbnailFromVideoUrl(videoUrl, fileKey = '', userId = '') {
  if (!videoUrl) return Promise.resolve(null);

  const cacheKey = `vid_thumb_${fileKey || videoUrl}`;

  // 1. Check Synchronous Cache Helper
  const existing = getCachedThumbnail(fileKey, videoUrl);
  if (existing) {
    return Promise.resolve(existing);
  }

  // 3. Deduplicate in-flight extraction for the same URL
  if (pendingPromises.has(cacheKey)) {
    return pendingPromises.get(cacheKey);
  }

  const promise = enqueueExtraction(() => {
    return new Promise((resolve) => {
      let resolved = false;
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      // Invisible placement in DOM to force Chromium/WebView to schedule video decoding
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(video);
      }

      // Seek to 0.5s for a meaningful thumbnail frame instead of black intro
      const targetUrl = videoUrl.includes('#') ? videoUrl : `${videoUrl}#t=0.5`;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, 7000);

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMeta);
        video.removeEventListener('loadeddata', onData);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('canplay', onSeeked);
        video.removeEventListener('error', onError);
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
        try {
          video.removeAttribute('src');
          video.load();
        } catch {}
        pendingPromises.delete(cacheKey);
      };

      const capture = () => {
        if (resolved) return;
        try {
          if (!video.videoWidth || !video.videoHeight) {
            return;
          }

          const canvas = document.createElement('canvas');
          const maxDim = 320;
          const scale = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

          resolved = true;
          clearTimeout(timer);
          cleanup();

          // Cache in memory and localStorage
          memoryCache.set(cacheKey, dataUrl);
          try {
            localStorage.setItem(cacheKey, dataUrl);
          } catch {}

          // Persist to S3 metadata in background if user is available
          if (userId && fileKey) {
            const s3MetaKey = `users/${userId}/.settings/file_meta.json`;
            directGetJsonFromS3(s3MetaKey, userId).then((metaMap) => {
              const updated = metaMap || {};
              updated[fileKey] = { ...(updated[fileKey] || {}), thumbnail: dataUrl };
              directPutJsonToS3(s3MetaKey, updated, userId).catch(() => {});
            }).catch(() => {});
          }

          resolve(dataUrl);
        } catch {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(null);
        }
      };

      const onSeeked = () => capture();
      const onMeta = () => {
        try {
          const seekTime = Math.min(0.5, Math.max(0.05, (video.duration || 1) / 4));
          video.currentTime = seekTime;
        } catch {
          capture();
        }
      };
      const onData = () => {
        if (video.currentTime >= 0.05) {
          capture();
        } else {
          onMeta();
        }
      };

      const onError = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(null);
        }
      };

      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('loadeddata', onData);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('canplay', onSeeked);
      video.addEventListener('error', onError);
      video.src = targetUrl;
    });
  });

  pendingPromises.set(cacheKey, promise);
  return promise;
}

/**
 * Capture thumbnail directly from a local File object during upload
 */
export function captureThumbnailFromLocalFile(file) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith('video/')) {
      resolve(null);
      return;
    }

    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          URL.revokeObjectURL(url);
          resolve(null);
        }
      }, 4000);

      const capture = () => {
        if (resolved) return;
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 360;
          const scale = Math.min(maxDim / (video.videoWidth || 360), 1);
          canvas.width = Math.round((video.videoWidth || 360) * scale);
          canvas.height = Math.round((video.videoHeight || 640) * scale);

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);

          resolved = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } catch {
          resolved = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      video.addEventListener('loadeddata', () => {
        try {
          video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
        } catch {
          capture();
        }
      });
      video.addEventListener('seeked', capture);
      video.addEventListener('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(null);
        }
      });

      video.src = url;
    } catch {
      resolve(null);
    }
  });
}
