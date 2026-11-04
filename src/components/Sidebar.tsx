import React from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import type { ViewType } from '../types';
import { 
  Clock, 
  FolderKanban, 
  Users, 
  BarChart3, 
  FileText,
  Settings as SettingsIcon,
  X,
  Search,
  LogOut
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenGlobalSearch?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile, onOpenGlobalSearch }) => {
  const { currentView, setCurrentView } = useApp();
  const { logout, user } = useAuth();

  const navItems: { id: ViewType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'tracker', label: 'מעקב שעות', icon: Clock },
    { id: 'projects', label: 'פרויקטים', icon: FolderKanban },
    { id: 'clients', label: 'לקוחות', icon: Users },
    { id: 'documents', label: 'מסמכים', icon: FileText },
    { id: 'reports', label: 'דוחות', icon: BarChart3 },
  ];

  const handleNavClick = (id: ViewType) => {
    setCurrentView(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between py-6 px-3">
      {/* Top Section: AMIT TOUCH Main Logo & Navigation */}
      <div className="flex flex-col">
        {/* AMIT TOUCH Official Logo */}
        <div className="flex items-center justify-between px-1 mb-7">
          <div className="w-full flex items-center justify-center py-1">
            <img
              src="/amit-touch-logo.png"
              alt="AMIT TOUCH Design Studio"
              className="w-full max-w-[138px] max-h-[80px] object-contain select-none"
            />
          </div>

          {/* Close button for mobile drawer */}
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-warm-700 hover:bg-white/40 absolute top-4 left-4"
            aria-label="סגירת תפריט"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Global Search Trigger */}
        <button
          type="button"
          onClick={() => {
            if (onOpenGlobalSearch) onOpenGlobalSearch();
            onCloseMobile();
          }}
          className="flex items-center justify-between px-3 py-2 mb-3.5 rounded-2xl bg-white/50 hover:bg-white/80 border border-white/70 text-xs text-warm-700 hover:text-warm-900 transition-all shadow-xs group cursor-pointer"
          title="חיפוש מהיר (Ctrl+K)"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[#BC796F] group-hover:scale-110 transition-transform" />
            <span className="font-medium">חיפוש...</span>
          </div>
          <kbd className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded border border-warm-200/80 font-mono text-warm-500">
            ⌘K
          </kbd>
        </button>

        {/* Main Nav Items */}
        <nav className="flex flex-col gap-1.5" aria-label="תפריט ראשי">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 text-right w-full ${
                  isActive
                    ? 'liquid-glass-pill text-[#88463F] font-semibold shadow-xs'
                    : 'text-warm-800/80 hover:text-warm-950 hover:bg-white/30'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] transition-colors shrink-0 ${
                    isActive ? 'text-[#BC796F]' : 'text-warm-700/70 group-hover:text-[#BC796F]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Settings & User Session with subtle separator */}
      <div className="flex flex-col gap-1.5 pt-4">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#BC796F]/20 to-transparent my-1" />
        
        <button
          onClick={() => handleNavClick('settings')}
          className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 text-right w-full cursor-pointer ${
            currentView === 'settings'
              ? 'liquid-glass-pill text-[#88463F] font-semibold'
              : 'text-warm-800/80 hover:text-warm-950 hover:bg-white/30'
          }`}
        >
          <SettingsIcon
            className={`w-[18px] h-[18px] transition-colors shrink-0 ${
              currentView === 'settings' ? 'text-[#BC796F]' : 'text-warm-700/70 group-hover:text-[#BC796F]'
            }`}
          />
          <span className="truncate">הגדרות</span>
        </button>

        <button
          type="button"
          onClick={logout}
          title={user?.email ? `התנתקות מ-${user.email}` : 'התנתקות מהמערכת'}
          className="group flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-medium text-warm-700/80 hover:text-rose-700 hover:bg-rose-50/50 transition-all text-right w-full cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-warm-500 group-hover:text-rose-600 transition-colors shrink-0" />
          <span className="truncate">התנתק</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar: Flush against right edge, full height, 165px-180px wide */}
      <aside 
        className="hidden md:block fixed top-0 right-0 bottom-0 w-[172px] liquid-glass-sidebar z-30 select-none"
        aria-label="סרגל צד"
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-warm-950/20 backdrop-blur-sm z-40 transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Panel */}
      <div
        className={`md:hidden fixed top-0 right-0 bottom-0 w-[240px] liquid-glass-sidebar z-50 transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
};
