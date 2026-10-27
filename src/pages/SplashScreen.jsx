import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    // Signed-in users skip Welcome/Login and go straight to the app
    const timer = setTimeout(() => {
      navigate(currentUser ? '/home' : '/welcome', { replace: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate, currentUser]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-blue-600 text-white p-4">
      <div className="w-20 h-20 bg-white text-blue-600 rounded-3xl flex items-center justify-center shadow-2xl mb-4 animate-bounce">
        <Cloud size={40} className="stroke-[2.5]" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">iCloud</h1>
      <p className="text-blue-100 text-sm mt-1">Smart Cloud Storage & Backup</p>
    </div>
  );
}