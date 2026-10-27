import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const CATEGORIES = ['photos', 'videos', 'music', 'docs', 'other'];

const EXT = {
  photos: 'jpg jpeg png heic heif gif webp bmp tif tiff dng raw svg avif',
  videos: 'mp4 mov avi mkv webm m4v 3gp wmv flv mpg mpeg mts',
  music:  'mp3 m4a aac wav flac ogg oga opus wma aiff aif alac amr mid midi',
  docs:   'pdf doc docx xls xlsx ppt pptx txt rtf csv md odt ods odp pages numbers key epub',
};

const EXT_MAP = Object.fromEntries(
  Object.entries(EXT).flatMap(([cat, list]) => list.split(' ').map((e) => [e, cat]))
);

// Helper to sanitize file names
export const safeFileName = (n) =>
  (n || 'file')
    .normalize('NFKC')
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\- ()\u0080-\uFFFF]/g, '_')
    .slice(-150);

// Helper to classify file extensions into categories
export function classifyExtension(fileName = '', mimeType = '') {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'photos';
  if (mime.startsWith('video/')) return 'videos';
  if (mime.startsWith('audio/')) return 'music';
  const ext = (fileName.toLowerCase().split('.').pop() || '').trim();
  return EXT_MAP[ext] || 'other';
}

// Classify key and extract category & custom folder
export function classifyKey(key = '', userId = '') {
  const prefix = `users/${userId}/`;
  const rest = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  const parts = rest.split('/');

  // Handles: folders/<folderName>/<filename>
  if (parts.length > 2 && parts[0] === 'folders') {
    const folder = parts[1];
    return {
      category: classifyExtension(key),
      folder,
    };
  }

  // Handles: <category>/<filename>
  if (parts.length > 1 && CATEGORIES.includes(parts[0])) {
    return {
      category: parts[0] === 'other' ? classifyExtension(key) : parts[0],
      folder: parts[0],
    };
  }

  // Handles: <folder>/<filename>
  if (parts.length > 1) {
    return {
      category: classifyExtension(key),
      folder: parts[0],
    };
  }

  return {
    category: classifyExtension(key),
    folder: 'other',
  };
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(2)} ${units[i]}`;
}

// Get configured AWS credentials with localStorage override support
export function getDirectAwsConfig() {
  try {
    const custom = localStorage.getItem('icloud_custom_aws_config');
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed.accessKeyId && parsed.secretAccessKey && parsed.bucketName) {
        return parsed;
      }
    }
  } catch {}

  const envAkid = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
  const envSak = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;

  return {
    region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
    accessKeyId: (envAkid && envAkid.trim()) ? envAkid.trim() : '',
    secretAccessKey: (envSak && envSak.trim()) ? envSak.trim() : '',
    bucketName: import.meta.env.VITE_AWS_S3_BUCKET_NAME || 'icloud-android-storage-2026',
  };
}

export function isDirectAwsConfigured() {
  const cfg = getDirectAwsConfig();
  return Boolean(cfg.accessKeyId && cfg.secretAccessKey && cfg.bucketName);
}

// Module-level persistent presigned URL cache to avoid repeating expensive crypto signing
const URL_STORAGE_KEY = 'icloud_presigned_urls_cache_v1';
const presignedUrlsCache = new Map();

// Hydrate URL cache from sessionStorage for instant 0ms access across tab navigation & page loads
if (typeof window !== 'undefined') {
  try {
    const raw = sessionStorage.getItem(URL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      Object.entries(parsed).forEach(([key, entry]) => {
        if (entry && entry.url && entry.expiresAt > now + 60000) {
          presignedUrlsCache.set(key, entry);
        }
      });
    }
  } catch {}
}

let saveUrlTimer = null;
function persistPresignedUrlCache() {
  if (typeof window === 'undefined') return;
  if (saveUrlTimer) return;
  saveUrlTimer = setTimeout(() => {
    saveUrlTimer = null;
    try {
      const obj = {};
      const now = Date.now();
      for (const [k, v] of presignedUrlsCache.entries()) {
        if (v && v.expiresAt > now + 60000) {
          obj[k] = v;
        }
      }
      sessionStorage.setItem(URL_STORAGE_KEY, JSON.stringify(obj));
    } catch {}
  }, 1000);
}

export function getCachedPresignedUrl(key) {
  const cached = presignedUrlsCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.url;
  }
  return null;
}

export function setCachedPresignedUrl(key, url, expiresInSeconds = 86400) {
  presignedUrlsCache.set(key, { url, expiresAt: Date.now() + expiresInSeconds * 1000 });
  persistPresignedUrlCache();
}

let cachedS3Client = null;
let lastConfigHash = '';

export function getDirectS3Client() {
  const cfg = getDirectAwsConfig();
  if (!cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error(
      'AWS credentials missing. Please set VITE_AWS_ACCESS_KEY_ID and VITE_AWS_SECRET_ACCESS_KEY in Netlify Site Configuration, or configure your AWS keys in Cloud Backup settings.'
    );
  }

  const hash = `${cfg.region}:${cfg.accessKeyId}:${cfg.bucketName}`;

  if (cachedS3Client && lastConfigHash === hash) {
    return { client: cachedS3Client, bucket: cfg.bucketName, region: cfg.region };
  }

  cachedS3Client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    maxAttempts: 4,
  });
  lastConfigHash = hash;

  return { client: cachedS3Client, bucket: cfg.bucketName, region: cfg.region };
}

// MIME mapping for pre-signed download and streaming
export const MIME_MAP = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/mp4', // MPEG-4 container allows Chromium & WebView to hardware-decode .mov directly
  mkv: 'video/mp4',
  m4v: 'video/mp4',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

// In-memory set of known keys per user to prevent blind GetObject 404s
const userKnownKeys = new Map();

export function registerKnownKeys(userId, keys = []) {
  if (!userId) return;
  if (!userKnownKeys.has(userId)) {
    userKnownKeys.set(userId, new Set());
  }
  const set = userKnownKeys.get(userId);
  for (const k of keys) {
    if (k) set.add(k);
  }
}

export function registerKnownKey(userId, key) {
  if (!userId || !key) return;
  if (!userKnownKeys.has(userId)) {
    userKnownKeys.set(userId, new Set());
  }
  userKnownKeys.get(userId).add(key);
}

export function unregisterKnownKey(userId, key) {
  if (!userId || !key) return;
  userKnownKeys.get(userId)?.delete(key);
}

/**
 * Direct JSON reading from AWS S3 without triggering browser 404 console errors
 */
export async function directGetJsonFromS3(key, userId = '') {
  if (!key) return null;
  const uid = userId || (key.startsWith('users/') ? key.split('/')[1] : '');

  try {
    const { client, bucket } = getDirectS3Client();

    // Check if key is verified to exist before issuing GET request (prevents 404 in console)
    if (uid) {
      if (!userKnownKeys.has(uid)) {
        try {
          const listRes = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: `users/${uid}/.settings/`,
            })
          );
          const found = (listRes.Contents || []).map((c) => c.Key);
          registerKnownKeys(uid, found);
        } catch {}
      }

      const known = userKnownKeys.get(uid);
      if (known && !known.has(key)) {
        // Key is proven not to exist in S3: avoid sending GET to prevent 404 in console
        return null;
      }
    }

    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await res.Body.transformToString();
    return JSON.parse(text);
  } catch (err) {
    if (err.name !== 'NoSuchKey') {
      console.warn('[directS3Service] Read JSON warning for', key, err.message);
    }
    return null;
  }
}

/**
 * Direct JSON writing to AWS S3 (for settings, history, and metadata)
 */
export async function directPutJsonToS3(key, data, userId = '') {
  if (!key) return false;
  const uid = userId || (key.startsWith('users/') ? key.split('/')[1] : '');

  try {
    const { client, bucket } = getDirectS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
      })
    );
    if (uid) registerKnownKey(uid, key);
    return true;
  } catch (err) {
    console.warn('[directS3Service] Write JSON warning for', key, err.message);
    return false;
  }
}

/**
 * 1. Direct Upload to AWS S3 (Client-to-Cloud, 100% Serverless)
 */
export async function directUploadFileToS3({
  file,
  userId,
  category = 'other',
  folder = '',
  onProgress = () => {},
  onStatus = () => {},
}) {
  if (!userId) throw new Error('User authentication required for cloud upload');
  const { client, bucket } = getDirectS3Client();

  const cleanName = safeFileName(file.name);
  const targetFolder = folder || category || 'other';

  // Strict isolated multi-tenant key
  const s3Key = folder
    ? `users/${userId}/folders/${targetFolder}/${Date.now()}-${cleanName}`
    : `users/${userId}/${targetFolder}/${Date.now()}-${cleanName}`;

  const fileType = file.type || 'application/octet-stream';

  onStatus?.('Requesting direct AWS S3 transfer ticket...');

  // Generate pre-signed PUT URL right inside the client
  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(client, putCommand, { expiresIn: 3600 });

  onStatus?.(`Uploading directly to AWS S3: ${file.name}...`);

  // Stream binary directly to AWS S3 with live progress
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', fileType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`AWS S3 returned status ${xhr.status} during direct upload`));
      }
    };

    xhr.onerror = () => reject(new Error('Network failure during direct upload to AWS S3'));
    xhr.send(file);
  });

  return {
    success: true,
    key: s3Key,
    fileName: file.name,
    size: file.size,
    s3Bucket: bucket,
    category,
    folder: targetFolder,
  };
}

/**
 * 2. Direct Query User Files from AWS S3 (Scoped strictly to users/${userId}/)
 */
export async function directGetUserFilesFromS3(userId) {
  if (!userId) return [];
  const { client, bucket } = getDirectS3Client();
  const prefix = `users/${userId}/`;

  const files = [];
  let token = undefined;

  try {
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );

      for (const item of res.Contents || []) {
        if (!item.Key || item.Key.endsWith('/')) continue;
        const key = item.Key;
        // Verify key strictly starts with users/${userId}/
        if (!key.startsWith(prefix)) continue;

        // Skip internal/hidden system files (.settings/, dotfiles, json metadata)
        const fileName = key.split('/').pop() || '';
        if (key.includes('/.settings/') || fileName.startsWith('.') || fileName.endsWith('.json')) {
          continue;
        }

        const size = item.Size || 0;
        const rawName = fileName.replace(/^\d+-/, '');
        const ext = (rawName.split('.').pop() || '').toLowerCase();
        const { category, folder } = classifyKey(key, userId);

        // Instant 0ms cache retrieval
        const cachedUrl = getCachedPresignedUrl(key);

        files.push({
          key,
          name: rawName,
          fileName: rawName,
          size,
          type: category,
          category,
          folder,
          lastModified: item.LastModified?.toISOString?.() || new Date().toISOString(),
          s3Bucket: bucket,
          downloadUrl: cachedUrl || '',
          _ext: ext,
        });
      }

      registerKnownKeys(userId, (res.Contents || []).map((c) => c.Key));
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    // Parallel Batch Signing: Sign un-cached items in parallel chunks of 15 to eliminate sequential lag
    const unSignedItems = files.filter((f) => !f.downloadUrl);
    if (unSignedItems.length > 0) {
      const BATCH_SIZE = 15;
      for (let i = 0; i < unSignedItems.length; i += BATCH_SIZE) {
        const batch = unSignedItems.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (fileObj) => {
            try {
              const commandInput = { Bucket: bucket, Key: fileObj.key };
              if (MIME_MAP[fileObj._ext]) {
                commandInput.ResponseContentType = MIME_MAP[fileObj._ext];
              }
              const url = await getSignedUrl(client, new GetObjectCommand(commandInput), {
                expiresIn: 86400,
              });
              fileObj.downloadUrl = url;
              setCachedPresignedUrl(fileObj.key, url, 86400);
            } catch (uErr) {
              console.warn('URL presign error for', fileObj.key, uErr.message);
            }
          })
        );
      }
    }
  } catch (err) {
    console.warn('[directS3Service] List objects error:', err.message);
    throw err;
  }

  // Sort by latest upload first
  files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return files;
}

/**
 * 3. Direct Storage Summary calculation (Total bytes, category breakdown, count)
 */
export async function directGetUserStorageSummary(userId) {
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

  const files = await directGetUserFilesFromS3(userId);
  const GB = 1024 ** 3;
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, { bytes: 0, count: 0 }]));

  for (const f of files) {
    const cat = totals[f.category] ? f.category : 'other';
    totals[cat].bytes += f.size || 0;
    totals[cat].count += 1;
  }

  const totalBytes = Object.values(totals).reduce((s, t) => s + t.bytes, 0);

  const summary = {
    totalBytes,
    totalGB: (totalBytes / GB).toFixed(2),
    totalLabel: formatBytes(totalBytes),
    categories: Object.fromEntries(
      CATEGORIES.map((c) => [
        c,
        {
          sizeBytes: totals[c].bytes,
          sizeGB: (totals[c].bytes / GB).toFixed(2),
          sizeLabel: formatBytes(totals[c].bytes),
          count: totals[c].count,
        },
      ])
    ),
    filesCount: files.length,
    lastSynced: new Date().toISOString(),
    s3Connected: true,
    s3Error: null,
  };

  return { summary, files };
}

/**
 * 4. Direct Delete File from AWS S3 (Strictly user-scoped)
 */
export async function directDeleteFileFromS3(key, userId) {
  if (!key || !userId) throw new Error('Missing key or userId for deletion');
  const expectedPrefix = `users/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error('Permission denied: cannot delete files belonging to another account');
  }

  const { client, bucket } = getDirectS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  unregisterKnownKey(userId, key);
  presignedUrlsCache.delete(key);
  persistPresignedUrlCache();
  return { success: true, key };
}

/**
 * 5. Generate Pre-signed Download/Stream URL directly on client (Cached for zero overhead)
 */
export async function directGetDownloadUrl(key, userId) {
  if (!key || !userId) throw new Error('Missing key or userId');
  const expectedPrefix = `users/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error('Permission denied: cannot access files from another account');
  }

  const cachedUrl = getCachedPresignedUrl(key);
  if (cachedUrl) {
    return cachedUrl;
  }

  const { client, bucket } = getDirectS3Client();
  const ext = (key.split('.').pop() || '').toLowerCase();

  const commandInput = { Bucket: bucket, Key: key };
  if (MIME_MAP[ext]) {
    commandInput.ResponseContentType = MIME_MAP[ext];
  }

  const url = await getSignedUrl(client, new GetObjectCommand(commandInput), { expiresIn: 86400 });
  setCachedPresignedUrl(key, url, 86400);
  return url;
}

/**
 * 6. Direct AWS S3 Connection Test
 */
export async function directTestAwsConnection() {
  try {
    const { client, bucket, region } = getDirectS3Client();
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { connected: true, bucket, region };
  } catch (err) {
    return { connected: false, error: err.message || err.name };
  }
}

/**
 * 7. Save custom AWS configuration
 */
export function directSaveCustomAwsConfig(config) {
  try {
    localStorage.setItem('icloud_custom_aws_config', JSON.stringify(config));
    cachedS3Client = null;
    lastConfigHash = '';
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 8. Direct Copy File in AWS S3 (Client-side, Serverless)
 */
export async function directCopyFileInS3({ sourceKey, targetFolder, userId }) {
  if (!sourceKey || !targetFolder || !userId) {
    throw new Error('sourceKey, targetFolder, and userId are required');
  }

  const { client, bucket } = getDirectS3Client();
  const rawFileName = sourceKey.split('/').pop() || 'file';
  const cleanName = rawFileName.replace(/^\d+-/, '');
  const isStandardCat = CATEGORIES.includes(targetFolder);

  const targetKey = isStandardCat
    ? `users/${userId}/${targetFolder}/${Date.now()}-${cleanName}`
    : `users/${userId}/folders/${targetFolder}/${Date.now()}-${cleanName}`;

  const copySource = `${bucket}/${encodeURI(sourceKey)}`;

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: copySource,
      Key: targetKey,
    })
  );

  registerKnownKey(userId, targetKey);

  let downloadUrl = '';
  try {
    downloadUrl = await directGetDownloadUrl(targetKey, userId);
  } catch {}

  return {
    success: true,
    key: targetKey,
    name: cleanName,
    folder: targetFolder,
    downloadUrl,
    lastModified: new Date().toISOString(),
  };
}

/**
 * 9. Direct Move File in AWS S3 (Copy to target + Delete from source)
 */
export async function directMoveFileInS3({ sourceKey, targetFolder, userId }) {
  const copyRes = await directCopyFileInS3({ sourceKey, targetFolder, userId });
  await directDeleteFileFromS3(sourceKey, userId);
  return copyRes;
}
