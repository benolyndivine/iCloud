import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cloud,
  CheckCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  Folder,
  FolderPlus,
  Upload,
  Database,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  Trash2,
  History,
  X,
  Plus,
  Key,
  ExternalLink,
  Zap
} from 'lucide-react';
import { auth } from '../services/firebase/firebaseClient';
import {
  getBackupSettings,
  saveBackupSettings,
  getBackupHistory,
  backupFileToAWSAndFirebase,
  recordBackupSession,
  formatBytes,
  CATEGORY_DEFINITIONS,
  getAwsConfig,
  saveAwsConfig,
  syncUserStorage,
} from '../services/firebase/backupService';
import { useBackNavigation, useBackHandler } from '../context/BackNavigationContext';

export default function BackupScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();

  // Settings state
  const [autoBackup, setAutoBackup] = useState(true);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [compressionQuality, setCompressionQuality] = useState(0.90);
  const [categoryToggles, setCategoryToggles] = useState({
    photos: true,
    videos: true,
    docs: true,
    music: true,
  });
  // Only real user-selected device folders (mock folders removed)
  const [customFolders, setCustomFolders] = useState([]);

  // Backup status state
  const [backingUp, setBackingUp] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [lastSynced, setLastSynced] = useState('Ready to sync with AWS S3');
  const [categoryCounts, setCategoryCounts] = useState({
    photos: 0,
    videos: 0,
    docs: 0,
    music: 0,
  });

  // AWS Configuration State
  const [showAwsModal, setShowAwsModal] = useState(false);
  const [awsConfig, setAwsConfig] = useState({
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    region: 'us-east-1',
  });
  const [awsConnected, setAwsConnected] = useState(false);
  const [awsStatusMsg, setAwsStatusMsg] = useState('');
  const [savingAws, setSavingAws] = useState(false);

  // UI state
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderActionTarget, setFolderActionTarget] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [backupHistory, setBackupHistory] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  // Register prioritized back handlers for modals
  useBackHandler(() => setShowAwsModal(false), 90, showAwsModal);
  useBackHandler(() => setShowAddFolderModal(false), 90, showAddFolderModal);
  useBackHandler(() => setShowHistoryModal(false), 90, showHistoryModal);

  // File input refs for Android mobile file pickers
  const photosInputRef = useRef(null);
  const videosInputRef = useRef(null);
  const docsInputRef = useRef(null);
  const musicInputRef = useRef(null);
  const customFolderInputRef = useRef(null);
  const mobileFolderInputRef = useRef(null);
  const mobileFilesFromFolderInputRef = useRef(null);
  const activeCustomFolderRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const loadSettingsAndS3 = useCallback(async (userOverride = null) => {
    const user = userOverride || auth.currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();

      // Check AWS config
      const awsInfo = await getAwsConfig(token);
      if (awsInfo) {
        setAwsConnected(!!awsInfo.connected);
        setAwsConfig((prev) => ({
          ...prev,
          bucketName: awsInfo.bucket || '',
          region: awsInfo.region || 'us-east-1',
        }));
      }

      // Query real files summary directly from AWS S3
      const data = await syncUserStorage(user.uid);
      if (data && data.summary) {
        setCategoryCounts({
          photos: data.summary.categories?.photos?.count || 0,
          videos: data.summary.categories?.videos?.count || 0,
          docs: data.summary.categories?.docs?.count || 0,
          music: data.summary.categories?.music?.count || 0,
        });
        if (data.summary.filesCount > 0) {
          setLastSynced(`Synchronized (${data.summary.totalLabel})`);
        }
      }

      // Load settings from AWS S3 / Local cache
      const settings = await getBackupSettings(user.uid, token);
      if (settings) {
        if (typeof settings.autoBackup === 'boolean') setAutoBackup(settings.autoBackup);
        if (typeof settings.compressionEnabled === 'boolean') setCompressionEnabled(settings.compressionEnabled);
        if (typeof settings.compressionQuality === 'number') setCompressionQuality(settings.compressionQuality);
        if (settings.categories) setCategoryToggles(settings.categories);
        const isMock = (f) =>
          !f ||
          ['whatsapp', 'downloads', 'screenshots'].includes(f.id) ||
          ['/WhatsApp/Media', '/Download', '/Pictures/Screenshots'].includes(f.path) ||
          ['WhatsApp Media', 'Downloads', 'Screenshots'].includes(f.name);
        const cleanFolders = (settings.customFolders || []).filter((f) => !isMock(f));
        setCustomFolders(cleanFolders);
        if (settings.lastSynced && settings.lastSynced !== 'No backup performed yet') {
          setLastSynced(settings.lastSynced);
        }
      }
    } catch (err) {
      console.warn('Could not load AWS / Firebase backup data:', err.message);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadSettingsAndS3(user);
      }
    });

    const handleFocus = () => {
      if (auth.currentUser) loadSettingsAndS3(auth.currentUser);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadSettingsAndS3]);

  const updateSettingsInFirebase = async (
    newAutoBackup,
    newCategories,
    newFolders,
    newCounts,
    newSynced,
    newCompEnabled,
    newCompQuality
  ) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();
      await saveBackupSettings(
        user.uid,
        {
          autoBackup: newAutoBackup ?? autoBackup,
          compressionEnabled: newCompEnabled ?? compressionEnabled,
          compressionQuality: newCompQuality ?? compressionQuality,
          categories: newCategories ?? categoryToggles,
          customFolders: newFolders ?? customFolders,
          categoryCounts: newCounts ?? categoryCounts,
          lastSynced: newSynced ?? lastSynced,
        },
        token
      );
    } catch (err) {
      console.warn('Failed to save settings to Firebase:', err);
    }
  };

  const handleToggleAutoBackup = () => {
    const nextState = !autoBackup;
    setAutoBackup(nextState);
    updateSettingsInFirebase(nextState, null, null, null, null);
    showToast(nextState ? 'Automatic background backup enabled' : 'Automatic background backup paused');
  };

  const handleToggleCategory = (catId) => {
    const nextCategories = {
      ...categoryToggles,
      [catId]: !categoryToggles[catId],
    };
    setCategoryToggles(nextCategories);
    updateSettingsInFirebase(null, nextCategories, null, null, null);
    showToast(`${catId.charAt(0).toUpperCase() + catId.slice(1)} backup ${nextCategories[catId] ? 'enabled' : 'disabled'}`);
  };

  const handleToggleCustomFolder = (folderId) => {
    const nextFolders = customFolders.map((f) =>
      f.id === folderId ? { ...f, enabled: !f.enabled } : f
    );
    setCustomFolders(nextFolders);
    updateSettingsInFirebase(null, null, nextFolders, null, null);
  };

  const handleDeleteCustomFolder = (folderId) => {
    const nextFolders = customFolders.filter((f) => f.id !== folderId);
    setCustomFolders(nextFolders);
    updateSettingsInFirebase(null, null, nextFolders, null, null);
    showToast('Folder removed from backup list');
  };

  // Called when folder/files are picked directly from mobile device
  const handleFolderFromDeviceSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    // Check if triggered for an existing tracked folder
    let targetFolder = activeCustomFolderRef.current;
    activeCustomFolderRef.current = null;

    let detectedName = targetFolder ? targetFolder.name : '';
    if (!detectedName) {
      const firstRel = files[0].webkitRelativePath;
      if (firstRel && firstRel.includes('/')) {
        detectedName = firstRel.split('/')[0];
      } else {
        const defaultName = files.length === 1 ? files[0].name.split('.')[0] : `Mobile_Folder_${new Date().toLocaleDateString('en-CA')}`;
        const promptName = prompt('Enter a name for this mobile folder in AWS S3:', defaultName);
        if (promptName === null) return;
        detectedName = promptName.trim() || defaultName;
      }
    }

    if (!detectedName) detectedName = 'Mobile_Folder';

    // Check if folder exists or create it
    let folder = customFolders.find((f) => f.name.toLowerCase() === detectedName.toLowerCase());
    let isBrandNew = false;
    if (!folder) {
      isBrandNew = true;
      folder = {
        id: `folder_${Date.now()}`,
        name: detectedName,
        path: `/storage/emulated/0/${detectedName}`,
        enabled: true,
        count: 0,
        size: '0 B',
        syncedFiles: {},
        lastBackup: new Date().toISOString(),
      };
      const updated = [...customFolders, folder];
      setCustomFolders(updated);
      await updateSettingsInFirebase(null, null, updated, null, null);
    }

    // Auto-detect newly added files (skip files already backed up to AWS S3)
    const syncedMap = folder.syncedFiles || {};
    const newFiles = files.filter((file) => {
      const sig = `${file.name}:${file.size}`;
      return !syncedMap[sig];
    });

    if (!isBrandNew && newFiles.length === 0) {
      showToast(`All ${files.length} file(s) in "${folder.name}" are already up to date in AWS S3!`);
      return;
    }

    if (!isBrandNew && newFiles.length < files.length) {
      showToast(`Detected ${newFiles.length} new file(s) in "${folder.name}". Uploading to AWS S3...`);
    } else {
      showToast(`Adding "${folder.name}" with ${newFiles.length} file(s) to AWS S3 auto-backup...`);
    }

    await handleFilesSelected({ target: { files: newFiles, value: '' } }, 'custom', folder);
  };

  const handleOpenHistory = async () => {
    setShowHistoryModal(true);
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        const history = await getBackupHistory(user.uid, token);
        setBackupHistory(history);
      } catch (err) {
        console.warn('Failed to load history:', err);
      }
    }
  };

  const handleSaveAwsConfig = async () => {
    const user = auth.currentUser;
    if (!user) {
      showToast('Please log in first');
      return;
    }
    setSavingAws(true);
    setAwsStatusMsg('Connecting to AWS S3 bucket...');
    try {
      const token = await user.getIdToken();
      const res = await saveAwsConfig(awsConfig, token);
      if (res.connected) {
        setAwsConnected(true);
        setAwsStatusMsg('Successfully connected to AWS S3 bucket!');
        showToast(`Connected to AWS S3 bucket: ${awsConfig.bucketName}`);
        setTimeout(() => setShowAwsModal(false), 1200);
        loadSettingsAndS3();
      } else {
        setAwsConnected(false);
        setAwsStatusMsg(res.error || 'Connection failed. Verify AWS credentials and permissions.');
      }
    } catch (err) {
      setAwsStatusMsg(`Error: ${err.message}`);
    } finally {
      setSavingAws(false);
    }
  };

  // Trigger file / media picker on Android mobile device for a specific category
  const handleTriggerPicker = (categoryId) => {
    if (!categoryToggles[categoryId]) {
      showToast(`Please enable ${categoryId} backup switch first`);
      return;
    }
    let inputEl = null;
    if (categoryId === 'photos') inputEl = photosInputRef.current;
    if (categoryId === 'videos') inputEl = videosInputRef.current;
    if (categoryId === 'docs') inputEl = docsInputRef.current;
    if (categoryId === 'music') inputEl = musicInputRef.current;

    if (inputEl) {
      inputEl.click();
    }
  };

  // Trigger folder picker for custom folder on mobile
  const handleTriggerCustomFolderPicker = (folder) => {
    if (!folder.enabled) {
      showToast(`Please enable "${folder.name}" switch first`);
      return;
    }
    activeCustomFolderRef.current = folder;
    if (customFolderInputRef.current) {
      customFolderInputRef.current.click();
    }
  };

  // Process selected files from Android device: upload to AWS S3 & record in Firebase Database
  const handleFilesSelected = async (e, category, customFolder = null) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const user = auth.currentUser;
    if (!user) {
      showToast('Please sign in to back up to AWS');
      navigate('/login');
      return;
    }

    setBackingUp(true);
    const sectionName = customFolder ? customFolder.name : category;
    setActiveSection(sectionName);
    setUploadProgress(0);

    let uploadedCount = 0;
    let totalBytesUploaded = 0;
    let totalBytesSaved = 0;
    let uploadErrors = [];

    try {
      const token = await user.getIdToken();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileName(`Preparing: ${file.name}...`);

        try {
          const res = await backupFileToAWSAndFirebase({
            file,
            category,
            folder: customFolder ? customFolder.name : category,
            userId: user.uid,
            token,
            enableCompression: compressionEnabled,
            compressionQuality,
            onStatus: (msg) => setCurrentFileName(msg),
            onProgress: (p) => {
              const overall = Math.round(((i + p / 100) / files.length) * 100);
              setUploadProgress(overall);
            },
          });
          uploadedCount++;
          const finalSize = res?.size || file.size;
          totalBytesUploaded += finalSize;
          if (res?.savedBytes > 0) {
            totalBytesSaved += res.savedBytes;
          }
        } catch (fileErr) {
          console.error(`Failed to upload ${file.name} to AWS:`, fileErr);
          uploadErrors.push(`${file.name}: ${fileErr.message}`);
        }
      }

      if (uploadedCount > 0) {
        const timeStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date());
        let nextCounts = { ...categoryCounts };
        let nextFolders = [...customFolders];

        if (customFolder) {
          nextFolders = customFolders.map((f) => {
            if (f.id === customFolder.id || f.name.toLowerCase() === customFolder.name.toLowerCase()) {
              const mergedSynced = { ...(f.syncedFiles || {}) };
              for (const file of files.slice(0, uploadedCount)) {
                mergedSynced[`${file.name}:${file.size}`] = {
                  uploadedAt: new Date().toISOString(),
                  size: file.size,
                };
              }
              const totalBytes = Object.values(mergedSynced).reduce((sum, item) => sum + (item.size || 0), 0);
              return {
                ...f,
                syncedFiles: mergedSynced,
                count: Object.keys(mergedSynced).length,
                size: formatBytes(totalBytes),
                lastBackup: new Date().toISOString(),
              };
            }
            return f;
          });
          setCustomFolders(nextFolders);
        } else if (category && nextCounts[category] !== undefined) {
          nextCounts[category] = (nextCounts[category] || 0) + uploadedCount;
          setCategoryCounts(nextCounts);
        }

        const formattedSynced =
          totalBytesSaved > 0
            ? `Today, ${timeStr} (${formatBytes(totalBytesUploaded)} in AWS • saved ${formatBytes(totalBytesSaved)})`
            : `Today, ${timeStr} (${formatBytes(totalBytesUploaded)} backed up to AWS S3)`;
        setLastSynced(formattedSynced);

        await recordBackupSession(
          user.uid,
          {
            totalFiles: uploadedCount,
            totalBytes: totalBytesUploaded,
            totalSavedBytes: totalBytesSaved,
            categories: [customFolder ? customFolder.name : category],
          },
          token
        );

        await updateSettingsInFirebase(null, null, nextFolders, nextCounts, formattedSynced);
        if (totalBytesSaved > 0) {
          showToast(
            `Successfully backed up ${uploadedCount} file(s) to AWS S3! (Saved ${formatBytes(totalBytesSaved)} with lossless compression)`
          );
        } else {
          showToast(`Successfully backed up ${uploadedCount} file(s) to AWS S3!`);
        }
      }

      if (uploadErrors.length > 0) {
        const firstErr = uploadErrors[0];
        alert(`AWS S3 Backup Note:\n${firstErr}\n\nMake sure your AWS S3 credentials are configured in the top "AWS S3" settings button.`);
      }
    } catch (err) {
      console.error('Backup error:', err);
      showToast(`Backup error: ${err.message}`);
    } finally {
      setBackingUp(false);
      setActiveSection(null);
      setUploadProgress(0);
      setCurrentFileName('');
    }
  };

  // Main "Backup Now" handler: syncs storage and records in Firebase
  const handleBackupNow = async () => {
    const user = auth.currentUser;
    if (!user) {
      showToast('Please sign in to sync with AWS S3');
      return;
    }

    setBackingUp(true);
    setActiveSection('all');
    setUploadProgress(20);

    try {
      setUploadProgress(50);
      const data = await syncUserStorage(user.uid);
      setUploadProgress(85);
      const timeStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date());

      if (data && data.summary) {
        const totalSize = data.summary.totalLabel;
        const count = data.summary.filesCount;
        setCategoryCounts({
          photos: data.summary.categories?.photos?.count || 0,
          videos: data.summary.categories?.videos?.count || 0,
          docs: data.summary.categories?.docs?.count || 0,
          music: data.summary.categories?.music?.count || 0,
        });

        const formattedSynced = `Today, ${timeStr} (${totalSize} in AWS S3)`;
        setLastSynced(formattedSynced);

        await updateSettingsInFirebase(null, null, null, null, formattedSynced);
        setUploadProgress(100);
        showToast(`Synchronized ${count} files (${totalSize}) from AWS S3!`);
      } else {
        throw new Error(data.error || 'Failed to sync with AWS');
      }
    } catch (err) {
      console.warn('Sync notice:', err.message);
      showToast('Could not query AWS S3. Tap "AWS Keys" to configure bucket.');
    } finally {
      setTimeout(() => {
        setBackingUp(false);
        setActiveSection(null);
        setUploadProgress(0);
      }, 500);
    }
  };

  const standardItemsCount = Object.keys(categoryCounts).reduce((acc, cat) => {
    return acc + (categoryToggles[cat] ? categoryCounts[cat] || 0 : 0);
  }, 0);
  const customItemsCount = customFolders.reduce((acc, f) => {
    return acc + (f.enabled ? f.count || 0 : 0);
  }, 0);
  const totalItemsCount = (standardItemsCount + customItemsCount).toLocaleString();

  const getCategoryIcon = (catId) => {
    switch (catId) {
      case 'photos':
        return <ImageIcon size={18} className="text-sky-400" />;
      case 'videos':
        return <Video size={18} className="text-indigo-400" />;
      case 'docs':
        return <FileText size={18} className="text-emerald-400" />;
      case 'music':
        return <Mic size={18} className="text-pink-400" />;
      default:
        return <Folder size={18} className="text-blue-400" />;
    }
  };

  return (
    <div className="p-4 space-y-5 pb-28 select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700/60 text-xs font-medium flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hidden File Inputs for Mobile Android File & Folder Pickers */}
      <input
        ref={photosInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e, 'photos')}
      />
      <input
        ref={videosInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e, 'videos')}
      />
      <input
        ref={docsInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.epub,.md"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e, 'docs')}
      />
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e, 'music')}
      />
      {/* Custom Folder Multi-File Selection from Android device */}
      <input
        ref={customFolderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e, 'custom', activeCustomFolderRef.current)}
      />
      {/* Direct Mobile Folder (Directory) Picker */}
      <input
        ref={mobileFolderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderFromDeviceSelected}
      />
      {/* Direct Mobile Multi-Files Picker */}
      <input
        ref={mobileFilesFromFolderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderFromDeviceSelected}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={smartGoBack}
            className="p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cloud Backup</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Secure automated synchronization &amp; backup</p>
          </div>
        </div>

        {/* AWS S3 Keys & History Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAwsModal(true)}
            title="Configure AWS S3 Credentials"
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
          >
            <Key size={13} />
            <span>AWS Keys</span>
          </button>
          <button
            onClick={handleOpenHistory}
            title="View Backup History"
            className="p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
          >
            <History size={16} />
          </button>
        </div>
      </div>

      {/* Blue Gradient Status Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl p-5 shadow-xl shadow-blue-500/20 space-y-4 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex justify-between items-center relative z-10">
          <div>
            <div className="flex items-center space-x-1.5">
              <p className="text-blue-100 text-xs font-medium">Backup Status</p>
              <span
                className={`w-2 h-2 rounded-full ${awsConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
                title={awsConnected ? 'AWS S3 Connected' : 'AWS S3 Pending Credentials'}
              />
            </div>
            <h3 className="text-xl font-bold mt-0.5 flex items-center">
              {backingUp ? (
                <>
                  <RefreshCw size={20} className="mr-1.5 animate-spin text-amber-300" />
                  <span>Syncing... {uploadProgress > 0 ? `${uploadProgress}%` : ''}</span>
                </>
              ) : !autoBackup && Object.values(categoryToggles).every((v) => !v) ? (
                <>
                  <AlertCircle size={20} className="mr-1.5 text-slate-300" />
                  <span>Backup Paused</span>
                </>
              ) : (
                <>
                  <CheckCircle size={20} className="mr-1.5 text-emerald-300" />
                  <span>{awsConnected ? 'Active' : 'Ready'}</span>
                </>
              )}
            </h3>
          </div>
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md shadow-inner">
            <Cloud size={24} className="text-white" />
          </div>
        </div>

        {backingUp && (
          <div className="bg-white/15 backdrop-blur-md p-3 rounded-2xl space-y-2">
            <div className="flex justify-between text-[11px] font-semibold text-blue-100">
              <span className="truncate max-w-[200px]">
                {currentFileName ? `Uploading: ${currentFileName}` : `Backing up ${activeSection}...`}
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl space-y-1">
          <p className="text-[11px] text-blue-100">Last Successful Backup:</p>
          <p className="text-xs font-bold">{lastSynced}</p>
        </div>

        <button
          onClick={handleBackupNow}
          disabled={backingUp}
          className="w-full bg-white hover:bg-slate-50 active:scale-[0.98] disabled:opacity-75 text-blue-600 font-bold py-3.5 rounded-2xl shadow-lg text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          <RefreshCw size={16} className={backingUp ? 'animate-spin' : ''} />
          <span>{backingUp ? 'Syncing with AWS S3...' : 'Backup Now'}</span>
        </button>
      </div>

      {/* Settings & Categories Card */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
        {/* Master Automatic Background Backup Switch */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Automatic Background Backup</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Sync changes over Wi-Fi automatically</p>
          </div>
          <button
            onClick={handleToggleAutoBackup}
            className="text-blue-600 dark:text-blue-400 cursor-pointer transition-transform active:scale-95"
            aria-label="Toggle Automatic Background Backup"
          >
            {autoBackup ? (
              <ToggleRight size={34} className="text-blue-600 dark:text-blue-500" />
            ) : (
              <ToggleLeft size={34} className="text-slate-300 dark:text-slate-600" />
            )}
          </button>
        </div>

        {/* Standard Categories Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Included Categories ({totalItemsCount} files in AWS)
          </p>
          <button
            onClick={() => navigate('/files')}
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center space-x-1"
          >
            <span>View Files</span>
            <ExternalLink size={12} />
          </button>
        </div>

        {/* Standard Categories List */}
        <div className="space-y-2.5">
          {CATEGORY_DEFINITIONS.map((item) => {
            const isEnabled = categoryToggles[item.id] !== false;
            const count = categoryCounts[item.id] || 0;
            const isSectionBackingUp = backingUp && activeSection === item.id;

            return (
              <div
                key={item.id}
                className={`flex flex-col p-3 rounded-2xl border transition-all ${
                  isEnabled
                    ? 'bg-slate-50 dark:bg-slate-900/80 border-slate-200/60 dark:border-slate-800'
                    : 'bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm shrink-0">
                      {getCategoryIcon(item.id)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {item.label}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{item.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {/* Status Badge */}
                    {isSectionBackingUp ? (
                      <span className="text-[10px] bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900 flex items-center space-x-1">
                        <RefreshCw size={10} className="animate-spin" />
                        <span>Syncing</span>
                      </span>
                    ) : isEnabled ? (
                      <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900">
                        {count > 0 ? `Synced (${count} files)` : '0 files'}
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 font-medium px-2 py-0.5 rounded-md">
                        Disabled
                      </span>
                    )}

                    {/* Button to Backup this specific section from Android mobile device */}
                    <button
                      onClick={() => handleTriggerPicker(item.id)}
                      disabled={!isEnabled || backingUp}
                      title={`Select and backup ${item.label} from mobile to AWS S3`}
                      className="p-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <Upload size={14} />
                    </button>

                    {/* Individual ON / OFF Toggle Switch */}
                    <button
                      onClick={() => handleToggleCategory(item.id)}
                      className="text-blue-600 dark:text-blue-400 cursor-pointer transition-transform active:scale-95"
                      aria-label={`Toggle ${item.label}`}
                    >
                      {isEnabled ? (
                        <ToggleRight size={28} className="text-blue-600 dark:text-blue-500" />
                      ) : (
                        <ToggleLeft size={28} className="text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                  </div>
                </div>

                {isSectionBackingUp && (
                  <div className="mt-2.5 w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Custom Android Folders Section */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Device Folders</p>
              <p className="text-[10px] text-slate-400 truncate">Select mobile folders to auto-backup to AWS</p>
            </div>
            <button
              onClick={() => setShowAddFolderModal(true)}
              className="shrink-0 inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 px-3 py-1.5 rounded-full shadow-md shadow-blue-500/25 transition-all cursor-pointer whitespace-nowrap"
            >
              <FolderPlus size={13} className="shrink-0" />
              <span>Add Folder</span>
            </button>
          </div>

          <div className="space-y-2">
            {customFolders.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <FolderPlus size={20} />
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">No device folders added yet</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Select a folder from your mobile storage. It will be added here and any new files inside will automatically back up to AWS S3.
                </p>
                <button
                  onClick={() => setShowAddFolderModal(true)}
                  className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-full shadow-md shadow-blue-500/25 cursor-pointer active:scale-95 transition-all inline-flex items-center space-x-1.5 whitespace-nowrap"
                >
                  <FolderPlus size={14} className="shrink-0" />
                  <span>Select Mobile Folder</span>
                </button>
              </div>
            ) : (
              customFolders.map((folder) => {
                const isFolderBackingUp = backingUp && activeSection === folder.name;

                return (
                  <div
                    key={folder.id}
                    className={`flex flex-col p-2.5 rounded-2xl border transition-all ${
                      folder.enabled
                        ? 'bg-slate-50 dark:bg-slate-900/70 border-slate-200/50 dark:border-slate-800 shadow-sm'
                        : 'bg-slate-50/40 dark:bg-slate-900/20 border-dashed border-slate-200 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0 shadow-sm">
                          <Folder size={17} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {folder.name}
                            </p>
                            <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                              Auto-Sync
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {folder.lastBackup
                              ? `Last synced: ${new Date(folder.lastBackup).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              : folder.path}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {folder.enabled ? (
                          <span className="text-[10px] bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-900">
                            {folder.count || 0} files ({folder.size || '0 B'})
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 font-medium px-2 py-0.5 rounded-md">
                            Disabled
                          </span>
                        )}

                        {/* Select & Backup Folder Files */}
                        <button
                          onClick={() => setFolderActionTarget(folder)}
                          disabled={!folder.enabled || backingUp}
                          title={`Check for new files in "${folder.name}" & auto-backup to AWS S3`}
                          className="p-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <Upload size={13} />
                        </button>

                        {/* Toggle Switch */}
                        <button
                          onClick={() => handleToggleCustomFolder(folder.id)}
                          className="text-blue-600 dark:text-blue-400 cursor-pointer transition-transform active:scale-95"
                          aria-label={`Toggle auto-backup for ${folder.name}`}
                        >
                          {folder.enabled ? (
                            <ToggleRight size={26} className="text-blue-600 dark:text-blue-500" />
                          ) : (
                            <ToggleLeft size={26} className="text-slate-300 dark:text-slate-600" />
                          )}
                        </button>

                        <button
                          onClick={() => handleDeleteCustomFolder(folder.id)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="Remove from auto-backup"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {isFolderBackingUp && (
                      <div className="mt-2 w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Database & Cloud Architecture Status Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center space-x-1.5">
            <Database size={13} className="text-amber-500" />
            <span>Firebase Database: <strong className="text-slate-700 dark:text-slate-300">Managed</strong></span>
          </div>
          <button
            onClick={() => setShowAwsModal(true)}
            className="flex items-center space-x-1.5 hover:text-blue-600 cursor-pointer"
          >
            <Cloud size={13} className={awsConnected ? 'text-blue-500' : 'text-amber-500'} />
            <span>AWS S3: <strong className="text-slate-700 dark:text-slate-300">{awsConnected ? 'Connected' : 'Configure'}</strong></span>
          </button>
        </div>
      </div>

      {/* AWS S3 Configuration Modal */}
      {showAwsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl border border-slate-100 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Cloud size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">AWS S3 Storage Settings</h3>
              </div>
              <button
                onClick={() => setShowAwsModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Enter your AWS S3 bucket details so mobile backups upload directly to your AWS S3 storage.
            </p>

            {awsStatusMsg && (
              <div className={`p-2.5 rounded-xl text-[11px] font-medium border ${awsConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                {awsStatusMsg}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  AWS S3 Bucket Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. my-icloud-storage-bucket"
                  value={awsConfig.bucketName}
                  onChange={(e) => setAwsConfig({ ...awsConfig, bucketName: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  AWS Region
                </label>
                <input
                  type="text"
                  placeholder="e.g. us-east-1"
                  value={awsConfig.region}
                  onChange={(e) => setAwsConfig({ ...awsConfig, region: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  AWS Access Key ID
                </label>
                <input
                  type="text"
                  placeholder="AKIA..."
                  value={awsConfig.accessKeyId}
                  onChange={(e) => setAwsConfig({ ...awsConfig, accessKeyId: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  AWS Secret Access Key
                </label>
                <input
                  type="password"
                  placeholder="Secret key..."
                  value={awsConfig.secretAccessKey}
                  onChange={(e) => setAwsConfig({ ...awsConfig, secretAccessKey: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setShowAwsModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleSaveAwsConfig}
                disabled={savingAws || !awsConfig.bucketName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md cursor-pointer flex items-center justify-center space-x-1"
              >
                {savingAws && <RefreshCw size={13} className="animate-spin" />}
                <span>{savingAws ? 'Connecting...' : 'Save & Connect'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select Device Folder Modal */}
      {showAddFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <FolderPlus size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Select Mobile Folder</h3>
              </div>
              <button
                onClick={() => setShowAddFolderModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Pick a folder or files from your mobile storage. The folder will be automatically created and backed up to AWS S3.
            </p>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Folder Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Camera, WhatsApp, Documents..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2.5">
              {/* Option 1: Pick an entire folder */}
              <button
                onClick={() => {
                  if (newFolderName.trim()) {
                    activeCustomFolderRef.current = { name: newFolderName.trim() };
                  }
                  setShowAddFolderModal(false);
                  setNewFolderName('');
                  if (mobileFolderInputRef.current) mobileFolderInputRef.current.click();
                }}
                className="w-full p-3.5 rounded-2xl bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 border border-blue-200/60 dark:border-blue-900/60 flex items-center space-x-3 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                  <Folder size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Select Entire Folder</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Browse and pick a folder directly from your device
                  </p>
                </div>
              </button>

              {/* Option 2: Pick files from any folder */}
              <button
                onClick={() => {
                  if (newFolderName.trim()) {
                    activeCustomFolderRef.current = { name: newFolderName.trim() };
                  }
                  setShowAddFolderModal(false);
                  setNewFolderName('');
                  if (mobileFilesFromFolderInputRef.current) mobileFilesFromFolderInputRef.current.click();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-700/80 flex items-center space-x-3 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Upload size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Select Files from Device</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Select multiple files from your mobile storage
                  </p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowAddFolderModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Folder Sync / Add New Files Action Modal */}
      {folderActionTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Folder size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {folderActionTarget.name}
                </h3>
              </div>
              <button
                onClick={() => setFolderActionTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {folderActionTarget.count || 0} files backed up ({folderActionTarget.size || '0 B'}). Select files or re-scan folder — already backed up files are automatically skipped!
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => {
                  const target = folderActionTarget;
                  setFolderActionTarget(null);
                  activeCustomFolderRef.current = target;
                  if (mobileFilesFromFolderInputRef.current) mobileFilesFromFolderInputRef.current.click();
                }}
                className="w-full p-3.5 rounded-2xl bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 border border-blue-200/60 dark:border-blue-900/60 flex items-center space-x-3 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                  <Upload size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Add New Files</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Select new files added to mobile to backup into this folder
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  const target = folderActionTarget;
                  setFolderActionTarget(null);
                  activeCustomFolderRef.current = target;
                  if (mobileFolderInputRef.current) mobileFolderInputRef.current.click();
                }}
                className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-700/80 flex items-center space-x-3 text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Folder size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Re-scan Entire Folder</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Pick folder to auto-detect any newly added files
                  </p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setFolderActionTarget(null)}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Backup History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl border border-slate-100 dark:border-slate-700 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <History size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Backup History</h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {backupHistory.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <Database size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  No backup sessions recorded yet.
                </div>
              ) : (
                backupHistory.map((session, idx) => (
                  <div
                    key={session.id || idx}
                    className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {session.device || 'Android Device'}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded font-medium">
                        Completed
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{session.totalFiles} files backed up</span>
                      <span>
                        {session.timestamp
                          ? new Date(session.timestamp).toLocaleDateString() +
                            ' ' +
                            new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Recent'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowHistoryModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
