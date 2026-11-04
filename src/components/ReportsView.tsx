import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatHoursDecimal, formatDurationHHMMSS } from '../utils/dateUtils';
import { BarChart3, Users, FolderKanban, FileSpreadsheet } from 'lucide-react';
import { MonthlyExportModal } from './reports/MonthlyExportModal';

export const ReportsView: React.FC = () => {
  const { entries, clients, projects, settings, routeParams, updateRouteParams } = useApp();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  const urlRange = routeParams.get('range');
  const dateRange: 'all' | 'today' | 'week' | 'month' = 
    (urlRange === 'today' || urlRange === 'week' || urlRange === 'month' || urlRange === 'all')
      ? urlRange
      : 'all';

  const handleRangeChange = (newRange: 'all' | 'today' | 'week' | 'month') => {
    updateRouteParams({ range: newRange === 'all' ? null : newRange });
  };

  const filteredEntries = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    return entries.filter(entry => {
      if (dateRange === 'today') return entry.date === todayStr;
      if (dateRange === 'week') {
        const d = new Date(entry.date);
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0,0,0,0);
        return d >= startOfWeek;
      }
      if (dateRange === 'month') {
        const [y, m] = entry.date.split('-').map(Number);
        return y === today.getFullYear() && m === (today.getMonth() + 1);
      }
      return true;
    });
  }, [entries, dateRange]);

  const totalSeconds = filteredEntries.reduce((sum, e) => sum + e.durationSeconds, 0);

  const estimatedRevenue = useMemo(() => {
    return Math.round(
      filteredEntries.reduce((sum, e) => {
        const proj = projects.find(p => p.id === e.projectId);
        const rate = typeof proj?.hourlyRate === 'number' ? proj.hourlyRate : (settings.defaultHourlyRate || 0);
        return sum + (e.durationSeconds / 3600) * rate;
      }, 0)
    );
  }, [filteredEntries, projects, settings.defaultHourlyRate]);

  // Group by client
  const clientBreakdown = useMemo(() => {
    return clients.map(client => {
      const clientEnts = filteredEntries.filter(e => e.clientId === client.id);
      const secs = clientEnts.reduce((sum, e) => sum + e.durationSeconds, 0);
      const hrs = secs / 3600;
      const revenue = Math.round(
        clientEnts.reduce((sum, e) => {
          const proj = projects.find(p => p.id === e.projectId);
          const rate = typeof proj?.hourlyRate === 'number' ? proj.hourlyRate : (settings.defaultHourlyRate || 0);
          return sum + (e.durationSeconds / 3600) * rate;
        }, 0)
      );
      return {
        ...client,
        seconds: secs,
        hours: hrs,
        percentage: totalSeconds > 0 ? Math.round((secs / totalSeconds) * 100) : 0,
        revenue,
      };
    }).filter(c => c.seconds > 0);
  }, [clients, projects, filteredEntries, totalSeconds, settings.defaultHourlyRate]);

  // Group by project
  const projectBreakdown = useMemo(() => {
    return projects.map(project => {
      const projEnts = filteredEntries.filter(e => e.projectId === project.id);
      const secs = projEnts.reduce((sum, e) => sum + e.durationSeconds, 0);
      const hrs = secs / 3600;
      const client = clients.find(c => c.id === project.clientId);
      const rate = typeof project.hourlyRate === 'number' ? project.hourlyRate : (settings.defaultHourlyRate || 0);
      return {
        ...project,
        clientName: client?.name || '',
        seconds: secs,
        hours: hrs,
        percentage: totalSeconds > 0 ? Math.round((secs / totalSeconds) * 100) : 0,
        revenue: Math.round(hrs * rate),
      };
    }).filter(p => p.seconds > 0);
  }, [projects, clients, filteredEntries, totalSeconds, settings.defaultHourlyRate]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Bar with Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 tracking-tight">דוחות וסיכומים</h1>
          <p className="text-sm text-warm-700/80 mt-1">ניתוח שעות עבודה ותחזית הכנסות לפי לקוחות ופרויקטים</p>
        </div>

        {/* Actions & Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold text-white bg-[#BC796F] hover:bg-[#A46A69] shadow-sm transition-all active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ייצוא חודשי</span>
          </button>

          <div className="flex rounded-xl p-1 bg-white/50 border border-white/70 text-xs font-semibold">
            <button
              onClick={() => handleRangeChange('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'all' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
              }`}
            >
              כל התקופה
            </button>
            <button
              onClick={() => handleRangeChange('today')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'today' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
              }`}
            >
              היום
            </button>
            <button
              onClick={() => handleRangeChange('week')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'week' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
              }`}
            >
              השבוע
            </button>
            <button
              onClick={() => handleRangeChange('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'month' ? 'bg-[#BC796F] text-white shadow-xs' : 'text-warm-800 hover:text-warm-950'
              }`}
            >
              החודש
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="liquid-glass rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-warm-700/80 mb-2">
            <span className="text-xs font-medium">סך הכל שעות שנרשמו</span>
            <BarChart3 className="w-4 h-4 text-[#BC796F]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-warm-950 tabular-nums font-heebo" dir="ltr">
            {formatDurationHHMMSS(totalSeconds)}
          </div>
          <span className="text-xs text-warm-700/70 mt-1">
            {formatHoursDecimal(totalSeconds)} שעות נטו
          </span>
        </div>

        <div className="liquid-glass rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-warm-700/80 mb-2">
            <span className="text-xs font-medium">הכנסה משוערת</span>
            <span className="text-xs font-bold text-[#BC796F]">{settings.currency}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-warm-950 tabular-nums" dir="ltr">
            {estimatedRevenue.toLocaleString()} {settings.currency}
          </div>
          <span className="text-xs text-warm-700/70 mt-1">
            מחושב לפי תעריפי הפרויקטים והשעות
          </span>
        </div>

        <div className="liquid-glass rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-warm-700/80 mb-2">
            <span className="text-xs font-medium">פרויקטים בעבודה</span>
            <FolderKanban className="w-4 h-4 text-[#BC796F]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-warm-950 tabular-nums">
            {projectBreakdown.length}
          </div>
          <span className="text-xs text-warm-700/70 mt-1">
            מתוך {projects.length} פרויקטים רשומים
          </span>
        </div>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Breakdown */}
        <div className="liquid-glass rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#BC796F]" />
              <h2 className="font-bold text-warm-900 text-lg">פילוח לפי לקוחות</h2>
            </div>
            <span className="text-xs text-warm-700/70 font-medium">חלוקת שעות</span>
          </div>

          <div className="flex flex-col gap-3.5 flex-1">
            {clientBreakdown.length === 0 ? (
              <div className="py-8 text-center text-warm-700/60 text-xs">אין רשומות לתקופה זו</div>
            ) : (
              clientBreakdown.map(c => (
                <div key={c.id} className="liquid-glass-subtle p-3.5 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="font-semibold text-warm-900">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-heebo tabular-nums font-bold text-warm-950" dir="ltr">
                        {formatHoursDecimal(c.seconds)} שעות
                      </span>
                      <span className="text-xs font-semibold text-[#88463F] bg-white/60 px-2 py-0.5 rounded">
                        {c.percentage}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-white/50 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.percentage}%`, backgroundColor: c.color }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Project Breakdown */}
        <div className="liquid-glass rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-[#BC796F]" />
              <h2 className="font-bold text-warm-900 text-lg">פילוח לפי פרויקטים</h2>
            </div>
            <span className="text-xs text-warm-700/70 font-medium">חלוקת שעות</span>
          </div>

          <div className="flex flex-col gap-3.5 flex-1">
            {projectBreakdown.length === 0 ? (
              <div className="py-8 text-center text-warm-700/60 text-xs">אין רשומות לתקופה זו</div>
            ) : (
              projectBreakdown.map(p => (
                <div key={p.id} className="liquid-glass-subtle p-3.5 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold text-warm-900">{p.name}</span>
                      <span className="text-xs text-warm-700/70 mr-1.5">({p.clientName})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-heebo tabular-nums font-bold text-warm-950" dir="ltr">
                        {formatHoursDecimal(p.seconds)} שעות
                      </span>
                      <span className="text-xs font-semibold text-[#88463F] bg-white/60 px-2 py-0.5 rounded">
                        {p.percentage}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-white/50 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.percentage}%`, backgroundColor: p.color }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Monthly Export Modal */}
      <MonthlyExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
};
