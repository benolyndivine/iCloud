const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const fileRoutes = require('./routes/fileRoutes');
const aiRoutes = require('./routes/aiRoutes');
const shareRoutes = require('./routes/shareRoutes');
const backupRoutes = require('./routes/backupRoutes');
const storageRoutes = require('./routes/storageRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

// API Routes
app.use('/api/files', fileRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/storage', storageRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`iCloud Backend Server running on port ${PORT}`);
});