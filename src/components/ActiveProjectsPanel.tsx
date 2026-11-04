import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatHoursDecimal, isDateInCurrentJerusalemMonth } from '../utils/dateUtils';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { 
  Palette, 
  Layout, 
  Sparkles, 
  Layers, 
  Folder, 
  Smartphone, 
  Megaphone, 
  Briefcase,
  ArrowLeft,
  Plus,
  Trash2
} from 'lucide-react';

interface ActiveProjectsPanelProps {
  onSelectProjectFilter: (projectId: string) => void;
  onOpenAllProjects?: () => void;
  onOpenAddProject?: () => void;
}

const getProjectIcon = (iconName: string) => {
  switch (iconName) {
    case 'Palette':
      return Palette;
    case 'Layout':
      return Layout;
    case 'Sparkles':
      return Sparkles;
    case 'Layers':
      return Layers;
    case 'Smartphone':
      return Smartphone;
    case 'Megaphone':
      return Megaphone;
    case 'Briefcase':
      return Briefcase;
    default:
      return Folder;
  }
};

export const ActiveProjectsPanel: React.FC<ActiveProjectsPanelProps> = ({
  onSelectProjectFilter,
  onOpenAllProjects,
  onOpenAddProject,
}) => {
  const { 
    projects, 
    clients, 
    entries, 
    activeTimer, 
    elapsedSeconds, 
    deleteProject, 
    getProjectStats 
  } = useApp();

  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);

  // Calculate tracked hours for the current calendar month (Asia/Jerusalem) and rate for each project
  const projectsWithStats = projects.map(project => {
    let projectSeconds = entries
      .filter(e => e.projectId === project.id && isDateInCurrentJerusalemMonth(e.date))
      .reduce((sum, e) => sum + e.durationSeconds, 0);

    if (activeTimer?.isRunning && activeTimer.projectId === project.id) {
      projectSeconds += elapsedSeconds;
    }

    const trackedHours = projectSeconds / 3600;
    const client = clients.find(c => c.id === project.clientId);
    const hasRate = typeof project.hourlyRate === 'number';

    return {
      ...project,
      clientName: client?.name || 'ללא לקוח',
      trackedHours,
      hasRate,
    };
  });

  const previewProjects = projectsWithStats.slice(0, 3);

  const handleDeleteClick = (e: React.MouseEvent, p: { id: string; name: string }) => {
    e.stopPropagation();
    setProjectToDelete(p);
  };

  const isTimerRunningOnProject = projectToDelete 
    ? activeTimer?.isRunning && activeTimer.projectId === projectToDelete.id
    : false;

  const projectStats = projectToDelete ? getProjectStats(projectToDelete.id) : { entryCount: 0 };

  return (
    <div className="liquid-glass rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full transition-all duration-300">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-[21px] sm:text-[23px] font-bold text-warm-900 tracking-tight">
            פרויקטים פעילים
          </h2>

          {projects.length > 0 && onOpenAllProjects && (
            <button
              onClick={onOpenAllProjects}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#88463F] hover:text-[#5C2B25] transition-colors group px-2 py-1 rounded-lg hover:bg-white/30"
            >
              <span>הצגת כל הפרויקטים</span>
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            </button>
          )}
        </div>

        {/* Empty State */}
        {projects.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/40 border border-white/60 flex items-center justify-center text-[#BC796F]">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-warm-900 text-sm">עדיין אין פרויקטים</h3>
              <p className="text-xs text-[#7D5A56] mt-0.5">
                צור פרויקט חדש כדי לעקוב אחר שעות, תעריפים והכנסות.
              </p>
            </div>
            {onOpenAddProject && (
              <button
                type="button"
                onClick={onOpenAddProject}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white liquid-glass-btn-primary shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>הוספת פרויקט</span>
              </button>
            )}
          </div>
        ) : (
          /* Project rows directly inside the parent glass panel */
          <div className="divide-y divide-[#BC796F]/12">
            {previewProjects.map(project => {
              const Icon = getProjectIcon(project.icon);

              return (
                <div
                  key={project.id}
                  onClick={() => onSelectProjectFilter(project.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectProjectFilter(project.id);
                    }
                  }}
                  className="group py-3.5 first:pt-1 last:pb-1 cursor-pointer transition-all duration-150 flex flex-col gap-2 relative"
                  title="לחץ לצפייה ברשומות פרויקט זה"
                >
                  {/* Top line: Icon, Project & Client, Hours & Rate */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/60"
                        style={{ backgroundColor: `${project.color}15` }}
                      >
                        <Icon 
                          className="w-4 h-4" 
                          style={{ color: project.color || '#BC796F' }}
                        />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-warm-900 truncate group-hover:text-[#88463F] transition-colors">
                          {project.name}
                        </span>
                        <span className="text-xs text-[#7D5A56] truncate">
                          {project.clientName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5">
                          <span 
                            dir="ltr"
                            className="text-xs sm:text-sm font-medium text-warm-950 tabular-nums"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatHoursDecimal(project.trackedHours * 3600)}
                          </span>
                          <span className="text-[11px] text-[#7D5A56]">שעות</span>
                        </div>

                        {project.hasRate ? (
                          <span 
                            dir="ltr"
                            className="text-[11px] font-medium text-[#88463F] tabular-nums"
                          >
                            {project.hourlyRate!.toLocaleString('he-IL')} ₪ / שעה
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#7D5A56]/70 font-normal">
                            לא הוגדר תעריף
                          </span>
                        )}
                      </div>

                      {/* Delete icon button */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, { id: project.id, name: project.name })}
                        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 rounded-md text-[#7D5A56] hover:text-red-700 hover:bg-white/40 transition-all"
                        title="מחיקת פרויקט"
                        aria-label={`מחיקת פרויקט ${project.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subtle Hint */}
      {projects.length > 0 && (
        <div className="pt-3 border-t border-[#BC796F]/10 text-center">
          <span className="text-[11px] text-[#7D5A56]/70 font-normal">
            לחיצה על פרויקט מסננת את הרשומות המקושרות אליו
          </span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <DeleteConfirmModal
          isOpen={!!projectToDelete}
          onClose={() => setProjectToDelete(null)}
          onConfirm={() => deleteProject(projectToDelete.id)}
          title="מחיקת פרויקט"
          itemName={projectToDelete.name}
          isBlocked={isTimerRunningOnProject}
          blockedMessage="לא ניתן למחוק פרויקט זה מכיוון שפועל כרגע טיימר עבורו. יש לעצור את הטיימר לפני המחיקה."
          warningDetails={
            projectStats.entryCount > 0
              ? `לפרויקט זה מקושרים ${projectStats.entryCount} דיווחי שעות. מחיקת הפרויקט תמחק לצמיתות גם את כל הדיווחים המקושרים אליו.`
              : 'הפרויקט יימחק לצמיתות מהמערכת.'
          }
        />
      )}
    </div>
  );
};
