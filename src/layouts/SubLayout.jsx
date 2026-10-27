import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import DesktopSidebar from '../components/DesktopSidebar';
import DesktopHeader from '../components/DesktopHeader';
import { useResolution } from '../context/ResolutionContext';

/**
 * Responsive sub-layout for detail and utility screens (Settings, Trash, Scanner, Analytics, Duplicates, etc.)
 * - Mobile: Edge-to-edge native sub-screen with safe insets
 * - Desktop/Tablet: Seamless integration with desktop sidebar, top header, and centered container
 */
export default function SubLayout() {
  const { isMobile, isTablet, viewMode } = useResolution();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Mobile sub-screen layout
  if (isMobile) {
    return (
      <div className={`android-device-frame relative flex flex-col h-full overflow-hidden ${
        viewMode === 'mobile' ? 'device-simulation-mobile' : ''
      }`}>
        <main
          style={{
            paddingTop: 'var(--status-bar-height, 0px)',
            paddingBottom: 'var(--safe-bottom, 0px)',
          }}
          className="flex-1 overflow-y-auto custom-scroll"
        >
          <Outlet />
        </main>
      </div>
    );
  }

  // Desktop & Tablet Sub-Screen Layout
  return (
    <div className={`android-device-frame w-full h-screen flex flex-row overflow-hidden bg-slate-50 dark:bg-[#090d16] ${
      viewMode === 'tablet' ? 'device-simulation-tablet' : ''
    }`}>
      {/* Desktop Navigation Sidebar */}
      <DesktopSidebar
        isCollapsed={sidebarCollapsed || isTablet}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Workspace with Desktop Header and Centered Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <DesktopHeader showBackButton={true} />

        <main className="flex-1 overflow-y-auto custom-scroll px-6 py-6 lg:px-8">
          <div className="max-w-5xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
