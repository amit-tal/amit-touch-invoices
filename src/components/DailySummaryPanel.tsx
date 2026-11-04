import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  formatHebrewFullDate, 
  formatDurationHHMM, 
  formatDurationHebrew, 
  isDateToday, 
  isDateInThisWeek, 
  isDateInThisMonth,
} from '../utils/dateUtils';

export const DailySummaryPanel: React.FC = () => {
  const { entries, activeTimer, elapsedSeconds } = useApp();

  const today = useMemo(() => new Date(), []);

  // Compute Today's Total Duration in seconds (full precision internally)
  const todayTotalSeconds = useMemo(() => {
    let total = entries
      .filter(e => isDateToday(e.date, today))
      .reduce((sum, e) => sum + e.durationSeconds, 0);

    if (activeTimer?.isRunning) {
      total += elapsedSeconds;
    }
    return total;
  }, [entries, activeTimer, elapsedSeconds, today]);

  // Compute Week's Total Duration in seconds (Sunday to Saturday)
  const weekTotalSeconds = useMemo(() => {
    let total = entries
      .filter(e => isDateInThisWeek(e.date, today))
      .reduce((sum, e) => sum + e.durationSeconds, 0);

    if (activeTimer?.isRunning) {
      total += elapsedSeconds;
    }
    return total;
  }, [entries, activeTimer, elapsedSeconds, today]);

  // Compute Month's Total Duration in seconds
  const monthTotalSeconds = useMemo(() => {
    let total = entries
      .filter(e => isDateInThisMonth(e.date, today))
      .reduce((sum, e) => sum + e.durationSeconds, 0);

    if (activeTimer?.isRunning) {
      total += elapsedSeconds;
    }
    return total;
  }, [entries, activeTimer, elapsedSeconds, today]);

  // Activity distribution across the day (slim direct bars without nested boxes)
  const activitySlots = useMemo(() => {
    const slots = [
      { label: '08:00', startHour: 8, endHour: 10, minutes: 0 },
      { label: '10:00', startHour: 10, endHour: 12, minutes: 0 },
      { label: '12:00', startHour: 12, endHour: 14, minutes: 0 },
      { label: '14:00', startHour: 14, endHour: 16, minutes: 0 },
      { label: '16:00', startHour: 16, endHour: 18, minutes: 0 },
      { label: '18:00', startHour: 18, endHour: 20, minutes: 0 },
    ];

    const todayEntries = entries.filter(e => isDateToday(e.date, today));
    todayEntries.forEach(entry => {
      const [sh, sm] = (entry.startTime || '09:00').split(':').map(Number);
      const [eh, em] = (entry.endTime || '10:00').split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      slots.forEach(slot => {
        const slotStartMin = slot.startHour * 60;
        const slotEndMin = slot.endHour * 60;
        const overlapStart = Math.max(startMin, slotStartMin);
        const overlapEnd = Math.min(endMin, slotEndMin);
        if (overlapEnd > overlapStart) {
          slot.minutes += (overlapEnd - overlapStart);
        }
      });
    });

    if (activeTimer?.isRunning) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentSlot = slots.find(s => currentHour >= s.startHour && currentHour < s.endHour);
      if (currentSlot) {
        currentSlot.minutes += Math.floor(elapsedSeconds / 60);
      }
    }

    const maxMinutes = Math.max(120, ...slots.map(s => s.minutes));
    return slots.map(s => ({
      ...s,
      percentage: Math.min(100, Math.round((s.minutes / maxMinutes) * 100)),
    }));
  }, [entries, activeTimer, elapsedSeconds, today]);

  return (
    <div className="liquid-glass rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full transition-all duration-300">
      {/* Top Header & Understated Date */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[21px] sm:text-[23px] font-bold text-warm-900 tracking-tight">
            היום
          </h2>
          <span className="text-xs text-[#7D5A56] font-normal">
            {formatHebrewFullDate(today)}
          </span>
        </div>

        {/* Big Today Duration in HH:MM (no seconds, no redundant text) */}
        <div className="mt-2 flex items-baseline">
          <span 
            dir="ltr"
            className="text-4xl sm:text-5xl font-medium text-warm-950 tabular-nums tracking-tight"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatDurationHHMM(todayTotalSeconds)}
          </span>
        </div>
      </div>

      {/* Middle: Slim Activity Bars directly inside glass panel (no nested boxes) */}
      <div className="my-5">
        <div className="flex items-center justify-between text-xs text-[#7D5A56] font-normal mb-3">
          <span>התפלגות פעילות לאורך היום</span>
        </div>

        {/* Activity Bars Container: simple baseline with slim glass rods */}
        <div className="flex items-end justify-between gap-3 h-20 px-2 pt-2 pb-1 border-b border-[#BC796F]/15">
          {activitySlots.map((slot, idx) => {
            const hasActivity = slot.minutes > 0;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                {/* Slim Activity Bar (direct glass rod) */}
                <div 
                  className="w-full max-w-[28px] flex items-end justify-center h-full relative"
                  title={`${slot.label}: ${slot.minutes} דקות`}
                >
                  <div
                    className={`w-full rounded-t-sm transition-all duration-500 ease-out ${
                      hasActivity
                        ? 'bg-gradient-to-t from-[#BC796F] to-[#E4AEA3] shadow-xs'
                        : 'bg-warm-400/20'
                    }`}
                    style={{
                      height: `${Math.max(hasActivity ? 20 : 6, slot.percentage)}%`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-[#7D5A56] font-normal mt-1.5 tabular-nums" dir="ltr">
                  {slot.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom: Weekly and Monthly totals directly on parent glass surface, separated by fine vertical line */}
      <div className="grid grid-cols-2 pt-4 border-t border-[#BC796F]/15">
        {/* Weekly Total */}
        <div className="flex flex-col gap-0.5 pl-4">
          <span className="text-xs font-normal text-[#7D5A56]">השבוע</span>
          <div 
            dir="ltr"
            className="text-2xl sm:text-3xl font-medium text-warm-950 tabular-nums tracking-tight mt-0.5"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatDurationHHMM(weekTotalSeconds)}
          </div>
          <span className="text-xs text-[#8C6560] font-normal truncate">
            {formatDurationHebrew(weekTotalSeconds)}
          </span>
        </div>

        {/* Monthly Total with subtle vertical separator on right in RTL */}
        <div className="flex flex-col gap-0.5 pr-4 border-r border-[#BC796F]/15">
          <span className="text-xs font-normal text-[#7D5A56]">החודש</span>
          <div 
            dir="ltr"
            className="text-2xl sm:text-3xl font-medium text-warm-950 tabular-nums tracking-tight mt-0.5"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatDurationHHMM(monthTotalSeconds)}
          </div>
          <span className="text-xs text-[#8C6560] font-normal truncate">
            {formatDurationHebrew(monthTotalSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
};
