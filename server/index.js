import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { adminAuth, db, isFirestoreAdminReady } from './services/firebaseAdmin.js';
import { syncUserStorageFromS3 } from './services/syncService.js';
import {
  s3Client,
  BUCKET_NAME,
  isAwsConfigured,
  testAwsConnection,
  updateS3Credentials,
  ensureBucketCors,
} from './services/s3Client.js';
import {
  generateUploadPresignedUrl,
  generateDownloadPresignedUrl,
  deleteS3Object,
  ownsKey,
} from './services/s3Service.js';
import { CATEGORIES, classify, formatBytes } from './services/categories.js';

// Prevent any unhandled background promise or gRPC network timeout from crashing the server
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception caught safely:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection caught safely:', reason);
});

const app = express();
app.use(cors());

// Parse binary body for direct S3 upload before general express.json (up to 5GB)
app.use('/api/s3/upload-direct', express.raw({ type: '*/*', limit: '5gb' }));
app.use(express.json({ limit: '50mb' }));

const safeName = (n) =>
  (n || 'file').normalize('NFKC').replace(/[\\/]/g, '_').replace(/[^\w.\- ()\u0080-\uFFFF]/g, '_').slice(-150);

// Local disk storage directory when AWS credentials are in emulation / setup mode
const localBucketDir = path.resolve(process.cwd(), 'server/storage/s3-bucket');
if (!fs.existsSync(localBucketDir)) {
  fs.mkdirSync(localBucketDir, { recursive: true });
}

// In-memory fallback stores for backup settings and logs
const memoryBackupSettings = new Map();
const memoryBackupHistory = new Map();
const memoryLocalFiles = new Map();

// Authentication middleware
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = await adminAuth.verifyIdToken(header.slice(7));
    next();
  } catch (err) {
    console.error('Auth error:', err.code || err.message);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
app.use('/api', requireAuth);

app.get('/health', (_req, res) => res.json({ status: 'healthy', awsConfigured: isAwsConfigured() }));

// AWS S3 Configuration Status & Setup
app.get('/api/aws/config', async (_req, res) => {
  const result = await testAwsConnection();
  res.json({
    configured: isAwsConfigured(),
    ...result,
  });
});

app.post('/api/aws/config', async (req, res) => {
  try {
    const { accessKeyId, secretAccessKey, bucketName, region } = req.body;
    updateS3Credentials({ accessKeyId, secretAccessKey, bucketName, region });
    const result = await testAwsConnection();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct upload to AWS S3 from mobile device / browser
app.post('/api/s3/upload-direct', async (req, res) => {
  try {
    const fileName = req.query.fileName;
    const fileType = req.query.fileType || req.headers['content-type'] || 'application/octet-stream';
    const category = req.query.category || 'other';
    const folder = req.query.folder || category;

    if (!fileName) return res.status(400).json({ error: 'Missing fileName in query parameter' });
    if (!req.body || req.body.length === 0) return res.status(400).json({ error: 'No file data received' });

    const key = `users/${req.user.uid}/${folder ? 'folders/' + safeName(folder) : category}/${Date.now()}-${safeName(fileName)}`;
    let uploadedToAwsLive = false;

    // 1. If real AWS credentials are set, upload directly to AWS S3 bucket
    if (isAwsConfigured()) {
      try {
        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: req.body,
          ContentType: fileType,
        });
        await s3Client.send(command);
        uploadedToAwsLive = true;
      } catch (awsErr) {
        console.warn('[upload-direct] Live AWS upload returned error:', awsErr.message);
        throw new Error(`AWS S3 rejected upload: ${awsErr.message}`);
      }
    } else {
      // 2. Local storage emulation when AWS credentials are not yet entered
      const userFolder = path.join(localBucketDir, `users_${req.user.uid}`, safeName(folder));
      if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });
      fs.writeFileSync(path.join(userFolder, safeName(fileName)), req.body);
    }

    const originalSize = Number(req.query.originalSize || req.body.length);
    const compressed = req.query.compressed === 'true' || req.query.compressed === true;
    const savedBytes = Number(req.query.savedBytes || 0);
    const savedPercent = Number(req.query.savedPercent || 0);
    const duration = req.query.duration || null;

    const fileRecord = {
      fileId: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: req.user.uid,
      name: fileName,
      size: req.body.length,
      originalSize,
      compressed,
      savedBytes,
      savedPercent,
      duration,
      type: fileType,
      category,
      folder: folder || category,
      s3Key: key,
      s3Bucket: BUCKET_NAME,
      uploadedAt: new Date().toISOString(),
      backupStatus: 'completed',
      storageProvider: uploadedToAwsLive ? 'AWS S3 (Live Cloud)' : 'AWS S3 (Ready to sync to Cloud)',
      device: 'Android Mobile Device',
    };

    // Store in memory cache
    const userFiles = memoryLocalFiles.get(req.user.uid) || [];
    userFiles.unshift(fileRecord);
    memoryLocalFiles.set(req.user.uid, userFiles);

    // Save in Firestore if available
    if (isFirestoreAdminReady && db) {
      try {
        await db.collection('files').doc(fileRecord.fileId).set(fileRecord);
      } catch {}
    }

    res.json({
      success: true,
      key,
      category,
      folder,
      fileRecord,
      awsLive: uploadedToAwsLive,
    });
  } catch (err) {
    console.error('Direct S3 upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload file to AWS S3' });
  }
});

// Generate presigned upload URL
app.post('/api/s3/presign', async (req, res) => {
  try {
    const { fileName, fileType, category, folder } = req.body;
    if (!fileName) return res.status(400).json({ error: 'Missing fileName' });
    const result = await generateUploadPresignedUrl(
      fileName,
      fileType || 'application/octet-stream',
      req.user.uid,
      category,
      folder
    );
    res.json(result);
  } catch (err) {
    console.error('Presign error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Record metadata after client completes direct S3 PUT upload
app.post('/api/s3/record-metadata', async (req, res) => {
  try {
    const { key, fileName, originalName, size, originalSize, compressed, savedBytes, savedPercent, category, folder, duration } = req.body;
    const metadata = {
      name: fileName || (key ? key.split('/').pop().replace(/^\d+-/, '') : 'Uploaded File'),
      originalName: originalName || fileName,
      key,
      size: Number(size || 0),
      originalSize: Number(originalSize || size || 0),
      compressed: Boolean(compressed),
      savedBytes: Number(savedBytes || 0),
      savedPercent: Number(savedPercent || 0),
      duration: duration || null,
      category: category || 'other',
      folder: folder || category || 'other',
      type: category || 'other',
      uploadedAt: new Date().toISOString(),
      backupStatus: 'completed',
      storageProvider: 'AWS S3 (Live Cloud)',
      device: 'Android Mobile Device',
    };

    if (isFirestoreAdminReady) {
      try {
        await db.collection('users').doc(req.user.uid).collection('files').doc(encodeURIComponent(key)).set(metadata, { merge: true });
      } catch (fErr) {
        console.warn('Firestore metadata write error:', fErr.message);
      }
    }

    const userFiles = memoryLocalFiles.get(req.user.uid) || [];
    userFiles.unshift(metadata);
    memoryLocalFiles.set(req.user.uid, userFiles);

    res.json({ success: true, metadata });
  } catch (err) {
    console.error('Record metadata error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update video duration for an existing S3 file
app.post('/api/files/update-duration', async (req, res) => {
  try {
    const { key, duration } = req.body;
    if (!key || !duration) {
      return res.status(400).json({ error: 'Missing key or duration' });
    }

    const userFiles = memoryLocalFiles.get(req.user.uid) || [];
    const target = userFiles.find((f) => f.key === key || f.name === key);
    if (target) {
      target.duration = duration;
    } else {
      userFiles.unshift({ key, duration });
      memoryLocalFiles.set(req.user.uid, userFiles);
    }

    if (isFirestoreAdminReady && db) {
      try {
        await db
          .collection('users')
          .doc(req.user.uid)
          .collection('files')
          .doc(encodeURIComponent(key))
          .set({ duration }, { merge: true });
      } catch (fErr) {
        console.warn('Firestore update-duration error:', fErr.message);
      }
    }

    res.json({ success: true, key, duration });
  } catch (err) {
    console.error('Update duration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to discover files on disk in local S3 emulation directory
function scanLocalFiles(uid) {
  const userDir = path.join(localBucketDir, `users_${uid}`);
  const list = [];
  if (!fs.existsSync(userDir)) return list;

  function traverse(dir, relFolder = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          traverse(fullPath, relFolder ? `${relFolder}/${ent.name}` : ent.name);
        } else if (ent.isFile()) {
          const stats = fs.statSync(fullPath);
          const folder = relFolder || 'other';
          const category = classify(ent.name);
          const s3Key = `users/${uid}/${folder}/${stats.mtimeMs.toFixed(0)}-${safeName(ent.name)}`;
          list.push({
            key: s3Key,
            name: ent.name,
            size: stats.size,
            type: category,
            category,
            folder,
            lastModified: stats.mtime.toISOString(),
            s3Bucket: BUCKET_NAME,
            storageProvider: 'AWS S3 (Ready to sync to Cloud)',
          });
        }
      }
    } catch (e) {
      console.warn('[scanLocalFiles] traverse error:', e.message);
    }
  }

  traverse(userDir);
  return list;
}

// S3 Storage Sync: Queries ONLY real files from AWS S3
app.post('/api/storage/sync', async (req, res) => {
  try {
    const { summary, files } = await syncUserStorageFromS3(req.user.uid);
    // Merge any files uploaded locally or awaiting cloud push
    const localUserFiles = memoryLocalFiles.get(req.user.uid) || [];
    const onDiskFiles = scanLocalFiles(req.user.uid);

    const allLocal = [...localUserFiles];
    for (const odf of onDiskFiles) {
      if (!allLocal.some((m) => m.name === odf.name)) {
        allLocal.push(odf);
      }
    }

    for (const lf of allLocal) {
      if (!files.some((f) => f.key === lf.s3Key || f.name === lf.name)) {
        files.push({
          key: lf.s3Key || `users/${req.user.uid}/${lf.folder || 'other'}/${Date.now()}-${safeName(lf.name)}`,
          name: lf.name,
          size: lf.size || 0,
          type: lf.category || lf.type || classify(lf.name),
          category: lf.category || lf.type || classify(lf.name),
          folder: lf.folder || 'other',
          lastModified: lf.uploadedAt || lf.lastModified || new Date().toISOString(),
          s3Bucket: BUCKET_NAME,
          storageProvider: lf.storageProvider || 'AWS S3 (Ready to sync to Cloud)',
        });
      }
    }

    // Decorate S3 files with recorded compression metadata from memory or Firestore
    const metaMap = new Map();
    for (const lf of localUserFiles) {
      if (lf.s3Key || lf.key) metaMap.set(lf.s3Key || lf.key, lf);
      if (lf.name) metaMap.set(lf.name, lf);
    }
    if (isFirestoreAdminReady && db) {
      try {
        const metaSnap = await db.collection('users').doc(req.user.uid).collection('files').get();
        metaSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.key) metaMap.set(data.key, data);
          if (data.name) metaMap.set(data.name, data);
        });
      } catch (fErr) {
        console.warn('Firestore metadata lookup warning:', fErr.message);
      }
    }

    for (const file of files) {
      const match = metaMap.get(file.key) || metaMap.get(file.name);
      if (match) {
        file.originalSize = match.originalSize || file.size;
        file.compressed = match.compressed || false;
        file.savedBytes = match.savedBytes || 0;
        file.savedPercent = match.savedPercent || 0;
        if (match.originalName) file.originalName = match.originalName;
        if (match.duration) file.duration = match.duration;
      }
    }

    // Accurately recalculate totals so frontend badges & storage counters are 100% in sync
    const GB = 1024 ** 3;
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalSavedBytes = files.reduce((sum, f) => sum + (f.savedBytes || 0), 0);
    summary.totalBytes = totalBytes;
    summary.totalGB = (totalBytes / GB).toFixed(2);
    summary.totalLabel = formatBytes(totalBytes);
    summary.totalSavedBytes = totalSavedBytes;
    summary.totalSavedLabel = formatBytes(totalSavedBytes);
    summary.filesCount = files.length;
    for (const cat of CATEGORIES) {
      const catFiles = files.filter((f) => f.category === cat || f.type === cat);
      const catBytes = catFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      if (summary.categories && summary.categories[cat]) {
        summary.categories[cat].count = catFiles.length;
        summary.categories[cat].sizeBytes = catBytes;
        summary.categories[cat].sizeGB = (catBytes / GB).toFixed(2);
        summary.categories[cat].sizeLabel = formatBytes(catBytes);
      }
    }

    // Attach pre-signed URLs so frontend thumbnail grids and previews load instantly
    for (const file of files) {
      if (file.key && !file.downloadUrl) {
        try {
          file.downloadUrl = await generateDownloadPresignedUrl(file.key);
        } catch (e) {
          console.warn('[sync] failed to sign url for', file.name, e.message);
        }
      }
    }

    res.json({ success: true, summary, files });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Failed to sync storage from S3' });
  }
});

// Backup settings: Get configuration
app.get('/api/backup/settings', async (req, res) => {
  try {
    const uid = req.user.uid;
    let settings = null;
    if (isFirestoreAdminReady && db) {
      try {
        const docSnap = await db.collection('backup_settings').doc(uid).get();
        if (docSnap.exists) settings = docSnap.data();
      } catch {}
    }
    if (!settings) {
      settings = memoryBackupSettings.get(uid);
    }
    res.json({ success: true, settings: settings || null });
  } catch (err) {
    console.error('Get backup settings error:', err);
    res.status(500).json({ error: 'Failed to fetch backup settings' });
  }
});

// Backup settings: Save configuration
app.post('/api/backup/settings', async (req, res) => {
  try {
    const uid = req.user.uid;
    const settings = {
      ...req.body,
      updatedAt: new Date().toISOString(),
      userId: uid,
    };
    memoryBackupSettings.set(uid, settings);
    if (isFirestoreAdminReady && db) {
      try {
        await db.collection('backup_settings').doc(uid).set(settings, { merge: true });
      } catch {}
    }
    res.json({ success: true, settings });
  } catch (err) {
    console.error('Save backup settings error:', err);
    res.status(500).json({ error: 'Failed to save backup settings' });
  }
});

// Record backed up file
app.post('/api/backup/record-file', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { fileId, name, size, type, category, folder, s3Key } = req.body;
    const record = {
      fileId: fileId || `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: uid,
      name,
      size: size || 0,
      type: type || 'application/octet-stream',
      category: category || 'other',
      folder: folder || category || 'other',
      s3Key,
      uploadedAt: new Date().toISOString(),
      backupStatus: 'completed',
      device: 'Android Mobile',
    };

    const userFiles = memoryLocalFiles.get(uid) || [];
    userFiles.unshift(record);
    memoryLocalFiles.set(uid, userFiles);

    if (isFirestoreAdminReady && db) {
      try {
        await db.collection('files').doc(record.fileId).set(record);
      } catch {}
    }

    res.json({ success: true, record });
  } catch (err) {
    console.error('Record file error:', err);
    res.status(500).json({ error: 'Failed to record backed up file' });
  }
});

// Record backup session history
app.post('/api/backup/history', async (req, res) => {
  try {
    const uid = req.user.uid;
    const session = {
      id: `session_${Date.now()}`,
      userId: uid,
      timestamp: new Date().toISOString(),
      ...req.body,
      device: req.body.device || 'Android Mobile',
    };

    const userHistory = memoryBackupHistory.get(uid) || [];
    userHistory.unshift(session);
    memoryBackupHistory.set(uid, userHistory.slice(0, 50));

    if (isFirestoreAdminReady && db) {
      try {
        await db.collection('users').doc(uid).collection('backup_history').add(session);
      } catch {}
    }

    res.json({ success: true, session });
  } catch (err) {
    console.error('Record history error:', err);
    res.status(500).json({ error: 'Failed to record backup history' });
  }
});

// Get backup history
app.get('/api/backup/history', async (req, res) => {
  try {
    const uid = req.user.uid;
    let history = [];
    if (isFirestoreAdminReady && db) {
      try {
        const snap = await db.collection('users').doc(uid).collection('backup_history').orderBy('timestamp', 'desc').limit(20).get();
        history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch {}
    }
    if (history.length === 0) {
      history = memoryBackupHistory.get(uid) || [];
    }
    res.json({ success: true, history });
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Failed to get backup history' });
  }
});

app.post('/api/s3/presign-download', async (req, res) => {
  try {
    const { key } = req.body;
    if (!ownsKey(key, req.user.uid)) return res.status(403).json({ error: 'Not your file' });
    res.json({ downloadUrl: await generateDownloadPresignedUrl(key) });
  } catch (err) {
    console.error('Download presign error:', err);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

app.post('/api/s3/delete', async (req, res) => {
  try {
    const { key, fileName } = req.body;
    if (key && !ownsKey(key, req.user.uid)) return res.status(403).json({ error: 'Not your file' });

    let deletedFromAws = false;
    if (isAwsConfigured() && key) {
      try {
        await deleteS3Object(key);
        deletedFromAws = true;
      } catch (e) {
        console.warn('AWS delete warning:', e.message);
      }
    }

    // Clean up local memory and disk file if applicable
    const uid = req.user.uid;
    const userFiles = memoryLocalFiles.get(uid) || [];
    const targetName = fileName || (key ? key.split('/').pop().replace(/^\d+-/, '') : null);
    if (targetName) {
      memoryLocalFiles.set(uid, userFiles.filter((f) => f.name !== targetName && f.s3Key !== key));
      const userDir = path.join(localBucketDir, `users_${uid}`);
      if (fs.existsSync(userDir)) {
        const removeFile = (d) => {
          for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, ent.name);
            if (ent.isDirectory()) removeFile(p);
            else if (ent.name === safeName(targetName)) {
              try { fs.unlinkSync(p); } catch {}
            }
          }
        };
        try { removeFile(userDir); } catch {}
      }
    }

    res.json({ success: true, key, deletedFromAws });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete object' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  ensureBucketCors().catch(() => {});
});
