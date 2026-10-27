import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Trash2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Copy,
  Image as ImageIcon,
  FileText,
  AlertTriangle,
  RefreshCw,
  Eye,
  Check,
  ShieldCheck,
  Zap,
  Info,
  Clock,
  Layers,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useResolution } from '../context/ResolutionContext';
import { runAiCleanupScan, moveItemsToTrash } from '../services/aiCleanupService';
import { formatBytes } from '../services/firebase/backupService';
import SmartImage from '../components/SmartImage';
import { useBackNavigation, useBackHandler } from '../context/BackNavigationContext';

export default function AiCleanupScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;
  const { isDesktop } = useResolution();

  // Scanning State
  const [isScanning, setIsScanning] = useState(true);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState('Initializing AI Neural Scan...');

  // Detection Results
  const [scanResults, setScanResults] = useState({
    items: [],
    categories: {
      duplicates: [],
      blurry: [],
      junk: [],
      suggestions: [],
    },
    totalBytes: 0,
    totalLabel: '0 B',
    totalCount: 0,
    healthScore: 85,
  });

  // Selected item IDs for deletion
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Category expansion states for reviewing files
  const [expandedCategories, setExpandedCategories] = useState({
    duplicates: false,
    blurry: false,
    junk: false,
    suggestions: false,
  });

  // Modal / Toast Notification State
  const [cleanModal, setCleanModal] = useState(null); // { count, bytesFreedLabel }
  const [isCleaning, setIsCleaning] = useState(false);

  // Prioritized Back Handlers for Android Back Button & Escape
  useBackHandler(() => setCleanModal(null), 90, Boolean(cleanModal));
  useBackHandler(
    () => setExpandedCategories({ duplicates: false, blurry: false, junk: false, suggestions: false }),
    40,
    Object.values(expandedCategories).some(Boolean)
  );

  // Run the automatic AI Scan
  const executeScan = useCallback(async () => {
    setIsScanning(true);
    setScanProgress(5);
    setScanStage('Initializing AI Neural Scanner...');

    try {
      const results = await runAiCleanupScan(userId, ({ percent, stage }) => {
        setScanProgress(percent);
        setScanStage(stage);
      });

      setScanResults(results);

      // By default, select all detected junk and duplicates for instant 1-click convenience
      const initialSelected = new Set();
      results.items.forEach((item) => {
        // Automatically check duplicates, blurry, and junk by default
        if (item.category === 'duplicates' || item.category === 'blurry' || item.category === 'junk') {
          initialSelected.add(item.id);
        }
      });
      setSelectedIds(initialSelected);
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  }, [userId]);

  // Automatic scan on mount
  useEffect(() => {
    executeScan();
  }, [executeScan]);

  // Toggle individual item
  const toggleItem = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle all items in a category
  const toggleCategory = (categoryKey) => {
    const categoryItems = scanResults.categories[categoryKey] || [];
    const allCategoryIds = categoryItems.map((i) => i.id);
    const areAllSelected = allCategoryIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (areAllSelected) {
        allCategoryIds.forEach((id) => next.delete(id));
      } else {
        allCategoryIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Toggle category expansion
  const toggleExpand = (categoryKey) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  };

  // Computed size of currently selected items
  const selectedStats = useMemo(() => {
    let bytes = 0;
    let count = 0;
    scanResults.items.forEach((item) => {
      if (selectedIds.has(item.id)) {
        bytes += item.size || 0;
        count++;
      }
    });
    return {
      bytes,
      label: formatBytes(bytes),
      count,
    };
  }, [scanResults.items, selectedIds]);

  // Category total sizes
  const categoryStats = useMemo(() => {
    const calc = (items) => {
      const bytes = (items || []).reduce((acc, curr) => acc + (curr.size || 0), 0);
      return {
        bytes,
        label: formatBytes(bytes),
        count: (items || []).length,
      };
    };

    return {
      duplicates: calc(scanResults.categories.duplicates),
      blurry: calc(scanResults.categories.blurry),
      junk: calc(scanResults.categories.junk),
      suggestions: calc(scanResults.categories.suggestions),
    };
  }, [scanResults.categories]);

  // Execute Move to Trash Action
  const handleCleanSelected = async () => {
    if (selectedStats.count === 0) return;

    setIsCleaning(true);
    const itemsToClean = scanResults.items.filter((item) => selectedIds.has(item.id));

    try {
      const result = await moveItemsToTrash(userId, itemsToClean);

      // Remove cleaned items from local state
      const cleanedIds = new Set(itemsToClean.map((i) => i.id));
      const remainingItems = scanResults.items.filter((i) => !cleanedIds.has(i.id));

      const updatedCategories = {
        duplicates: remainingItems.filter((i) => i.category === 'duplicates'),
        blurry: remainingItems.filter((i) => i.category === 'blurry'),
        junk: remainingItems.filter((i) => i.category === 'junk'),
        suggestions: remainingItems.filter((i) => i.category === 'suggestions'),
      };

      const remainingBytes = remainingItems.reduce((acc, curr) => acc + (curr.size || 0), 0);

      setScanResults({
        items: remainingItems,
        categories: updatedCategories,
        totalBytes: remainingBytes,
        totalLabel: formatBytes(remainingBytes),
        totalCount: remainingItems.length,
        healthScore: Math.min(100, scanResults.healthScore + 18),
      });

      setSelectedIds(new Set());
      setCleanModal({
        count: result.count,
        bytesFreedLabel: result.bytesFreedLabel,
      });
    } catch (err) {
      console.error('Clean error:', err);
      alert('Failed to move items to trash. Please try again.');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6 pb-28 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={smartGoBack}
            className="p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Go back"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                AI Cleanup Studio
              </h2>
              <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 flex items-center space-x-1">
                <Sparkles size={11} />
                <span>AI Active</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automatic neural detection for duplicates, blurry photos, and junk files
            </p>
          </div>
        </div>

        <button
          onClick={executeScan}
          disabled={isScanning}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          title="Run AI scan again"
        >
          <RefreshCw size={14} className={isScanning ? 'animate-spin text-blue-500' : 'text-slate-500'} />
          <span className="hidden sm:inline">{isScanning ? 'Scanning…' : 'Rescan with AI'}</span>
        </button>
      </div>

      {/* AI Scanning Progress State (When scan is active) */}
      {isScanning && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-blue-200/70 dark:border-blue-900/50 shadow-lg shadow-blue-500/10 space-y-3.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Sparkles size={20} className="animate-spin" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>AI Neural Engine Scanning</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-extrabold">{scanProgress}%</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 animate-pulse">{scanStage}</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{scanProgress}%</span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${scanProgress}%` }}
              className="bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 h-full rounded-full transition-all duration-300"
            />
          </div>
        </div>
      )}

      {/* Potential Storage Recovery Card (Matches Screenshot & Live Reactive) */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/25 relative overflow-hidden space-y-3.5">
        <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-6 -top-6 w-36 h-36 bg-sky-400/20 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <span className="text-xs font-bold text-blue-100 uppercase tracking-wider">
            POTENTIAL STORAGE RECOVERY
          </span>
          <div className="flex items-center space-x-1.5 bg-white/15 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-semibold text-sky-200">
            <ShieldCheck size={13} />
            <span>AI Verified</span>
          </div>
        </div>

        <div className="relative z-10">
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight leading-none">
            {scanResults.totalCount === 0 ? '0 B Cleaned' : `${scanResults.totalLabel} Available`}
          </h3>
          <p className="text-xs text-blue-100/90 leading-relaxed mt-2 max-w-xl">
            {scanResults.totalCount === 0
              ? 'Your cloud storage is fully optimized! No duplicate files, blurry images, or redundant junk detected.'
              : 'Safe deletion & cloud offloading recommendations verified with computer vision and hash matching.'}
          </p>
        </div>

        {/* Quick Diagnostic Pill Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 relative z-10">
          <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-2xl text-center">
            <p className="text-[10px] text-blue-200 uppercase font-semibold">Duplicates</p>
            <p className="text-xs font-bold mt-0.5">{categoryStats.duplicates.label}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-2xl text-center">
            <p className="text-[10px] text-blue-200 uppercase font-semibold">Blurry Photos</p>
            <p className="text-xs font-bold mt-0.5">{categoryStats.blurry.label}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-2xl text-center">
            <p className="text-[10px] text-blue-200 uppercase font-semibold">Junk & Cache</p>
            <p className="text-xs font-bold mt-0.5">{categoryStats.junk.label}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-2xl text-center">
            <p className="text-[10px] text-blue-200 uppercase font-semibold">AI Suggestions</p>
            <p className="text-xs font-bold mt-0.5">{categoryStats.suggestions.label}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          AI RECOMMENDATIONS ({scanResults.totalCount} ITEMS)
        </h3>
        {scanResults.totalCount > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedStats.count} of {scanResults.totalCount} selected ({selectedStats.label})
          </span>
        )}
      </div>

      {/* 4 Category AI Recommendation Cards */}
      <div className="space-y-4">
        {/* ======================================================== */}
        {/* 1. DUPLICATE IMAGES DETECTED                             */}
        {/* ======================================================== */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/80 shadow-sm overflow-hidden transition-all">
          <div className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3.5 min-w-0">
              <input
                type="checkbox"
                aria-label="Select all duplicates"
                checked={
                  categoryStats.duplicates.count > 0 &&
                  scanResults.categories.duplicates.every((i) => selectedIds.has(i.id))
                }
                onChange={() => toggleCategory('duplicates')}
                disabled={categoryStats.duplicates.count === 0}
                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-900 cursor-pointer"
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Duplicate Images Detected
                  </h4>
                  <span className="text-[9px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-200/50">
                    Hash Matched
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {categoryStats.duplicates.count === 0
                    ? 'No duplicate photos found in cloud repository.'
                    : `Found ${categoryStats.duplicates.count} duplicate photos consuming ${categoryStats.duplicates.label} of storage.`}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-black bg-blue-50 dark:bg-slate-900 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-xl border border-blue-100 dark:border-slate-700 shadow-sm">
                {categoryStats.duplicates.label}
              </span>
            </div>
          </div>

          {/* Review Files Accordion Toggle */}
          {categoryStats.duplicates.count > 0 && (
            <div className="px-4 pb-3.5 sm:px-5 flex justify-end border-t border-slate-50 dark:border-slate-700/60 pt-2.5">
              <button
                onClick={() => toggleExpand('duplicates')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1 hover:underline cursor-pointer"
              >
                <span>{expandedCategories.duplicates ? 'Hide Preview' : 'Review Files'}</span>
                {expandedCategories.duplicates ? <ChevronUp size={14} /> : <ArrowRight size={14} />}
              </button>
            </div>
          )}

          {/* Expanded Files Review Gallery */}
          {expandedCategories.duplicates && categoryStats.duplicates.count > 0 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/80 space-y-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Compare Original vs. Duplicate Copy
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {scanResults.categories.duplicates.map((dup) => {
                  const isChecked = selectedIds.has(dup.id);
                  return (
                    <div
                      key={dup.id}
                      onClick={() => toggleItem(dup.id)}
                      className={`p-3 rounded-2xl bg-white dark:bg-slate-800 border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                        isChecked
                          ? 'border-blue-500 shadow-sm bg-blue-50/20 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {dup.downloadUrl ? (
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 shrink-0 border relative">
                            <SmartImage src={dup.downloadUrl} alt={dup.name} className="w-full h-full object-cover" />
                            <span className="absolute bottom-1 right-1 text-[8px] bg-red-600 text-white font-bold px-1 rounded">
                              Copy
                            </span>
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-slate-900 text-blue-600 flex items-center justify-center shrink-0">
                            <Copy size={22} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={dup.name}>
                            {dup.name}
                          </h5>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {dup.sizeLabel} • {dup.aiConfidence}% match
                          </p>
                          <p className="text-[9px] text-blue-500 truncate mt-0.5">
                            Original: {dup.originalName || 'Stored photo'}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-blue-600 pointer-events-none"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                        {dup.reason}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 2. BLURRY & LOW QUALITY IMAGES                           */}
        {/* ======================================================== */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/80 shadow-sm overflow-hidden transition-all">
          <div className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3.5 min-w-0">
              <input
                type="checkbox"
                aria-label="Select all blurry images"
                checked={
                  categoryStats.blurry.count > 0 &&
                  scanResults.categories.blurry.every((i) => selectedIds.has(i.id))
                }
                onChange={() => toggleCategory('blurry')}
                disabled={categoryStats.blurry.count === 0}
                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-900 cursor-pointer"
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Blurry Images Detected
                  </h4>
                  <span className="text-[9px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200/50">
                    CV Edge Detection
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {categoryStats.blurry.count === 0
                    ? 'No blurry or motion-degraded photos found.'
                    : `Found ${categoryStats.blurry.count} photos with motion blur, camera shake, or low edge sharpness (${categoryStats.blurry.label}).`}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-black bg-amber-50 dark:bg-slate-900 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-xl border border-amber-100 dark:border-slate-700 shadow-sm">
                {categoryStats.blurry.label}
              </span>
            </div>
          </div>

          {/* Review Files Accordion Toggle */}
          {categoryStats.blurry.count > 0 && (
            <div className="px-4 pb-3.5 sm:px-5 flex justify-end border-t border-slate-50 dark:border-slate-700/60 pt-2.5">
              <button
                onClick={() => toggleExpand('blurry')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1 hover:underline cursor-pointer"
              >
                <span>{expandedCategories.blurry ? 'Hide Preview' : 'Review Files'}</span>
                {expandedCategories.blurry ? <ChevronUp size={14} /> : <ArrowRight size={14} />}
              </button>
            </div>
          )}

          {/* Expanded Blurry Preview Grid */}
          {expandedCategories.blurry && categoryStats.blurry.count > 0 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/80 space-y-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Blur Analysis & Sharpness Scores
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {scanResults.categories.blurry.map((blur) => {
                  const isChecked = selectedIds.has(blur.id);
                  return (
                    <div
                      key={blur.id}
                      onClick={() => toggleItem(blur.id)}
                      className={`p-3 rounded-2xl bg-white dark:bg-slate-800 border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                        isChecked
                          ? 'border-amber-500 shadow-sm bg-amber-50/20 dark:bg-amber-950/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {blur.downloadUrl ? (
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-950 shrink-0 border relative">
                            <SmartImage src={blur.downloadUrl} alt={blur.name} className="w-full h-full object-cover filter blur-[1px]" />
                            <span className="absolute bottom-1 right-1 text-[8px] bg-amber-600 text-white font-bold px-1 rounded">
                              Blur
                            </span>
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-amber-50 dark:bg-slate-900 text-amber-600 flex items-center justify-center shrink-0">
                            <AlertTriangle size={22} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={blur.name}>
                            {blur.name}
                          </h5>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {blur.sizeLabel} • Sharpness: {blur.sharpnessScore || 14}/100
                          </p>
                          <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold">
                            Motion blur / camera shake
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-blue-600 pointer-events-none"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                        {blur.reason}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 3. JUNK & TEMPORARY CACHE FILES                          */}
        {/* ======================================================== */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/80 shadow-sm overflow-hidden transition-all">
          <div className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3.5 min-w-0">
              <input
                type="checkbox"
                aria-label="Select all junk files"
                checked={
                  categoryStats.junk.count > 0 &&
                  scanResults.categories.junk.every((i) => selectedIds.has(i.id))
                }
                onChange={() => toggleCategory('junk')}
                disabled={categoryStats.junk.count === 0}
                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-900 cursor-pointer"
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Junk Files Detected
                  </h4>
                  <span className="text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200/50">
                    Safe to Delete
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {categoryStats.junk.count === 0
                    ? 'No temporary cache or broken downloads found.'
                    : `Found ${categoryStats.junk.count} residual cache files, logs, and corrupt downloads (${categoryStats.junk.label}).`}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-black bg-emerald-50 dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-slate-700 shadow-sm">
                {categoryStats.junk.label}
              </span>
            </div>
          </div>

          {/* Review Files Accordion Toggle */}
          {categoryStats.junk.count > 0 && (
            <div className="px-4 pb-3.5 sm:px-5 flex justify-end border-t border-slate-50 dark:border-slate-700/60 pt-2.5">
              <button
                onClick={() => toggleExpand('junk')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1 hover:underline cursor-pointer"
              >
                <span>{expandedCategories.junk ? 'Hide Preview' : 'Review Files'}</span>
                {expandedCategories.junk ? <ChevronUp size={14} /> : <ArrowRight size={14} />}
              </button>
            </div>
          )}

          {/* Expanded Junk Files Review */}
          {expandedCategories.junk && categoryStats.junk.count > 0 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/80 space-y-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Temporary Logs & Cache Signatures
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {scanResults.categories.junk.map((j) => {
                  const isChecked = selectedIds.has(j.id);
                  return (
                    <div
                      key={j.id}
                      onClick={() => toggleItem(j.id)}
                      className={`p-3 rounded-2xl bg-white dark:bg-slate-800 border transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'border-emerald-500 shadow-sm bg-emerald-50/20 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-500 flex items-center justify-center shrink-0">
                          <FileText size={18} />
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={j.name}>
                            {j.name}
                          </h5>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {j.sizeLabel} • {j.reason}
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-blue-600 pointer-events-none ml-2 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 4. AI SUGGESTIONS TO DELETE                              */}
        {/* ======================================================== */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/80 shadow-sm overflow-hidden transition-all">
          <div className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3.5 min-w-0">
              <input
                type="checkbox"
                aria-label="Select all AI suggestions"
                checked={
                  categoryStats.suggestions.count > 0 &&
                  scanResults.categories.suggestions.every((i) => selectedIds.has(i.id))
                }
                onChange={() => toggleCategory('suggestions')}
                disabled={categoryStats.suggestions.count === 0}
                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-900 cursor-pointer"
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    AI Suggestions to Delete
                  </h4>
                  <span className="text-[9px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full border border-purple-200/50">
                    Smart Heuristics
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {categoryStats.suggestions.count === 0
                    ? 'No obsolete screenshots or unused large archives.'
                    : `Old ephemeral screenshots (>60 days), heavy screen recordings, and untouched archives (${categoryStats.suggestions.label}).`}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-black bg-purple-50 dark:bg-slate-900 text-purple-600 dark:text-purple-400 px-3 py-1.5 rounded-xl border border-purple-100 dark:border-slate-700 shadow-sm">
                {categoryStats.suggestions.label}
              </span>
            </div>
          </div>

          {/* Review Files Accordion Toggle */}
          {categoryStats.suggestions.count > 0 && (
            <div className="px-4 pb-3.5 sm:px-5 flex justify-end border-t border-slate-50 dark:border-slate-700/60 pt-2.5">
              <button
                onClick={() => toggleExpand('suggestions')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1 hover:underline cursor-pointer"
              >
                <span>{expandedCategories.suggestions ? 'Hide Preview' : 'Review Files'}</span>
                {expandedCategories.suggestions ? <ChevronUp size={14} /> : <ArrowRight size={14} />}
              </button>
            </div>
          )}

          {/* Expanded AI Suggestions Review */}
          {expandedCategories.suggestions && categoryStats.suggestions.count > 0 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/80 space-y-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Ephemeral Content & Large Unused Media
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {scanResults.categories.suggestions.map((sugg) => {
                  const isChecked = selectedIds.has(sugg.id);
                  return (
                    <div
                      key={sugg.id}
                      onClick={() => toggleItem(sugg.id)}
                      className={`p-3 rounded-2xl bg-white dark:bg-slate-800 border transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'border-purple-500 shadow-sm bg-purple-50/20 dark:bg-purple-950/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                          {sugg.type === 'videos' ? <Layers size={18} /> : <ImageIcon size={18} />}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={sugg.name}>
                            {sugg.name}
                          </h5>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {sugg.sizeLabel} • {sugg.reason}
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-blue-600 pointer-events-none ml-2 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating / Pinned Action Bar: Clean Selected Items */}
      <div className="pt-2 pb-4">
        <button
          onClick={handleCleanSelected}
          disabled={selectedStats.count === 0 || isCleaning}
          className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 active:scale-[0.98] disabled:opacity-50 text-white font-extrabold py-4 px-5 rounded-2xl shadow-xl shadow-blue-500/25 flex items-center justify-center space-x-2.5 transition-all text-sm cursor-pointer"
        >
          {isCleaning ? (
            <>
              <RefreshCw size={17} className="animate-spin text-white" />
              <span>Moving Items to Trash…</span>
            </>
          ) : (
            <>
              <Trash2 size={17} />
              <span>
                {selectedStats.count > 0
                  ? `Clean Selected Items (${selectedStats.label} • ${selectedStats.count} items)`
                  : 'Select Items to Clean'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Success Modal / Toast Dialog */}
      {cleanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={32} />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Space Successfully Cleaned!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Recovered <span className="font-extrabold text-blue-600 dark:text-blue-400">{cleanModal.bytesFreedLabel}</span> across {cleanModal.count} items.
              </p>
              <p className="text-[11px] text-slate-400 pt-1">
                Moved to your Trash Bin. You can restore them anytime within 30 days.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setCleanModal(null)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setCleanModal(null);
                  navigate('/trash');
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                View in Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
