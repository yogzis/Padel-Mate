'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type ChromeSelectOption<Value extends string> = {
  value: Value;
  label: string;
};

export function ChromeSelect<Value extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: Value;
  options: readonly ChromeSelectOption<Value>[];
  onChange: (value: Value) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listboxId = `${id}-listbox`;
  const labelId = `${id}-label`;
  const selected = options.find((option) => option.value === value) ?? options[0];
  const sizerLabel = useMemo(
    () => options.reduce((longest, option) => (
      option.label.length > longest.length ? option.label : longest
    ), ''),
    [options],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="chrome-select" ref={rootRef}>
      <span id={labelId}>{label}</span>
      <button
        type="button"
        id={id}
        className={open ? 'chrome-select-trigger open' : 'chrome-select-trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${id}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="chrome-select-labels">
          <span className="chrome-select-sizer" aria-hidden>
            {sizerLabel}
            <span className="check-circle" />
          </span>
          <span className="chrome-select-value">{selected?.label}</span>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <ul id={listboxId} className="chrome-select-menu" role="listbox" aria-labelledby={labelId}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  id={`${generatedId}-${option.value}`}
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? 'chrome-select-option selected' : 'chrome-select-option'}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  <span className="check-circle">{isSelected && <Check size={15} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
