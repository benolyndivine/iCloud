import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// verifyIdToken only needs the project id (it fetches Google's public keys),
// so no service-account secret has to be stored on AWS.
if (!getApps().length) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}

export async function verifyFirebaseToken(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  try {
    req.user = await getAuth().verifyIdToken(header.split(' ')[1]);
    next();
  } catch (err) {
    console.error('Token verification failed:', err.code || err.message);
    res.status(403).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

// Users may only touch objects under their own prefix.
export const assertOwnsKey = (uid, key) =>
  typeof key === 'string' && key.startsWith(`users/${uid}/`) && !key.includes('..');