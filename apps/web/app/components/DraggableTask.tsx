'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { DragItem } from './DragContext';

type DraggableTaskProps = {
  taskId: string;
  title: string;
  source: 'unscheduled' | 'calendar';
  children: React.ReactNode;
};

export function DraggableTask({ taskId, title, source, children }: DraggableTaskProps) {
  const data: DragItem = { taskId, title, source };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `draggable-${taskId}`,
    data,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}
