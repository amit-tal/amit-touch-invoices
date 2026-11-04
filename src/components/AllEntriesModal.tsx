import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { TimeEntry } from '../types';
import { 
  formatDurationHHMMSS, 
  isDateInCurrentJerusalemMonth, 
  isDateToday, 
  isDateInThisWeek 
} from '../utils/dateUtils';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { CustomSelect } from './CustomSelect';
import { X, Search, Trash2, Edit2, Calendar } from 'lucide-react';

interface AllEntriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditEntry: (entry: TimeEntry) => void;
  initialProjectId?: string | null;
  initialDateRange?: 'all' | 'today' | 'week' | 'month';
}

export const AllEntriesModal: React.FC<AllEntriesModalProps> = ({
  isOpen,
  onClose,
  onEditEntry,
  initialProjectId = null,
  initialDateRange = 'all',
}) => {
  const { entries, clients, projects, deleteEntry } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>(initialProjectId || '');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>(initialDateRange);
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null);

  // Sync initialProjectId and initialDateRange if passed
  React.useEffect(() => {
    if (isOpen) {
      if (initialProjectId) {
        setFilterProject(initialProjectId);
        const prj = projects.find(p => p.id === initialProjectId);
        if (prj) setFilterClient(prj.clientId);
      } else {
        setFilterProject('');
        setFilterClient('');
      }
      setDateRange(initialDateRange || 'all');
    }
  }, [isOpen, initialProjectId, initialDateRange, projects]);

  if (!isOpen) return null;

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'ללא לקוח';
  };

  const getProject = (projectId: string) => {
    return projects.find(p => p.id === projectId) || { name: 'פרויקט כללי', color: '#BC796F' };
  };

  // Filtered & sorted entries
  const filteredEntries = entries.filter(entry => {
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const clientName = getClientName(entry.clientId).toLowerCase();
      const projectName = getProject(entry.projectId).name.toLowerCase();
      const task = entry.task.toLowerCase();
      if (!clientName.includes(q) && !projectName.includes(q) && !task.includes(q)) {
        return false;
      }
    }

    // Client filter
    if (filterClient && entry.clientId !== filterClient) {
      return false;
    }

    // Project filter
    if (filterProject && entry.projectId !== filterProject) {
      return false;
    }

    // Date range filter
    if (dateRange !== 'all') {
      if (dateRange === 'today' && !isDateToday(entry.date)) return false;
      if (dateRange === 'week' && !isDateInThisWeek(entry.date)) return false;
      if (dateRange === 'month' && !isDateInCurrentJerusalemMonth(entry.date)) return false;
    }

    return true;
  }).sort((a, b) => `${b.date}T${b.startTime || '00:00'}`.localeCompare(`${a.date}T${a.startTime || '00:00'}`));

  const totalFilteredSeconds = filteredEntries.reduce((sum, e) => sum + e.durationSeconds, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-warm-950/35 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div 
        role="dialog"
        aria-modal="true"
        dir="rtl"
        className="relative w-full max-w-4xl h-[90vh] liquid-glass rounded-2xl shadow-2xl p-5 sm:p-7 z-10 flex flex-col justify-between overflow-hidden border border-white/80"
      >
        {/* Top Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-[#BC796F]/15 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#BC796F]/20 flex items-center justify-center text-[#BC796F]">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-warm-900 tracking-tight">
                  יומן רשומות מלא
                </h2>
                <span className="text-xs text-warm-700/80">
                  נמצאו {filteredEntries.length} רשומות • סך הכל: {formatDurationHHMMSS(totalFilteredSeconds)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-warm-700 hover:text-warm-950 hover:bg-white/60 transition-colors"
              aria-label="סגירה"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 mb-4">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-warm-600 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חיפוש משימה או לקוח..."
                className="w-full h-9 pr-9 pl-3 rounded-xl text-xs sm:text-sm font-medium text-warm-900 placeholder:text-warm-700/50 liquid-glass-input"
              />
            </div>

            {/* Client Filter */}
            <CustomSelect
              value={filterClient}
              onChange={v => {
                setFilterClient(v);
                setFilterProject('');
              }}
              options={[
                { value: '', label: 'כל הלקוחות' },
                ...clients.map(c => ({ value: c.id, label: c.name })),
              ]}
              triggerClassName="h-9 px-3 text-xs sm:text-sm bg-white/70"
            />

            {/* Project Filter */}
            <CustomSelect
              value={filterProject}
              onChange={setFilterProject}
              options={[
                { value: '', label: 'כל הפרויקטים' },
                ...projects
                  .filter(p => !filterClient || p.clientId === filterClient)
                  .map(p => ({ value: p.id, label: p.name })),
              ]}
              triggerClassName="h-9 px-3 text-xs sm:text-sm bg-white/70"
            />

            {/* Date Range Buttons */}
            <div className="flex rounded-xl p-0.5 bg-white/40 border border-white/60 text-xs font-medium">
              <button
                onClick={() => setDateRange('all')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  dateRange === 'all' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
                }`}
              >
                הכל
              </button>
              <button
                onClick={() => setDateRange('today')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  dateRange === 'today' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
                }`}
              >
                היום
              </button>
              <button
                onClick={() => setDateRange('week')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  dateRange === 'week' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
                }`}
              >
                השבוע
              </button>
              <button
                onClick={() => setDateRange('month')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  dateRange === 'month' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
                }`}
              >
                החודש
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Entries Table */}
        <div className="flex-1 overflow-y-auto pr-1">
          {filteredEntries.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-warm-700/60 text-sm">
              לא נמצאו רשומות העונות לסינון המבוקש.
            </div>
          ) : (
            <table className="w-full text-right border-collapse">
              <thead className="sticky top-0 bg-[#FAF4F2]/90 backdrop-blur-md z-10">
                <tr className="border-b border-[#BC796F]/15 text-warm-700/70 text-xs font-semibold">
                  <th className="pb-3 pr-2 font-medium">תאריך</th>
                  <th className="pb-3 font-medium">שעות</th>
                  <th className="pb-3 font-medium">לקוח</th>
                  <th className="pb-3 font-medium">פרויקט</th>
                  <th className="pb-3 font-medium">משימה</th>
                  <th className="pb-3 font-medium">משך זמן</th>
                  <th className="pb-3 pl-2 text-left font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#BC796F]/10 text-sm">
                {filteredEntries.map(entry => {
                  const project = getProject(entry.projectId);

                  return (
                    <tr key={entry.id} className="group hover:bg-white/40 transition-colors">
                      <td className="py-3 pr-2 text-xs font-heebo tabular-nums text-warm-800/80 whitespace-nowrap" dir="ltr">
                        {entry.date}
                      </td>
                      <td className="py-3 text-xs font-heebo tabular-nums text-warm-700 whitespace-nowrap" dir="ltr">
                        {entry.startTime} - {entry.endTime}
                      </td>
                      <td className="py-3 font-medium text-warm-900 text-xs sm:text-sm whitespace-nowrap">
                        {getClientName(entry.clientId)}
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="text-xs sm:text-sm text-warm-900 font-medium">
                            {project.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-warm-800/80 text-xs sm:text-sm max-w-[220px] truncate">
                        {entry.task}
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <span dir="ltr" className="font-heebo tabular-nums text-xs sm:text-sm font-semibold text-warm-950 bg-white/40 px-2 py-0.5 rounded border border-white/60">
                          {formatDurationHHMMSS(entry.durationSeconds)}
                        </span>
                      </td>
                      <td className="py-3 pl-2 text-left whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEditEntry(entry)}
                            className="p-1.5 rounded-lg text-warm-700 hover:text-warm-950 hover:bg-white/60 transition-colors"
                            title="עריכה"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEntryToDelete(entry)}
                            className="p-1.5 rounded-lg text-warm-700 hover:text-red-700 hover:bg-red-50/80 transition-colors"
                            title="מחיקה"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#BC796F]/15 flex items-center justify-between text-xs text-warm-700/80">
          <span>סה״כ שעות מחושבות: <strong className="font-heebo tabular-nums text-warm-950">{formatDurationHHMMSS(totalFilteredSeconds)}</strong></span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-medium text-warm-900 liquid-glass-btn-secondary hover:bg-white/80 transition-all"
          >
            סגירה
          </button>
        </div>
      </div>

      {/* Delete Entry Confirm Dialog */}
      <DeleteConfirmModal
        isOpen={!!entryToDelete}
        onClose={() => setEntryToDelete(null)}
        onConfirm={() => {
          if (entryToDelete) {
            deleteEntry(entryToDelete.id);
            setEntryToDelete(null);
          }
        }}
        title="מחיקת דיווח שעות"
        itemName={entryToDelete?.task ? `"${entryToDelete.task}"` : 'דיווח שעות זה'}
        warningDetails={entryToDelete ? `משך הדיווח: ${formatDurationHHMMSS(entryToDelete.durationSeconds)} מתאריך ${entryToDelete.date}. לא ניתן לשחזר דיווח זה לאחר המחיקה.` : undefined}
      />
    </div>
  );
};
