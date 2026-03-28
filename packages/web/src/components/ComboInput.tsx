import { useState, useRef, useEffect } from 'react';

interface ComboInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[] | string[];
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

/**
 * Text input with dropdown suggestions. User can type freely
 * or pick from the list. Replaces rigid <select> dropdowns.
 */
export default function ComboInput({
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength = 100,
  className = '',
}: ComboInputProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes((filter || value).toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value.slice(0, maxLength);
          onChange(v);
          setFilter(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`input-field ${className}`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-tg-section-bg rounded-xl shadow-lg max-h-48 overflow-y-auto no-scrollbar border border-tg-hint/10">
          {filtered.slice(0, 15).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onChange(item);
                setFilter('');
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-tg-text active:bg-tg-secondary-bg transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
