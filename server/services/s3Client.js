import 'dotenv/config';
import { S3Client, HeadBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

let currentBucket = process.env.AWS_S3_BUCKET_NAME || 'your-icloud-bucket-name';
let currentRegion = process.env.AWS_REGION || 'us-east-1';

function createClient() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  return new S3Client({
    region,
    ...(accessKeyId && secretAccessKey && accessKeyId !== 'your_aws_access_key'
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

export let s3Client = createClient();
export let BUCKET_NAME = currentBucket;

export function getS3Client() {
  return s3Client;
}

export function getBucketName() {
  return BUCKET_NAME;
}

export function isAwsConfigured() {
  const key = process.env.AWS_ACCESS_KEY_ID || '';
  const bucket = process.env.AWS_S3_BUCKET_NAME || '';
  return (
    key.length > 5 &&
    key !== 'your_aws_access_key' &&
    bucket.length > 2 &&
    bucket !== 'your-icloud-bucket-name'
  );
}

export async function ensureBucketCors() {
  if (!isAwsConfigured()) return;
  try {
    const command = new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag', 'Content-Range', 'Accept-Ranges', 'Content-Length'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    });
    await s3Client.send(command);
    console.log(`[s3Client] CORS rules verified for bucket: ${BUCKET_NAME}`);
  } catch (err) {
    console.warn('[s3Client] Note on S3 CORS check:', err.message);
  }
}

export async function testAwsConnection() {
  if (!isAwsConfigured()) {
    return {
      connected: false,
      error: 'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET_NAME.',
      bucket: BUCKET_NAME,
      region: currentRegion,
    };
  }
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    ensureBucketCors().catch(() => {});
    return { connected: true, bucket: BUCKET_NAME, region: currentRegion };
  } catch (err) {
    return {
      connected: false,
      error: err.message || err.name,
      bucket: BUCKET_NAME,
      region: currentRegion,
    };
  }
}

export function updateS3Credentials({ accessKeyId, secretAccessKey, bucketName, region = 'us-east-1' }) {
  if (accessKeyId) process.env.AWS_ACCESS_KEY_ID = accessKeyId.trim();
  if (secretAccessKey) process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey.trim();
  if (bucketName) process.env.AWS_S3_BUCKET_NAME = bucketName.trim();
  if (region) process.env.AWS_REGION = region.trim();

  currentBucket = process.env.AWS_S3_BUCKET_NAME;
  currentRegion = process.env.AWS_REGION;
  BUCKET_NAME = currentBucket;
  s3Client = createClient();

  // Persist to .env file
  try {
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/^AWS_ACCESS_KEY_ID=.*$/m, `AWS_ACCESS_KEY_ID=${process.env.AWS_ACCESS_KEY_ID}`);
      content = content.replace(/^AWS_SECRET_ACCESS_KEY=.*$/m, `AWS_SECRET_ACCESS_KEY=${process.env.AWS_SECRET_ACCESS_KEY}`);
      content = content.replace(/^AWS_S3_BUCKET_NAME=.*$/m, `AWS_S3_BUCKET_NAME=${process.env.AWS_S3_BUCKET_NAME}`);
      content = content.replace(/^AWS_REGION=.*$/m, `AWS_REGION=${process.env.AWS_REGION}`);
      fs.writeFileSync(envPath, content, 'utf8');
    }
  } catch (err) {
    console.warn('Failed to update .env:', err.message);
  }

  return { success: true, bucket: BUCKET_NAME, region: currentRegion };
}
