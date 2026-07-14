import { useEffect, useRef } from 'react';

type AutoGrowTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

// Grows to fit its content instead of scrolling internally — height is set
// directly from scrollHeight on every value change.
export function AutoGrowTextarea({ value, onChange, placeholder, className }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
    />
  );
}
