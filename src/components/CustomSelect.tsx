import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  renderOption?: (option: SelectOption, isSelected: boolean) => React.ReactNode;
  renderTrigger?: (selectedOption?: SelectOption, placeholder?: string) => React.ReactNode;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'בחירה...',
  disabled = false,
  className = '',
  triggerClassName = '',
  menuClassName = '',
  id,
  name,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  renderOption,
  renderTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ left: 0, width: 0, maxHeight: 240 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchStringRef = useRef<string>('');

  const selectedOption = options.find(o => o.value === value);

  // Update menu coordinates based on trigger position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;

    if (openUpward) {
      setMenuPosition({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(260, spaceAbove),
      });
    } else {
      setMenuPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(260, spaceBelow),
      });
    }
  }, [options.length]);

  // Handle open/close and focus
  const openMenu = () => {
    if (disabled) return;
    updatePosition();
    setIsOpen(true);
    const selectedIdx = options.findIndex(o => o.value === value);
    setFocusedIndex(selectedIdx >= 0 ? selectedIdx : 0);
  };

  const closeMenu = (restoreFocus = true) => {
    setIsOpen(false);
    setFocusedIndex(-1);
    if (restoreFocus && triggerRef.current) {
      triggerRef.current.focus();
    }
  };

  const toggleMenu = () => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        closeMenu(false);
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

  // Keep focused item visible in scroll
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && menuRef.current) {
      const optionEl = menuRef.current.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`);
      if (optionEl) {
        optionEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, focusedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setFocusedIndex(prev => {
          let next = prev + 1;
          while (next < options.length && options[next].disabled) {
            next++;
          }
          return next < options.length ? next : prev;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setFocusedIndex(prev => {
          let next = prev - 1;
          while (next >= 0 && options[next].disabled) {
            next--;
          }
          return next >= 0 ? next : prev;
        });
        break;
      }
      case 'Home': {
        e.preventDefault();
        const firstEnabled = options.findIndex(o => !o.disabled);
        if (firstEnabled >= 0) setFocusedIndex(firstEnabled);
        break;
      }
      case 'End': {
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            setFocusedIndex(i);
            break;
          }
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          const opt = options[focusedIndex];
          if (!opt.disabled) {
            onChange(opt.value);
            closeMenu(true);
          }
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        closeMenu(true);
        break;
      }
      case 'Tab': {
        closeMenu(false);
        break;
      }
      default: {
        // Type-ahead search
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
          searchStringRef.current += e.key.toLowerCase();

          searchTimeoutRef.current = setTimeout(() => {
            searchStringRef.current = '';
          }, 800);

          const query = searchStringRef.current;
          const matchIdx = options.findIndex(
            (o, i) => !o.disabled && (i > focusedIndex ? true : false) && o.label.toLowerCase().startsWith(query)
          );
          const finalMatchIdx = matchIdx !== -1 ? matchIdx : options.findIndex(
            o => !o.disabled && o.label.toLowerCase().startsWith(query)
          );

          if (finalMatchIdx !== -1) {
            setFocusedIndex(finalMatchIdx);
          }
        }
        break;
      }
    }
  };

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    closeMenu(true);
  };

  return (
    <div className={`relative inline-block w-full text-right ${className}`}>
      {/* Hidden input for form submission compatibility */}
      {name && <input type="hidden" name={name} value={value} />}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={toggleMenu}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2.5 px-3.5 rounded-xl text-sm font-medium transition-all text-right liquid-glass-input select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/70'
        } ${isOpen ? 'ring-2 ring-[#BC796F]/25 border-[#BC796F] bg-white/80' : ''} ${triggerClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 truncate text-right">
          {renderTrigger ? (
            renderTrigger(selectedOption, placeholder)
          ) : (
            <>
              {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
              <span className={`truncate text-right ${selectedOption ? 'text-warm-900 font-medium' : 'text-warm-700/50'}`}>
                {selectedOption ? selectedOption.label : placeholder}
              </span>
            </>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-[#BC796F] shrink-0 transition-transform duration-200 pointer-events-none ${
            isOpen ? 'rotate-180 text-warm-950' : ''
          }`}
        />
      </button>

      {/* Opened Dropdown Menu via Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            dir="rtl"
            aria-activedescendant={
              focusedIndex >= 0 && focusedIndex < options.length
                ? `option-${listboxId}-${options[focusedIndex].value}`
                : undefined
            }
            onKeyDown={handleKeyDown}
            className={`fixed z-[9999] rounded-2xl liquid-glass border border-white/80 shadow-2xl py-1.5 backdrop-blur-xl bg-white/92 font-heebo animate-in fade-in zoom-in-95 duration-150 overflow-hidden text-right ${menuClassName}`}
            style={{
              ...(menuPosition.top !== undefined ? { top: `${menuPosition.top}px` } : {}),
              ...(menuPosition.bottom !== undefined ? { bottom: `${menuPosition.bottom}px` } : {}),
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
              minWidth: '180px',
            }}
          >
            <div
              className="overflow-y-auto px-1 space-y-0.5"
              style={{ maxHeight: `${menuPosition.maxHeight - 16}px` }}
            >
              {options.length === 0 ? (
                <div className="py-4 text-center text-xs text-[#7D5A56] select-none">
                  אין פריטים לבחירה
                </div>
              ) : (
                options.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isFocused = idx === focusedIndex;

                  return (
                    <div
                      key={opt.value}
                      id={`option-${listboxId}-${opt.value}`}
                      data-index={idx}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled}
                      onClick={() => !opt.disabled && handleSelect(opt.value)}
                      onMouseEnter={() => !opt.disabled && setFocusedIndex(idx)}
                      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer transition-all text-right select-none ${
                        isSelected
                          ? 'bg-[#BC796F]/15 text-[#88463F] font-semibold'
                          : isFocused
                          ? 'bg-white/80 text-warm-950 font-medium'
                          : 'text-warm-900 hover:bg-white/60'
                      } ${opt.disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                    >
                      {renderOption ? (
                        renderOption(opt, isSelected)
                      ) : (
                        <>
                          <div className="flex items-center gap-2.5 min-w-0 text-right">
                            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                            <div className="flex flex-col min-w-0 text-right">
                              <span className="truncate">{opt.label}</span>
                              {opt.description && (
                                <span className="text-[11px] text-[#7D5A56] font-normal truncate">
                                  {opt.description}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {opt.badge && (
                              <span className="px-2 py-0.5 rounded-md bg-white/60 border border-white/60 text-[11px] text-[#7D5A56] tabular-nums">
                                {opt.badge}
                              </span>
                            )}
                            {isSelected && (
                              <Check className="w-4 h-4 text-[#BC796F] shrink-0 stroke-[2.5]" />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
