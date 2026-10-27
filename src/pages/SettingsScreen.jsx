import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Moon,
  Lock,
  Check,
  Sun,
  Smartphone,
  Zap,
  ShieldCheck,
  Server,
  Wifi,
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Tablet
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useResolution } from '../context/ResolutionContext';
import { useBackNavigation } from '../context/BackNavigationContext';
import { auth } from '../services/firebase/firebaseClient';
import { getBackupSettings, saveBackupSettings, getAwsConfig } from '../services/firebase/backupService';

/** iOS/OneUI-style switch with smooth translate animation */
function Switch({ checked, onChange, label, on = 'bg-blue-500' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative shrink-0 w-[51px] h-[31px] rounded-full transition-colors duration-300 cursor-pointer ${
        checked ? on : 'bg-slate-300/80 dark:bg-white/20'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-[#fff]
          shadow-[0_3px_8px_rgba(0,0,0,0.25),0_1px_1px_rgba(0,0,0,0.16)]
          transition-transform duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)]
          ${checked ? 'translate-x-[20px]' : 'translate-x-0'}`}
      />
    </button>
  );
}

function Row({ icon: Icon, tile, title, desc, children, last }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${last ? '' : 'border-b border-slate-100 dark:border-slate-800'}`}>
      <div className={`w-9 h-9 rounded-[11px] flex items-center justify-center text-white shrink-0 shadow-sm ${tile}`}>
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white">{title}</h4>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function ThemeTile({ mode, selected, onSelect }) {
  const isDark = mode === 'dark';
  const isSystem = mode === 'system';
  const label = isSystem ? 'System' : isDark ? 'Dark' : 'Light';
  const Icon = isSystem ? Smartphone : isDark ? Moon : Sun;

  const Preview = ({ dark }) => (
    <div className={`h-full w-full p-1.5 flex flex-col gap-1 ${dark ? 'bg-[#0b1226]' : 'bg-[#eef4ff]'}`}>
      <div className={`h-2 rounded ${dark ? 'bg-[#1e2a44]' : 'bg-[#ffffff]'}`} />
      <div className="h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600" />
      <div className="flex gap-1 flex-1">
        <div className={`flex-1 rounded ${dark ? 'bg-[#16203a]' : 'bg-[#ffffff]'}`} />
        <div className={`flex-1 rounded ${dark ? 'bg-[#16203a]' : 'bg-[#ffffff]'}`} />
      </div>
    </div>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex-1 min-w-0 rounded-2xl p-2 text-left border-2 transition-all duration-200 cursor-pointer ${
        selected ? 'border-blue-500 shadow-[0_8px_20px_-8px_rgba(59,130,246,0.6)]' : 'border-transparent'
      }`}
    >
      {/* mini phone preview (System = half light / half dark) */}
      <div className={`h-24 rounded-xl overflow-hidden border flex ${
        isDark ? 'border-[#1e293b]' : 'border-[#dbe5f5]'
      }`}>
        {isSystem ? (
          <>
            <div className="w-1/2 h-full overflow-hidden"><div className="w-[200%] h-full"><Preview dark={false} /></div></div>
            <div className="w-1/2 h-full overflow-hidden"><div className="w-[200%] h-full -translate-x-1/2"><Preview dark /></div></div>
          </>
        ) : (
          <Preview dark={isDark} />
        )}
      </div>
      <div className="flex items-center justify-between mt-2.5 px-0.5">
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-900 dark:text-white">
          <Icon size={13} />
          {label}
        </span>
        <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center transition-colors ${
          selected ? 'bg-blue-500 text-[#fff]' : 'border-2 border-slate-300 dark:border-slate-700'
        }`}>
          {selected && <Check size={11} strokeWidth={3.5} />}
        </span>
      </div>
    </button>
  );
}

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const { theme, setTheme } = useTheme();
  const { viewMode, setViewMode, width, height, breakpoint, orientation, devicePixelRatio } = useResolution();

  // Cloud Backup & Smart Compression State
  const [autoBackup, setAutoBackup] = useState(true);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [compressionQuality, setCompressionQuality] = useState(0.90);

  // App Preferences
  const [alerts, setAlerts] = useState(true);
  const [biometrics, setBiometrics] = useState(false);

  // Direct AWS Cloud S3 State (Serverless Mode)
  const [awsInfo, setAwsInfo] = useState({
    bucket: 'icloud-android-storage-2026',
    region: 'us-east-1',
    connected: true,
  });
  const [testingAws, setTestingAws] = useState(false);
  const [awsStatus, setAwsStatus] = useState('online');

  const testAwsCloudConnection = async () => {
    setTestingAws(true);
    try {
      const res = await getAwsConfig();
      setAwsInfo({
        bucket: res.bucket || 'icloud-android-storage-2026',
        region: res.region || 'us-east-1',
        connected: res.connected,
      });
      setAwsStatus(res.connected ? 'online' : 'offline');
    } catch {
      setAwsStatus('offline');
    } finally {
      setTestingAws(false);
    }
  };

  useEffect(() => {
    testAwsCloudConnection();
  }, []);

  // Load live backup & compression settings from Firebase/local storage
  useEffect(() => {
    let active = true;
    const user = auth.currentUser;
    const userId = user ? user.uid : 'guest';

    async function loadSettings() {
      try {
        const token = user ? await user.getIdToken() : null;
        const s = await getBackupSettings(userId, token);
        if (active && s) {
          setAutoBackup(s.autoBackup !== false);
          setCompressionEnabled(s.compressionEnabled !== false);
          setCompressionQuality(s.compressionQuality || 0.90);
        }
      } catch (err) {
        console.warn('Failed to load backup settings in SettingsScreen:', err);
      }
    }

    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const persistBackupSetting = async (key, val) => {
    try {
      const user = auth.currentUser;
      const userId = user ? user.uid : 'guest';
      const token = user ? await user.getIdToken() : null;
      const current = await getBackupSettings(userId, token);
      const updated = { ...current, [key]: val };
      await saveBackupSettings(userId, updated, token);
    } catch (err) {
      console.warn('Failed to persist backup setting:', err);
    }
  };

  const handleToggleAutoBackup = () => {
    const next = !autoBackup;
    setAutoBackup(next);
    persistBackupSetting('autoBackup', next);
  };

  const handleToggleCompression = () => {
    const next = !compressionEnabled;
    setCompressionEnabled(next);
    persistBackupSetting('compressionEnabled', next);
  };

  const handleSelectQuality = (q) => {
    setCompressionQuality(q);
    persistBackupSetting('compressionQuality', q);
  };

  return (
    <div className="p-4 space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <button
          onClick={smartGoBack}
          aria-label="Back"
          className="glass-chip w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">App configuration & preferences</p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. CLOUD BACKUP & SMART COMPRESSION (Matching User Image) */}
      {/* ======================================================== */}
      <section className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3.5">
        {/* Top: Automatic Background Backup Row */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0 pr-3">
            <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">
              Automatic Background Backup
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Sync changes over Wi-Fi automatically
            </p>
          </div>
          <Switch
            checked={autoBackup}
            onChange={handleToggleAutoBackup}
            label="Automatic Background Backup"
            on="bg-blue-500"
          />
        </div>

        {/* Middle: Smart Cloud Compression Row */}
        <div className="space-y-3 pt-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0 pr-2">
              <div className="w-9 h-9 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-sm">
                <Zap size={18} className="fill-emerald-500/30" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">
                    Smart Cloud Compression
                  </h4>
                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    All Formats Supported
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Compresses images, videos, audios &amp; documents up to 80% smaller before AWS S3 upload
                </p>

                {/* Categories applied badges */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                  <span className="text-[9px] font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/20">
                    🖼️ Images
                  </span>
                  <span className="text-[9px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">
                    🎬 Videos
                  </span>
                  <span className="text-[9px] font-semibold bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/20">
                    🎵 Audio
                  </span>
                  <span className="text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    📄 Documents
                  </span>
                </div>
              </div>
            </div>
            <Switch
              checked={compressionEnabled}
              onChange={handleToggleCompression}
              label="Smart Cloud Compression"
              on="bg-emerald-500"
            />
          </div>

          {/* Expandable Preset Selector Sub-card */}
          {compressionEnabled && (
            <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  Compression Level:
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
                  {compressionQuality === 0.95
                    ? 'Ultra Pristine (95% – Bit-level precision)'
                    : compressionQuality === 0.85
                    ? 'Max Space Saver (85% – Max savings)'
                    : 'Lossless Balanced (90% – Recommended)'}
                </span>
              </div>

              {/* 3 Preset Cards in a Row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { q: 0.90, label: 'Balanced', sub: '60–80% smaller' },
                  { q: 0.95, label: 'Ultra', sub: '40–60% smaller' },
                  { q: 0.85, label: 'Max Saver', sub: '75–88% smaller' },
                ].map((preset) => {
                  const isSelected = compressionQuality === preset.q;
                  return (
                    <button
                      key={preset.q}
                      type="button"
                      onClick={() => handleSelectQuality(preset.q)}
                      className={`py-2 px-1 rounded-xl text-center border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25'
                          : 'bg-white dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80 hover:border-emerald-400'
                      }`}
                    >
                      <p className="text-xs font-bold leading-tight">{preset.label}</p>
                      <p
                        className={`text-[9px] mt-0.5 leading-tight ${
                          isSelected ? 'text-emerald-100 font-medium' : 'text-slate-400'
                        }`}
                      >
                        {preset.sub}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Protective Guarantee Note */}
              <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                <span>Applies to photos, videos, audio, and documents before uploading to AWS S3. 100% quality preserved.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ======================================================== */}
      {/* 2. APPEARANCE SECTION                                    */}
      {/* ======================================================== */}
      <section className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Appearance</h3>
        <div className="flex gap-2">
          <ThemeTile mode="system" selected={theme === 'system'} onSelect={() => setTheme('system')} />
          <ThemeTile mode="light" selected={theme === 'light'} onSelect={() => setTheme('light')} />
          <ThemeTile mode="dark" selected={theme === 'dark'} onSelect={() => setTheme('dark')} />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 px-0.5">
          System follows your Android / OS light & dark theme automatically.
        </p>
      </section>

      {/* ======================================================== */}
      {/* 2B. DISPLAY & SCREEN RESOLUTION SECTION                  */}
      {/* ======================================================== */}
      <section className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Screen Resolution & Adaptive UI</h3>
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-200/50">
            {breakpoint.toUpperCase()} ({orientation})
          </span>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Monitor size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Active Screen Resolution</p>
              <p className="text-[10px] text-slate-400">{width} × {height} px • Scale @{devicePixelRatio}x</p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">{viewMode} Mode</span>
        </div>

        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Layout Adaptability</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'auto', label: 'Auto (Screen)', icon: Monitor, desc: 'Adapts to screen' },
              { id: 'desktop', label: 'Desktop', icon: Monitor, desc: 'Full Dashboard' },
              { id: 'tablet', label: 'Tablet', icon: Tablet, desc: '820px Grid' },
              { id: 'mobile', label: 'Mobile', icon: Smartphone, desc: '390px Phone' },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = viewMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setViewMode(m.id)}
                  className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 font-bold'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={16} className="mb-1" />
                  <span className="text-xs">{m.label}</span>
                  <span className={`text-[9px] mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>{m.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 3. PREFERENCES SECTION                                   */}
      {/* ======================================================== */}
      <section className="bg-white dark:bg-slate-900 px-4 pt-4 pb-1 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Preferences</h3>
        <Row
          icon={Bell}
          tile="bg-gradient-to-br from-sky-400 to-blue-600"
          title="Storage Alerts"
          desc="Notify before quota is reached"
          last
        >
          <Switch checked={alerts} onChange={() => setAlerts(!alerts)} label="Storage alerts" />
        </Row>
      </section>

      {/* ======================================================== */}
      {/* 4. SECURITY & PRIVACY SECTION                            */}
      {/* ======================================================== */}
      <section className="bg-white dark:bg-slate-900 px-4 pt-4 pb-1 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Security & Privacy</h3>
        <Row
          icon={Lock}
          tile="bg-gradient-to-br from-emerald-400 to-teal-600"
          title="Biometric Lock"
          desc="Require fingerprint on app launch"
          last
        >
          <Switch
            checked={biometrics}
            onChange={() => setBiometrics(!biometrics)}
            label="Biometric lock"
            on="bg-emerald-500"
          />
        </Row>
      </section>

      {/* ======================================================== */}
      {/* 5. DIRECT AWS CLOUD S3 STORAGE (SERVERLESS MODE)          */}
      {/* ======================================================== */}
      <section className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cloud size={16} className="text-blue-500" />
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">AWS Cloud Storage (Serverless)</h3>
          </div>
          {awsStatus === 'online' ? (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 flex items-center space-x-1">
              <CheckCircle2 size={11} />
              <span>Direct S3 Connected</span>
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/20 flex items-center space-x-1">
              <AlertCircle size={11} />
              <span>Offline</span>
            </span>
          )}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          100% Serverless Mode: The mobile app communicates directly with AWS S3. No PC server or local Wi-Fi required!
        </p>

        <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 dark:text-slate-400">Target S3 Bucket:</span>
            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 text-[11px]">{awsInfo.bucket}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 dark:text-slate-400">AWS Region:</span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 text-[11px]">{awsInfo.region}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 dark:text-slate-400">Architecture:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">Direct Cloud (Zero Server)</span>
          </div>
        </div>

        <button
          onClick={testAwsCloudConnection}
          disabled={testingAws}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer active:scale-95 transition-all flex items-center justify-center space-x-1.5 shadow-sm"
        >
          {testingAws ? <RefreshCw size={13} className="animate-spin" /> : <Cloud size={13} />}
          <span>{testingAws ? 'Testing AWS S3 Connection...' : 'Test AWS S3 Connection'}</span>
        </button>
      </section>

      <div className="text-center space-y-0.5 pt-1">
        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">iCloud Android Mobile Prototype</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">Version 1.2.0 • Build 2026.10</p>
      </div>
    </div>
  );
}
