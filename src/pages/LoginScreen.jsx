import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBackNavigation } from '../context/BackNavigationContext';
import { ArrowLeft, Mail, Lock, Cloud } from 'lucide-react';
import { googleProvider } from '../services/firebase/firebaseClient';

// Always show the Google account chooser in the popup
googleProvider.setCustomParameters({ prompt: 'select_account' });

function friendlyAuthError(err) {
  switch (err?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked. Please allow popups and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase (Authentication > Settings > Authorized domains).';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled in Firebase Console > Authentication > Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return err?.message || 'Something went wrong. Please try again.';
  }
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const { currentUser, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { smartGoBack } = useBackNavigation();

  if (currentUser) return <Navigate to="/home" replace />;

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setError('');
      await login(email, password);
      navigate('/home');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  };

  const handleGoogleLogin = async () => {
    if (googleBusy) return;
    setError('');
    setGoogleBusy(true);
    try {
      await loginWithGoogle(); // Firebase Google popup
      navigate('/home');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/80 dark:border-slate-800 space-y-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={smartGoBack} 
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full border border-slate-200/60 dark:border-slate-700 shadow-sm inline-flex text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
              iC
            </div>
            <span className="font-bold text-sm">iCloud</span>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Welcome Back</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Sign in to access your secure AWS S3 cloud storage
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-2xl text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Email Address</label>
            <div className="relative mt-1">
              <Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Password</label>
            <div className="relative mt-1">
              <Lock size={16} className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-blue-500/25 transition-all text-sm mt-2 cursor-pointer"
          >
            Sign In
          </button>
        </form>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          <span className="flex-shrink mx-4 text-[10px] text-slate-400 uppercase font-semibold">Or continue with</span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
        </div>

        {/* Google popup sign-in */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleBusy}
          className="w-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60 text-slate-700 dark:text-slate-200 font-semibold py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 transition-all text-sm flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>{googleBusy ? 'Signing in…' : 'Google Account'}</span>
        </button>

        <div className="text-center pt-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Don't have an account?{' '}
            <span onClick={() => navigate('/register')} className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer">
              Create Account
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
