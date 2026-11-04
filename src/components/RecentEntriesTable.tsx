import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { TimeEntry } from '../types';
import { formatDurationHHMM } from '../utils/dateUtils';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { Edit2, Trash2, ArrowLeft, Clock, Plus } from 'lucide-react';

interface RecentEntriesTableProps {
  onEditEntry: (entry: TimeEntry) => void;
  onOpenAllEntries: () => void;
  onOpenManualModal?: () => void;
}

export const RecentEntriesTable: React.FC<RecentEntriesTableProps> = ({
  onEditEntry,
  onOpenAllEntries,
  onOpenManualModal,
}) => {
  const { entries, clients, projects, deleteEntry } = useApp();
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null);

  // Sort newest first by date and startTime
  const sortedEntries = [...entries].sort((a, b) => {
    const dateTimeA = `${a.date}T${a.startTime || '00:00'}`;
    const dateTimeB = `${b.date}T${b.startTime || '00:00'}`;
    return dateTimeB.localeCompare(dateTimeA);
  });

  const recentEntries = sortedEntries.slice(0, 4);

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'לקוח לא ידוע';
  };

  const getProjectInfo = (projectId: string) => {
    return projects.find(p => p.id === projectId) || { name: 'פרויקט כללי', color: '#BC796F' };
  };

  const formatDateDisplay = (dateStr: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) return 'היום';
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  };

  return (
    <div className="liquid-glass rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full transition-all duration-300">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-[21px] sm:text-[23px] font-bold text-warm-900 tracking-tight">
            רשומות אחרונות
          </h2>

          {entries.length > 0 && (
            <button
              onClick={onOpenAllEntries}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#88463F] hover:text-[#5C2B25] transition-colors group px-2 py-1 rounded-lg hover:bg-white/30"
            >
              <span>הצגת כל הרשומות</span>
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            </button>
          )}
        </div>

        {/* Empty State */}
        {recentEntries.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/40 border border-white/60 flex items-center justify-center text-[#BC796F]">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-warm-900 text-sm">עדיין אין דיווחי שעות</h3>
              <p className="text-xs text-[#7D5A56] mt-0.5">
                הפעל את הטיימר למעקב או הוסף דיווח שעות ידני ראשון.
              </p>
            </div>
            {onOpenManualModal && (
              <button
                type="button"
                onClick={onOpenManualModal}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white liquid-glass-btn-primary shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>הוספת דיווח</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-[#BC796F]/15 text-[#7D5A56] text-xs font-medium">
                    <th className="pb-3 pr-1 font-medium w-[70px]">תאריך</th>
                    <th className="pb-3 font-medium w-[140px]">לקוח</th>
                    <th className="pb-3 font-medium w-[160px]">פרויקט</th>
                    <th className="pb-3 font-medium">משימה</th>
                    <th className="pb-3 font-medium w-[90px]">משך זמן</th>
                    <th className="pb-3 pl-1 text-left font-medium w-[65px]">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#BC796F]/10 text-sm">
                  {recentEntries.map(entry => {
                    const project = getProjectInfo(entry.projectId);

                    return (
                      <tr
                        key={entry.id}
                        className="group hover:bg-white/20 transition-colors duration-150"
                      >
                        {/* Date */}
                        <td className="py-3.5 pr-1 text-xs font-normal text-[#7D5A56] whitespace-nowrap">
                          {formatDateDisplay(entry.date)}
                        </td>

                        {/* Client */}
                        <td className="py-3.5 font-medium text-warm-900 whitespace-nowrap text-xs sm:text-sm">
                          {getClientName(entry.clientId)}
                        </td>

                        {/* Project with color marker */}
                        <td className="py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: project.color || '#BC796F' }}
                            />
                            <span className="text-xs sm:text-sm text-warm-900 font-medium truncate max-w-[140px]">
                              {project.name}
                            </span>
                          </div>
                        </td>

                        {/* Task */}
                        <td 
                          className="py-3.5 text-[#5C3D3A] text-xs sm:text-sm truncate max-w-[200px]"
                          title={entry.task}
                        >
                          {entry.task}
                        </td>

                        {/* Duration */}
                        <td className="py-3.5 whitespace-nowrap">
                          <span 
                            dir="ltr"
                            className="tabular-nums text-xs sm:text-sm font-medium text-warm-950 inline-block"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatDurationHHMM(entry.durationSeconds)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 pl-1 text-left whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            <button
                              onClick={() => onEditEntry(entry)}
                              className="p-1 rounded text-[#7D5A56] hover:text-warm-950 hover:bg-white/40 transition-colors"
                              title="עריכת רשומה"
                              aria-label="עריכת רשומה"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEntryToDelete(entry)}
                              className="p-1 rounded text-[#7D5A56] hover:text-red-700 hover:bg-red-50/50 transition-colors"
                              title="מחיקת רשומה"
                              aria-label="מחיקת רשומה"
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
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden flex flex-col gap-3">
              {recentEntries.map(entry => {
                const project = getProjectInfo(entry.projectId);

                return (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-2xl liquid-glass-subtle flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: project.color || '#BC796F' }}
                        />
                        <span className="font-semibold text-warm-900 text-sm">
                          {project.name}
                        </span>
                      </div>
                      <span 
                        dir="ltr"
                        className="tabular-nums text-xs font-semibold text-warm-950"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatDurationHHMM(entry.durationSeconds)}
                      </span>
                    </div>

                    <div className="text-xs text-[#5C3D3A] line-clamp-2">
                      {entry.task}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#BC796F]/10 text-xs text-[#7D5A56]">
                      <span>{getClientName(entry.clientId)} • {formatDateDisplay(entry.date)}</span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEditEntry(entry)}
                          className="p-1 rounded text-[#7D5A56] hover:text-warm-950"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEntryToDelete(entry)}
                          className="p-1 rounded text-[#7D5A56] hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal for Entry */}
      {entryToDelete && (
        <DeleteConfirmModal
          isOpen={!!entryToDelete}
          onClose={() => setEntryToDelete(null)}
          onConfirm={() => deleteEntry(entryToDelete.id)}
          title="מחיקת דיווח שעות"
          itemName={`${entryToDelete.task} (${formatDurationHHMM(entryToDelete.durationSeconds)})`}
          warningDetails="רשומת שעות זו תימחק לצמיתות מסך השעות והדוחות."
        />
      )}
    </div>
  );
};
