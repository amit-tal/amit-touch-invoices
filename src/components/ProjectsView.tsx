import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Project } from '../types';
import { formatHoursDecimal } from '../utils/dateUtils';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { CustomSelect } from './CustomSelect';
import { 
  FolderKanban, 
  Plus, 
  Edit2, 
  Clock, 
  X,
  Trash2,
  Folder,
  AlertCircle
} from 'lucide-react';

interface ProjectsViewProps {
  onOpenProjectEntries: (projectId: string) => void;
  initialAddOpen?: boolean;
  onAddModalClose?: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ 
  onOpenProjectEntries,
  initialAddOpen = false,
  onAddModalClose,
}) => {
  const { 
    projects, 
    clients, 
    entries, 
    activeTimer, 
    settings,
    addProject, 
    updateProject, 
    deleteProject, 
    getProjectStats,
    routeParams,
    updateRouteParams,
    showToast,
  } = useApp();

  const urlClientId = routeParams.get('client');
  const isAddInUrl = routeParams.get('add') === '1' || routeParams.get('add') === 'true';

  const [isAddModalOpen, setIsAddModalOpen] = useState(initialAddOpen || isAddInUrl);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [color, setColor] = useState('#BC796F');
  const [icon, setIcon] = useState('Folder');
  const [error, setError] = useState('');

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const PALETTE_COLORS = ['#C9877C', '#BC796F', '#A46A69', '#D49B90', '#E4AEA3', '#945853'];

  // Check if client exists when urlClientId is provided
  React.useEffect(() => {
    if (urlClientId && clients.length > 0) {
      const exists = clients.some(c => c.id === urlClientId);
      if (!exists) {
        showToast('הלקוח המבוקש אינו קיים במערכת');
        updateRouteParams({ client: null }, true);
      }
    }
  }, [urlClientId, clients, showToast, updateRouteParams]);

  const closeModal = () => {
    setIsAddModalOpen(false);
    updateRouteParams({ add: null }, true);
    onAddModalClose?.();
  };

  const openAdd = (preselectedClientId?: string) => {
    setEditingProject(null);
    setName('');
    setClientId(preselectedClientId || urlClientId || clients[0]?.id || '');
    // Prefill default hourly rate from settings if configured
    setHourlyRate(
      typeof settings?.defaultHourlyRate === 'number' && settings.defaultHourlyRate > 0
        ? String(settings.defaultHourlyRate)
        : ''
    );
    setColor('#BC796F');
    setIcon('Palette');
    setError('');
    setIsAddModalOpen(true);
  };

  React.useEffect(() => {
    if (initialAddOpen || isAddInUrl) {
      openAdd();
    }
  }, [initialAddOpen, isAddInUrl]);

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setName(p.name);
    setClientId(p.clientId);
    setHourlyRate(typeof p.hourlyRate === 'number' ? String(p.hourlyRate) : '');
    setColor(p.color || '#BC796F');
    setIcon(p.icon || 'Folder');
    setError('');
    setIsAddModalOpen(true);
  };

  // Compute tracked time for currently edited project
  const editingProjectTrackedSeconds = editingProject
    ? entries
        .filter(e => e.projectId === editingProject.id)
        .reduce((sum, e) => sum + e.durationSeconds, 0)
    : 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('יש להזין שם פרויקט');
      return;
    }
    if (!clientId) {
      setError('יש לבחור לקוח');
      return;
    }

    let parsedRate: number | undefined = undefined;
    if (hourlyRate.trim() !== '') {
      const num = parseFloat(hourlyRate.trim());
      if (isNaN(num) || num < 0) {
        setError('יש להזין תעריף שעתי חיובי או 0');
        return;
      }
      parsedRate = Math.round(num * 100) / 100;
    }

    if (editingProject) {
      updateProject({
        ...editingProject,
        name: name.trim(),
        clientId,
        color,
        icon,
        hourlyRate: parsedRate,
      });
    } else {
      addProject(name.trim(), clientId, icon, color, parsedRate);
    }

    closeModal();
  };

  const isTimerRunningOnProject = projectToDelete 
    ? activeTimer?.isRunning && activeTimer.projectId === projectToDelete.id
    : false;

  const projectStats = projectToDelete ? getProjectStats(projectToDelete.id) : { entryCount: 0 };

  const filteredProjects = urlClientId
    ? projects.filter(p => p.clientId === urlClientId)
    : projects;

  const selectedClient = clients.find(c => c.id === urlClientId);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">ניהול פרויקטים</h1>
          <p className="text-sm text-[#7D5A56] mt-1">מעקב אחר שעות, תעריפים והכנסות לפי פרויקטים ולקוחות</p>
        </div>

        <div className="flex items-center gap-3">
          {clients.length > 0 && (
            <div className="w-48 sm:w-56">
              <CustomSelect
                value={urlClientId || ''}
                onChange={v => updateRouteParams({ client: v || null })}
                options={[
                  { value: '', label: `כל הלקוחות (${projects.length})` },
                  ...clients.map(c => {
                    const count = projects.filter(p => p.clientId === c.id).length;
                    return {
                      value: c.id,
                      label: c.name,
                      badge: String(count),
                    };
                  }),
                ]}
                triggerClassName="h-10 px-3.5 bg-white/70 text-xs sm:text-sm"
              />
            </div>
          )}

          <button
            onClick={() => openAdd()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>הוספת פרויקט חדש</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {projects.length === 0 ? (
        <div className="liquid-glass rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-3.5 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-white/40 border border-white/60 flex items-center justify-center text-[#BC796F]">
            <Folder className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-bold text-warm-900 text-lg">עדיין אין פרויקטים</h2>
            <p className="text-sm text-[#7D5A56] mt-1">
              שייך פרויקטים ללקוחות והגדר תעריף שעתי לצורך מעקב שעות והכנסות מדויק.
            </p>
          </div>
          <button
            onClick={() => openAdd()}
            className="mt-2 flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-semibold text-white liquid-glass-btn-primary shadow-md active:scale-98 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>הוספת פרויקט</span>
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="liquid-glass rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3 max-w-md mx-auto">
          <p className="text-sm font-medium text-warm-900">
            לא נמצאו פרויקטים עבור {selectedClient ? `"${selectedClient.name}"` : 'לקוח זה'}.
          </p>
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={() => updateRouteParams({ client: null })}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-warm-800 liquid-glass-btn-secondary"
            >
              הצגת כל הפרויקטים
            </button>
            <button
              onClick={() => openAdd(urlClientId || undefined)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white liquid-glass-btn-primary"
            >
              הוספת פרויקט ללקוח זה
            </button>
          </div>
        </div>
      ) : (
        /* Projects Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map(project => {
            const client = clients.find(c => c.id === project.clientId);
            const projectSeconds = entries
              .filter(e => e.projectId === project.id)
              .reduce((sum, e) => sum + e.durationSeconds, 0);

            const trackedHours = projectSeconds / 3600;
            const hasRate = typeof project.hourlyRate === 'number';
            const estimatedIncome = hasRate ? Math.round(trackedHours * project.hourlyRate!) : null;

            return (
              <div
                key={project.id}
                className="liquid-glass rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between group hover:border-[#BC796F]/40 transition-all duration-200"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs"
                        style={{ backgroundColor: project.color || '#BC796F' }}
                      >
                        <FolderKanban className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-warm-900 text-base">{project.name}</h3>
                        <span className="text-xs text-[#7D5A56] font-medium">
                          {client?.name || 'ללא לקוח'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(project)}
                        className="p-1.5 rounded-lg text-[#7D5A56] hover:text-warm-950 hover:bg-white/60 transition-colors"
                        title="עריכת פרויקט"
                        aria-label={`עריכת פרויקט ${project.name}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setProjectToDelete(project)}
                        className="p-1.5 rounded-lg text-[#7D5A56] hover:text-red-700 hover:bg-red-50/50 transition-colors"
                        title="מחיקת פרויקט"
                        aria-label={`מחיקת פרויקט ${project.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Hourly Rate & Estimated Earnings details */}
                  <div className="my-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#7D5A56]">תעריף שעתי:</span>
                      {hasRate ? (
                        <span className="font-semibold text-warm-900 tabular-nums" dir="ltr">
                          {project.hourlyRate!.toLocaleString('he-IL')} ₪ / שעה
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg bg-white/40 border border-white/60 text-[#7D5A56] text-[11px] font-medium">
                          לא הוגדר תעריף
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#7D5A56]">סך הכנסה משוערת:</span>
                      <span className="font-bold text-[#88463F] tabular-nums" dir="ltr">
                        {estimatedIncome !== null ? `${estimatedIncome.toLocaleString('he-IL')} ₪` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats & Link */}
                <div className="pt-3 border-t border-[#BC796F]/15 flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#BC796F]" />
                    <span className="text-xs text-[#7D5A56]">נרשמו:</span>
                    <span className="text-sm font-bold text-warm-950 tabular-nums" dir="ltr">
                      {formatHoursDecimal(projectSeconds)} שעות
                    </span>
                  </div>

                  <button
                    onClick={() => onOpenProjectEntries(project.id)}
                    className="text-xs font-semibold text-[#88463F] hover:underline"
                  >
                    יומן שעות ←
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Project Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={closeModal}
            className="fixed inset-0 bg-warm-950/30 backdrop-blur-md"
          />
          <div 
            role="dialog"
            aria-modal="true"
            dir="rtl"
            className="relative w-full max-w-md liquid-glass rounded-3xl shadow-2xl p-6 sm:p-7 z-10 border border-white/80"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#BC796F]/15 mb-4">
              <h3 className="font-bold text-warm-900 text-lg">
                {editingProject ? 'עריכת פרויקט' : 'הוספת פרויקט חדש'}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-warm-700 hover:text-warm-950"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              {error && (
                <div className="px-3 py-2 rounded-xl bg-red-500/10 text-red-700 text-xs">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-warm-800">שם הפרויקט</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="לדוגמה: עיצוב ממשק משתמש"
                  autoFocus
                  className="w-full h-11 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-warm-800">שיוך ללקוח</label>
                <CustomSelect
                  value={clientId}
                  onChange={setClientId}
                  placeholder="בחירת לקוח..."
                  options={clients.map(c => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  triggerClassName="h-11 bg-white/70"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-warm-800">תעריף שעתי</label>
                  <span className="text-[11px] text-[#7D5A56]">מחיר לשעת עבודה</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    value={hourlyRate}
                    onChange={e => setHourlyRate(e.target.value)}
                    placeholder={typeof settings?.defaultHourlyRate === 'number' && settings.defaultHourlyRate > 0 ? String(settings.defaultHourlyRate) : "לדוגמה: 250"}
                    className="w-full h-11 pr-3.5 pl-9 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input text-right tabular-nums"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#88463F] pointer-events-none select-none">
                    ₪
                  </div>
                </div>
              </div>

              {/* Notice when editing a project that has tracked hours */}
              {editingProject && editingProjectTrackedSeconds > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-600/20 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    שים לב: לפרויקט זה נרשמו כבר <span className="font-bold tabular-nums" dir="ltr">{formatHoursDecimal(editingProjectTrackedSeconds)}</span> שעות עבודה. עדכון התעריף השעתי יחשב מחדש את סך ההכנסות המשוער עבור פרויקט זה.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-warm-800">גוון ייצוגי</label>
                <div className="flex items-center gap-2.5">
                  {PALETTE_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        color === c ? 'scale-110 border-warm-950 shadow-sm' : 'border-white'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#BC796F]/15 mt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-warm-800 liquid-glass-btn-secondary"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white liquid-glass-btn-primary"
                >
                  שמירה
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Project */}
      {projectToDelete && (
        <DeleteConfirmModal
          isOpen={!!projectToDelete}
          onClose={() => setProjectToDelete(null)}
          onConfirm={() => deleteProject(projectToDelete.id)}
          title="מחיקת פרויקט"
          itemName={projectToDelete.name}
          isBlocked={isTimerRunningOnProject}
          blockedMessage="לא ניתן למחוק פרויקט זה מכיוון שפועל כרגע טיימר עבורו. יש לעצור את הטיימר תחילה."
          warningDetails={
            projectStats.entryCount > 0
              ? `לפרויקט זה מקושרים ${projectStats.entryCount} דיווחי שעות. מחיקת הפרויקט תמחק לצמיתות גם את כל הדיווחים המקושרים אליו!`
              : 'הפרויקט יימחק לצמיתות מהמערכת.'
          }
        />
      )}
    </div>
  );
};
