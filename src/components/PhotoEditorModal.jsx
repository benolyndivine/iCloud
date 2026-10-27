import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  RotateCw,
  FlipHorizontal,
  Sliders,
  Sparkles,
  Crop,
  RefreshCw,
  Download,
  UploadCloud,
  Undo2
} from 'lucide-react';
import { directUploadFileToS3, safeFileName } from '../services/aws/directS3Service';
import { useBackHandler } from '../context/BackNavigationContext';

const FILTER_PRESETS = [
  { id: 'normal', name: 'Original', filter: 'none' },
  { id: 'vivid', name: 'Vivid', filter: 'contrast(120%) saturate(135%)' },
  { id: 'warm', name: 'Warm', filter: 'sepia(25%) saturate(115%) hue-rotate(-10deg)' },
  { id: 'cool', name: 'Cool', filter: 'saturate(95%) hue-rotate(15deg) contrast(105%)' },
  { id: 'mono', name: 'B&W', filter: 'grayscale(100%) contrast(115%)' },
  { id: 'vintage', name: 'Vintage', filter: 'sepia(40%) contrast(95%) brightness(105%)' },
  { id: 'dramatic', name: 'Dramatic', filter: 'contrast(135%) brightness(95%) saturate(110%)' },
];

export default function PhotoEditorModal({
  isOpen,
  onClose,
  file,
  imageUrl,
  userUid,
  onSaveSuccess,
  showToast = () => {},
}) {
  useBackHandler(onClose, 100, isOpen);

  const [activeTab, setActiveTab] = useState('crop'); // 'crop' | 'filters' | 'adjust'
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('normal');
  const [brightness, setBrightness] = useState(0); // -50 to 50
  const [contrast, setContrast] = useState(0);     // -50 to 50
  const [saturation, setSaturation] = useState(0); // -50 to 50
  const [saving, setSaving] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setFlipped(false);
      setSelectedFilter('normal');
      setBrightness(0);
      setContrast(0);
      setSaturation(0);
      setSaving(false);
    }
  }, [isOpen]);

  if (!isOpen || !file) return null;

  const rawName = file.name || file.key?.split('/').pop() || 'photo.jpg';
  const cleanName = rawName.replace(/^\d+-/, '');

  // Compute CSS filter string
  const getFilterString = () => {
    const preset = FILTER_PRESETS.find((p) => p.id === selectedFilter);
    const presetStr = preset && preset.filter !== 'none' ? preset.filter : '';
    const bStr = brightness !== 0 ? `brightness(${1 + brightness / 100})` : '';
    const cStr = contrast !== 0 ? `contrast(${1 + contrast / 100})` : '';
    const sStr = saturation !== 0 ? `saturate(${1 + saturation / 100})` : '';
    return [presetStr, bStr, cStr, sStr].filter(Boolean).join(' ') || 'none';
  };

  const handleReset = () => {
    setRotation(0);
    setFlipped(false);
    setSelectedFilter('normal');
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleFlip = () => {
    setFlipped((prev) => !prev);
  };

  // Render canvas & save edited image
  const handleSave = async (saveMode = 'cloud') => {
    if (!imageUrl || saving) return;
    setSaving(true);
    showToast('Rendering edited photo...');

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image source for editing'));
        img.src = imageUrl;
      });

      const isRotated90or270 = rotation % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
      canvas.height = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize canvas context');

      // Apply transformations
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipped ? -1 : 1, 1);

      // Apply CSS filter directly to canvas context
      const filterStr = getFilterString();
      if (filterStr && filterStr !== 'none') {
        ctx.filter = filterStr;
      }

      ctx.drawImage(
        img,
        -img.naturalWidth / 2,
        -img.naturalHeight / 2,
        img.naturalWidth,
        img.naturalHeight
      );
      ctx.restore();

      // Convert to high-quality JPEG Blob
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });

      if (!blob) throw new Error('Failed to encode image blob');

      const editedFileName = `edited-${cleanName.replace(/\.[^/.]+$/, '')}.jpg`;

      if (saveMode === 'download') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = editedFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Saved edited photo to device!');
        setSaving(false);
        onClose();
        return;
      }

      // Upload directly to AWS S3
      if (!userUid) {
        throw new Error('User not authenticated for cloud storage');
      }

      showToast('Saving edited photo to AWS S3...');
      const editedFileObj = new File([blob], editedFileName, { type: 'image/jpeg' });
      const targetFolder = file.folder || 'photos';

      const uploadRes = await directUploadFileToS3({
        file: editedFileObj,
        userId: userUid,
        category: 'photos',
        folder: targetFolder,
      });

      showToast('Edited photo saved to AWS S3!');

      if (onSaveSuccess) {
        onSaveSuccess({
          key: uploadRes.key,
          name: editedFileName,
          size: blob.size,
          type: 'photos',
          category: 'photos',
          folder: targetFolder,
          lastModified: new Date().toISOString(),
          s3Bucket: uploadRes.s3Bucket,
        });
      }

      onClose();
    } catch (err) {
      console.error('Error saving edited photo:', err);
      showToast(err.message || 'Failed to save edited photo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex flex-col justify-between animate-in fade-in duration-200 select-none"
    >
      {/* Top Header */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}
        className="w-full px-4 pb-3 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md z-10"
      >
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white px-2 py-1 text-xs font-semibold cursor-pointer active:scale-95"
        >
          Cancel
        </button>

        <div className="text-center">
          <h3 className="text-xs font-bold text-white tracking-wide">Photo Editor</h3>
          <p className="text-[10px] text-white/50 truncate max-w-[160px]">{cleanName}</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            title="Reset All Adjustments"
            className="text-white/60 hover:text-white p-1 rounded-lg cursor-pointer active:scale-95 transition-colors"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={() => handleSave('cloud')}
            disabled={saving}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center space-x-1.5 active:scale-95 transition-all"
          >
            {saving ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Preview Canvas Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-1 w-full flex items-center justify-center p-4 relative overflow-hidden"
      >
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          <img
            src={imageUrl}
            alt={cleanName}
            style={{
              transform: `rotate(${rotation}deg) scaleX(${flipped ? -1 : 1})`,
              filter: getFilterString(),
              transition: 'transform 0.25s ease, filter 0.15s ease',
              maxHeight: '60vh',
              maxWidth: '90vw',
            }}
            className="object-contain rounded-xl shadow-2xl pointer-events-none select-none"
          />
        </div>
      </div>

      {/* Bottom Editing Controls Drawer */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)' }}
        className="w-full bg-slate-900/90 backdrop-blur-2xl border-t border-white/10 px-4 pt-3 space-y-3 z-10"
      >
        {/* Dynamic Panel Content based on Active Tab */}
        <div className="min-h-[70px] flex items-center justify-center">
          {activeTab === 'crop' && (
            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={handleRotate}
                className="flex flex-col items-center justify-center space-y-1 p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 cursor-pointer text-white transition-all w-20"
              >
                <RotateCw size={18} className="text-blue-400" />
                <span className="text-[10px] font-semibold">Rotate 90°</span>
                <span className="text-[8px] text-white/50">{rotation}°</span>
              </button>

              <button
                onClick={handleFlip}
                className={`flex flex-col items-center justify-center space-y-1 p-2.5 rounded-2xl active:scale-95 cursor-pointer transition-all w-20 ${
                  flipped ? 'bg-purple-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <FlipHorizontal size={18} className="text-purple-400" />
                <span className="text-[10px] font-semibold">Flip</span>
                <span className="text-[8px] text-white/50">{flipped ? 'Mirrored' : 'Normal'}</span>
              </button>

              <button
                onClick={() => handleSave('download')}
                disabled={saving}
                className="flex flex-col items-center justify-center space-y-1 p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 cursor-pointer text-white transition-all w-20"
              >
                <Download size={18} className="text-emerald-400" />
                <span className="text-[10px] font-semibold">Download</span>
                <span className="text-[8px] text-white/50">Local File</span>
              </button>
            </div>
          )}

          {activeTab === 'filters' && (
            <div className="w-full overflow-x-auto flex items-center space-x-2 py-1 px-1 scrollbar-none">
              {FILTER_PRESETS.map((p) => {
                const isSelected = selectedFilter === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedFilter(p.id)}
                    className={`shrink-0 flex flex-col items-center p-2 rounded-2xl border cursor-pointer active:scale-95 transition-all ${
                      isSelected
                        ? 'bg-blue-600/30 border-blue-400 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div
                      style={{ filter: p.filter }}
                      className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-white/10 mb-1"
                    >
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[9px] font-semibold">{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'adjust' && (
            <div className="w-full max-w-sm mx-auto space-y-2">
              {/* Brightness */}
              <div className="flex items-center space-x-2 text-[10px] text-white/80">
                <span className="w-16 font-semibold">Brightness</span>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="w-8 text-right font-mono text-[9px]">{brightness > 0 ? `+${brightness}` : brightness}</span>
              </div>

              {/* Contrast */}
              <div className="flex items-center space-x-2 text-[10px] text-white/80">
                <span className="w-16 font-semibold">Contrast</span>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="w-8 text-right font-mono text-[9px]">{contrast > 0 ? `+${contrast}` : contrast}</span>
              </div>

              {/* Saturation */}
              <div className="flex items-center space-x-2 text-[10px] text-white/80">
                <span className="w-16 font-semibold">Saturation</span>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={saturation}
                  onChange={(e) => setSaturation(Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="w-8 text-right font-mono text-[9px]">{saturation > 0 ? `+${saturation}` : saturation}</span>
              </div>
            </div>
          )}
        </div>

        {/* Primary Tool Switcher Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 max-w-xs mx-auto">
          {[
            { id: 'crop', label: 'Rotate & Flip', icon: RotateCw },
            { id: 'filters', label: 'Filters', icon: Sparkles },
            { id: 'adjust', label: 'Adjust', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-1.5 rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer text-xs font-semibold transition-all ${
                  isTabActive
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={13} />
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
