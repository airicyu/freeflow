import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  splitPercent: number;
  onResize: (percent: number) => void;
}

/**
 * ResizableSplit - Two-panel layout with draggable divider
 *
 * Features:
 * - Draggable divider between panels
 * - Configurable initial split percentage
 * - Keyboard support (Arrow keys while dragging)
 */
export const ResizableSplit: React.FC<ResizableSplitProps> = ({
  left,
  right,
  splitPercent,
  onResize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;

    onResize(percent);
  }, [isDragging, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percent = (x / rect.width) * 100;

    onResize(percent);
  }, [isDragging, onResize]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = 2; // Percentage change per keypress

    switch (e.key) {
      case 'ArrowLeft':
        onResize(splitPercent - step);
        e.preventDefault();
        break;
      case 'ArrowRight':
        onResize(splitPercent + step);
        e.preventDefault();
        break;
    }
  }, [splitPercent, onResize]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return (
    <div
      ref={containerRef}
      className="resizable-split"
      onKeyDown={handleKeyDown}
    >
      <div
        className="resizable-split__left"
        style={{ width: `${splitPercent}%` }}
      >
        {left}
      </div>

      <div
        className="resizable-split__divider"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={handleKeyDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuenow={splitPercent}
        tabIndex={0}
      />

      <div className="resizable-split__right">
        {right}
      </div>

      {/* Overlay while dragging to capture mouse events outside elements */}
      {isDragging && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: 'col-resize',
          }}
        />
      )}
    </div>
  );
};

export default ResizableSplit;
