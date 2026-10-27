import { Capacitor } from '@capacitor/core';

// On web browsers (desktop or mobile browser), empty string uses the current host
// and Vite proxies /api to port 5000 automatically.
// On native Android / iOS Capacitor apps, we use the LAN IP of the host machine.
const getApiBase = () => {
  const custom = localStorage.getItem('icloud_custom_api_base');
  if (custom) return custom;
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (Capacitor.isNativePlatform()) {
    return 'http://172.16.6.153:5000';
  }
  // Browser: use relative path for seamless Vite proxying
  return '';
};

export const API_BASE = getApiBase();
export const STORAGE_LIMIT_GB = Number(import.meta.env.VITE_STORAGE_LIMIT_GB) || 50;

export const CATEGORY_META = {
  photos: { label: 'Photos', bar: 'bg-sky-500' },
  videos: { label: 'Videos', bar: 'bg-indigo-500' },
  music:  { label: 'Music', bar: 'bg-pink-500' },
  docs:   { label: 'Documents', bar: 'bg-emerald-500' },
  other:  { label: 'Other', bar: 'bg-slate-400' },
};
