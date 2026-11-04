import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { TimeEntry } from '../types';
import { 
  toISODateString, 
  calculateDurationFromTimes, 
  formatDurationHHMMSS 
} from '../utils/dateUtils';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import { CustomTimePicker } from './CustomTimePicker';
import { X, Clock, AlertCircle, Save } from 'lucide-react';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryToEdit?: TimeEntry | null;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  entryToEdit,
}) => {
  const { clients, projects, addEntry, updateEntry } = useApp();

  const [date, setDate] = useState<string>(toISODateString());
  const [clientId, setClientId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [task, setTask] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('10:30');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Sync state when opening or when entryToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (entryToEdit) {
        setDate(entryToEdit.date);
        setClientId(entryToEdit.clientId);
        setProjectId(entryToEdit.projectId);
        setTask(entryToEdit.task);
        setStartTime(entryToEdit.startTime || '09:00');
        setEndTime(entryToEdit.endTime || '10:00');
      } else {
        setDate(toISODateString());
        const defaultClient = clients[0]?.id || '';
        setClientId(defaultClient);
        const clientProjects = projects.filter(p => p.clientId === defaultClient);
        setProjectId(clientProjects[0]?.id || '');
        setTask('');
        setStartTime('09:00');
        setEndTime('10:30');
      }
      setErrors({});

      // Focus first input
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, entryToEdit, clients, projects]);

  // When client changes, update available project
  useEffect(() => {
    if (clientId) {
      const clientProjects = projects.filter(p => p.clientId === clientId);
      if (!clientProjects.some(p => p.id === projectId)) {
        setProjectId(clientProjects[0]?.id || '');
      }
    }
  }, [clientId, projects, projectId]);

  // Keyboard accessibility: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter projects for selected client
  const availableProjects = projects.filter(p => p.clientId === clientId);

  // Live calculated duration
  const calculatedSeconds = calculateDurationFromTimes(startTime, endTime);
  const isTimeOrderValid = calculatedSeconds > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};

    if (!clientId) newErrors.clientId = 'יש לבחור לקוח';
    if (!projectId) newErrors.projectId = 'יש לבחור פרויקט';
    if (!task.trim()) newErrors.task = 'יש למלא תיאור משימה';
    if (!startTime) newErrors.startTime = 'שעת התחלה חסרה';
    if (!endTime) newErrors.endTime = 'שעת סיום חסרה';
    if (startTime && endTime && !isTimeOrderValid) {
      newErrors.timeOrder = 'שעת הסיום חייבת להיות מאוחרת משעת ההתחלה';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (entryToEdit) {
      updateEntry({
        ...entryToEdit,
        clientId,
        projectId,
        task: task.trim(),
        date,
        startTime,
        endTime,
        durationSeconds: calculatedSeconds,
      });
    } else {
      addEntry({
        clientId,
        projectId,
        task: task.trim(),
        date,
        startTime,
        endTime,
        durationSeconds: calculatedSeconds,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-warm-950/30 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        dir="rtl"
        aria-labelledby="modal-title"
        className="relative w-full max-w-lg liquid-glass rounded-2xl shadow-2xl p-6 sm:p-7 z-10 animate-in fade-in zoom-in-95 duration-200 border border-white/80"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#BC796F]/15 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#BC796F]/20 flex items-center justify-center text-[#BC796F]">
              <Clock className="w-4 h-4" />
            </div>
            <h2 id="modal-title" className="text-lg font-bold text-warm-900 tracking-tight">
              {entryToEdit ? 'עריכת רשומת שעות' : 'הוספת שעות ידנית'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-warm-700 hover:text-warm-950 hover:bg-white/60 transition-colors"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* General Time Order Error */}
          {errors.timeOrder && (
            <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errors.timeOrder}</span>
            </div>
          )}

          {/* Date Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-warm-800/90">תאריך</label>
            <CustomDatePicker
              value={date}
              onChange={setDate}
            />
          </div>

          {/* Client & Project Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Client */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-warm-800/90">לקוח</label>
                {errors.clientId && (
                  <span className="text-[11px] text-red-600">{errors.clientId}</span>
                )}
              </div>
              <CustomSelect
                value={clientId}
                onChange={setClientId}
                placeholder="בחירת לקוח..."
                options={clients.map(c => ({
                  value: c.id,
                  label: c.name,
                }))}
                triggerClassName="h-10 bg-white/70"
              />
            </div>

            {/* Project */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-warm-800/90">פרויקט</label>
                {errors.projectId && (
                  <span className="text-[11px] text-red-600">{errors.projectId}</span>
                )}
              </div>
              <CustomSelect
                value={projectId}
                onChange={setProjectId}
                disabled={availableProjects.length === 0}
                placeholder={availableProjects.length === 0 ? 'אין פרויקטים ללקוח זה' : 'בחירת פרויקט...'}
                options={availableProjects.map(p => ({
                  value: p.id,
                  label: p.name,
                }))}
                triggerClassName="h-10 bg-white/70"
              />
            </div>
          </div>

          {/* Task Description */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-warm-800/90">תיאור משימה</label>
              {errors.task && (
                <span className="text-[11px] text-red-600">{errors.task}</span>
              )}
            </div>
            <input
              type="text"
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="לדוגמה: אפיון מסכים ועיצוב טיפוגרפי"
              className="w-full h-10 px-3.5 rounded-xl text-sm font-medium text-warm-900 placeholder:text-warm-700/40 liquid-glass-input text-right"
            />
          </div>

          {/* Start Time, End Time & Calculated Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
            {/* Start Time */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-warm-800/90">שעת התחלה</label>
              <CustomTimePicker
                value={startTime}
                onChange={setStartTime}
                placeholder="09:00"
              />
            </div>

            {/* End Time */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-warm-800/90">שעת סיום</label>
              <CustomTimePicker
                value={endTime}
                onChange={setEndTime}
                placeholder="10:30"
              />
            </div>

            {/* Calculated Duration */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-warm-800/90">משך זמן מחושב</label>
              <div 
                dir="ltr"
                className={`h-10 px-3 rounded-xl text-sm font-heebo tabular-nums font-bold flex items-center justify-center border ${
                  isTimeOrderValid 
                    ? 'bg-white/80 border-[#BC796F]/30 text-warm-950' 
                    : 'bg-red-50/70 border-red-200 text-red-700'
                }`}
              >
                {isTimeOrderValid ? formatDurationHHMMSS(calculatedSeconds) : '--:--:--'}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#BC796F]/15 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-warm-800 liquid-glass-btn-secondary hover:bg-white/70 transition-all"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>שמירה</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
