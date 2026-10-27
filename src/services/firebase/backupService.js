import { smartCompressFile } from '../compressionService';
import { captureThumbnailFromLocalFile } from '../thumbnailService';
import {
  directUploadFileToS3,
  directGetUserFilesFromS3,
  directGetUserStorageSummary,
  directDeleteFileFromS3,
  directGetDownloadUrl,
  directTestAwsConnection,
  directSaveCustomAwsConfig,
  directGetJsonFromS3,
  directPutJsonToS3,
  directCopyFileInS3,
  directMoveFileInS3,
  formatBytes,
} from '../aws/directS3Service';

const LOCAL_SETTINGS_KEY = 'icloud_backup_settings_';
const LOCAL_HISTORY_KEY = 'icloud_backup_history_';
const LOCAL_META_KEY = 'icloud_files_meta_';

export {
  formatBytes,
  directGetDownloadUrl,
  directDeleteFileFromS3,
  directCopyFileInS3,
  directMoveFileInS3,
};

export const DEFAULT_BACKUP_SETTINGS = {
  autoBackup: true,
  compressionEnabled: true,
  compressionQuality: 0.90, // 0.90: Visually lossless with maximum size reduction (60-80% smaller)
  categories: {
    photos: true,
    videos: true,
    docs: true,
    music: true,
  },
  customFolders: [],
  lastSynced: 'No backup performed yet',
  syncedCount: 0,
  status: 'ready',
  wifiOnly: true,
};

export const CATEGORY_DEFINITIONS = [
  {
    id: 'photos',
    label: 'Photos & Live Captures',
    description: 'Camera roll, screenshots, live photos',
    mimeAccept: 'image/*',
    badge: 'photos',
    defaultCount: 0,
    defaultSize: '0 B',
  },
  {
    id: 'videos',
    label: 'Videos (Up to 4K)',
    description: 'Recorded movies, screen captures, 4K clips',
    mimeAccept: 'video/*',
    badge: 'videos',
    defaultCount: 0,
    defaultSize: '0 B',
  },
  {
    id: 'docs',
    label: 'Documents & Spreadsheets',
    description: 'PDFs, Word, Excel, text files, presentations',
    mimeAccept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.epub,.md',
    badge: 'docs',
    defaultCount: 0,
    defaultSize: '0 B',
  },
  {
    id: 'music',
    label: 'Voice Memos & Audio',
    description: 'Sound recordings, voice notes, audio tracks',
    mimeAccept: 'audio/*',
    badge: 'music',
    defaultCount: 0,
    defaultSize: '0 B',
  },
];

/**
 * 1. Fetch backup configuration (Direct AWS S3 & LocalStorage - 0 Firestore)
 */
export async function getBackupSettings(userId) {
  if (!userId) return { ...DEFAULT_BACKUP_SETTINGS };

  const cached = localStorage.getItem(LOCAL_SETTINGS_KEY + userId);
  let initial = cached ? JSON.parse(cached) : null;

  // Background fetch from S3 cloud settings
  try {
    const s3SettingsKey = `users/${userId}/.settings/backup.json`;
    const cloudSettings = await directGetJsonFromS3(s3SettingsKey, userId);
    if (cloudSettings) {
      localStorage.setItem(LOCAL_SETTINGS_KEY + userId, JSON.stringify(cloudSettings));
      return { ...DEFAULT_BACKUP_SETTINGS, ...cloudSettings };
    }
  } catch (_err) {}

  return initial || { ...DEFAULT_BACKUP_SETTINGS };
}

/**
 * 2. Save backup settings (Direct AWS S3 & LocalStorage - 0 Firestore)
 */
export async function saveBackupSettings(userId, settings) {
  if (!userId) return;

  const dataToSave = {
    ...settings,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(LOCAL_SETTINGS_KEY + userId, JSON.stringify(dataToSave));

  // Sync directly to AWS S3 cloud
  try {
    const s3SettingsKey = `users/${userId}/.settings/backup.json`;
    await directPutJsonToS3(s3SettingsKey, dataToSave, userId);
  } catch (err) {
    console.warn('[backupService] S3 settings sync warning:', err.message);
  }
}

/**
 * Extract accurate video duration from a File or Blob before upload
 */
export function getVideoDurationFromFile(file) {
  return new Promise((resolve) => {
    if (!file || (!file.type?.startsWith('video/') && !file.name?.match(/\.(mp4|mov|webm|mkv|3gp)$/i))) {
      resolve(null);
      return;
    }
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      const onMeta = () => {
        const d = v.duration;
        cleanup();
        if (d && isFinite(d) && d > 0) {
          const total = Math.max(1, Math.round(d));
          const hrs = Math.floor(total / 3600);
          const mins = Math.floor((total % 3600) / 60);
          const secs = total % 60;
          const formatted =
            hrs > 0
              ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
              : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          resolve(formatted);
        } else {
          resolve(null);
        }
      };
      const cleanup = () => {
        v.removeEventListener('loadedmetadata', onMeta);
        v.removeEventListener('error', onError);
        if (v.src) URL.revokeObjectURL(v.src);
      };
      const onError = () => {
        cleanup();
        resolve(null);
      };
      v.addEventListener('loadedmetadata', onMeta);
      v.addEventListener('error', onError);
      v.src = URL.createObjectURL(file);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Save / Update video duration or custom file metadata in S3 and localStorage
 */
export async function saveFileDuration(userId, fileKey, duration) {
  if (!userId || !fileKey || !duration) return;

  // 1. LocalStorage memory & disk cache
  try {
    localStorage.setItem(`vid_dur_${fileKey}`, duration);
    const metaRaw = localStorage.getItem(LOCAL_META_KEY + userId);
    const metaMap = metaRaw ? JSON.parse(metaRaw) : {};
    metaMap[fileKey] = { ...(metaMap[fileKey] || {}), duration };
    localStorage.setItem(LOCAL_META_KEY + userId, JSON.stringify(metaMap));

    // 2. Persist to AWS S3
    const s3MetaKey = `users/${userId}/.settings/file_meta.json`;
    await directPutJsonToS3(s3MetaKey, metaMap, userId);
  } catch (e) {
    console.warn('[backupService] saveFileDuration notice:', e.message);
  }
}

/**
 * Upload a file directly from the device into AWS S3.
 * 100% Serverless: Direct client-to-AWS-S3 transfer.
 * Preserves lossless compression and video duration metadata in S3.
 */
export async function backupFileToAWSAndFirebase({
  file,
  category = 'other',
  folder = '',
  userId,
  token,
  enableCompression,
  compressionQuality,
  onProgress = () => {},
  onStatus = () => {},
}) {
  if (!userId) throw new Error('User authentication required for cloud upload');

  let compEnabled = enableCompression;
  let compQuality = compressionQuality;

  // If compression parameters are not explicitly passed, read from user's live settings
  if (compEnabled === undefined || compQuality === undefined) {
    try {
      const userSettings = await getBackupSettings(userId);
      if (compEnabled === undefined) {
        compEnabled = userSettings?.compressionEnabled !== false;
      }
      if (compQuality === undefined) {
        compQuality = userSettings?.compressionQuality || 0.90;
      }
    } catch {}
  }

  let uploadFile = file;
  const originalSize = file.size;
  let compressionResult = null;

  // Apply intelligent multi-media compression (Photos, Videos, Audio, Documents)
  if (compEnabled !== false) {
    try {
      compressionResult = await smartCompressFile(file, {
        enableCompression: true,
        quality: compQuality,
        onStatus,
      });
      if (compressionResult && compressionResult.wasCompressed) {
        uploadFile = compressionResult.file;
      }
    } catch (cErr) {
      console.warn('Smart compression warning, uploading original:', cErr.message);
    }
  }

  const wasCompressed = !!(compressionResult && compressionResult.wasCompressed);
  const savedBytes = compressionResult ? compressionResult.savedBytes : 0;
  const savedPercent = compressionResult ? compressionResult.savedPercent : 0;
  const fileName = uploadFile.name || file.name;
  const targetFolder = folder || category || 'other';

  // Extract accurate video duration and image thumbnail if file is a video
  let videoDuration = null;
  let videoThumbnail = null;
  if (category === 'videos' || file.type?.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|mkv|3gp)$/i)) {
    try {
      videoDuration = await getVideoDurationFromFile(file);
      videoThumbnail = await captureThumbnailFromLocalFile(file);
    } catch (e) {}
  }

  // 1. Upload DIRECTLY to AWS S3 (Client-to-Cloud, 0 server needed)
  const s3Result = await directUploadFileToS3({
    file: uploadFile,
    userId,
    category,
    folder: targetFolder,
    onProgress,
    onStatus,
  });

  // 2. Record File Metadata directly in AWS S3 and LocalStorage
  try {
    const metaRaw = localStorage.getItem(LOCAL_META_KEY + userId);
    const metaMap = metaRaw ? JSON.parse(metaRaw) : {};
    metaMap[s3Result.key] = {
      key: s3Result.key,
      name: fileName,
      originalName: file.name,
      size: uploadFile.size,
      originalSize,
      compressed: wasCompressed,
      savedBytes,
      savedPercent,
      duration: videoDuration,
      thumbnail: videoThumbnail,
      category,
      folder: targetFolder,
      s3Bucket: s3Result.s3Bucket,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(LOCAL_META_KEY + userId, JSON.stringify(metaMap));
    if (videoDuration) {
      localStorage.setItem(`vid_dur_${s3Result.key}`, videoDuration);
    }
    if (videoThumbnail) {
      localStorage.setItem(`vid_thumb_${s3Result.key}`, videoThumbnail);
    }

    const s3MetaKey = `users/${userId}/.settings/file_meta.json`;
    directPutJsonToS3(s3MetaKey, metaMap, userId).catch(() => {});
  } catch (fsErr) {
    console.warn('File metadata recording notice:', fsErr.message);
  }

  const newUploadedFile = {
    key: s3Result.key,
    name: fileName,
    fileName,
    originalName: file.name,
    size: uploadFile.size,
    originalSize,
    compressed: wasCompressed,
    savedBytes,
    savedPercent,
    duration: videoDuration,
    thumbnail: videoThumbnail,
    category,
    folder: targetFolder,
    s3Bucket: s3Result.s3Bucket,
    lastModified: new Date().toISOString(),
    awsLive: true,
  };

  try {
    updateFileInUserCache(userId, newUploadedFile);
  } catch {}

  return {
    success: true,
    ...newUploadedFile,
  };
}

/** Record a completed backup session in AWS S3 and LocalStorage */
export async function recordBackupSession(userId, sessionData) {
  if (!userId) return;

  const session = {
    id: `session_${Date.now()}`,
    timestamp: new Date().toISOString(),
    totalFiles: sessionData.totalFiles || 0,
    totalBytes: sessionData.totalBytes || 0,
    categories: sessionData.categories || [],
    device: 'Android Mobile Device',
    status: 'completed',
  };

  const existing = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY + userId) || '[]');
  existing.unshift(session);
  const updatedHistory = existing.slice(0, 30);
  localStorage.setItem(LOCAL_HISTORY_KEY + userId, JSON.stringify(updatedHistory));

  // Sync to AWS S3
  try {
    const s3HistoryKey = `users/${userId}/.settings/history.json`;
    await directPutJsonToS3(s3HistoryKey, updatedHistory, userId);
  } catch (_e) {}
}

/** Get backup history sessions from AWS S3 or LocalStorage */
export async function getBackupHistory(userId) {
  if (!userId) return [];

  const cached = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY + userId) || '[]');

  try {
    const s3HistoryKey = `users/${userId}/.settings/history.json`;
    const cloudHistory = await directGetJsonFromS3(s3HistoryKey, userId);
    if (Array.isArray(cloudHistory)) {
      localStorage.setItem(LOCAL_HISTORY_KEY + userId, JSON.stringify(cloudHistory));
      return cloudHistory;
    }
  } catch (_e) {}

  return cached;
}

// =====================================================================
// GLOBAL USER FILES CACHE (Eliminates repeated reloading across pages)
// =====================================================================
const LOCAL_FILES_CACHE_KEY = 'icloud_cached_files_';
let memoryUserFilesCache = {
  userId: null,
  files: [],
  timestamp: 0,
};

export function getCachedUserFiles(userId) {
  if (!userId) return [];
  if (memoryUserFilesCache.userId === userId && memoryUserFilesCache.files.length > 0) {
    return memoryUserFilesCache.files;
  }
  try {
    const raw = localStorage.getItem(LOCAL_FILES_CACHE_KEY + userId);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryUserFilesCache = {
          userId,
          files: parsed,
          timestamp: Date.now(),
        };
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function setCachedUserFiles(userId, files) {
  if (!userId || !Array.isArray(files)) return;
  memoryUserFilesCache = {
    userId,
    files,
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem(LOCAL_FILES_CACHE_KEY + userId, JSON.stringify(files));
  } catch {}
}

export function invalidateUserFilesCache(userId) {
  if (memoryUserFilesCache.userId === userId) {
    memoryUserFilesCache.timestamp = 0;
  }
}

export function removeFileFromUserCache(userId, fileKey) {
  if (!userId || !fileKey) return;
  const current = getCachedUserFiles(userId);
  const updated = current.filter((f) => (f.key || f.name) !== fileKey);
  setCachedUserFiles(userId, updated);
}

export function updateFileInUserCache(userId, updatedFile) {
  if (!userId || !updatedFile) return;
  const current = getCachedUserFiles(userId);
  const targetKey = updatedFile.key || updatedFile.name;
  let exists = false;
  const updated = current.map((f) => {
    if ((f.key || f.name) === targetKey) {
      exists = true;
      return { ...f, ...updatedFile };
    }
    return f;
  });
  if (!exists) {
    updated.unshift(updatedFile);
  }
  setCachedUserFiles(userId, updated);
}

/**
 * Fetch files that exist in AWS S3 directly from AWS S3,
 * merging metadata (durations, compression stats) and leveraging persistent cache.
 */
export async function getUserStoredFiles(userId, options = {}) {
  if (!userId) return [];
  const forceRefresh = typeof options === 'boolean' ? options : Boolean(options?.forceRefresh);

  // Return cached files immediately if available and fresh (within 45s)
  const isFresh =
    memoryUserFilesCache.userId === userId &&
    memoryUserFilesCache.files.length > 0 &&
    Date.now() - memoryUserFilesCache.timestamp < 45000;

  if (!forceRefresh && isFresh) {
    return memoryUserFilesCache.files;
  }

  // If memory cache is empty, check localStorage
  const cachedFiles = getCachedUserFiles(userId);
  if (!forceRefresh && cachedFiles.length > 0 && memoryUserFilesCache.files.length === 0) {
    memoryUserFilesCache = {
      userId,
      files: cachedFiles,
      timestamp: Date.now(),
    };
    return cachedFiles;
  }

  try {
    const s3Files = await directGetUserFilesFromS3(userId);

    // Fetch metadata from localStorage and S3
    let metaMap = {};
    try {
      const cached = localStorage.getItem(LOCAL_META_KEY + userId);
      if (cached) metaMap = JSON.parse(cached);
      else {
        const cloudMeta = await directGetJsonFromS3(`users/${userId}/.settings/file_meta.json`, userId);
        if (cloudMeta) {
          metaMap = cloudMeta;
          localStorage.setItem(LOCAL_META_KEY + userId, JSON.stringify(cloudMeta));
        }
      }
    } catch (_fsErr) {}

    // Merge metadata
    const mergedFiles = s3Files.map((file) => {
      const meta = metaMap[file.key];
      const localDur = localStorage.getItem(`vid_dur_${file.key}`);
      const localThumb = localStorage.getItem(`vid_thumb_${file.key}`);
      return {
        ...file,
        duration: meta?.duration || localDur || file.duration,
        thumbnail: meta?.thumbnail || localThumb || file.thumbnail || null,
        compressed: meta?.compressed || file.compressed,
        savedBytes: meta?.savedBytes || file.savedBytes,
        savedPercent: meta?.savedPercent || file.savedPercent,
        originalSize: meta?.originalSize || file.originalSize,
      };
    });

    setCachedUserFiles(userId, mergedFiles);
    return mergedFiles;
  } catch (err) {
    console.warn('Failed to query storage from S3:', err.message);
    const fallback = getCachedUserFiles(userId);
    return fallback.length > 0 ? fallback : [];
  }
}

/**
 * Sync user storage summary and files directly from AWS S3
 */
export async function syncUserStorage(userId) {
  if (!userId) {
    return {
      summary: {
        totalBytes: 0,
        totalGB: '0.00',
        totalLabel: '0 B',
        categories: {
          photos: { sizeBytes: 0, sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
          videos: { sizeBytes: 0, sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
          docs: { sizeBytes: 0, sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
          music: { sizeBytes: 0, sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
          other: { sizeBytes: 0, sizeGB: '0.00', sizeLabel: '0 B', count: 0 },
        },
        filesCount: 0,
        lastSynced: new Date().toISOString(),
        s3Connected: true,
      },
      files: [],
    };
  }

  const { summary, files } = await directGetUserStorageSummary(userId);

  // Merge metadata
  try {
    const cached = localStorage.getItem(LOCAL_META_KEY + userId);
    let metaMap = cached ? JSON.parse(cached) : {};
    if (!cached) {
      const cloudMeta = await directGetJsonFromS3(`users/${userId}/.settings/file_meta.json`, userId);
      if (cloudMeta) {
        metaMap = cloudMeta;
        localStorage.setItem(LOCAL_META_KEY + userId, JSON.stringify(cloudMeta));
      }
    }
    for (const f of files) {
      const meta = metaMap[f.key];
      const localDur = localStorage.getItem(`vid_dur_${f.key}`);
      const localThumb = localStorage.getItem(`vid_thumb_${f.key}`);
      if (meta) Object.assign(f, meta);
      if (localDur) f.duration = localDur;
      if (localThumb) f.thumbnail = localThumb;
    }
  } catch (_e) {}

  if (files && files.length > 0) {
    setCachedUserFiles(userId, files);
  }

  return { summary, files, success: true };
}

/**
 * Delete a stored file directly from AWS S3 and LocalStorage metadata
 */
export async function deleteStoredFile(key, userId) {
  if (!key || !userId) throw new Error('Missing key or userId for deletion');

  // 1. Delete from AWS S3
  await directDeleteFileFromS3(key, userId);

  // 2. Remove immediately from memory and persistent files cache
  removeFileFromUserCache(userId, key);

  // 3. Clean metadata in localStorage and S3
  try {
    const metaRaw = localStorage.getItem(LOCAL_META_KEY + userId);
    if (metaRaw) {
      const metaMap = JSON.parse(metaRaw);
      delete metaMap[key];
      localStorage.setItem(LOCAL_META_KEY + userId, JSON.stringify(metaMap));
      directPutJsonToS3(`users/${userId}/.settings/file_meta.json`, metaMap, userId).catch(() => {});
    }
    localStorage.removeItem(`vid_dur_${key}`);
  } catch (_e) {}

  return { success: true, key };
}

/** Check AWS S3 connection status directly */
export async function getAwsConfig() {
  const res = await directTestAwsConnection();
  return {
    configured: true,
    connected: res.connected,
    bucket: res.bucket || 'icloud-android-storage-2026',
    region: res.region || 'us-east-1',
    error: res.error,
  };
}

/** Save AWS S3 credentials dynamically */
export async function saveAwsConfig(config) {
  directSaveCustomAwsConfig(config);
  const testRes = await directTestAwsConnection();
  return {
    success: true,
    connected: testRes.connected,
    bucket: testRes.bucket,
    region: testRes.region,
    error: testRes.error,
  };
}
