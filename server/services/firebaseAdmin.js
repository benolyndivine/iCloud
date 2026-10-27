import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(root, 'serviceAccountKey.json');
const projectId = process.env.FIREBASE_PROJECT_ID || 'icloud-8bc82';

const hasServiceAccount = fs.existsSync(keyPath);

function init() {
  if (hasServiceAccount) {
    try {
      return initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
    } catch (e) {
      console.warn('[firebaseAdmin] Error reading serviceAccountKey.json:', e.message);
    }
  }
  console.log(`[firebaseAdmin] Token verification enabled for project "${projectId}" (service account: ${hasServiceAccount})`);
  return initializeApp({ projectId });
}

const app = getApps()[0] || init();

export const adminAuth = getAuth(app);
// Only initialize Firestore Admin if real service account key is available,
// otherwise gRPC will crash the Node server with NO_ADC_FOUND.
export const db = hasServiceAccount ? getFirestore(app) : null;
export const isFirestoreAdminReady = hasServiceAccount;
