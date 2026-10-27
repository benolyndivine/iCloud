import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { Search, ArrowLeft, FileText } from 'lucide-react';

export default function SearchScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  const [query, setQuery] = useState('project');

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files by name, type..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search Results</h4>
        {['project.pdf', 'project-final.docx', 'project.zip'].map((file, idx) => (
          <div key={idx} onClick={() => navigate('/preview/file_123')} className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><FileText size={16} /></div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">{file}</h4>
                <p className="text-[10px] text-slate-400">Match found in Documents</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}