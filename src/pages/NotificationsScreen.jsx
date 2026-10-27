import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from '../context/BackNavigationContext';
import { ArrowLeft, Bell, Sparkles } from 'lucide-react';

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();
  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center space-x-3">
        <button onClick={smartGoBack} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm cursor-pointer">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Smart Notifications</h2>
          <p className="text-xs text-slate-500">Storage & AI alerts</p>
        </div>
      </div>

      <div className="space-y-3">
        {[
          { title: 'AI Cleanup Available', desc: 'AI found 2.67 GB of duplicate and unnecessary files.', time: '10m ago', icon: Sparkles },
          { title: 'Backup Completed', desc: 'Successfully synchronized 6.8 GB to AWS S3.', time: '2h ago', icon: Bell },
        ].map((notif, idx) => {
          const Icon = notif.icon;
          return (
            <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 flex space-x-3 shadow-sm">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0"><Icon size={20} /></div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">{notif.title}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">{notif.desc}</p>
                <span className="text-[9px] text-slate-400 mt-1 block">{notif.time}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}