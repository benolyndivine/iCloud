import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { ArrowLeft, Minimize2, Check } from 'lucide-react';

export default function CompressionScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const [quality, setQuality] = useState('High');

  return (
    <div className="p-4 space-y-5 pb-24">
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900">File Compression</h2>
          <p className="text-xs text-slate-500">Reduce file size while preserving quality</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
            <Minimize2 size={24} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Vacation_Raw.mov</h4>
            <p className="text-xs text-slate-400">Original Size: <span className="font-semibold text-slate-700">480 MB</span></p>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="text-xs font-semibold text-slate-600">Compression Quality</label>
          <div className="grid grid-cols-3 gap-2">
            {['High', 'Balanced', 'Maximum'].map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  quality === q ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-200' : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-2xl space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Estimated Compressed Size:</span>
            <span className="font-bold text-purple-600">310 MB</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Space Saved:</span>
            <span className="font-bold text-emerald-600">170 MB (35%)</span>
          </div>
        </div>

        <button onClick={() => alert('Compression completed successfully!')} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg shadow-purple-200 text-sm">
          Compress File Now
        </button>
      </div>
    </div>
  );
}