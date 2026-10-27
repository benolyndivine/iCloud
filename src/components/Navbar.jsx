import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Folder, Sparkles, Cloud } from 'lucide-react';

/** iOS liquid-glass floating tab bar — anchored cleanly inside the device frame. */
export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Home', path: '/home', icon: Home },
    { label: 'Files', path: '/files', icon: Folder },
    { label: 'Cleanup', path: '/cleanup', icon: Sparkles },
    { label: 'Backup', path: '/backup', icon: Cloud },
  ];

  return (
    <div
      style={{
        paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.75rem)',
      }}
      className="shrink-0 z-40 px-3 bg-transparent pointer-events-none"
    >
      <div className="glass glass-nav pointer-events-auto h-16 px-1.5 flex items-center justify-around shadow-lg rounded-[24px]">
        <div className="glass-sheen" />
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              aria-current={isActive ? 'page' : undefined}
              className="glass-tab relative flex flex-col items-center justify-center w-[68px] h-[50px] rounded-[20px]"
            >
              <span className="glass-tab-pill" />
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} className="relative" />
              <span className={`relative text-[10px] mt-0.5 tracking-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
