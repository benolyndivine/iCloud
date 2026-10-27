import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { ArrowLeft, QrCode, Copy, Shield } from 'lucide-react';

export default function QrShareScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const { fileId } = useParams();

  return (
    <div className="p-4 space-y-5 pb-24 text-center">
      <div className="flex items-center space-x-3 text-left">
        <button onClick={smartGoBack} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900">QR Code Sharing</h2>
          <p className="text-xs text-slate-500">Secure cross-platform file transfer</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 max-w-xs mx-auto">
        <div className="w-48 h-48 bg-slate-900 text-white rounded-2xl mx-auto flex flex-col items-center justify-center space-y-2 shadow-inner">
          <QrCode size={110} />
          <span className="text-[10px] text-slate-400">Secure Token Active</span>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900">Vacation_Capture.jpg</h4>
          <p className="text-[10px] text-slate-400 mt-0.5">Scan with Android or iOS camera to download</p>
        </div>
        <button onClick={() => alert('Link copied to clipboard!')} className="w-full bg-blue-600 text-white text-xs font-semibold py-3 rounded-xl flex items-center justify-center space-x-1.5 shadow-md shadow-blue-200">
          <Copy size={14} />
          <span>Copy Secure Link</span>
        </button>
      </div>
    </div>
  );
}