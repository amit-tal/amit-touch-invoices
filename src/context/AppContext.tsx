import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Client, Project, TimeEntry, ActiveTimer, Settings, ViewType, ElectronicDeliveryConsent } from '../types';
import { toISODateString, toTimeString, calculateDurationFromTimes } from '../utils/dateUtils';
import { evaluateAppDataSync, type SyncConflictInfo } from '../utils/syncGuard';

export function getViewFromPath(pathname: string): ViewType {
  const clean = pathname.toLowerCase().replace(/\/+$/, '');
  if (clean === '/projects') return 'projects';
  if (clean === '/clients') return 'clients';
  if (clean === '/documents') return 'documents';
  if (clean === '/reports') return 'reports';
  if (clean === '/settings') return 'settings';
  return 'tracker';
}

export function getPathFromView(view: ViewType): string {
  if (view === 'tracker') return '/';
  return `/${view}`;
}

interface AppContextType {
  clients: Client[];
  projects: Project[];
  entries: TimeEntry[];
  activeTimer: ActiveTimer | null;
  settings: Settings;
  currentView: ViewType;
  routeParams: URLSearchParams;
  selectedProjectFilter: string | null;
  elapsedSeconds: number;
  
  // Navigation & filtering
  setCurrentView: (view: ViewType, params?: Record<string, string | null | undefined>) => void;
  updateRouteParams: (params: Record<string, string | null | undefined>, replace?: boolean) => void;
  setSelectedProjectFilter: (projectId: string | null) => void;

  // Timer actions
  startTimer: (clientId: string, projectId: string, task: string) => Promise<{ success: boolean; error?: string }>;
  stopTimer: () => Promise<{ success: boolean; error?: string }>;
  cancelTimer: () => Promise<{ success: boolean; error?: string }>;
  isTimerReminderActive: boolean;
  snoozeTimerReminder: (minutes?: number) => void;
  fixTimerEndTime: (endTime: string) => Promise<{ success: boolean; error?: string }>;

  // Entry actions
  addEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string; entry?: TimeEntry }>;
  updateEntry: (entry: TimeEntry) => Promise<{ success: boolean; error?: string }>;
  deleteEntry: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Client actions
  addClient: (
    name: string,
    color?: string,
    businessNumber?: string,
    paymentTerms?: string,
    paymentTermsCustom?: string,
    email?: string,
    address?: string,
    electronicConsent?: ElectronicDeliveryConsent
  ) => Promise<{ success: boolean; client?: Client; error?: string }>;
  updateClient: (client: Client) => Promise<{ success: boolean; error?: string }>;
  deleteClient: (id: string) => Promise<{ success: boolean; error?: string }>;
  getClientStats: (id: string) => { projectCount: number; entryCount: number };

  // Project actions
  addProject: (
    name: string,
    clientId: string,
    icon?: string,
    color?: string,
    hourlyRate?: number | null
  ) => Promise<{ success: boolean; project?: Project; error?: string }>;
  updateProject: (project: Project) => Promise<{ success: boolean; error?: string }>;
  deleteProject: (id: string) => Promise<{ success: boolean; error?: string }>;
  getProjectStats: (id: string) => { entryCount: number };

  // Settings & Work Data Reset
  updateSettings: (settings: Partial<Settings>) => Promise<{ success: boolean; error?: string }>;
  clearAllWorkData: () => void;
  clearDemoData: () => void;

  // Toast notifications & Sync guard
  toastMessage: string | null;
  showToast: (msg: string) => void;
  appSyncConflict: SyncConflictInfo | null;
  isEphemeralServerWarning: boolean;
  refreshAppData: (options?: { forceOverwrite?: boolean }) => Promise<void>;
  forceAcceptServerAppData: () => Promise<void>;
  dismissAppSyncConflict: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  CLIENTS: 'time_tracker_clients',
  PROJECTS: 'time_tracker_projects',
  ENTRIES: 'time_tracker_entries',
  ACTIVE_TIMER: 'time_tracker_active_timer',
  SETTINGS: 'time_tracker_settings',
  MIGRATION_V4: 'time_tracker_migrated_v4_clean_real',
};

const DEFAULT_SETTINGS: Settings = {
  studioName: 'AMIT TOUCH',
  defaultHourlyRate: 350,
  currency: '₪',
  timerReminder: {
    enabled: true,
    thresholdHours: 4,
    browserNotificationsEnabled: false,
  },
};

const DEMO_CLIENT_IDS = ['c1', 'c2', 'c3'];
const DEMO_PROJECT_IDS = ['p1', 'p2', 'p3', 'p4'];
const DEMO_ENTRY_IDS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];

// Run one-time migration to strip demo records from localStorage
function runMigrationCleanup() {
  try {
    const isMigrated = localStorage.getItem(STORAGE_KEYS.MIGRATION_V4);
    if (!isMigrated) {
      const rawClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      if (rawClients) {
        const parsed: Client[] = JSON.parse(rawClients);
        const filtered = parsed.filter(c => !DEMO_CLIENT_IDS.includes(c.id));
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(filtered));
      }

      const rawProjects = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (rawProjects) {
        const parsed: Project[] = JSON.parse(rawProjects);
        const filtered = parsed.filter(p => !DEMO_PROJECT_IDS.includes(p.id) && !DEMO_CLIENT_IDS.includes(p.clientId));
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(filtered));
      }

      const rawEntries = localStorage.getItem(STORAGE_KEYS.ENTRIES);
      if (rawEntries) {
        const parsed: TimeEntry[] = JSON.parse(rawEntries);
        const filtered = parsed.filter(e => 
          !DEMO_ENTRY_IDS.includes(e.id) && 
          !DEMO_CLIENT_IDS.includes(e.clientId) && 
          !DEMO_PROJECT_IDS.includes(e.projectId)
        );
        localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(filtered));
      }

      const rawTimer = localStorage.getItem(STORAGE_KEYS.ACTIVE_TIMER);
      if (rawTimer) {
        const parsed: ActiveTimer = JSON.parse(rawTimer);
        if (DEMO_CLIENT_IDS.includes(parsed.clientId) || DEMO_PROJECT_IDS.includes(parsed.projectId)) {
          localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIMER);
        }
      }

      const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (rawSettings) {
        const parsed: Settings = JSON.parse(rawSettings);
        parsed.studioName = 'AMIT TOUCH';
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsed));
      } else {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      }

      localStorage.setItem(STORAGE_KEYS.MIGRATION_V4, 'true');
    }
  } catch (err) {
    console.error('Error during demo migration cleanup:', err);
  }
}

// Run before state initialization
runMigrationCleanup();

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [clients, setClients] = useState<Client[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [entries, setEntries] = useState<TimeEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ENTRIES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TIMER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.isRunning && parsed.startTimestamp) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SETTINGS;
  });

  const [currentView, setCurrentViewState] = useState<ViewType>(() => {
    return getViewFromPath(window.location.pathname);
  });

  const [routeParams, setRouteParams] = useState<URLSearchParams>(() => {
    return new URLSearchParams(window.location.search);
  });

  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TIMER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.isRunning && parsed.startTimestamp) {
          return Math.max(0, Math.floor((Date.now() - parsed.startTimestamp) / 1000));
        }
      }
    } catch (e) {
      console.error(e);
    }
    return 0;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [appSyncConflict, setAppSyncConflict] = useState<SyncConflictInfo | null>(null);
  const [isEphemeralServerWarning, setIsEphemeralServerWarning] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  const postDurableJson = useCallback(async (url: string, payload: unknown, fallbackError: string) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        try {
          window.dispatchEvent(new CustomEvent('amit-auth-expired'));
        } catch {}
        return {
          ok: false as const,
          status: 401,
          error: 'פג תוקף ההתחברות. יש להתחבר מחדש ולשמור שוב.',
        };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        return {
          ok: false as const,
          status: res.status,
          error: typeof data?.error === 'string' && data.error ? data.error : fallbackError,
        };
      }
      return { ok: true as const, status: res.status, data };
    } catch {
      return {
        ok: false as const,
        status: 0,
        error: 'שגיאת תקשורת עם השרת. הנתונים לא נשמרו — יש לבדוק חיבור ולנסות שוב.',
      };
    }
  }, []);

  const navigateTo = useCallback((
    view: ViewType, 
    params?: Record<string, string | null | undefined>, 
    replace = false
  ) => {
    setCurrentViewState(view);

    const newSearchParams = new URLSearchParams(params ? {} : window.location.search);
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val === null || val === undefined || val === '') {
          newSearchParams.delete(key);
        } else {
          newSearchParams.set(key, val);
        }
      });
    }

    const path = getPathFromView(view);
    const qs = newSearchParams.toString();
    const url = qs ? `${path}?${qs}` : path;

    if (replace) {
      window.history.replaceState({ view }, '', url);
    } else {
      window.history.pushState({ view }, '', url);
    }
    setRouteParams(newSearchParams);
  }, []);

  const setCurrentView = useCallback((view: ViewType, params?: Record<string, string | null | undefined>) => {
    navigateTo(view, params, false);
  }, [navigateTo]);

  const updateRouteParams = useCallback((
    params: Record<string, string | null | undefined>, 
    replace = false
  ) => {
    const currentParams = new URLSearchParams(window.location.search);
    Object.entries(params).forEach(([key, val]) => {
      if (val === null || val === undefined || val === '') {
        currentParams.delete(key);
      } else {
        currentParams.set(key, val);
      }
    });

    const path = getPathFromView(currentView);
    const qs = currentParams.toString();
    const url = qs ? `${path}?${qs}` : path;

    if (replace) {
      window.history.replaceState({ view: currentView }, '', url);
    } else {
      window.history.pushState({ view: currentView }, '', url);
    }
    setRouteParams(currentParams);
  }, [currentView]);

  // Sync browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const newView = getViewFromPath(window.location.pathname);
      setCurrentViewState(newView);
      setRouteParams(new URLSearchParams(window.location.search));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync state changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  const [timerSnoozedUntil, setTimerSnoozedUntil] = useState<number | null>(null);

  // Check if timer has been running longer than threshold (default 4 hours)
  const timerReminderConfig = useMemo(() => {
    return settings.timerReminder || {
      enabled: true,
      thresholdHours: 4,
      browserNotificationsEnabled: false,
    };
  }, [settings.timerReminder]);
  const reminderThresholdSec = (timerReminderConfig.thresholdHours || 4) * 3600;
  const isTimerReminderActive = Boolean(
    activeTimer?.isRunning &&
    timerReminderConfig.enabled !== false &&
    elapsedSeconds >= reminderThresholdSec &&
    (!timerSnoozedUntil || Date.now() > timerSnoozedUntil)
  );

  // Trigger optional browser notification once per threshold crossing
  const notifiedRef = React.useRef(false);
  useEffect(() => {
    if (isTimerReminderActive && !notifiedRef.current) {
      notifiedRef.current = true;
      if (
        timerReminderConfig.browserNotificationsEnabled &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification('AMIT TOUCH - תזכורת טיימר פעיל', {
            body: `הטיימר פועל ברציפות מעל ${timerReminderConfig.thresholdHours || 4} שעות בפרויקט הנוכחי.`,
            icon: '/amit-touch-logo.png',
          });
        } catch {}
      }
    } else if (!isTimerReminderActive) {
      notifiedRef.current = false;
    }
  }, [isTimerReminderActive, timerReminderConfig]);

  const snoozeTimerReminder = useCallback((minutes = 60) => {
    setTimerSnoozedUntil(Date.now() + minutes * 60 * 1000);
    showToast(`התזכורת נדחתה ב-${minutes} דקות`);
  }, []);

  const fixTimerEndTime = useCallback(async (endTime: string): Promise<{ success: boolean; error?: string }> => {
    if (!activeTimer || !activeTimer.isRunning) {
      return { success: false, error: 'אין טיימר פעיל' };
    }

    const startDate = new Date(activeTimer.startTimestamp);
    const startTime = toTimeString(startDate);
    const durationSeconds = calculateDurationFromTimes(startTime, endTime);

    if (durationSeconds <= 0) {
      return { success: false, error: `שעת הסיום (${endTime}) חייבת להיות מאוחרת משעת ההתחלה (${startTime})` };
    }

    const nowIso = new Date().toISOString();
    const newEntry: TimeEntry = {
      id: 'entry_' + Date.now(),
      clientId: activeTimer.clientId,
      projectId: activeTimer.projectId,
      task: activeTimer.task || 'עבודה שוטפת',
      date: toISODateString(startDate),
      startTime,
      endTime,
      durationSeconds,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const saveRes = await postDurableJson('/api/app-data/entry/save', newEntry, 'שגיאה בשמירת רשומת הזמן המתוקנת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const nextEntries = [newEntry, ...entries];
    setEntries(nextEntries);
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(nextEntries));
    setActiveTimer(null);
    setElapsedSeconds(0);
    setTimerSnoozedUntil(null);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIMER);

    await postDurableJson('/api/app-data/timer', { activeTimer: null }, 'שגיאה בניקוי הטיימר בשרת');
    showToast('רשומת הזמן תוקנה ונשמרה בהצלחה');
    return { success: true };
  }, [activeTimer, entries, postDurableJson]);

  // Synchronize state with persistent server storage on mount or refresh
  const refreshAppData = useCallback(async (options?: { forceOverwrite?: boolean }) => {
    try {
      const res = await fetch('/api/app-data');
      if (res.status === 401) {
        try {
          window.dispatchEvent(new CustomEvent('amit-auth-expired'));
        } catch {}
        return;
      }
      if (!res.ok) return;
      const data = await res.json();

      if (data?.syncMeta?.isEphemeralWarning) {
        setIsEphemeralServerWarning(true);
      } else if (data?.storageStatus?.backend === 'postgres' && data?.storageStatus?.isDurable) {
        setIsEphemeralServerWarning(false);
      }

      const readLocalArray = <T,>(key: string): T[] => {
        try {
          const raw = localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      let localClients = readLocalArray<Client>(STORAGE_KEYS.CLIENTS);
      let localProjects = readLocalArray<Project>(STORAGE_KEYS.PROJECTS);
      let localEntries = readLocalArray<TimeEntry>(STORAGE_KEYS.ENTRIES);

      if (!options?.forceOverwrite) {
        const evaluation = evaluateAppDataSync({
          localClients,
          localProjects,
          localEntries,
          serverData: data,
        });

        // Apply server deletion tombstones so deleted records are not resurrected locally
        if (evaluation.prunedClientIds && evaluation.prunedClientIds.length > 0) {
          const prunedSet = new Set(evaluation.prunedClientIds);
          localClients = localClients.filter(c => !prunedSet.has(c.id));
          setClients(localClients);
          localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(localClients));
        }
        if (evaluation.prunedProjectIds && evaluation.prunedProjectIds.length > 0) {
          const prunedSet = new Set(evaluation.prunedProjectIds);
          localProjects = localProjects.filter(p => !prunedSet.has(p.id));
          setProjects(localProjects);
          localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(localProjects));
        }
        if (evaluation.prunedEntryIds && evaluation.prunedEntryIds.length > 0) {
          const prunedSet = new Set(evaluation.prunedEntryIds);
          localEntries = localEntries.filter(e => !prunedSet.has(e.id));
          setEntries(localEntries);
          localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(localEntries));
        }

        if (evaluation.shouldPauseSync) {
          try {
            localStorage.setItem(
              'amit_recovery_hold_app',
              JSON.stringify({
                capturedAt: new Date().toISOString(),
                reason: evaluation.reason,
                clients: localClients,
                projects: localProjects,
                entries: localEntries,
              })
            );
          } catch {}
          setAppSyncConflict(evaluation);
          showToast(evaluation.message || 'הסנכרון הושהה למניעת איבוד נתונים מקומיים');
          return;
        }
      }

      setAppSyncConflict(null);
      if (Array.isArray(data.clients)) {
        setClients(data.clients);
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(data.clients));
      }
      if (Array.isArray(data.projects)) {
        setProjects(data.projects);
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(data.projects));
      }
      if (Array.isArray(data.entries)) {
        setEntries(data.entries);
        localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(data.entries));
      }
      if (data.settings && typeof data.settings === 'object') {
        const mergedSettings: Settings = { ...DEFAULT_SETTINGS, ...data.settings };
        setSettings(mergedSettings);
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(mergedSettings));
      }

      // Sync active running timer from server
      try {
        const timerRes = await fetch('/api/app-data/timer');
        if (timerRes.ok) {
          const timerData = await timerRes.json();
          if (timerData.activeTimer && timerData.activeTimer.isRunning) {
            setActiveTimer(timerData.activeTimer);
            localStorage.setItem(STORAGE_KEYS.ACTIVE_TIMER, JSON.stringify(timerData.activeTimer));
          } else {
            setActiveTimer(null);
            localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIMER);
          }
        }
      } catch {}
    } catch (err) {
      console.error('Failed to refresh server app data:', err);
    }
  }, []);

  const forceAcceptServerAppData = useCallback(async () => {
    await refreshAppData({ forceOverwrite: true });
  }, [refreshAppData]);

  const dismissAppSyncConflict = useCallback(() => {
    setAppSyncConflict(null);
  }, []);

  useEffect(() => {
    refreshAppData();
  }, [refreshAppData]);

  useEffect(() => {
    if (activeTimer) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TIMER, JSON.stringify(activeTimer));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIMER);
    }
  }, [activeTimer]);

  // Active Timer Tick Handler
  useEffect(() => {
    if (!activeTimer || !activeTimer.isRunning) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - activeTimer.startTimestamp) / 1000));
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 500);

    return () => clearInterval(interval);
  }, [activeTimer]);

  // Start Timer
  const startTimer = async (clientId: string, projectId: string, task: string): Promise<{ success: boolean; error?: string }> => {
    if (!clientId) {
      return { success: false, error: 'יש לבחור לקוח' };
    }
    if (!projectId) {
      return { success: false, error: 'יש לבחור פרויקט' };
    }
    if (activeTimer && activeTimer.isRunning) {
      return { success: false, error: 'קיים כבר טיימר פעיל' };
    }

    const newTimer: ActiveTimer = {
      clientId,
      projectId,
      task: task.trim() || 'עבודה שוטפת',
      startTimestamp: Date.now(),
      isRunning: true,
    };

    const saveRes = await postDurableJson('/api/app-data/timer', { activeTimer: newTimer }, 'שגיאה בהפעלת הטיימר בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    setActiveTimer(newTimer);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TIMER, JSON.stringify(newTimer));
    showToast('הטיימר הופעל בהצלחה');
    return { success: true };
  };

  // Stop Timer
  const stopTimer = async (): Promise<{ success: boolean; error?: string }> => {
    if (!activeTimer || !activeTimer.isRunning) {
      return { success: false, error: 'אין טיימר פעיל' };
    }

    const stopTime = Date.now();
    const durationSeconds = Math.max(1, Math.floor((stopTime - activeTimer.startTimestamp) / 1000));
    const startDate = new Date(activeTimer.startTimestamp);
    const endDate = new Date(stopTime);
    const nowIso = new Date().toISOString();

    const newEntry: TimeEntry = {
      id: 'entry_' + Date.now(),
      clientId: activeTimer.clientId,
      projectId: activeTimer.projectId,
      task: activeTimer.task || 'עבודה שוטפת',
      date: toISODateString(startDate),
      startTime: toTimeString(startDate),
      endTime: toTimeString(endDate),
      durationSeconds,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const saveRes = await postDurableJson('/api/app-data/entry/save', newEntry, 'שגיאה בשמירת רשומת הזמן בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const updated = [newEntry, ...entries];
    setEntries(updated);
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(updated));
    setActiveTimer(null);
    setElapsedSeconds(0);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIMER);

    await postDurableJson('/api/app-data/timer', { activeTimer: null }, 'שגיאה בניקוי הטיימר בשרת');
    showToast('רשומת הזמן נשמרה בהצלחה');
    return { success: true };
  };

  // Cancel running timer without saving
  const cancelTimer = async (): Promise<{ success: boolean; error?: string }> => {
    const clearRes = await postDurableJson('/api/app-data/timer', { activeTimer: null }, 'שגיאה בביטול הטיימר בשרת');
    if (!clearRes.ok) {
      showToast(clearRes.error);
      return { success: false, error: clearRes.error };
    }
    setActiveTimer(null);
    setElapsedSeconds(0);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIMER);
    showToast('הטיימר בוטל');
    return { success: true };
  };

  // Manual / Edit Entry actions
  const addEntry = async (entryData: Omit<TimeEntry, 'id' | 'createdAt'>): Promise<{ success: boolean; error?: string; entry?: TimeEntry }> => {
    const nowIso = new Date().toISOString();
    const newEntry: TimeEntry = {
      ...entryData,
      id: 'entry_' + Date.now(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const saveRes = await postDurableJson('/api/app-data/entry/save', newEntry, 'שגיאה בשמירת הרשומה בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const updated = [newEntry, ...entries];
    setEntries(updated);
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(updated));
    showToast('הרשומה נוספה בהצלחה');
    return { success: true, entry: newEntry };
  };

  const updateEntry = async (updatedEntry: TimeEntry): Promise<{ success: boolean; error?: string }> => {
    const payload: TimeEntry = {
      ...updatedEntry,
      updatedAt: new Date().toISOString(),
    };
    const saveRes = await postDurableJson('/api/app-data/entry/save', payload, 'שגיאה בעדכון הרשומה בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const updated = entries.map(e => (e.id === payload.id ? payload : e));
    setEntries(updated);
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(updated));
    showToast('הרשומה עודכנה בהצלחה');
    return { success: true };
  };

  const deleteEntry = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const delRes = await postDurableJson('/api/app-data/entry/delete', { id }, 'שגיאה במחיקת הרשומה מהשרת');
    if (!delRes.ok) {
      showToast(delRes.error);
      return { success: false, error: delRes.error };
    }

    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(updated));
    showToast('הרשומה נמחקה בהצלחה');
    return { success: true };
  };

  // Client actions
  const addClient = async (
    name: string,
    color: string = '#BC796F',
    businessNumber?: string,
    paymentTerms?: string,
    paymentTermsCustom?: string,
    email?: string,
    address?: string,
    electronicConsent?: ElectronicDeliveryConsent
  ): Promise<{ success: boolean; client?: Client; error?: string }> => {
    const nowIso = new Date().toISOString();
    const newClient: Client = {
      id: 'client_' + Date.now(),
      name: name.trim(),
      color,
      businessNumber: businessNumber?.trim() || undefined,
      paymentTerms: paymentTerms?.trim() || undefined,
      paymentTermsCustom: paymentTerms === 'אחר' ? paymentTermsCustom?.trim() : undefined,
      email: email?.trim() || undefined,
      address: address?.trim() || undefined,
      electronicConsent,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const saveRes = await postDurableJson('/api/app-data/client/save', newClient, 'שגיאה בשמירת הלקוח בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const updated = [...clients, newClient];
    setClients(updated);
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(updated));
    showToast(`הלקוח "${newClient.name}" נוסף בהצלחה`);
    return { success: true, client: newClient };
  };

  const updateClient = async (updatedClient: Client): Promise<{ success: boolean; error?: string }> => {
    const payload: Client = {
      ...updatedClient,
      updatedAt: new Date().toISOString(),
    };
    const saveRes = await postDurableJson('/api/app-data/client/save', payload, 'שגיאה בעדכון פרטי הלקוח בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const updated = clients.map(c => (c.id === payload.id ? payload : c));
    setClients(updated);
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(updated));
    showToast('פרטי הלקוח עודכנו');
    return { success: true };
  };

  const getClientStats = (id: string) => {
    const linkedProjects = projects.filter(p => p.clientId === id);
    const linkedEntries = entries.filter(e => e.clientId === id);
    return {
      projectCount: linkedProjects.length,
      entryCount: linkedEntries.length,
    };
  };

  const deleteClient = async (id: string): Promise<{ success: boolean; error?: string }> => {
    // Active timer protection
    if (activeTimer?.isRunning && activeTimer.clientId === id) {
      const msg = 'לא ניתן למחוק לקוח כאשר הטיימר פועל עבורו. יש לעצור את הטיימר תחילה.';
      showToast(msg);
      return { success: false, error: msg };
    }

    try {
      const res = await fetch('/api/app-data/client/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (res.status === 401) {
        try {
          window.dispatchEvent(new CustomEvent('amit-auth-expired'));
        } catch {}
        throw new Error('פג תוקף ההתחברות. יש להתחבר מחדש.');
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'שגיאה במחיקת הלקוח מהשרת');
      }

      // Cascade delete: remove client, its projects, and its entries
      const updatedClients = clients.filter(c => c.id !== id);
      const updatedProjects = projects.filter(p => p.clientId !== id);
      const updatedEntries = entries.filter(e => e.clientId !== id);

      setClients(updatedClients);
      setProjects(updatedProjects);
      setEntries(updatedEntries);

      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(updatedClients));
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
      localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(updatedEntries));

      if (selectedProjectFilter) {
        const prj = projects.find(p => p.id === selectedProjectFilter);
        if (prj && prj.clientId === id) {
          setSelectedProjectFilter(null);
        }
      }

      showToast('הלקוח וכל הרשומות המקושרות נמחקו בהצלחה');
      return { success: true };
    } catch (err: any) {
      console.error('Delete client failed:', err);
      showToast(err.message || 'שגיאה במחיקת הלקוח');
      return { success: false, error: err.message };
    }
  };

  // Project actions
  const addProject = async (
    name: string,
    clientId: string,
    icon: string = 'Folder',
    color: string = '#BC796F',
    hourlyRate?: number | null
  ): Promise<{ success: boolean; project?: Project; error?: string }> => {
    const nowIso = new Date().toISOString();
    const newProject: Project = {
      id: 'project_' + Date.now(),
      name: name.trim(),
      clientId,
      icon,
      color,
      hourlyRate: typeof hourlyRate === 'number' && hourlyRate >= 0 ? hourlyRate : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const saveRes = await postDurableJson('/api/app-data/project/save', newProject, 'שגיאה בשמירת הפרויקט בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const updated = [...projects, newProject];
    setProjects(updated);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
    showToast(`הפרויקט "${newProject.name}" נוצר בהצלחה`);
    return { success: true, project: newProject };
  };

  const updateProject = async (updatedProject: Project): Promise<{ success: boolean; error?: string }> => {
    const payload: Project = {
      ...updatedProject,
      updatedAt: new Date().toISOString(),
    };
    const saveRes = await postDurableJson('/api/app-data/project/save', payload, 'שגיאה בעדכון הפרויקט בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    const updated = projects.map(p => (p.id === payload.id ? payload : p));
    setProjects(updated);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
    showToast('הפרויקט עודכן');
    return { success: true };
  };

  const getProjectStats = (id: string) => {
    const linkedEntries = entries.filter(e => e.projectId === id);
    return {
      entryCount: linkedEntries.length,
    };
  };

  const deleteProject = async (id: string): Promise<{ success: boolean; error?: string }> => {
    // Active timer protection
    if (activeTimer?.isRunning && activeTimer.projectId === id) {
      const msg = 'לא ניתן למחוק פרויקט כאשר הטיימר פועל עבורו. יש לעצור את הטיימר תחילה.';
      showToast(msg);
      return { success: false, error: msg };
    }

    try {
      const res = await fetch('/api/app-data/project/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (res.status === 401) {
        try {
          window.dispatchEvent(new CustomEvent('amit-auth-expired'));
        } catch {}
        throw new Error('פג תוקף ההתחברות. יש להתחבר מחדש.');
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'שגיאה במחיקת הפרויקט מהשרת');
      }

      // Cascade delete: remove project and linked entries
      const updatedProjects = projects.filter(p => p.id !== id);
      const updatedEntries = entries.filter(e => e.projectId !== id);

      setProjects(updatedProjects);
      setEntries(updatedEntries);

      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
      localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(updatedEntries));

      if (selectedProjectFilter === id) {
        setSelectedProjectFilter(null);
      }

      showToast('הפרויקט והרשומות המקושרות נמחקו בהצלחה');
      return { success: true };
    } catch (err: any) {
      console.error('Delete project failed:', err);
      showToast(err.message || 'שגיאה במחיקת הפרויקט');
      return { success: false, error: err.message };
    }
  };

  // Settings
  const updateSettings = async (partial: Partial<Settings>): Promise<{ success: boolean; error?: string }> => {
    const nextSettings: Settings = { ...settings, ...partial };
    const saveRes = await postDurableJson('/api/app-data/settings', nextSettings, 'שגיאה בשמירת ההגדרות בשרת');
    if (!saveRes.ok) {
      showToast(saveRes.error);
      return { success: false, error: saveRes.error };
    }

    setSettings(nextSettings);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(nextSettings));
    showToast('ההגדרות נשמרו');
    return { success: true };
  };

  // Clear demo data specifically
  const clearDemoData = () => {
    setClients(prev => prev.filter(c => !DEMO_CLIENT_IDS.includes(c.id)));
    setProjects(prev => prev.filter(p => !DEMO_PROJECT_IDS.includes(p.id) && !DEMO_CLIENT_IDS.includes(p.clientId)));
    setEntries(prev => prev.filter(e => 
      !DEMO_ENTRY_IDS.includes(e.id) && 
      !DEMO_CLIENT_IDS.includes(e.clientId) && 
      !DEMO_PROJECT_IDS.includes(e.projectId)
    ));
    if (activeTimer && (DEMO_CLIENT_IDS.includes(activeTimer.clientId) || DEMO_PROJECT_IDS.includes(activeTimer.projectId))) {
      setActiveTimer(null);
      setElapsedSeconds(0);
    }
    showToast('נתוני הדוגמה הוסרו בהצלחה');
  };

  // Manual reset of all work data (preserves branding & preferences)
  const clearAllWorkData = () => {
    setClients([]);
    setProjects([]);
    setEntries([]);
    setActiveTimer(null);
    setElapsedSeconds(0);
    setSelectedProjectFilter(null);

    localStorage.removeItem(STORAGE_KEYS.CLIENTS);
    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
    localStorage.removeItem(STORAGE_KEYS.ENTRIES);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIMER);

    showToast('כל נתוני העבודה נמחקו. המערכת מוכנה לנתונים אמיתיים');
  };

  return (
    <AppContext.Provider
      value={{
        clients,
        projects,
        entries,
        activeTimer,
        settings,
        currentView,
        routeParams,
        updateRouteParams,
        selectedProjectFilter,
        elapsedSeconds,
        setCurrentView,
        setSelectedProjectFilter,
        startTimer,
        stopTimer,
        cancelTimer,
        addEntry,
        updateEntry,
        deleteEntry,
        addClient,
        updateClient,
        deleteClient,
        getClientStats,
        addProject,
        updateProject,
        deleteProject,
        getProjectStats,
        updateSettings,
        clearAllWorkData,
        clearDemoData,
        toastMessage,
        showToast,
        appSyncConflict,
        isEphemeralServerWarning,
        isTimerReminderActive,
        snoozeTimerReminder,
        fixTimerEndTime,
        refreshAppData,
        forceAcceptServerAppData,
        dismissAppSyncConflict,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
