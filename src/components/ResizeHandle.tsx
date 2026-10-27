import { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  direction: 'vertical';
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  onDoubleClick?: () => void;
}

export function ResizeHandle({ direction, onResize, onResizeEnd, onDoubleClick }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    lastX.current = e.clientX;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      onResizeEnd?.();
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, onResizeEnd]);

  return (
    <div
      className="resize-handle"
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="resize-handle-line" />
    </div>
  );
}
