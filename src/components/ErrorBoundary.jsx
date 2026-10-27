import React from 'react';
import { RefreshCw, AlertCircle, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-inner">
            <AlertCircle size={32} />
          </div>

          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {this.props.title || 'Something went wrong'}
          </h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mt-1 mb-6 leading-relaxed">
            {this.props.message ||
              'An unexpected error occurred while loading this view. You can reload or return to the main dashboard.'}
          </p>

          <div className="flex items-center space-x-3">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Try Again</span>
            </button>

            <a
              href="/home"
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 active:scale-95 transition-all cursor-pointer"
            >
              <Home size={14} />
              <span>Home</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
