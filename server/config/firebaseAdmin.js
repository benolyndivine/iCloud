const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Option A: Using environment variables or service account key file path
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    // Alternatively: require('./path-to-serviceAccountKey.json')
  });
}

const db = admin.firestore();
const adminAuth = admin.auth();

module.exports = { admin, db, adminAuth };