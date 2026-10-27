import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ResolutionProvider } from './context/ResolutionContext';
import { BackNavigationProvider } from './context/BackNavigationContext';
import AppLayout from './layouts/AppLayout';
import SubLayout from './layouts/SubLayout';
import ErrorBoundary from './components/ErrorBoundary';
import NetworkStatusNotifier from './components/NetworkStatusNotifier';

// Instant Startup Pages
import SplashScreen from './pages/SplashScreen';
import WelcomeScreen from './pages/WelcomeScreen';
import LoginScreen from './pages/LoginScreen';
import RegisterScreen from './pages/RegisterScreen';

// Core Tabs: Code-split for high-speed initial startup
const HomeScreen = lazy(() => import('./pages/HomeScreen'));
const FilesScreen = lazy(() => import('./pages/FilesScreen'));
const AiCleanupScreen = lazy(() => import('./pages/AiCleanupScreen'));
const BackupScreen = lazy(() => import('./pages/BackupScreen'));
const ProfileScreen = lazy(() => import('./pages/ProfileScreen'));

// Sub-screens: Code-split on-demand to eliminate bundle bloat & initial lag
const StorageScannerScreen = lazy(() => import('./pages/StorageScannerScreen'));
const DuplicateFilesScreen = lazy(() => import('./pages/DuplicateFilesScreen'));
const LargeFilesScreen = lazy(() => import('./pages/LargeFilesScreen'));
const CompressionScreen = lazy(() => import('./pages/CompressionScreen'));
const FolderViewScreen = lazy(() => import('./pages/FolderViewScreen'));
const FilePreviewScreen = lazy(() => import('./pages/FilePreviewScreen'));
const UploadScreen = lazy(() => import('./pages/UploadScreen'));
const SearchScreen = lazy(() => import('./pages/SearchScreen'));
const QrShareScreen = lazy(() => import('./pages/QrShareScreen'));
const SharedFilesScreen = lazy(() => import('./pages/SharedFilesScreen'));
const TrashScreen = lazy(() => import('./pages/TrashScreen'));
const NotificationsScreen = lazy(() => import('./pages/NotificationsScreen'));
const StorageAnalyticsScreen = lazy(() => import('./pages/StorageAnalyticsScreen'));
const SettingsScreen = lazy(() => import('./pages/SettingsScreen'));

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!currentUser) return <Navigate to="/welcome" replace />;
  return children;
};

// Lightweight, sleek micro-spinner for fast route transitions without UI stutter
function RouteLoadingFallback() {
  return (
    <div className="w-full h-full min-h-[50vh] flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-blue-500/30 border-t-blue-600 animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ResolutionProvider>
          <Router>
            <BackNavigationProvider>
              <NetworkStatusNotifier />
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                  <Route path="/" element={<SplashScreen />} />
                  <Route path="/welcome" element={<WelcomeScreen />} />
                  <Route path="/login" element={<LoginScreen />} />
                  <Route path="/register" element={<RegisterScreen />} />

                  {/* Main App Layout with Header, Bottom Navigation & Dark Mode Support */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <ErrorBoundary>
                          <AppLayout />
                        </ErrorBoundary>
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/home" element={<HomeScreen />} />
                    <Route path="/files" element={<FilesScreen />} />
                    <Route path="/cleanup" element={<AiCleanupScreen />} />
                    <Route path="/backup" element={<BackupScreen />} />
                    <Route path="/profile" element={<ProfileScreen />} />
                  </Route>

                  {/* Sub-screens & Features */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <ErrorBoundary>
                          <SubLayout />
                        </ErrorBoundary>
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/scanner" element={<StorageScannerScreen />} />
                    <Route path="/duplicates" element={<DuplicateFilesScreen />} />
                    <Route path="/large-files" element={<LargeFilesScreen />} />
                    <Route path="/compression" element={<CompressionScreen />} />
                    <Route path="/folder/:folderName" element={<FolderViewScreen />} />
                    <Route path="/preview/:fileId" element={<FilePreviewScreen />} />
                    <Route path="/upload" element={<UploadScreen />} />
                    <Route path="/search" element={<SearchScreen />} />
                    <Route path="/qr-share/:fileId" element={<QrShareScreen />} />
                    <Route path="/shared" element={<SharedFilesScreen />} />
                    <Route path="/trash" element={<TrashScreen />} />
                    <Route path="/notifications" element={<NotificationsScreen />} />
                    <Route path="/analytics" element={<StorageAnalyticsScreen />} />
                    <Route path="/settings" element={<SettingsScreen />} />
                  </Route>
                </Routes>
              </Suspense>
            </BackNavigationProvider>
          </Router>
        </ResolutionProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
