const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client } = require('../config/aws');
const admin = require('firebase-admin');
const db = admin.firestore();

exports.getPresignedUploadUrl = async (req, res) => {
  try {
    const { filename, fileType, fileSize } = req.body;
    const userId = req.user.uid;
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const s3Key = `users/${userId}/${fileId}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // Save initial metadata in Firestore
    await db.collection('files').doc(fileId).set({
      fileId,
      userId,
      originalFilename: filename,
      fileType,
      fileSize,
      s3Key,
      uploadDate: new Date().toISOString(),
      backupStatus: 'completed',
      compressionStatus: 'none',
      isTrash: false,
      notes: '',
    });

    res.status(200).json({ uploadUrl, fileId, s3Key });
  } catch (error) {
    console.error('Presign Upload Error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

exports.getFiles = async (req, res) => {
  try {
    const userId = req.user.uid;
    const snapshot = await db.collection('files').where('userId', '==', userId).where('isTrash', '==', false).get();
    const files = [];
    snapshot.forEach(doc => files.push(doc.data()));
    res.status(200).json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db.collection('files').doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    // Move to trash or mark as trash
    await docRef.update({ isTrash: true, deletedAt: new Date().toISOString() });
    res.status(200).json({ message: 'File moved to trash successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
};