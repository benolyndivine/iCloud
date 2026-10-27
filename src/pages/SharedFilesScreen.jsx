import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { ArrowLeft, Share2, XCircle } from 'lucide-react';

export default function SharedFilesScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Active Shared Links</h2>
          <p className="text-xs text-slate-500">Manage permissions & revoke links</p>
        </div>
      </div>

      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center"><Share2 size={20} /></div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Project_Final_{i}.pdf</h4>
                <p className="text-[10px] text-slate-400">Expires in 2 days • 14 downloads</p>
              </div>
            </div>
            <button onClick={() => alert('Link revoked!')} className="text-red-600 p-2"><XCircle size={18} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}