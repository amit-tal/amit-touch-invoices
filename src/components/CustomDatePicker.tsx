import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft } from 'lucide-react';
import { CustomSelect, type SelectOption } from './CustomSelect';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
}

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  id,
  name,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const datepickerId = useId();

  // Parse initial selected date or default to today
  const parsedDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedDate.getMonth()); // 0-11

  // Keep view year/month in sync with external value changes when closed
  useEffect(() => {
    if (!isOpen && value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value, isOpen]);

  const [popupPos, setPopupPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  }>({ left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const calendarHeight = 360;

    const openUpward = spaceBelow < calendarHeight && spaceAbove > spaceBelow;

    if (openUpward) {
      setPopupPos({
        bottom: window.innerHeight - rect.top + 6,
        left: Math.max(10, Math.min(rect.right - 320, window.innerWidth - 330)),
      });
    } else {
      setPopupPos({
        top: rect.bottom + 6,
        left: Math.max(10, Math.min(rect.right - 320, window.innerWidth - 330)),
      });
    }
  }, []);

  const openCalendar = () => {
    if (disabled) return;
    updatePosition();
    setIsOpen(true);
  };

  const closeCalendar = () => {
    setIsOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popupRef.current &&
        !popupRef.current.contains(target)
      ) {
        closeCalendar();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Year options: current year - 10 to current year + 5
  const currentYear = new Date().getFullYear();
  const yearOptions: SelectOption[] = [];
  for (let y = currentYear - 10; y <= currentYear + 5; y++) {
    yearOptions.push({ value: String(y), label: String(y) });
  }

  // Month options
  const monthOptions: SelectOption[] = HEBREW_MONTHS.map((m, idx) => ({
    value: String(idx),
    label: m,
  }));

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Generate days for grid
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday (א׳)

  const days: Array<{ day: number; isCurrentMonth: boolean; dateStr: string }> = [];

  // Previous month trailing days
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, isCurrentMonth: false, dateStr });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, isCurrentMonth: true, dateStr });
  }

  // Next month leading days to complete grid (multiples of 7)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, isCurrentMonth: false, dateStr });
  }

  const handleSelectDay = (dateStr: string) => {
    onChange(dateStr);
    closeCalendar();
  };

  const handleSelectToday = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    onChange(dateStr);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    closeCalendar();
  };

  // Formatted date for trigger display in Hebrew
  const formattedDisplay = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('he-IL', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'בחירת תאריך...';

  return (
    <div className={`relative w-full ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={openCalendar}
        className="w-full h-10 px-3.5 rounded-xl text-sm font-medium text-warm-900 liquid-glass-input flex items-center justify-between text-right cursor-pointer hover:bg-white/70 transition-all select-none"
      >
        <span className="truncate text-right">{formattedDisplay}</span>
        <CalendarIcon className="w-4 h-4 text-[#BC796F] shrink-0 pointer-events-none" />
      </button>

      {/* Calendar Popup via Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={popupRef}
            id={datepickerId}
            dir="rtl"
            className="fixed z-[9999] w-[320px] rounded-2xl liquid-glass border border-white/80 shadow-2xl p-4 backdrop-blur-xl bg-white/95 font-heebo animate-in fade-in zoom-in-95 duration-150 text-right"
            style={{
              ...(popupPos.top !== undefined ? { top: `${popupPos.top}px` } : {}),
              ...(popupPos.bottom !== undefined ? { bottom: `${popupPos.bottom}px` } : {}),
              left: `${popupPos.left}px`,
            }}
          >
            {/* Header: Month/Year CustomSelects & Navigation */}
            <div className="flex items-center justify-between gap-1.5 mb-3.5 pb-2.5 border-b border-[#BC796F]/15">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg text-warm-700 hover:text-warm-950 hover:bg-white/60 transition-colors"
                title="חודש קודם"
                aria-label="חודש קודם"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5 flex-1">
                {/* Month Selector */}
                <div className="flex-1">
                  <CustomSelect
                    value={String(viewMonth)}
                    onChange={v => setViewMonth(Number(v))}
                    options={monthOptions}
                    triggerClassName="h-8 px-2 text-xs font-semibold bg-white/60"
                  />
                </div>

                {/* Year Selector */}
                <div className="w-24">
                  <CustomSelect
                    value={String(viewYear)}
                    onChange={v => setViewYear(Number(v))}
                    options={yearOptions}
                    triggerClassName="h-8 px-2 text-xs font-semibold bg-white/60"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg text-warm-700 hover:text-warm-950 hover:bg-white/60 transition-colors"
                title="חודש הבא"
                aria-label="חודש הבא"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[11px] font-bold text-[#88463F]">
              {HEBREW_DAYS.map(d => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {days.map((d, idx) => {
                const isSelected = d.dateStr === value;
                const isToday =
                  d.dateStr ===
                  new Date().toISOString().split('T')[0];

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectDay(d.dateStr)}
                    className={`h-8 rounded-xl text-xs font-medium transition-all flex items-center justify-center tabular-nums ${
                      isSelected
                        ? 'bg-[#BC796F] text-white font-bold shadow-xs'
                        : isToday
                        ? 'bg-[#BC796F]/15 text-[#88463F] font-bold border border-[#BC796F]/30 hover:bg-[#BC796F]/25'
                        : d.isCurrentMonth
                        ? 'text-warm-900 hover:bg-white/70'
                        : 'text-warm-700/40 hover:bg-white/40'
                    }`}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>

            {/* Footer with "היום" and "סגירה" */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#BC796F]/15 text-xs">
              <button
                type="button"
                onClick={handleSelectToday}
                className="font-semibold text-[#88463F] hover:text-[#5C2B25] hover:underline"
              >
                היום
              </button>

              <button
                type="button"
                onClick={closeCalendar}
                className="text-warm-700 hover:text-warm-950 px-2 py-1 rounded-lg hover:bg-white/60 transition-colors"
              >
                סגירה
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
