import React, { useEffect, useRef, useState } from 'react';
import { clampPaneSize } from '../utils/paneLayout.ts';

interface SplitResizerProps {
  orientation: 'vertical' | 'horizontal';
  label: string;
  value: number;
  min: number;
  max: number;
  invertDelta?: boolean;
  onChangeValue: (nextValue: number) => void;
  onReset?: () => void;
  className?: string;
  testId?: string;
}

export const SplitResizer: React.FC<SplitResizerProps> = ({
  orientation,
  label,
  value,
  min,
  max,
  invertDelta = false,
  onChangeValue,
  onReset,
  className = '',
  testId,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const startPos = orientation === 'vertical' ? e.clientX : e.clientY;
    const startVal = value;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;

    document.body.style.cursor =
      orientation === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      const currentPos = orientation === 'vertical' ? ev.clientX : ev.clientY;
      const rawDelta = currentPos - startPos;
      const effectiveDelta = invertDelta ? -rawDelta : rawDelta;
      onChangeValue(clampPaneSize(startVal + effectiveDelta, min, max));
    };

    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      setIsDragging(false);
      cleanupRef.current = null;
    };

    cleanupRef.current = stop;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;

    if (orientation === 'vertical') {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onChangeValue(clampPaneSize(value + (invertDelta ? -step : step), min, max));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onChangeValue(clampPaneSize(value + (invertDelta ? step : -step), min, max));
      }
    } else {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onChangeValue(clampPaneSize(value + (invertDelta ? step : -step), min, max));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onChangeValue(clampPaneSize(value + (invertDelta ? -step : step), min, max));
      }
    }

    if (e.key === 'Home') {
      e.preventDefault();
      onChangeValue(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChangeValue(max);
    } else if ((e.key === 'Enter' || e.key === '0') && onReset) {
      e.preventDefault();
      onReset();
    }
  };

  const isVertical = orientation === 'vertical';

  return (
    <div
      role="separator"
      tabIndex={0}
      data-testid={testId}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clampPaneSize(value, min, max)}
      title={`${label} (drag to resize, double-click to reset)`}
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={`group relative z-20 shrink-0 select-none touch-none focus:outline-none flex items-center justify-center ${
        isVertical
          ? 'w-2 -mx-1 h-full cursor-col-resize'
          : 'h-2.5 -my-[5px] w-full cursor-row-resize'
      } ${className}`}
    >
      {/* Hairline accent highlight */}
      <span
        aria-hidden="true"
        className={`pointer-events-none transition-colors ${
          isVertical ? 'w-[2px] h-full' : 'h-[2px] w-full'
        } ${
          isDragging
            ? 'bg-sky-500'
            : 'bg-transparent group-hover:bg-sky-500/75 group-focus-visible:bg-sky-500'
        }`}
      />
      {/* Subtle grip bar */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-full transition-colors ${
          isVertical ? 'w-1 h-7' : 'h-1 w-9'
        } ${
          isDragging
            ? 'bg-sky-500'
            : isVertical
              ? 'bg-transparent group-hover:bg-sky-500 group-focus-visible:bg-sky-500'
              : 'bg-slate-300/80 dark:bg-slate-600/80 group-hover:bg-sky-500 group-focus-visible:bg-sky-500'
        }`}
      />
    </div>
  );
};
