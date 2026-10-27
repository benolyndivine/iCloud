import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName, isAwsConfigured } from './s3Client.js';
import { CATEGORIES, classifyKey, formatBytes } from './categories.js';

const GB = 1024 ** 3;

/**
 * Fetch and sync ONLY files that actually exist in the AWS S3 bucket.
 * No dummy or hardcoded files.
 */
export async function syncUserStorageFromS3(userId) {
  const prefix = `users/${userId}/`;
  const files = [];
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, { bytes: 0, count: 0 }]));

  let s3Connected = false;
  let s3Error = null;
  const s3 = getS3Client();
  const bucket = getBucketName();

  if (isAwsConfigured()) {
    try {
      let token;
      do {
        const res = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
        );
        s3Connected = true;
        for (const item of res.Contents || []) {
          if (item.Key.endsWith('/')) continue; // skip folder placeholder
          const size = item.Size || 0;
          const type = classifyKey(item.Key, userId);
          if (totals[type]) {
            totals[type].bytes += size;
            totals[type].count += 1;
          }
          files.push({
            key: item.Key,
            name: item.Key.split('/').pop().replace(/^\d+-/, ''),
            size,
            type,
            category: type,
            folder: item.Key.includes('/folders/') ? item.Key.split('/folders/')[1].split('/')[0] : type,
            lastModified: item.LastModified,
            s3Bucket: bucket,
          });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
    } catch (err) {
      console.warn(`[syncService] S3 query error: ${err.name} - ${err.message}`);
      s3Error = err.message || err.name;
    }
  } else {
    s3Error = 'AWS credentials not configured in .env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME)';
  }

  files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
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
    s3Connected,
    s3Error,
  };

  return { summary, files };
}
