import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';

interface CustomTimePickerProps {
  value: string; // HH:mm (24-hour clock)
  onChange: (time: string) => void;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

const VIEWPORT_MARGIN = 14; // 12-16px viewport margin requirement

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value,
  onChange,
  id,
  name,
  className = '',
  disabled = false,
  placeholder = '00:00',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hoursListRef = useRef<HTMLDivElement>(null);
  const minutesListRef = useRef<HTMLDivElement>(null);
  const timepickerId = useId();

  // Internal draft state for hours and minutes
  const parseTime = (timeStr: string) => {
    if (!timeStr || !timeStr.includes(':')) {
      const now = new Date();
      return {
        hours: String(now.getHours()).padStart(2, '0'),
        minutes: String(now.getMinutes()).padStart(2, '0'),
      };
    }
    const [h, m] = timeStr.split(':');
    const validH = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
    const validM = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
    return {
      hours: String(validH).padStart(2, '0'),
      minutes: String(validM).padStart(2, '0'),
    };
  };

  const initialTime = parseTime(value);
  const [draftHours, setDraftHours] = useState(initialTime.hours);
  const [draftMinutes, setDraftMinutes] = useState(initialTime.minutes);
  const [typedValue, setTypedValue] = useState(value);

  // Sync typedValue when external value changes
  useEffect(() => {
    setTypedValue(value);
    const parsed = parseTime(value);
    setDraftHours(parsed.hours);
    setDraftMinutes(parsed.minutes);
  }, [value]);

  const [popoverPos, setPopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
    isSheet?: boolean;
  }>({ left: 0, width: 240, maxHeight: 290 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const isSmallScreen = viewportWidth < 480 || viewportHeight < 420;

    if (isSmallScreen) {
      setPopoverPos({
        left: 0,
        width: viewportWidth,
        maxHeight: Math.min(380, viewportHeight * 0.85),
        isSheet: true,
      });
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 240;
    const idealHeight = 285; // Compact ergonomic height

    // Available space above and below the trigger field
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;

    // Decision: open upward if insufficient room below and more room above
    let openUpward = false;
    if (spaceBelow < idealHeight && spaceAbove >= idealHeight) {
      openUpward = true;
    } else if (spaceBelow < idealHeight && spaceAbove < idealHeight) {
      openUpward = spaceAbove > spaceBelow;
    } else {
      openUpward = false;
    }

    // Viewport-aware max-height
    const availableVertical = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(210, Math.min(idealHeight, availableVertical - 8));

    // Horizontal placement with 12-16px margin clamping (RTL right-aligned with trigger)
    let left = rect.right - popoverWidth;
    if (left + popoverWidth > viewportWidth - VIEWPORT_MARGIN) {
      left = viewportWidth - VIEWPORT_MARGIN - popoverWidth;
    }
    if (left < VIEWPORT_MARGIN) {
      left = VIEWPORT_MARGIN;
    }

    let top: number | undefined;
    let bottom: number | undefined;

    if (openUpward) {
      bottom = viewportHeight - rect.top + 6;
      // Prevent top from clipping beyond viewport
      if (rect.top - 6 - maxHeight < VIEWPORT_MARGIN) {
        bottom = undefined;
        top = VIEWPORT_MARGIN;
      }
    } else {
      top = rect.bottom + 6;
      // Prevent bottom from clipping beyond viewport
      if (top + maxHeight > viewportHeight - VIEWPORT_MARGIN) {
        top = Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - maxHeight);
      }
    }

    setPopoverPos({
      top,
      bottom,
      left,
      width: popoverWidth,
      maxHeight,
      isSheet: false,
    });
  }, []);

  const openPopover = () => {
    if (disabled) return;
    const parsed = parseTime(value);
    setDraftHours(parsed.hours);
    setDraftMinutes(parsed.minutes);
    updatePosition();
    setIsOpen(true);
  };

  const closePopover = () => {
    setIsOpen(false);
  };

  // Scroll hours and minutes into view when opened
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (hoursListRef.current) {
        const selectedHourEl = hoursListRef.current.querySelector<HTMLElement>('[data-selected="true"]');
        if (selectedHourEl) {
          selectedHourEl.scrollIntoView({ block: 'center' });
        }
      }
      if (minutesListRef.current) {
        const selectedMinEl = minutesListRef.current.querySelector<HTMLElement>('[data-selected="true"]');
        if (selectedMinEl) {
          selectedMinEl.scrollIntoView({ block: 'center' });
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // Click outside and dynamic repositioning on scroll, resize, or zoom change
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        closePopover();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleScrollOrResize);
      window.visualViewport.addEventListener('scroll', handleScrollOrResize);
    }

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleScrollOrResize);
        window.visualViewport.removeEventListener('scroll', handleScrollOrResize);
      }
    };
  }, [isOpen, updatePosition]);

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        openPopover();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      closePopover();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  // Direct typing handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTypedValue(raw);

    // If matches valid time HH:mm, update parent
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(raw)) {
      onChange(raw);
      const parsed = parseTime(raw);
      setDraftHours(parsed.hours);
      setDraftMinutes(parsed.minutes);
    }
  };

  const handleInputBlur = () => {
    // Auto-fix if typed partially or blur
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(typedValue)) {
      onChange(typedValue);
    } else if (typedValue.trim() === '') {
      onChange('');
    } else {
      // Revert to last valid value
      setTypedValue(value);
    }
  };

  const handleConfirm = () => {
    const timeStr = `${draftHours}:${draftMinutes}`;
    onChange(timeStr);
    setTypedValue(timeStr);
    closePopover();
  };

  const handleCancel = () => {
    const parsed = parseTime(value);
    setDraftHours(parsed.hours);
    setDraftMinutes(parsed.minutes);
    closePopover();
  };

  const handleSetNow = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    setDraftHours(h);
    setDraftMinutes(m);
  };

  const hoursArray = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutesArray = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  return (
    <div ref={triggerRef} className={`relative w-full ${className}`} onKeyDown={handleKeyDown}>
      {name && <input type="hidden" name={name} value={value} />}

      {/* Field Container */}
      <div
        className={`w-full h-10 rounded-xl liquid-glass-input flex items-center justify-between transition-all select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/70'
        } ${isOpen ? 'ring-2 ring-[#BC796F]/25 border-[#BC796F] bg-white/80' : ''}`}
      >
        {/* Clock Icon Button */}
        <button
          type="button"
          onClick={openPopover}
          disabled={disabled}
          title="בחירת שעה מהרשימה"
          aria-label="בחירת שעה"
          className="h-full px-3 text-[#BC796F] hover:text-warm-950 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* Editable Time Input */}
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={typedValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onClick={openPopover}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full h-full pr-3 pl-1 bg-transparent border-0 outline-none text-right font-heebo tabular-nums text-sm font-medium text-warm-900 placeholder:text-warm-700/40"
        />
      </div>

      {/* Custom Time Popover / Bottom Sheet via Portal */}
      {isOpen &&
        createPortal(
          popoverPos.isSheet ? (
            /* Responsive Bottom Sheet / Dialog for mobile or constrained screens */
            <div 
              className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-3 bg-black/35 backdrop-blur-xs animate-in fade-in duration-150"
              onClick={closePopover}
            >
              <div
                ref={popoverRef}
                id={timepickerId}
                role="dialog"
                aria-label="בחירת שעה"
                dir="rtl"
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl liquid-glass border border-white/90 shadow-2xl backdrop-blur-2xl bg-white/95 font-heebo animate-in slide-in-from-bottom-4 duration-200 text-right select-none flex flex-col overflow-hidden"
                style={{ maxHeight: `${popoverPos.maxHeight}px` }}
              >
                {/* Header */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-[#BC796F]/15 shrink-0 bg-white/60">
                  <div className="flex items-center gap-2 text-xs text-[#7D5A56]">
                    <Clock className="w-4 h-4 text-[#BC796F]" />
                    <span className="font-bold text-warm-950 text-sm">בחירת שעה</span>
                  </div>

                  <div
                    dir="ltr"
                    className="text-base font-bold text-[#88463F] tabular-nums px-2.5 py-0.5 rounded-lg bg-[#BC796F]/12 border border-[#BC796F]/20"
                  >
                    {draftHours}:{draftMinutes}
                  </div>
                </div>

                {/* Body with dual columns & presets */}
                <div className="p-3.5 flex-1 min-h-0 overflow-y-auto scrollbar-none flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold text-warm-800/90 shrink-0">
                    <div>שעות</div>
                    <div>דקות</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 h-36 min-h-[120px] rounded-xl bg-white/40 p-1 border border-white/60 shrink-0">
                    {/* Hours */}
                    <div ref={hoursListRef} role="listbox" aria-label="שעות" className="overflow-y-auto space-y-1 px-1 scroll-smooth scrollbar-none">
                      {hoursArray.map(h => {
                        const isSelected = h === draftHours;
                        return (
                          <button
                            key={h}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            data-selected={isSelected}
                            onClick={() => setDraftHours(h)}
                            className={`w-full py-1.5 rounded-lg text-xs font-semibold tabular-nums text-center transition-all ${
                              isSelected
                                ? 'bg-[#BC796F] text-white shadow-xs font-bold'
                                : 'text-warm-900 hover:bg-[#BC796F]/15 hover:text-[#88463F]'
                            }`}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>

                    {/* Minutes */}
                    <div ref={minutesListRef} role="listbox" aria-label="דקות" className="overflow-y-auto space-y-1 px-1 scroll-smooth scrollbar-none">
                      {minutesArray.map(m => {
                        const isSelected = m === draftMinutes;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            data-selected={isSelected}
                            onClick={() => setDraftMinutes(m)}
                            className={`w-full py-1.5 rounded-lg text-xs font-semibold tabular-nums text-center transition-all ${
                              isSelected
                                ? 'bg-[#BC796F] text-white shadow-xs font-bold'
                                : 'text-warm-900 hover:bg-[#BC796F]/15 hover:text-[#88463F]'
                            }`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Presets */}
                  <div className="flex items-center justify-between gap-1.5 px-0.5 shrink-0">
                    {['00', '15', '30', '45'].map(min => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setDraftMinutes(min)}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-semibold tabular-nums transition-all border ${
                          draftMinutes === min
                            ? 'bg-[#BC796F]/20 text-[#88463F] border-[#BC796F]/40'
                            : 'bg-white/60 text-warm-800 border-white/70 hover:bg-white'
                        }`}
                      >
                        :{min}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sticky Footer */}
                <div className="px-4 py-3 border-t border-[#BC796F]/15 flex items-center justify-between text-xs bg-white/95 shrink-0">
                  <button
                    type="button"
                    onClick={handleSetNow}
                    className="font-bold text-[#88463F] hover:text-[#5C2B25] hover:underline"
                  >
                    עכשיו
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-3.5 py-1.5 rounded-xl text-warm-700 hover:text-warm-950 hover:bg-white/60 transition-colors"
                    >
                      ביטול
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      className="px-4 py-1.5 rounded-xl font-bold text-white bg-[#88463F] hover:bg-[#723832] shadow-xs active:scale-95 transition-all"
                    >
                      אישור
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop / Standard Popover with Viewport-Aware Positioning */
            <div
              ref={popoverRef}
              id={timepickerId}
              role="dialog"
              aria-label="בחירת שעה"
              dir="rtl"
              className="fixed z-[9999] rounded-2xl liquid-glass border border-white/85 shadow-2xl backdrop-blur-xl bg-white/95 font-heebo animate-in fade-in zoom-in-95 duration-150 text-right select-none flex flex-col overflow-hidden"
              style={{
                ...(popoverPos.top !== undefined ? { top: `${popoverPos.top}px` } : {}),
                ...(popoverPos.bottom !== undefined ? { bottom: `${popoverPos.bottom}px` } : {}),
                left: `${popoverPos.left}px`,
                width: `${popoverPos.width}px`,
                maxHeight: `${popoverPos.maxHeight}px`,
              }}
            >
              {/* Header (shrink-0) */}
              <div className="px-3 py-2 flex items-center justify-between border-b border-[#BC796F]/15 shrink-0 bg-white/40">
                <div className="flex items-center gap-1.5 text-xs text-[#7D5A56]">
                  <Clock className="w-3.5 h-3.5 text-[#BC796F]" />
                  <span className="font-bold text-warm-900">בחירת שעה</span>
                </div>

                <div
                  dir="ltr"
                  className="text-sm font-bold text-[#88463F] tabular-nums px-2 py-0.5 rounded-lg bg-[#BC796F]/12 border border-[#BC796F]/20"
                >
                  {draftHours}:{draftMinutes}
                </div>
              </div>

              {/* Scrollable Body (flex-1 min-h-0 overflow-y-auto scrollbar-none) */}
              <div className="p-2.5 flex-1 min-h-0 overflow-y-auto scrollbar-none flex flex-col gap-1.5">
                {/* Column Titles */}
                <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold text-warm-800/90 shrink-0">
                  <div>שעות</div>
                  <div>דקות</div>
                </div>

                {/* Dual Scrollable Columns */}
                <div className="grid grid-cols-2 gap-2 h-36 min-h-[110px] rounded-xl bg-white/40 p-1 border border-white/60 shrink-0">
                  {/* Hours */}
                  <div
                    ref={hoursListRef}
                    role="listbox"
                    aria-label="שעות"
                    className="overflow-y-auto space-y-0.5 px-0.5 scroll-smooth scrollbar-none"
                  >
                    {hoursArray.map(h => {
                      const isSelected = h === draftHours;
                      return (
                        <button
                          key={h}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-selected={isSelected}
                          onClick={() => setDraftHours(h)}
                          className={`w-full py-1 rounded-lg text-xs font-semibold tabular-nums text-center transition-all ${
                            isSelected
                              ? 'bg-[#BC796F] text-white shadow-xs font-bold'
                              : 'text-warm-900 hover:bg-[#BC796F]/15 hover:text-[#88463F]'
                          }`}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>

                  {/* Minutes */}
                  <div
                    ref={minutesListRef}
                    role="listbox"
                    aria-label="דקות"
                    className="overflow-y-auto space-y-0.5 px-0.5 scroll-smooth scrollbar-none"
                  >
                    {minutesArray.map(m => {
                      const isSelected = m === draftMinutes;
                      return (
                        <button
                          key={m}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-selected={isSelected}
                          onClick={() => setDraftMinutes(m)}
                          className={`w-full py-1 rounded-lg text-xs font-semibold tabular-nums text-center transition-all ${
                            isSelected
                              ? 'bg-[#BC796F] text-white shadow-xs font-bold'
                              : 'text-warm-900 hover:bg-[#BC796F]/15 hover:text-[#88463F]'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Presets for Minutes */}
                <div className="flex items-center justify-between gap-1 px-0.5 shrink-0">
                  {['00', '15', '30', '45'].map(min => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setDraftMinutes(min)}
                      className={`flex-1 py-0.5 rounded-lg text-[11px] font-semibold tabular-nums transition-all border ${
                        draftMinutes === min
                          ? 'bg-[#BC796F]/20 text-[#88463F] border-[#BC796F]/40'
                          : 'bg-white/60 text-warm-800 border-white/70 hover:bg-white'
                      }`}
                    >
                      :{min}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sticky Footer Actions (shrink-0) */}
              <div className="px-3 py-2 border-t border-[#BC796F]/15 flex items-center justify-between text-xs bg-white/95 shrink-0 rounded-b-2xl">
                <button
                  type="button"
                  onClick={handleSetNow}
                  className="font-bold text-[#88463F] hover:text-[#5C2B25] hover:underline"
                >
                  עכשיו
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-2.5 py-1 rounded-lg text-warm-700 hover:text-warm-950 hover:bg-white/60 transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="px-3 py-1 rounded-lg font-bold text-white bg-[#88463F] hover:bg-[#723832] shadow-xs active:scale-95 transition-all"
                  >
                    אישור
                  </button>
                </div>
              </div>
            </div>
          ),
          document.body
        )}
    </div>
  );
};
