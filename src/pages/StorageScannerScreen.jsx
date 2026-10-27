import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { Scan, HardDrive, ArrowLeft, AlertTriangle, FileText } from 'lucide-react';
import { mockStorageData } from '../utils/mockData';

export default function StorageScannerScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(true);

  return (
    <div className="p-4 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Storage Scanner</h2>
          <p className="text-xs text-slate-500">Analyze categories and large files</p>
        </div>
      </div>

      {/* Main Storage Bar Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Total Storage</p>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5">6.8 GB Used / 10 GB</h3>
          </div>
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <HardDrive size={20} />
          </div>
        </div>

        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
          <div style={{ width: '35%' }} className="bg-blue-500 h-full"></div>
          <div style={{ width: '45%' }} className="bg-indigo-500 h-full"></div>
          <div style={{ width: '12%' }} className="bg-purple-500 h-full"></div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="p-3 bg-slate-50 rounded-2xl">
            <p className="text-[11px] text-slate-500">Available Storage</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">3.2 GB Free</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl">
            <p className="text-[11px] text-slate-500">Junk / Dupes</p>
            <p className="text-sm font-bold text-indigo-600 mt-0.5">2.67 GB Found</p>
          </div>
        </div>
      </div>

      {/* Largest Files Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Largest Files Detected</h3>
        <div className="space-y-2">
          {[
            { name: '4K Video.mp4', size: '850 MB', type: 'Video' },
            { name: 'Project_Archive.zip', size: '620 MB', type: 'Archive' },
            { name: 'Vacation_Raw.mov', size: '480 MB', type: 'Video' },
          ].map((file, idx) => (
            <div key={idx} className="bg-white p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold text-xs">
                  <FileText size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{file.name}</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Large file category • {file.type}</p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-xl">{file.size}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Re-scan Button */}
      <button
        onClick={() => { setScanning(true); setTimeout(() => setScanning(false), 1000); }}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center space-x-2 text-sm transition-all"
      >
        <Scan size={18} className={scanning ? 'animate-spin' : ''} />
        <span>{scanning ? 'Scanning Storage...' : 'Rescan Storage'}</span>
      </button>
    </div>
  );
}