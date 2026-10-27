import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { ArrowLeft, FileText, MoreVertical } from 'lucide-react';

export default function FolderViewScreen() {
  const { folderName } = useParams();
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900 capitalize">{folderName}</h2>
          <p className="text-xs text-slate-500">Browsing cloud repository</p>
        </div>
      </div>

      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((item) => (
          <div key={item} onClick={() => navigate('/preview/file_123')} className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <FileText size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 capitalize">{folderName}_item_{item}.dat</h4>
                <p className="text-[10px] text-slate-400">4.2 MB • Oct 2026</p>
              </div>
            </div>
            <button className="p-2 text-slate-400"><MoreVertical size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}