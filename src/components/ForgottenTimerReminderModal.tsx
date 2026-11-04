import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDurationHebrew, toTimeString } from '../utils/dateUtils';
import { Clock, Play, Square, Edit3, X, AlertCircle } from 'lucide-react';

export const ForgottenTimerReminderModal: React.FC = () => {
  const { 
    activeTimer, 
    elapsedSeconds, 
    projects, 
    clients, 
    isTimerReminderActive, 
    snoozeTimerReminder, 
    stopTimer, 
    fixTimerEndTime 
  } = useApp();

  const [isFixingEndTime, setIsFixingEndTime] = useState(false);
  const [correctedEndTime, setCorrectedEndTime] = useState('');
  const [fixError, setFixError] = useState<string | null>(null);

  if (!isTimerReminderActive || !activeTimer || !activeTimer.isRunning) {
    return null;
  }

  const currentProject = projects.find(p => p.id === activeTimer.projectId);
  const currentClient = clients.find(c => c.id === activeTimer.clientId);
  const startTimeStr = toTimeString(new Date(activeTimer.startTimestamp));

  const handleOpenFix = () => {
    // Default corrected end time to current time
    setCorrectedEndTime(toTimeString(new Date()));
    setFixError(null);
    setIsFixingEndTime(true);
  };

  const handleSaveFix = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctedEndTime) {
      setFixError('יש להזין שעת סיום תקינה');
      return;
    }
    const result = fixTimerEndTime(correctedEndTime);
    if (!result.success && result.error) {
      setFixError(result.error);
    } else {
      setIsFixingEndTime(false);
    }
  };

  return (
    <aside 
      aria-label="תזכורת טיימר פעיל"
      className="fixed bottom-6 left-6 z-50 max-w-md w-full animate-slide-up"
    >
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-[0_16px_50px_-10px_rgba(188,121,111,0.30)] border border-white/90 bg-gradient-to-br from-white/95 via-white/90 to-[#FAF4F2]/90 backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#BC796F]/15 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#BC796F]/15 text-[#88463F] flex items-center justify-center border border-[#BC796F]/30 shadow-xs animate-pulse">
              <Clock className="w-4 h-4 text-[#BC796F]" />
            </div>
            <div>
              <h3 className="font-bold text-warm-950 text-sm">הטיימר עדיין פועל?</h3>
              <p className="text-[11px] text-[#7D5A56]">עבודה רצופה של {formatDurationHebrew(elapsedSeconds)}</p>
            </div>
          </div>

          <button
            onClick={() => snoozeTimerReminder(60)}
            className="p-1 rounded-lg text-[#7D5A56] hover:text-warm-950 hover:bg-white/50 transition-colors"
            title="דחיית תזכורת בשעה"
            aria-label="דחיית תזכורת"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Project & Client Context */}
        <div className="mb-4 text-xs space-y-1 bg-white/50 p-3 rounded-2xl border border-white/70">
          <div className="flex items-center justify-between">
            <span className="text-[#7D5A56]">פרויקט:</span>
            <span className="font-bold text-warm-950">{currentProject?.name || 'פרויקט כללי'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#7D5A56]">לקוח:</span>
            <span className="font-semibold text-warm-900">{currentClient?.name || 'כללי'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#7D5A56]">שעת התחלה:</span>
            <span className="font-mono text-warm-900" dir="ltr">{startTimeStr}</span>
          </div>
        </div>

        {/* Inline Fix End Time Form */}
        {isFixingEndTime ? (
          <form onSubmit={handleSaveFix} className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-warm-900">
                ציין מתי באמת סיימת לעבוד:
              </label>
              <input
                type="time"
                value={correctedEndTime}
                onChange={e => {
                  setCorrectedEndTime(e.target.value);
                  setFixError(null);
                }}
                className="w-full h-10 px-3 rounded-xl text-sm font-mono text-warm-950 bg-white border border-[#BC796F]/30 focus:border-[#BC796F] focus:ring-2 focus:ring-[#BC796F]/20 text-center"
                autoFocus
              />
              {fixError && (
                <div className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fixError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setIsFixingEndTime(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-warm-800 hover:bg-white/50 transition-all border border-black/5"
              >
                חזרה
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-[#88463F] hover:bg-[#6E352F] shadow-xs transition-all active:scale-98"
              >
                שמירה ועצירה
              </button>
            </div>
          </form>
        ) : (
          /* Action Buttons */
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => snoozeTimerReminder(60)}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold text-warm-800 bg-white hover:bg-warm-50 border border-[#BC796F]/20 hover:border-[#BC796F]/40 transition-all shadow-xs active:scale-98"
              title="המשך עבודה כרגיל ודחיית התזכורת בשעה"
            >
              <Play className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>המשך עבודה</span>
            </button>

            <button
              type="button"
              onClick={handleOpenFix}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold text-[#88463F] bg-[#BC796F]/10 hover:bg-[#BC796F]/20 border border-[#BC796F]/25 transition-all shadow-xs active:scale-98"
              title="קביעת שעת סיום מדויקת למקרה שהטיימר נשכח"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#BC796F]" />
              <span>תיקון סיום</span>
            </button>

            <button
              type="button"
              onClick={() => stopTimer()}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#BC796F] to-[#88463F] hover:from-[#A46A69] hover:to-[#6E352F] transition-all shadow-xs active:scale-98"
              title="עצירת הטיימר ושמירתו כעת"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>עצירה כעת</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
