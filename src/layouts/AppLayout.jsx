import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import Navbar from '../components/Navbar';
import DesktopSidebar from '../components/DesktopSidebar';
import DesktopHeader from '../components/DesktopHeader';
import { useResolution } from '../context/ResolutionContext';

export default function AppLayout() {
  const { isMobile, isTablet, viewMode } = useResolution();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // If mobile or simulated mobile
  if (isMobile) {
    return (
      <div className={`android-device-frame relative flex flex-col h-full overflow-hidden ${
        viewMode === 'mobile' ? 'device-simulation-mobile' : ''
      }`}>
        {/* Fixed Mobile iOS Glass Header */}
        <Header />

        {/* Scrollable Main Content Area */}
        <main
          style={{
            paddingTop: 'calc(3.75rem + var(--status-bar-height, 0px))',
          }}
          className="flex-1 overflow-y-auto custom-scroll px-3"
        >
          <Outlet />
        </main>

        {/* Bottom Floating Glass Navigation Dock */}
        <Navbar />
      </div>
    );
  }

  // Desktop & Tablet Layout: Modern Cloud Dashboard
  return (
    <div className={`android-device-frame w-full h-screen flex flex-row overflow-hidden bg-slate-50 dark:bg-[#090d16] ${
      viewMode === 'tablet' ? 'device-simulation-tablet' : ''
    }`}>
      {/* Left Navigation Sidebar */}
      <DesktopSidebar
        isCollapsed={sidebarCollapsed || isTablet}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Desktop App Bar */}
        <DesktopHeader />

        {/* Scrollable Workspace */}
        <main className="flex-1 overflow-y-auto custom-scroll px-6 py-6 lg:px-8">
          <div className="max-w-[1600px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
