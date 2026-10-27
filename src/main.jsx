import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // <- Required for styles to load
import { Capacitor } from '@capacitor/core';

// Mark native Android / iOS runtime to apply mobile-safe status bar & navigation insets
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('capacitor-native');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);