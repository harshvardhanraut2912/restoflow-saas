import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.js';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme, isCustomerRoute } = useTheme();

  // If on customer route, it is locked to bright mode as required
  if (isCustomerRoute) return null;

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={`Switch to ${theme === 'dark' ? 'Bright / Light Mode' : 'Dark Mode'}`}
      className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${
        theme === 'dark'
          ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm'
      } ${className}`}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline text-slate-300">Bright Mode</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline text-slate-700">Dark Mode</span>
        </>
      )}
    </button>
  );
};
