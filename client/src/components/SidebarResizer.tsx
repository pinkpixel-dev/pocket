import { useCallback } from 'react';
import { SIDEBAR_MAX, SIDEBAR_MIN } from '../hooks/useSidebarWidth';

interface SidebarResizerProps {
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

/** How far one arrow key press moves the edge. */
const STEP = 16;

/**
 * The draggable edge of the sidebar. It is a real separator with arrow key
 * support, because a drag handle that only answers to a mouse is no use on a
 * keyboard, and pointer events cover touch and pen without a second path.
 */
export function SidebarResizer({ width, onResize, onReset }: SidebarResizerProps) {
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Only a primary press drags. A right click should open the menu.
      if (event.button !== 0) return;
      event.preventDefault();

      const node = event.currentTarget;
      node.setPointerCapture(event.pointerId);

      const move = (moveEvent: PointerEvent) => {
        // The sidebar starts at the left edge, so the pointer's x is the width.
        onResize(moveEvent.clientX);
      };

      const stop = () => {
        node.releasePointerCapture(event.pointerId);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', stop);
        node.removeEventListener('pointercancel', stop);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
      };

      // Held on the body so the cursor does not flicker over the content the
      // pointer crosses while dragging.
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', stop);
      node.addEventListener('pointercancel', stop);
    },
    [onResize],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') onResize(width - STEP);
    else if (event.key === 'ArrowRight') onResize(width + STEP);
    else if (event.key === 'Home') onResize(SIDEBAR_MIN);
    else if (event.key === 'End') onResize(SIDEBAR_MAX);
    else if (event.key === 'Enter' || event.key === ' ') onReset();
    else return;

    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      title="Drag to resize. Double click to reset."
      className="absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none lg:block
                 after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2
                 after:bg-transparent after:transition-colors hover:after:bg-accent
                 focus-visible:outline-none focus-visible:after:bg-accent focus-visible:after:w-0.5"
    />
  );
}
