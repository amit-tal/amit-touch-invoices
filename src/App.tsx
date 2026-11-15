import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { GlassRibbonsBackground } from './components/GlassRibbonsBackground';
import { Sidebar } from './components/Sidebar';
import { TimerPanel } from './components/TimerPanel';
import { DailySummaryPanel } from './components/DailySummaryPanel';
import { RecentEntriesTable } from './components/RecentEntriesTable';
import { ActiveProjectsPanel } from './components/ActiveProjectsPanel';
import { ManualEntryModal } from './components/ManualEntryModal';
import { AllEntriesModal } from './components/AllEntriesModal';
import { ClientsView } from './components/ClientsView';
import { ProjectsView } from './components/ProjectsView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { DocumentsView } from './components/documents/DocumentsView';
import { DocumentsProvider, useDocuments } from './context/DocumentsContext';
import { Toast } from './components/Toast';
import type { TimeEntry } from './types';
import type { AppDocument } from './types/documents';
import { Menu, Clock, Search, AlertTriangle, Download, Upload, CheckCircle2 } from 'lucide-react';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { ForgottenTimerReminderModal } from './components/ForgottenTimerReminderModal';
import { DocumentDetailsModal } from './components/documents/DocumentDetailsModal';

const MainAppContent: React.FC = () => {
  const { 
    currentView, 
    setCurrentView, 
    settings,
    routeParams,
    updateRouteParams,
    clients,
    projects,
    entries,
    appSyncConflict,
    isEphemeralServerWarning,
    forceAcceptServerAppData,
    dismissAppSyncConflict,
    showToast,
  } = useApp();

  const {
    documents,
    sequences,
    businessSettings,
    documentsSyncConflict,
    restoreBackup,
    forceAcceptServerDocuments,
    dismissDocumentsSyncConflict,
  } = useDocuments();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [detailsDocFromSearch, setDetailsDocFromSearch] = useState<AppDocument | null>(null);
  const [isRestoringLocal, setIsRestoringLocal] = useState(false);

  const activeSyncConflict = appSyncConflict || documentsSyncConflict;

  const handleDownloadLocalHold = () => {
    try {
      const payload = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        reason: 'client_sync_pause_snapshot',
        clients,
        projects,
        entries,
        documents,
        sequences,
        business: businessSettings,
        settings,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `amit-touch-local-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('קובץ גיבוי מקומי הורד בהצלחה');
    } catch {
      showToast('שגיאה ביצוא הגיבוי המקומי');
    }
  };

  const handlePushLocalToServer = async () => {
    setIsRestoringLocal(true);
    try {
      const payload = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        reason: 'client_sync_pause_restore',
        clients,
        projects,
        entries,
        documents,
        sequences,
        business: businessSettings,
        settings,
      };
      const res = await restoreBackup(payload);
      if (res?.success) {
        dismissAppSyncConflict();
        dismissDocumentsSyncConflict();
        showToast('הנתונים המקומיים שוחזרו בהצלחה לשרת');
      } else {
        showToast(res?.error || 'שחזור הנתונים לשרת נכשל');
      }
    } finally {
      setIsRestoringLocal(false);
    }
  };

  const handleAcceptServerState = async () => {
    if (appSyncConflict) await forceAcceptServerAppData();
    if (documentsSyncConflict) await forceAcceptServerDocuments();
    showToast('סונכרנו נתוני השרת');
  };

  // Global search keyboard shortcuts (Ctrl+K, Cmd+K, /)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
      }
      if (e.key === '/' && !isGlobalSearchOpen) {
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGlobalSearchOpen]);

  // Sync modals from URL query params
  const modalParam = routeParams.get('modal');
  const projectParam = routeParams.get('project');
  const rangeParam = routeParams.get('range');

  // Verify project if projectParam exists
  React.useEffect(() => {
    if (projectParam && projects.length > 0) {
      const exists = projects.some(p => p.id === projectParam);
      if (!exists) {
        showToast('הפרויקט המבוקש לא נמצא או שנמחק');
        updateRouteParams({ project: null }, true);
      }
    }
  }, [projectParam, projects, showToast, updateRouteParams]);

  const isManualModalOpen = modalParam === 'manual';
  const isAllEntriesModalOpen = modalParam === 'entries';
  const filterProjectIdForModal = projectParam || null;

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
    updateRouteParams({ modal: 'manual' });
  };

  const handleOpenManualAdd = () => {
    setEditingEntry(null);
    updateRouteParams({ modal: 'manual' });
  };

  const handleOpenAllEntries = (
    projectId?: string | null,
    dateRange: 'all' | 'today' | 'week' | 'month' = 'all'
  ) => {
    updateRouteParams({ 
      modal: 'entries', 
      project: projectId || null,
      range: dateRange !== 'all' ? dateRange : null,
    });
  };

  const handleCloseManualModal = () => {
    setEditingEntry(null);
    updateRouteParams({ modal: null });
  };

  const handleCloseAllEntriesModal = () => {
    updateRouteParams({ modal: null, project: null, range: null });
  };

  const handleOpenAddClient = () => {
    setCurrentView('clients', { add: '1' });
  };

  const handleOpenAddProject = () => {
    setCurrentView('projects', { add: '1' });
  };

  return (
    <div className="relative min-h-screen text-warm-900 font-heebo selection:bg-rose-dusty/20 selection:text-warm-950 overflow-x-hidden">
      {/* Background Liquid Glass Layer */}
      <GlassRibbonsBackground />

      {/* Full-height Desktop Sidebar (flush right) & Mobile Drawer */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
      />

      {/* Mobile Top App Bar */}
      <div className="md:hidden sticky top-0 z-20 liquid-glass border-b border-white/60 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#BC796F] to-[#E4AEA3] flex items-center justify-center text-white">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-warm-900 text-sm">{settings.studioName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsGlobalSearchOpen(true)}
            className="p-2 rounded-xl text-warm-800 hover:bg-white/50 active:scale-95 transition-all"
            aria-label="חיפוש מהיר"
            title="חיפוש מהיר"
          >
            <Search className="w-4 h-4 text-[#BC796F]" />
          </button>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-xl text-warm-800 hover:bg-white/50 active:scale-95 transition-all"
            aria-label="פתח תפריט ניווט"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Offset by desktop sidebar width (172px) on right in RTL */}
      <main className="relative z-10 md:mr-[172px] min-h-screen p-4 sm:p-6 lg:p-8 xl:p-10 max-w-[1520px]">
        {activeSyncConflict && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-rose-300 bg-rose-50/95 p-4 sm:p-5 text-rose-950 shadow-sm"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="font-bold text-base">
                    הסנכרון הושהה אוטומטית כדי למנוע דריסת נתונים מקומיים
                  </h2>
                  <p className="text-sm text-rose-900">
                    זוהה שנתוני השרת ריקים, חסרים או ישנים מהנתונים השמורים בדפדפן ({activeSyncConflict.message || `רשומות מקומיות: ${activeSyncConflict.localCount}, שרת: ${activeSyncConflict.serverCount}`}). המערכת שמרה עותק מקומי ולא מחקה את הרשומות שלך.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <button
                  type="button"
                  onClick={handlePushLocalToServer}
                  disabled={isRestoringLocal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isRestoringLocal ? 'משחזר לשרת...' : 'שחזר נתונים מקומיים לשרת'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadLocalHold}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  שמור גיבוי מקומי (JSON)
                </button>
                <button
                  type="button"
                  onClick={handleAcceptServerState}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-xs font-medium text-rose-800 hover:bg-rose-100/80 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  קבל נתוני שרת בכל זאת
                </button>
              </div>
            </div>
          </div>
        )}

        {isEphemeralServerWarning && !activeSyncConflict && (
          <div
            role="status"
            className="mb-5 rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-amber-950 flex items-center gap-2.5 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              התראה: השרת פועל כעת ללא מסד נתונים חיצוני קבוע (<code dir="ltr">DATABASE_URL</code>). נתונים חדשים עלולים להימחק בעת הפעלה מחדש של השרת עד לחיבור PostgreSQL חיצוני.
            </span>
          </div>
        )}

        {/* Tracker View */}
        {currentView === 'tracker' && (
          <div className="flex flex-col gap-6 lg:gap-7">
            {/* Top Heading & Subtitle without top-left badge */}
            <header className="pb-1">
              <h1 className="text-3xl sm:text-[38px] lg:text-[40px] font-bold text-warm-950 tracking-tight leading-tight">
                מעקב שעות
              </h1>
              <p className="text-sm sm:text-[15px] text-[#7D5A56] font-normal mt-1">
                מקום לכל רגע של יצירה
              </p>
            </header>

            {/* First Row: Summary (40% right) & Timer (60% left) with equal height */}
            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,40%)_minmax(0,60%)] gap-5 lg:gap-6 items-stretch">
              {/* Daily Summary: 40% on right in RTL */}
              <div className="order-2 lg:order-1 flex flex-col h-full">
                <DailySummaryPanel />
              </div>

              {/* Timer Panel: 60% on left in RTL */}
              <div className="order-1 lg:order-2 flex flex-col h-full">
                <TimerPanel
                  onOpenManualModal={handleOpenManualAdd}
                  onOpenAddClient={handleOpenAddClient}
                  onOpenAddProject={handleOpenAddProject}
                />
              </div>
            </section>

            {/* Second Row: Active Projects (40% right) & Recent Entries (60% left) aligned at same top position */}
            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,40%)_minmax(0,60%)] gap-5 lg:gap-6 items-stretch">
              {/* Active Projects: 40% on right in RTL */}
              <div className="order-2 lg:order-1 flex flex-col h-full">
                <ActiveProjectsPanel
                  onSelectProjectFilter={(pId) => handleOpenAllEntries(pId, 'month')}
                  onOpenAllProjects={() => setCurrentView('projects')}
                  onOpenAddProject={handleOpenAddProject}
                />
              </div>

              {/* Recent Entries: 60% on left in RTL */}
              <div className="order-1 lg:order-2 flex flex-col h-full">
                <RecentEntriesTable
                  onEditEntry={handleEditEntry}
                  onOpenAllEntries={() => handleOpenAllEntries(null)}
                  onOpenManualModal={handleOpenManualAdd}
                />
              </div>
            </section>
          </div>
        )}

        {/* Projects View */}
        {currentView === 'projects' && (
          <ProjectsView
            onOpenProjectEntries={(pId) => handleOpenAllEntries(pId)}
          />
        )}

        {/* Clients View */}
        {currentView === 'clients' && (
          <ClientsView />
        )}

        {/* Documents View */}
        {currentView === 'documents' && (
          <DocumentsView />
        )}

        {/* Reports View */}
        {currentView === 'reports' && <ReportsView />}

        {/* Settings View */}
        {currentView === 'settings' && <SettingsView />}
      </main>

      {/* Manual Entry / Edit Modal */}
      <ManualEntryModal
        isOpen={isManualModalOpen}
        onClose={handleCloseManualModal}
        entryToEdit={editingEntry}
      />

      {/* Full All Entries View Modal */}
      <AllEntriesModal
        isOpen={isAllEntriesModalOpen}
        onClose={handleCloseAllEntriesModal}
        onEditEntry={handleEditEntry}
        initialProjectId={filterProjectIdForModal}
        initialDateRange={(rangeParam as 'all' | 'today' | 'week' | 'month') || 'all'}
      />

      {/* Global Quick Search Modal */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        onSelectDocument={(doc) => setDetailsDocFromSearch(doc)}
        onSelectEntry={(entry) => handleEditEntry(entry)}
      />

      {/* Forgotten Running Timer Reminder Banner */}
      <ForgottenTimerReminderModal />

      {/* Document Details Opened From Global Search */}
      {detailsDocFromSearch && (
        <DocumentDetailsModal
          isOpen={!!detailsDocFromSearch}
          onClose={() => setDetailsDocFromSearch(null)}
          document={detailsDocFromSearch}
        />
      )}

      {/* Toast Feedback */}
      <Toast />
    </div>
  );
};

const AuthenticatedApp: React.FC = () => {
  const { isAuthenticated, isLoading, connectionError, retryConnection } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#FAF4F2] text-warm-900 font-heebo" dir="rtl">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#BC796F] to-[#E4AEA3] flex items-center justify-center text-white mb-4 animate-pulse shadow-md">
          <Clock className="w-8 h-8" />
        </div>
        <p className="text-sm font-medium text-[#7D5A56]">טוען את המערכת...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <AppProvider>
      <DocumentsProvider>
        {connectionError && (
          <div 
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-2xl bg-[#9B4A4A]/90 text-white shadow-xl backdrop-blur-md flex items-center gap-3 text-xs sm:text-sm font-medium border border-rose-200/30 animate-pulse font-heebo"
            dir="rtl"
          >
            <div className="w-2 h-2 rounded-full bg-rose-200 animate-ping shrink-0" />
            <span>{connectionError}</span>
            <button
              type="button"
              onClick={() => retryConnection()}
              className="mr-2 px-3 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-normal transition shadow-sm"
            >
              נסה שוב כעת
            </button>
          </div>
        )}
        <MainAppContent />
      </DocumentsProvider>
    </AppProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
