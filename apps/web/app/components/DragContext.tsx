'use client';

import { createContext, useContext, ReactNode, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragMoveEvent,
} from '@dnd-kit/core';
import { useState, useCallback } from 'react';

export type DragItem = {
  taskId: string;
  title: string;
  source: 'unscheduled' | 'calendar';
};

type DragContextValue = {
  activeItem: DragItem | null;
  overId: string | null;
  pointerPosition: { x: number; y: number } | null;
};

const DragCtx = createContext<DragContextValue>({ activeItem: null, overId: null, pointerPosition: null });

export function useDragContext() {
  return useContext(DragCtx);
}

type DragProviderProps = {
  children: ReactNode;
  onSchedule: (taskId: string, startAt: Date, durationMin: number) => Promise<void>;
  onUnschedule: (taskId: string) => Promise<void>;
  onReschedule: (taskId: string, startAt: Date, durationMin: number) => Promise<void>;
  getDropTime: (x: number, y: number) => Date | null;
  getEventDuration: (taskId: string) => number;
  calendarRef?: React.RefObject<HTMLDivElement>;
};

export function DragProvider({
  children,
  onSchedule,
  onUnschedule,
  onReschedule,
  getDropTime,
  getEventDuration,
  calendarRef,
}: DragProviderProps) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Track real pointer position via native event listener for scroll-aware accuracy.
  // @dnd-kit's delta doesn't reliably map to viewport coords when content is scrolled.
  const handleNativePointerMove = useCallback((e: PointerEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setPointerPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragItem | undefined;
    if (data) {
      setActiveItem(data);
      // Start tracking native pointer position for scroll-aware coordinates
      document.addEventListener('pointermove', handleNativePointerMove);
    }
  }, [handleNativePointerMove]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  }, []);

  const handleDragMove = useCallback((_event: DragMoveEvent) => {
    // Position tracking is handled by native pointermove listener (handleNativePointerMove).
    // This handler is kept for @dnd-kit lifecycle but does not compute position.
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const item = active.data.current as DragItem | undefined;

    // Capture pointer position before clearing state
    const finalPointer = lastPointerRef.current;

    // Stop tracking native pointer
    document.removeEventListener('pointermove', handleNativePointerMove);

    setActiveItem(null);
    setOverId(null);
    setPointerPosition(null);
    lastPointerRef.current = null;

    if (!item || !over) return;

    const dropTarget = over.id as string;

    // Drop on unschedule zone
    if (dropTarget === 'unschedule-zone') {
      if (item.source === 'calendar') {
        await onUnschedule(item.taskId);
      }
      return;
    }

    // Drop on calendar grid
    if (dropTarget === 'calendar-grid') {
      // Use tracked pointer position (most accurate)
      const finalX = finalPointer?.x || 0;
      const finalY = finalPointer?.y || 0;

      const dropTime = getDropTime(finalX, finalY);
      if (!dropTime) return;

      const duration = item.source === 'calendar' ? getEventDuration(item.taskId) : 30;

      if (item.source === 'unscheduled') {
        await onSchedule(item.taskId, dropTime, duration);
      } else {
        await onReschedule(item.taskId, dropTime, duration);
      }
    }
  }, [onSchedule, onUnschedule, onReschedule, getDropTime, getEventDuration, handleNativePointerMove]);

  const handleDragCancel = useCallback(() => {
    document.removeEventListener('pointermove', handleNativePointerMove);
    setActiveItem(null);
    setOverId(null);
    setPointerPosition(null);
    lastPointerRef.current = null;
  }, [handleNativePointerMove]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <DragCtx.Provider value={{ activeItem, overId, pointerPosition }}>
        {children}
        <DragOverlay dropAnimation={null}>
          {activeItem && (
            <div
              style={{
                padding: '8px 12px',
                background: '#3b82f6',
                color: 'white',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'grabbing',
              }}
            >
              {activeItem.title}
            </div>
          )}
        </DragOverlay>
      </DragCtx.Provider>
    </DndContext>
  );
}
