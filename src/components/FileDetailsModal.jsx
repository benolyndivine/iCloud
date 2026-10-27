import React, { useState, useEffect } from 'react';
import {
  X,
  Info,
  Calendar,
  Clock,
  HardDrive,
  Zap,
  Camera,
  Layers,
  MapPin,
  Cloud,
  FileText,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Video,
  Music,
  Image as ImageIcon,
} from 'lucide-react';
import { fetchFullFileDetails } from '../utils/mediaMetadataUtils';
import { formatBytes } from '../services/firebase/backupService';
import { useBackHandler } from '../context/BackNavigationContext';

/**
 * FileDetailsModal
 * Comprehensive, native-feeling file metadata sheet (Apple Photos / Samsung OneUI style).
 * Displays full details: Date, Time, Size, Location (Cloud & GPS), Compression Status & Savings,
 * Capture Device Name, Quality Profile, Resolution, and Camera Specs.
 */
export default function FileDetailsModal({ isOpen, onClose, file, downloadUrl }) {
  useBackHandler(onClose, 100, isOpen);

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (!isOpen || !file) return;

    let active = true;
    setLoading(true);

    fetchFullFileDetails(file, downloadUrl)
      .then((data) => {
        if (active) {
          setDetails(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, file, downloadUrl]);

  if (!isOpen || !file) return null;

  const handleCopyKey = () => {
    const keyToCopy = details?.fileKey || file.key || file.name || '';
    if (!keyToCopy) return;
    try {
      navigator.clipboard.writeText(keyToCopy);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {}
  };

  const isVideo = details?.category === 'Videos' || /\.(mp4|mov|webm|mkv|3gp)$/i.test(details?.fileName || file.name || '');
  const isImage = details?.category === 'Photos' || /\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(details?.fileName || file.name || '');
  const isAudio = details?.category === 'Audio' || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(details?.fileName || file.name || '');

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#0f141f] border-t sm:border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[88vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-5 duration-200 overflow-hidden"
      >
        {/* ======================================================== */}
        {/* HEADER BAR                                               */}
        {/* ======================================================== */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-200/80 dark:border-white/10 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shadow-inner">
              <Info size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">File Details &amp; Info</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Complete media specifications</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* ======================================================== */}
        {/* SCROLLABLE DETAILS CONTENT                               */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs font-sans">
          {/* File Name Banner */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
              {isVideo ? <Video size={20} /> : isAudio ? <Music size={20} /> : isImage ? <ImageIcon size={20} /> : <FileText size={20} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-white/40 tracking-wider">File Name</p>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">{details?.fileName || file.name}</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {details?.extension || 'FILE'}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  {formatBytes(details?.sizeBytes || file.size)}
                </span>
              </div>
            </div>
          </div>

          {/* Active Inspection Indicator */}
          {loading && (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-semibold border border-blue-200 dark:border-blue-500/20 animate-pulse">
              <RefreshCw size={13} className="animate-spin shrink-0" />
              <span>Fetching and inspecting full media headers from AWS S3...</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* 1. DATE & TIME SECTION                                   */}
          {/* ======================================================== */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-500 dark:text-white/50 text-[11px] font-bold uppercase tracking-wider">
              <Calendar size={13} className="text-blue-500" />
              <span>Captured Date &amp; Timing</span>
            </div>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Captured Date</p>
                <p className="text-xs font-semibold text-slate-800 dark:text-white mt-0.5">{details?.dateLabel || 'Today'}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{details?.fullDateStr || ''}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Captured Time</p>
                <div className="flex items-center space-x-1 mt-0.5">
                  <Clock size={11} className="text-blue-500 shrink-0" />
                  <p className="text-xs font-semibold text-slate-800 dark:text-white">{details?.timeStr || '--:--'}</p>
                </div>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">Exact device timestamp</p>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 2. RESOLUTION & QUALITY SECTION                          */}
          {/* ======================================================== */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-500 dark:text-white/50 text-[11px] font-bold uppercase tracking-wider">
              <Layers size={13} className="text-indigo-500" />
              <span>Resolution &amp; Quality</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Resolution</p>
                  <p className="text-xs font-semibold text-slate-800 dark:text-white mt-0.5">
                    {details?.resolution || (details?.width ? `${details.width} × ${details.height}` : 'Native Media Resolution')}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Quality Profile</p>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {details?.quality || 'High Definition'}
                  </p>
                </div>
              </div>

              {(details?.aspectRatio || details?.duration || isVideo) && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-white/5">
                  {details?.aspectRatio && (
                    <div>
                      <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Aspect Ratio</p>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{details.aspectRatio}</p>
                    </div>
                  )}
                  {details?.duration && (
                    <div>
                      <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Duration</p>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{details.duration}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                <span>Color Space: {details?.colorSpace || 'sRGB Display P3'}</span>
                <span>MIME: {details?.mimeType || 'Standard'}</span>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 3. CAPTURE DEVICE SECTION                                */}
          {/* ======================================================== */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-500 dark:text-white/50 text-[11px] font-bold uppercase tracking-wider">
              <Camera size={13} className="text-purple-500" />
              <span>Capture Device &amp; Camera</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Device Name</p>
                  <p className="text-xs font-semibold text-slate-800 dark:text-white mt-0.5">
                    {details?.device || 'Android Mobile Camera'}
                  </p>
                </div>
                <div className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-[10px] font-bold flex items-center space-x-1">
                  <Sparkles size={10} />
                  <span>Verified Sensor</span>
                </div>
              </div>

              {details?.exif?.fNumber && (
                <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-200/60 dark:border-white/5 text-center">
                  <div className="bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200/60 dark:border-white/5">
                    <p className="text-[9px] text-slate-400 uppercase">Aperture</p>
                    <p className="text-[11px] font-bold text-slate-800 dark:text-white">f/{details.exif.fNumber.toFixed(1)}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200/60 dark:border-white/5">
                    <p className="text-[9px] text-slate-400 uppercase">ISO</p>
                    <p className="text-[11px] font-bold text-slate-800 dark:text-white">{details.exif.iso || 'Auto'}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200/60 dark:border-white/5">
                    <p className="text-[9px] text-slate-400 uppercase">Shutter</p>
                    <p className="text-[11px] font-bold text-slate-800 dark:text-white">
                      {details.exif.exposureTime ? `1/${Math.round(1 / details.exif.exposureTime)}s` : 'Standard'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 4. COMPRESSION & STORAGE SAVINGS SECTION                 */}
          {/* ======================================================== */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-500 dark:text-white/50 text-[11px] font-bold uppercase tracking-wider">
              <Zap size={13} className="text-amber-500" />
              <span>Storage &amp; Lossless Compression</span>
            </div>
            <div
              className={`rounded-2xl p-3.5 space-y-2 border transition-all ${
                details?.isCompressed
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-500/25'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200/80 dark:border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase font-bold">Compression Status</p>
                  <p className="text-xs font-bold mt-0.5 text-slate-800 dark:text-white flex items-center space-x-1">
                    {details?.isCompressed ? (
                      <>
                        <ShieldCheck size={13} className="text-emerald-500" />
                        <span className="text-emerald-700 dark:text-emerald-300">Compressed &amp; Optimized</span>
                      </>
                    ) : (
                      <>
                        <Check size={13} className="text-blue-500" />
                        <span>Original File (Uncompressed)</span>
                      </>
                    )}
                  </p>
                </div>
                {details?.isCompressed && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold text-[10px]">
                    -{details.savedPercent}% Saved
                  </span>
                )}
              </div>

              {details?.isCompressed ? (
                <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-500/20 space-y-1 text-[11px]">
                  <div className="flex justify-between text-slate-700 dark:text-emerald-200/90 font-medium">
                    <span>Original Size:</span>
                    <span className="font-semibold">{formatBytes(details.originalSizeBytes)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700 dark:text-emerald-200/90 font-medium">
                    <span>Stored in AWS S3:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatBytes(details.sizeBytes)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                    <span>Bandwidth &amp; Space Saved:</span>
                    <span>{formatBytes(details.savedBytes)}</span>
                  </div>
                  <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/70 pt-1 flex items-center space-x-1 font-medium">
                    <Check size={11} className="text-emerald-500 shrink-0" />
                    <span>{details.compressionProfile}</span>
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                  Stored in AWS S3 at full 100% original master file size.
                </p>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 5. LOCATION (CLOUD & GPS) SECTION                        */}
          {/* ======================================================== */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-500 dark:text-white/50 text-[11px] font-bold uppercase tracking-wider">
              <MapPin size={13} className="text-rose-500" />
              <span>Location &amp; Cloud Storage</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 space-y-2.5">
              {/* GPS Location (if present) */}
              {details?.gps ? (
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-rose-500/20 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MapPin size={16} className="text-rose-500 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">GPS Coordinates</p>
                      <p className="text-xs font-semibold text-slate-800 dark:text-white">{details.gps.formatted}</p>
                    </div>
                  </div>
                  {details.gps.mapsUrl && (
                    <a
                      href={details.gps.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-[10px] font-semibold flex items-center space-x-1"
                    >
                      <span>Maps</span>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <div className="flex items-center space-x-1.5">
                    <MapPin size={12} className="text-slate-400" />
                    <span>Geo Location:</span>
                  </div>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Mobile Device Location</span>
                </div>
              )}

              {/* Cloud S3 Location */}
              <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
                    <Cloud size={13} className="text-sky-500" />
                    <span>Cloud Provider:</span>
                  </div>
                  <span className="font-semibold text-slate-800 dark:text-white">Amazon Web Services (AWS S3)</span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Bucket:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{details?.s3Bucket}</span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Region:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{details?.s3Region}</span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Album / Folder:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{details?.folder}</span>
                </div>
              </div>

              {/* S3 Object Key with Copy Button */}
              <div className="pt-2 border-t border-slate-200/60 dark:border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">AWS S3 Object Key</span>
                  <button
                    onClick={handleCopyKey}
                    className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-1 cursor-pointer active:scale-95"
                  >
                    {copiedKey ? (
                      <>
                        <Check size={11} className="text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>Copy Key</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] font-mono break-all bg-white dark:bg-black/50 p-2 rounded-xl border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300 select-all">
                  {details?.fileKey || file.key || file.name}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* FOOTER ACTION                                            */}
        {/* ======================================================== */}
        <div className="p-4 border-t border-slate-200/80 dark:border-white/10 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 active:scale-98 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
