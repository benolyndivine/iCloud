import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, getBucketName } from './s3Client.js';
import { classify } from './categories.js';

const safeName = (n) =>
  (n || 'file').normalize('NFKC').replace(/[\\/]/g, '_').replace(/[^\w.\- ()\u0080-\uFFFF]/g, '_').slice(-150);

export const ownsKey = (key, userId) =>
  typeof key === 'string' &&
  !key.includes('..') &&
  key.startsWith(`users/${userId}/`);

/** Pre-signed URL so the app uploads straight to S3 (any file type). Key is grouped by category or custom folder. */
export async function generateUploadPresignedUrl(fileName, fileType, userId, customCategory = null, folderName = null) {
  const category = customCategory || classify(fileName, fileType);
  const folderPath = folderName ? `folders/${safeName(folderName)}` : category;
  const key = `users/${userId}/${folderPath}/${Date.now()}-${safeName(fileName)}`;
  const bucket = getBucketName();
  const client = getS3Client();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: fileType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  return { uploadUrl, key, category, folder: folderName || category };
}

export async function generateDownloadPresignedUrl(key) {
  const bucket = getBucketName();
  const client = getS3Client();
  const ext = (key.split('.').pop() || '').toLowerCase();
  const mimeMap = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/mp4', // MPEG-4 container allows Chromium & mobile WebView to hardware decode .mov directly
    mkv: 'video/x-matroska',
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
    pdf: 'application/pdf',
  };

  const commandInput = {
    Bucket: bucket,
    Key: key,
  };

  if (mimeMap[ext]) {
    commandInput.ResponseContentType = mimeMap[ext];
  }

  return getSignedUrl(client, new GetObjectCommand(commandInput), { expiresIn: 86400 });
}

export async function deleteS3Object(key) {
  const bucket = getBucketName();
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { success: true, key };
}
