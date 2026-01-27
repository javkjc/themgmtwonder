'use client';

import { useDroppable } from '@dnd-kit/core';
import { useDragContext } from './DragContext';

type DroppableZoneProps = {
  id: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  activeStyle?: React.CSSProperties;
  className?: string;
};

export function DroppableZone({ id, children, style, activeStyle, className }: DroppableZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { activeItem } = useDragContext();

  const combinedStyle: React.CSSProperties = {
    ...style,
    ...(activeItem && isOver ? activeStyle : {}),
  };

  return (
    <div ref={setNodeRef} style={combinedStyle} className={className}>
      {children}
    </div>
  );
}
