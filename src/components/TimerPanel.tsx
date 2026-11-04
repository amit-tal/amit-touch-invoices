import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDurationHHMMSS } from '../utils/dateUtils';
import { CustomSelect } from './CustomSelect';
import { Play, Square, Plus, AlertCircle, Users } from 'lucide-react';

interface TimerPanelProps {
  onOpenManualModal: () => void;
  onOpenAddClient?: () => void;
  onOpenAddProject?: () => void;
}

export const TimerPanel: React.FC<TimerPanelProps> = ({
  onOpenManualModal,
  onOpenAddClient,
  onOpenAddProject,
}) => {
  const {
    clients,
    projects,
    activeTimer,
    elapsedSeconds,
    startTimer,
    stopTimer,
  } = useApp();

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // When active timer exists, lock to its client and project
  useEffect(() => {
    if (activeTimer && activeTimer.isRunning) {
      setSelectedClientId(activeTimer.clientId);
      setSelectedProjectId(activeTimer.projectId);
      setTaskDescription(activeTimer.task);
      setValidationError(null);
    } else {
      // If idle, default client/project if not selected
      if (!selectedClientId && clients.length > 0) {
        setSelectedClientId(clients[0].id);
      }
    }
  }, [activeTimer, clients, selectedClientId]);

  // Filter projects based on selected client
  const availableProjects = projects.filter(p => p.clientId === selectedClientId);

  // Update selected project if client changes and selected project is not in available projects
  useEffect(() => {
    if (!activeTimer?.isRunning && availableProjects.length > 0) {
      if (!availableProjects.some(p => p.id === selectedProjectId)) {
        setSelectedProjectId(availableProjects[0].id);
      }
    } else if (availableProjects.length === 0) {
      setSelectedProjectId('');
    }
  }, [selectedClientId, availableProjects, selectedProjectId, activeTimer]);

  const handleStartStop = () => {
    setValidationError(null);
    if (activeTimer?.isRunning) {
      stopTimer();
    } else {
      if (!selectedClientId) {
        setValidationError('יש לבחור לקוח');
        return;
      }
      if (!selectedProjectId) {
        setValidationError('יש לבחור פרויקט');
        return;
      }
      const res = startTimer(selectedClientId, selectedProjectId, taskDescription);
      if (!res.success && res.error) {
        setValidationError(res.error);
      }
    }
  };

  const isRunning = !!activeTimer?.isRunning;
  const currentClient = clients.find(c => c.id === selectedClientId);
  const currentProject = projects.find(p => p.id === selectedProjectId);

  const hasClients = clients.length > 0;
  const hasProjects = availableProjects.length > 0;
  const canStartTimer = hasClients && hasProjects;

  return (
    <div className="liquid-glass rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full transition-all duration-300">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-[21px] sm:text-[23px] font-bold text-warm-900 tracking-tight">
          במה מתמקדים עכשיו?
        </h2>

        {/* Running lock badge */}
        {isRunning && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#BC796F]/15 text-[#88463F] border border-[#BC796F]/25 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[#BC796F]" />
            <span>פעיל: {currentClient?.name} / {currentProject?.name}</span>
          </div>
        )}
      </div>

      {/* Validation alert banner */}
      {validationError && (
        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Main Two-Column Layout inside Timer Panel:
          Right column = Input Fields (stacked on separate rows)
          Left column = Timer (76-88px) & Pill Actions
          Subtle vertical divider between them */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center flex-1 my-auto">
        {/* Right Section: Fields on separate rows in RTL */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          {!hasClients ? (
            /* Empty State Guide when no clients exist */
            <div className="p-4 rounded-2xl liquid-glass-subtle flex flex-col gap-3 text-right">
              <div className="flex items-center gap-2 text-[#BC796F]">
                <Users className="w-5 h-5" />
                <span className="text-sm font-semibold text-warm-900">עדיין אין לקוחות</span>
              </div>
              <p className="text-xs text-[#7D5A56] leading-relaxed">
                כדי להתחיל לעקוב אחר שעות, יש ליצור לקוח ראשון במערכת.
              </p>
              {onOpenAddClient && (
                <button
                  type="button"
                  onClick={onOpenAddClient}
                  className="w-fit flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white liquid-glass-btn-primary shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>הוספת לקוח</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Row 1: Client Select */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1">
                  <label 
                    htmlFor="client-select" 
                    className="text-xs font-medium text-warm-800/80"
                  >
                    לקוח
                  </label>
                  {onOpenAddClient && !isRunning && (
                    <button
                      type="button"
                      onClick={onOpenAddClient}
                      className="text-[11px] text-[#88463F] hover:underline"
                    >
                      + לקוח חדש
                    </button>
                  )}
                </div>
                <CustomSelect
                  id="client-select"
                  value={selectedClientId}
                  onChange={setSelectedClientId}
                  disabled={isRunning}
                  placeholder="בחירת לקוח..."
                  options={clients.map(c => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  triggerClassName={`h-11 ${isRunning ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>

              {/* Row 2: Project Select */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1">
                  <label 
                    htmlFor="project-select" 
                    className="text-xs font-medium text-warm-800/80"
                  >
                    פרויקט
                  </label>
                  {onOpenAddProject && !isRunning && (
                    <button
                      type="button"
                      onClick={onOpenAddProject}
                      className="text-[11px] text-[#88463F] hover:underline"
                    >
                      + פרויקט חדש
                    </button>
                  )}
                </div>
                <CustomSelect
                  id="project-select"
                  value={selectedProjectId}
                  onChange={setSelectedProjectId}
                  disabled={isRunning || !hasProjects}
                  placeholder={!hasProjects ? 'אין פרויקטים ללקוח זה' : 'בחירת פרויקט...'}
                  options={availableProjects.map(p => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  triggerClassName={`h-11 ${isRunning || !hasProjects ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>

              {/* Row 3: Task Input */}
              <div className="flex flex-col gap-1.5">
                <label 
                  htmlFor="task-input" 
                  className="text-xs font-medium text-warm-800/80 px-1"
                >
                  משימה
                </label>
                <input
                  id="task-input"
                  type="text"
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  disabled={isRunning}
                  placeholder="מה המשימה הנוכחית? (לדוגמה: מחקר וקונספט עיצובי)"
                  className={`w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 placeholder:text-warm-700/40 liquid-glass-input ${
                    isRunning ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                />
              </div>
            </>
          )}
        </div>

        {/* Left Section: Timer Display & Actions with subtle vertical separator in RTL */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center lg:border-r lg:border-[#BC796F]/15 lg:pr-8 py-2">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                isRunning
                  ? 'bg-[#C9877C] shadow-[0_0_8px_#C9877C] animate-ping'
                  : 'bg-warm-400'
              }`}
            />
            <span className="text-xs font-medium text-[#7D5A56]">
              {isRunning ? 'הטיימר פועל' : 'מוכנים להתחיל'}
            </span>
          </div>

          {/* Focal Point: Massive Clean Sans-Serif Heebo Timer (76–88px on wide desktop) */}
          <div 
            dir="ltr"
            className="text-5xl sm:text-6xl md:text-7xl lg:text-[78px] xl:text-[84px] leading-none font-medium text-warm-950 tabular-nums tracking-tight my-2 select-all"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatDurationHHMMSS(elapsedSeconds)}
          </div>

          {/* Actions beneath timer */}
          <div className="flex flex-col items-center gap-2.5 mt-3 w-full max-w-[280px]">
            {/* Primary Action: Wide Rose Glass Pill */}
            <button
              onClick={handleStartStop}
              disabled={!isRunning && !canStartTimer}
              className={`w-full h-12 rounded-full text-base font-medium text-white shadow-md flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] ${
                isRunning
                  ? 'liquid-glass-btn-danger'
                  : canStartTimer
                  ? 'liquid-glass-btn-primary'
                  : 'bg-warm-400/40 text-warm-700/60 cursor-not-allowed border border-white/40'
              }`}
            >
              {isRunning ? (
                <>
                  <Square className="w-4 h-4 fill-white" />
                  <span>עצירת הטיימר</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>התחלת עבודה</span>
                </>
              )}
            </button>

            {/* Quieter Secondary Action */}
            <button
              onClick={onOpenManualModal}
              disabled={!hasClients || !hasProjects}
              className={`text-xs sm:text-sm font-normal transition-colors py-1 flex items-center gap-1.5 ${
                hasClients && hasProjects 
                  ? 'text-[#7D5A56] hover:text-warm-950' 
                  : 'text-[#7D5A56]/40 cursor-not-allowed'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>הוספת שעות ידנית</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
