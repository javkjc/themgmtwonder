'use client';

import { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, startOfDay, endOfDay, addDays, subDays } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { apiFetchJson, isUnauthorized } from '../lib/api';
import type { Me } from '../types';
import type { Todo } from '../hooks/useTodos';
import Layout from '../components/Layout';
import ForcePasswordChange from '../components/ForcePasswordChange';
import { useDraggable } from '@dnd-kit/core';
import { DragProvider, useDragContext, type DragItem } from '../components/DragContext';
import { DraggableTask } from '../components/DraggableTask';
import { DroppableZone } from '../components/DroppableZone';
import NotificationToast, { type Notification } from '../components/NotificationToast';
import { useCategories } from '../hooks/useCategories';
import { useDurationSettings } from '../hooks/useDurationSettings';
import ScheduleModal from '../components/ScheduleModal';
import CreateTaskModal from '../components/CreateTaskModal';
import { useSettings } from '../hooks/useSettings';

const locales = { 'en-US': require('date-fns/locale/en-US') };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const EDGE = 6;
type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Todo;
};

// Unschedule drop zone component - overlays the unscheduled panel when dragging calendar events
// Memoized to prevent re-renders when unrelated state changes
const UnscheduleZone = memo(function UnscheduleZone() {
  const { activeItem, overId } = useDragContext();
  const isOver = overId === 'unschedule-zone';
  const showZone = activeItem?.source === 'calendar';

  if (!showZone) return null;

  return (
    <DroppableZone
      id="unschedule-zone"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: isOver ? 'rgba(254, 226, 226, 0.95)' : 'rgba(254, 226, 226, 0.85)',
        border: isOver ? '3px dashed #dc2626' : '2px dashed #f87171',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        transition: 'all 0.15s ease',
      }}
    >
      <span style={{ color: isOver ? '#dc2626' : '#ef4444', fontWeight: 600, fontSize: 14, textAlign: 'center', padding: 16 }}>
        {isOver ? 'Release to Unschedule' : 'Drop here to unschedule'}
      </span>
    </DroppableZone>
  );
});

// Hover time indicator component
// Memoized to prevent re-renders - only updates when activeItem, overId, or pointerPosition changes
const DropTimeIndicator = memo(function DropTimeIndicator({
  calendarRef,
  getDropTime,
  getEventDuration,
}: {
  calendarRef: React.RefObject<HTMLDivElement | null>;
  getDropTime: (x: number, y: number) => Date | null;
  getEventDuration: (taskId: string) => number;
}) {
  const { activeItem, overId, pointerPosition } = useDragContext();

  // Only show when dragging over calendar
  if (!activeItem || overId !== 'calendar-grid' || !pointerPosition || !calendarRef.current) {
    return null;
  }

  const dropTime = getDropTime(pointerPosition.x, pointerPosition.y);
  if (!dropTime) return null;

  // Find the time content area to position the indicator
  const timeContent = calendarRef.current.querySelector('.rbc-time-content') as HTMLElement | null;
  if (!timeContent) return null;

  const contentRect = timeContent.getBoundingClientRect();
  const calendarRect = calendarRef.current.getBoundingClientRect();
  const scrollTop = timeContent.scrollTop;
  const scrollHeight = timeContent.scrollHeight;

  // Find which day column the pointer is over using day slots (same as getDropTime)
  const dayColumns = timeContent.querySelectorAll('.rbc-day-slot');
  let dayColumnLeft = 0;
  let dayColumnWidth = 0;
  let foundColumn = false;

  if (dayColumns.length > 0) {
    for (const col of dayColumns) {
      const colRect = col.getBoundingClientRect();
      if (pointerPosition.x >= colRect.left && pointerPosition.x <= colRect.right) {
        dayColumnLeft = colRect.left - calendarRect.left;
        dayColumnWidth = colRect.width;
        foundColumn = true;
        break;
      }
    }
  } else {
    // Fallback to headers
    const dayHeaders = calendarRef.current.querySelectorAll('.rbc-header');
    for (const header of dayHeaders) {
      const rect = header.getBoundingClientRect();
      if (pointerPosition.x >= rect.left && pointerPosition.x <= rect.right) {
        dayColumnLeft = rect.left - calendarRect.left;
        dayColumnWidth = rect.width;
        foundColumn = true;
        break;
      }
    }
  }

  // If pointer is not over any day column (e.g., in time gutter), don't show indicator
  if (!foundColumn) {
    return null;
  }

  // Calculate vertical position based on drop time (in viewport coordinates)
  // The indicator needs to be positioned relative to where the time visually appears
  const hour = dropTime.getHours();
  const minutes = dropTime.getMinutes();
  const totalMinutes = hour * 60 + minutes;

  // Pixels per minute based on scrollHeight (full content height)
  const pixelsPerMinute = scrollHeight / (24 * 60);

  // Position in the scrollable content
  const positionInContent = totalMinutes * pixelsPerMinute;

  // Translate to viewport position: content top + position - scroll offset
  const topOffset = (contentRect.top - calendarRect.top) + positionInContent - scrollTop;

  const timeStr = format(dropTime, 'h:mm a');

  // Use actual duration for scheduled events, default 30 min for unscheduled
  const durationMin = activeItem.source === 'calendar'
    ? getEventDuration(activeItem.taskId)
    : 30;
  const indicatorHeight = durationMin * pixelsPerMinute;


  return (
    <div
      style={{
        position: 'absolute',
        left: dayColumnLeft,
        top: topOffset,
        width: dayColumnWidth,
        height: indicatorHeight,
        background: 'rgba(59, 130, 246, 0.3)',
        border: '2px solid #3b82f6',
        borderRadius: 4,
        pointerEvents: 'none',
        zIndex: 999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 2,
      }}
    >
      <span
        style={{
          background: '#3b82f6',
          color: 'white',
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 3,
        }}
      >
        {timeStr}
      </span>
    </div>
  );
});

// Draggable calendar event wrapper with overlay-based interaction zones:
// - Left 50%: click zone (full height) - opens edit modal, never drag
// - Right 50%: drag zone (full height) - reschedule, never modal
// - Top edge: resize-start zone - adjusts startAt (earlier/later), end fixed
// - Bottom edge: resize-end zone - adjusts end time, start fixed
// All zones are absolute-positioned overlays INSIDE the event element.
// This ensures short events (5-15 min) remain fully interactive without expanding bounding box.
// Memoized to prevent re-renders during drag when only pointer position changes
const DraggableEvent = memo(function DraggableEvent({
  event,
  onEventClick,
  onResizeStart,
  onResizeTopStart,
}: {
  event: CalendarEvent;
  onEventClick?: (event: CalendarEvent) => void;
  onResizeStart?: (event: CalendarEvent, e: React.PointerEvent) => void;
  onResizeTopStart?: (event: CalendarEvent, e: React.PointerEvent) => void;
}) {
  const data: DragItem = { taskId: event.id, title: event.title, source: 'calendar' };
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `draggable-${event.id}`,
    data,
  });

  const handleClickableAreaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onEventClick) {
      onEventClick(event);
    }
  };

  const handleResizeBottomPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onResizeStart) {
      onResizeStart(event, e);
    }
  };

  const handleResizeTopPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onResizeTopStart) {
      onResizeTopStart(event, e);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        inset: 0,
        height: '100%',
        width: '100%',
        opacity: isDragging ? 0.5 : 1,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        overflow: 'hidden'
      }}
      {...attributes}
    >
      {/* Title display - visual only, not interactive */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: '2px 4px',
          fontSize: 12,
          fontWeight: 600,
          color: '#ffffff',
          lineHeight: '14px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 6, // must be above hit-zones + RBC label/content
        }}
      >
        {event.title}
      </div>

      {/* Top resize zone - adjusts startAt (end fixed, duration changes) */}
      <div
        onPointerDown={handleResizeTopPointerDown}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          cursor: 'ns-resize',
          zIndex: 3,
          background: 'transparent',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title="Drag to adjust start time"
      />

      {/* Bottom resize zone - adjusts end time (start fixed, duration changes) */}
      <div
        onPointerDown={handleResizeBottomPointerDown}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          cursor: 'ns-resize',
          zIndex: 3,
          background: 'transparent',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title="Drag to adjust end time"
      />

      {/* Left = click/edit (covers entire left half minus resize edges) */}
        <div
          title="Click to edit"
          onPointerDown={(e) => {
            // prevents drag from ever starting on left side
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={handleClickableAreaClick}
          style={{
            position: 'absolute',
            top: EDGE,
            bottom: EDGE,
            left: 0,
            width: '50%',
            cursor: 'pointer',
            zIndex: 2,
          }}
        />

        {/* Right = drag/reschedule (covers entire right half minus resize edges) */}
        <div
          title="Drag to reschedule"
          {...listeners}
          style={{
            position: 'absolute',
            top: EDGE,
            bottom: EDGE,
            right: 0,
            width: '50%',
            cursor: isDragging ? 'grabbing' : 'grab',
            zIndex: 2,
          }}
        />
    </div>
  );
});

// Unscheduled task item
// Memoized to prevent re-renders when parent state changes (e.g., during drag)
const UnscheduledTaskItem = memo(function UnscheduledTaskItem({
  todo,
  color,
  onClick,
}: {
  todo: Todo;
  color: string;
  onClick: () => void;
}) {
  const handleClick = (e: React.MouseEvent) => {
    // Only trigger click if not dragging (pointer hasn't moved significantly)
    const target = e.target as HTMLElement;
    if (!target.closest('[data-dragging]')) {
      onClick();
    }
  };

  return (
    <DraggableTask taskId={todo.id} title={todo.title} source="unscheduled">
      <div
        onClick={handleClick}
        style={{
          padding: '10px 12px',
          background: 'white',
          borderRadius: 6,
          borderLeft: `3px solid ${color}`,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          marginBottom: 8,
          cursor: 'pointer',
          transition: 'box-shadow 0.15s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{todo.title}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
          {todo.category && (
            <span style={{ fontSize: 11, color: color }}>{todo.category}</span>
          )}
          {todo.durationMin && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {todo.durationMin} min
            </span>
          )}
        </div>
      </div>
    </DraggableTask>
  );
});

export default function CalendarPage() {
  const { activeItem } = useDragContext();
  const { minDurationMin, maxDurationMin } = useDurationSettings();

  // Auth state
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>('week');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [unscheduledTodos, setUnscheduledTodos] = useState<Todo[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [unscheduledFilter, setUnscheduledFilter] = useState<'all' | 'recent'>('all');

  // Schedule modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalTask, setScheduleModalTask] = useState<Todo | null>(null);

  // Create task modal state (for clicking empty timeslot)
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createTaskModalStartAt, setCreateTaskModalStartAt] = useState<Date | null>(null);

  // Resize state (bottom = end time, top = start time)
  const [resizingEvent, setResizingEvent] = useState<CalendarEvent | null>(null);
  const [resizeStartY, setResizeStartY] = useState<number>(0);
  const [resizeStartDuration, setResizeStartDuration] = useState<number>(0);
  const [resizeDirection, setResizeDirection] = useState<'top' | 'bottom'>('bottom');
  const [resizeOriginalStart, setResizeOriginalStart] = useState<Date | null>(null);

  // Ref for calendar container to compute drop positions
  const calendarRef = useRef<HTMLDivElement>(null);

  // Categories
  const { getCategoryColor, getCategoryNames } = useCategories(me?.userId ?? null);

  // User settings (working hours) for availability suggestions
  const { settings } = useSettings(me?.userId ?? null);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    type: 'success' | 'error' | 'info',
    title: string,
    message?: string,
    taskTitle?: string,
    taskId?: string
  ) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, title, message, taskTitle, taskId }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Compute visible date range based on view
  const getVisibleRange = useCallback((date: Date, view: View) => {
    let start: Date, end: Date;
    if (view === 'month') {
      start = startOfMonth(date);
      end = endOfMonth(date);
      // Extend to full weeks
      start = subDays(start, start.getDay());
      end = addDays(end, 6 - end.getDay());
      // Ensure end is end of day to capture all events on the last day
      end = endOfDay(end);
    } else if (view === 'week') {
      start = startOfWeek(date);
      // End of the 7th day (Saturday end) to capture all events in the week
      end = endOfDay(addDays(start, 6));
    } else {
      start = startOfDay(date);
      end = endOfDay(date);
    }
    return { start, end };
  }, []);

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const meJson = (await apiFetchJson('/auth/me')) as Me;
        setMe(meJson);
      } catch (e) {
        if (isUnauthorized(e)) setMe(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Fetch scheduled events for visible range
  const fetchEvents = useCallback(async () => {
    if (!me) return;
    const { start, end } = getVisibleRange(currentDate, currentView);
    try {
      const data = await apiFetchJson(
        `/todos?scheduledAfter=${start.toISOString()}&scheduledBefore=${end.toISOString()}`
      );
      if (Array.isArray(data)) {
        const mapped: CalendarEvent[] = data
          .filter((t: Todo) => t.startAt)
          .map((t: Todo) => ({
            id: t.id,
            title: t.title,
            start: new Date(t.startAt!),
            end: new Date(new Date(t.startAt!).getTime() + (t.durationMin || 30) * 60000),
            resource: t,
          }));
        setEvents(mapped);
      }
    } catch (e) {
      if (isUnauthorized(e)) setMe(null);
    }
  }, [me, currentDate, currentView, getVisibleRange]);

  // Fetch unscheduled tasks
  const fetchUnscheduled = useCallback(async () => {
    if (!me) return;
    try {
      let data;
      if (unscheduledFilter === 'recent') {
        // Fetch recently unscheduled (last 5)
        data = await apiFetchJson('/todos/recently-unscheduled?limit=5');
      } else {
        // Fetch all unscheduled
        data = await apiFetchJson('/todos?scheduled=false&limit=50');
      }
      if (Array.isArray(data)) {
        setUnscheduledTodos(data.filter((t: Todo) => !t.startAt));
      }
    } catch (e) {
      if (isUnauthorized(e)) setMe(null);
    }
  }, [me, unscheduledFilter]);

  useEffect(() => {
    if (me) {
      fetchEvents();
      fetchUnscheduled();
    }
  }, [me, fetchEvents, fetchUnscheduled]);

  // Listen for todo updates from other pages (Task List, Task Detail)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'todoUpdate' && me) {
        // Refresh both events and unscheduled when any todo update happens elsewhere
        fetchEvents();
        fetchUnscheduled();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [me, fetchEvents, fetchUnscheduled]);

  // Event duration lookup
  const getEventDuration = useCallback((taskId: string): number => {
    const event = events.find((e) => e.id === taskId);
    return event?.resource.durationMin || 30;
  }, [events]);

  // Compute drop time from pointer position
  // Returns null if pointer is outside the valid calendar drop area (cancels drop)
  const getDropTime = useCallback((x: number, y: number): Date | null => {
    if (!calendarRef.current) return null;

    // Get calendar container bounds for early rejection
    const calendarRect = calendarRef.current.getBoundingClientRect();

    // Early bounds check: if pointer is completely outside the calendar container, return null
    if (x < calendarRect.left || x > calendarRect.right ||
        y < calendarRect.top || y > calendarRect.bottom) {
      return null;
    }

    // Find time slots in calendar
    const timeSlots = calendarRef.current.querySelectorAll('.rbc-time-slot');
    const dayHeaders = calendarRef.current.querySelectorAll('.rbc-header');

    if (currentView === 'month') {
      // For month view, find the day cell - pointer must be inside a specific cell
      const dayCells = calendarRef.current.querySelectorAll('.rbc-day-bg');
      for (const cell of dayCells) {
        const rect = cell.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          // Find the date from the row/column
          const row = cell.closest('.rbc-month-row');
          const rows = calendarRef.current.querySelectorAll('.rbc-month-row');
          const rowIndex = Array.from(rows).indexOf(row as Element);
          const cellIndex = Array.from(row?.querySelectorAll('.rbc-day-bg') || []).indexOf(cell);

          if (rowIndex >= 0 && cellIndex >= 0) {
            const { start } = getVisibleRange(currentDate, 'month');
            const date = addDays(start, rowIndex * 7 + cellIndex);
            date.setHours(9, 0, 0, 0); // Default to 9 AM
            return date;
          }
        }
      }
      // Pointer is outside all month cells - cancel drop
      return null;
    }

    // Week/day view - find the time slot
    if (timeSlots.length === 0) return null;

    // Get the time content container (scrollable area)
    const timeContent = calendarRef.current.querySelector('.rbc-time-content') as HTMLElement | null;
    if (!timeContent) return null;

    const contentRect = timeContent.getBoundingClientRect();
    const scrollHeight = timeContent.scrollHeight;

    // BOUNDS CHECK: Return null if pointer is outside the calendar time content area
    // This ensures dropping outside the calendar cancels the drag (no state change)
    if (y < contentRect.top || y > contentRect.bottom) {
      return null;
    }

    // Find which column (day) the pointer is over
    const dayColumns = timeContent.querySelectorAll('.rbc-day-slot');
    let dayIndex = -1; // -1 means not found (outside all columns)

    if (dayColumns.length > 0) {
      for (let i = 0; i < dayColumns.length; i++) {
        const colRect = dayColumns[i].getBoundingClientRect();
        if (x >= colRect.left && x <= colRect.right) {
          dayIndex = i;
          break;
        }
      }
    } else {
      // Fallback to headers if day columns not found
      const headers = Array.from(dayHeaders);
      for (let i = 0; i < headers.length; i++) {
        const rect = headers[i].getBoundingClientRect();
        if (x >= rect.left && x <= rect.right) {
          dayIndex = i;
          break;
        }
      }
    }

    // BOUNDS CHECK: Return null if pointer X is outside all day columns
    // This ensures dropping outside the calendar cancels the drag
    if (dayIndex < 0) {
      return null;
    }

    // Calculate Y position accounting for scroll
    const scrollTop = timeContent.scrollTop;
    const relativeY = (y - contentRect.top) + scrollTop;

    // Clamp Y to valid range [0, scrollHeight] for time calculation
    const clampedY = Math.max(0, Math.min(scrollHeight, relativeY));

    // Calculate time from position
    // scrollHeight represents the full 24-hour range
    const slotHeight = scrollHeight / 24; // pixels per hour
    const hour = Math.floor(clampedY / slotHeight);
    const minuteFraction = (clampedY % slotHeight) / slotHeight;
    const minutes = Math.round(minuteFraction * 60 / 15) * 15; // Snap to 15 min

    const { start } = getVisibleRange(currentDate, currentView);
    const dropDate = currentView === 'day' ? new Date(currentDate) : addDays(start, dayIndex);

    // Clamp hours and minutes to valid range
    const clampedHour = Math.max(0, Math.min(23, hour));
    const clampedMinutes = Math.min(45, Math.max(0, minutes)); // Max 45 to allow 15-min increments
    dropDate.setHours(clampedHour, clampedMinutes, 0, 0);

    return dropDate;
  }, [currentDate, currentView, getVisibleRange]);

  // Schedule task
  const handleSchedule = useCallback(async (taskId: string, startAt: Date, durationMin: number) => {
    // Find task title for notification
    const task = unscheduledTodos.find(t => t.id === taskId);
    const taskTitle = task?.title || 'Task';

    try {
      await apiFetchJson(`/todos/${taskId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ startAt: startAt.toISOString(), durationMin }),
      });
      await fetchEvents();
      await fetchUnscheduled();
      addNotification('success', 'Task scheduled', 'The task has been scheduled successfully.', taskTitle, taskId);
    } catch (e: any) {
      addNotification('error', 'Schedule failed', e?.message || 'Failed to schedule', taskTitle, taskId);
    }
  }, [fetchEvents, fetchUnscheduled, unscheduledTodos, addNotification]);

  // Unschedule task
  const handleUnschedule = useCallback(async (taskId: string) => {
    // Find task title for notification
    const event = events.find(e => e.id === taskId);
    const taskTitle = event?.title || 'Task';

    try {
      await apiFetchJson(`/todos/${taskId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ startAt: null }),
      });
      await fetchEvents();
      await fetchUnscheduled();
      addNotification('success', 'Task unscheduled', 'The schedule has been removed from the task.', taskTitle, taskId);
    } catch (e: any) {
      addNotification('error', 'Unschedule failed', e?.message || 'Failed to unschedule', taskTitle, taskId);
    }
  }, [fetchEvents, fetchUnscheduled, events, addNotification]);

  // Reschedule task
  const handleReschedule = useCallback(async (taskId: string, startAt: Date, durationMin: number) => {
    // Find task title for notification
    const event = events.find(e => e.id === taskId);
    const taskTitle = event?.title || 'Task';

    try {
      await apiFetchJson(`/todos/${taskId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ startAt: startAt.toISOString(), durationMin }),
      });
      await fetchEvents();
      addNotification('success', 'Task rescheduled', 'The task schedule has been updated.', taskTitle, taskId);
    } catch (e: any) {
      addNotification('error', 'Reschedule failed', e?.message || 'Failed to reschedule', taskTitle, taskId);
    }
  }, [fetchEvents, events, addNotification]);

  // Click-to-schedule/edit from modal
  const handleModalSchedule = useCallback(async (startAt: string, durationMin: number, description?: string): Promise<{ success: boolean; conflictError?: boolean }> => {
    if (!scheduleModalTask) return { success: false };
    const wasScheduled = !!scheduleModalTask.startAt;
    try {
      // If description is provided, update task description first
      if (description !== undefined) {
        await apiFetchJson(`/todos/${scheduleModalTask.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ description: description || null }),
        });
      }

      // Then schedule
      await apiFetchJson(`/todos/${scheduleModalTask.id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ startAt, durationMin }),
      });
      await fetchEvents();
      await fetchUnscheduled();
      const title = wasScheduled ? 'Task rescheduled' : 'Task scheduled';
      const message = wasScheduled ? 'The task schedule has been updated.' : 'The task has been scheduled successfully.';
      addNotification('success', title, message, scheduleModalTask.title, scheduleModalTask.id);
      return { success: true };
    } catch (e: any) {
      if (e?.status === 409) {
        return { success: false, conflictError: true };
      }
      addNotification('error', 'Schedule failed', e?.message || 'Failed to save', scheduleModalTask.title, scheduleModalTask.id);
      return { success: false };
    }
  }, [scheduleModalTask, fetchEvents, fetchUnscheduled, addNotification]);

  // Open schedule modal for a task (unscheduled or from calendar event)
  const openScheduleModal = useCallback((todo: Todo) => {
    setScheduleModalTask(todo);
    setScheduleModalOpen(true);
  }, []);

  // Handler for clicking a scheduled calendar event
  const handleEventClick = useCallback((event: CalendarEvent) => {
    // Open the schedule modal with the event's task data
    openScheduleModal(event.resource);
  }, [openScheduleModal]);

  // Resize handlers - bottom resizes end time, top resizes start time
  // Bottom resize: start fixed, end moves, duration changes
  const handleResizeStart = useCallback((event: CalendarEvent, e: React.PointerEvent) => {
    setResizingEvent(event);
    setResizeStartY(e.clientY);
    setResizeStartDuration(event.resource.durationMin || 30);
    setResizeDirection('bottom');
    setResizeOriginalStart(event.start);
  }, []);

  // Top resize: end fixed, start moves, duration changes
  const handleResizeTopStart = useCallback((event: CalendarEvent, e: React.PointerEvent) => {
    setResizingEvent(event);
    setResizeStartY(e.clientY);
    setResizeStartDuration(event.resource.durationMin || 30);
    setResizeDirection('top');
    setResizeOriginalStart(event.start);
  }, []);

  // Resize move and end handlers (attached to document when resizing)
  useEffect(() => {
    if (!resizingEvent || !calendarRef.current || !resizeOriginalStart) return;

    const timeContent = calendarRef.current.querySelector('.rbc-time-content') as HTMLElement | null;
    if (!timeContent) return;

    const scrollHeight = timeContent.scrollHeight;
    const pixelsPerMinute = scrollHeight / (24 * 60);
    // Duration limits from runtime settings
    const minDuration = minDurationMin;
    const maxDuration = maxDurationMin;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaY = e.clientY - resizeStartY;

      // Snap to 15-min grid first
      const rawDeltaMinutes = Math.round(deltaY / pixelsPerMinute / 15) * 15;

      // Clamp delta so the moving edge can NEVER cross the fixed edge
      // Bottom resize: newDuration = resizeStartDuration + delta
      // Enforce: minDuration <= newDuration <= maxDuration
      // => (minDuration - resizeStartDuration) <= delta <= (maxDuration - resizeStartDuration)
      const bottomMinDelta = minDuration - resizeStartDuration;
      const bottomMaxDelta = maxDuration - resizeStartDuration;

      // Top resize: newDuration = resizeStartDuration - delta
      // Enforce: minDuration <= newDuration <= maxDuration
      // => (resizeStartDuration - maxDuration) <= delta <= (resizeStartDuration - minDuration)
      const topMinDelta = resizeStartDuration - maxDuration;
      const topMaxDelta = resizeStartDuration - minDuration;

      // Apply correct clamp based on direction
      const clampedDeltaMinutes =
        resizeDirection === 'bottom'
          ? Math.max(bottomMinDelta, Math.min(bottomMaxDelta, rawDeltaMinutes))
          : Math.max(topMinDelta, Math.min(topMaxDelta, rawDeltaMinutes));

      if (resizeDirection === 'bottom') {
        // Bottom resize: start fixed, end moves
        const newDuration = resizeStartDuration + clampedDeltaMinutes;

        setEvents((prev) =>
          prev.map((ev) => {
            if (ev.id === resizingEvent.id) {
              const newEnd = new Date(resizeOriginalStart.getTime() + newDuration * 60000);
              return {
                ...ev,
                start: resizeOriginalStart,
                end: newEnd,
                resource: { ...ev.resource, durationMin: newDuration },
              };
            }
            return ev;
          })
        );
      } else {
        // Top resize: end fixed, start moves
        const newDuration = resizeStartDuration - clampedDeltaMinutes;
        const originalEnd = new Date(resizeOriginalStart.getTime() + resizeStartDuration * 60000);
        const newStart = new Date(originalEnd.getTime() - newDuration * 60000);

        setEvents((prev) =>
          prev.map((ev) => {
            if (ev.id === resizingEvent.id) {
              return {
                ...ev,
                start: newStart,
                end: originalEnd,
                resource: { ...ev.resource, durationMin: newDuration, startAt: newStart.toISOString() },
              };
            }
            return ev;
          })
        );
      }

    };

    const handlePointerUp = async () => {
      if (!resizingEvent) return;

      // Get the current state from the updated event
      const updatedEvent = events.find(e => e.id === resizingEvent.id);
      const newDuration = updatedEvent?.resource.durationMin || resizeStartDuration;
      const newStart = updatedEvent?.start || resizeOriginalStart;

      // Check if anything changed
      const durationChanged = newDuration !== resizeStartDuration;
      const startChanged = newStart.getTime() !== resizeOriginalStart.getTime();

      if (durationChanged || startChanged) {
        const taskTitle = resizingEvent.title;
        const taskId = resizingEvent.id;
        try {
          await apiFetchJson(`/todos/${resizingEvent.id}/schedule`, {
            method: 'PATCH',
            body: JSON.stringify({
              startAt: newStart.toISOString(),
              durationMin: newDuration
            }),
          });
          await fetchEvents();
          const title = resizeDirection === 'top' ? 'Start time updated' : 'Duration updated';
          const message = resizeDirection === 'top'
            ? 'The task start time has been updated.'
            : 'The task duration has been updated.';
          addNotification('success', title, message, taskTitle, taskId);
        } catch (e: any) {
          // Revert on error
          await fetchEvents();
          if (e?.status === 409) {
            addNotification('error', 'Resize failed', 'Time slot conflicts with another event', taskTitle, taskId);
          } else {
            addNotification('error', 'Resize failed', e?.message || 'Failed to resize', taskTitle, taskId);
          }
        }
      }

      setResizingEvent(null);
      setResizeOriginalStart(null);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizingEvent, resizeStartY, resizeStartDuration, resizeDirection, resizeOriginalStart, events, fetchEvents, addNotification]);

  // Close schedule modal
  const closeScheduleModal = useCallback(() => {
    setScheduleModalOpen(false);
    setScheduleModalTask(null);
  }, []);

  // Handle slot selection (clicking empty timeslot)
  const handleSelectSlot = useCallback((slotInfo: { start: Date; end: Date; action: string }) => {
    // Only open modal for click actions, not select (drag) actions
    // This prevents interference with the drag-and-drop system
    if (slotInfo.action === 'click' || slotInfo.action === 'doubleClick') {
      setCreateTaskModalStartAt(slotInfo.start);
      setCreateTaskModalOpen(true);
    }
  }, []);

  // Create task and schedule it for a given start time
  const createAndScheduleTask = useCallback(async (
    title: string,
    category: string | null,
    startAt: string,
    durationMin: number,
    description?: string
  ): Promise<{ success: boolean; conflictError?: boolean; error?: string }> => {
    try {
      const newTodo = await apiFetchJson('/todos', {
        method: 'POST',
        body: JSON.stringify({
          title,
          category: category || undefined,
          durationMin,
          description: description || undefined,
        }),
      }) as Todo;

      await apiFetchJson(`/todos/${newTodo.id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ startAt, durationMin }),
      });

      await fetchEvents();
      await fetchUnscheduled();
      addNotification('success', 'Task created and scheduled', 'The task has been created and scheduled successfully.', title, newTodo.id);
      return { success: true };
    } catch (e: any) {
      if (e?.status === 409) {
        return { success: false, conflictError: true };
      }
      addNotification('error', 'Create failed', e?.message || 'Failed to create task', title);
      return { success: false, error: e?.message || 'Failed to create task' };
    }
  }, [fetchEvents, fetchUnscheduled, addNotification]);

  // Handler wired to CreateTaskModal (uses the stored slot start time)
  const handleCreateTask = useCallback(async (
    title: string,
    category?: string | null,
    durationMin?: number,
    description?: string
  ): Promise<boolean> => {
    if (!createTaskModalStartAt) {
      addNotification('error', 'Create failed', 'Unable to determine the selected start time.');
      return false;
    }
    if (durationMin === undefined) {
      addNotification('error', 'Create failed', 'Duration is missing.');
      return false;
    }

    const result = await createAndScheduleTask(
      title,
      category ?? null,
      createTaskModalStartAt.toISOString(),
      durationMin,
      description
    );
    return result.success;
  }, [createTaskModalStartAt, addNotification, createAndScheduleTask]);

  // Close create task modal
  const closeCreateTaskModal = useCallback(() => {
    setCreateTaskModalOpen(false);
    setCreateTaskModalStartAt(null);
  }, []);

  // Logout
  const logout = async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } finally {
      setMe(null);
      window.location.href = '/';
    }
  };

  // Change password
  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    setAuthError(null);
    try {
      await apiFetchJson('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return true;
    } catch (e: any) {
      setAuthError(e?.message || 'Failed to change password');
      return false;
    }
  };

  // Memoize calendar components to prevent re-creating wrapper functions on every render
  // This ensures DraggableEvent's memo() optimization is effective
  const calendarComponents = useMemo(() => ({
    event: (props: { event: CalendarEvent }) => (
      <DraggableEvent
        event={props.event}
        onEventClick={handleEventClick}
        onResizeStart={handleResizeStart}
        onResizeTopStart={handleResizeTopStart}
      />
    ),
    month: {
      event: (props: { event?: CalendarEvent }) => (
        <div
          style={{
            height: '100%',
            width: '100%',
            fontWeight: 500,
            padding: '2px 4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {props.event?.title}
        </div>
      ),
    },
  }), [handleEventClick, handleResizeStart, handleResizeTopStart]);

  if (loading) return null;

  if (!me) {
    if (typeof window !== 'undefined') window.location.href = '/';
    return null;
  }

  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={me.email}
        onChangePassword={changePassword}
        error={authError}
      />
    );
  }

  return (
    <Layout currentPage="calendar" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      <DragProvider
        onSchedule={handleSchedule}
        onUnschedule={handleUnschedule}
        onReschedule={handleReschedule}
        getDropTime={getDropTime}
        getEventDuration={getEventDuration}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#1e293b' }}>Calendar</h1>
          <p style={{ color: '#64748b', margin: '8px 0 0' }}>
            Drag tasks to schedule them
          </p>
        </div>

        {/* Calendar + Panel Container */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Calendar Container */}
          <div
            ref={calendarRef}
            style={{
              flex: 1,
              background: 'white',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              padding: 20,
              minHeight: 600,
              position: 'relative',
            }}
          >
            {/*
              Scoped CSS: Disable pointer-events on RBC event labels/content
              so our overlay hit-zones always receive click/drag/resize events.
              This ensures short events (5-15 min) remain fully interactive.
            */}
            

            {/* Drop Time Indicator */}
            <DropTimeIndicator calendarRef={calendarRef} getDropTime={getDropTime} getEventDuration={getEventDuration} />

            {/* Calendar Grid Drop Zone */}
            <DroppableZone
              id="calendar-grid"
              style={{ height: '100%' }}
            >
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: 'calc(100vh - 300px)', minHeight: 500 }}
                views={['month', 'week', 'day']}
                view={currentView}
                onView={(v) => setCurrentView(v)}
                date={currentDate}
                onNavigate={(d) => setCurrentDate(d)}
                eventPropGetter={(event) => ({
                  style: {
                    backgroundColor: getCategoryColor(event.resource.category),
                    border: 'none',
                    borderRadius: 4,
                  },
                })}
                components={calendarComponents}

                selectable={!activeItem}
                onSelectSlot={handleSelectSlot}
                showMultiDayTimes
                popup
              />
            </DroppableZone>
          </div>

          {/* Unscheduled Panel */}
          <div
            style={{
              width: isPanelOpen ? 280 : 40,
              background: 'white',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              transition: 'width 0.2s ease',
              overflow: 'hidden',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {/* Unschedule Zone Overlay */}
            <UnscheduleZone />
            <div
              style={{
                padding: 16,
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {isPanelOpen && (
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  Unscheduled ({unscheduledTodos.length})
                </h3>
              )}
              <button
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  fontSize: 16,
                }}
              >
                {isPanelOpen ? '→' : '←'}
              </button>
            </div>

            {isPanelOpen && (
              <div style={{ padding: 16, maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                {/* Filter toggle */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <button
                    onClick={() => setUnscheduledFilter('all')}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: unscheduledFilter === 'all' ? 'none' : '1px solid #e2e8f0',
                      background: unscheduledFilter === 'all' ? '#3b82f6' : 'white',
                      color: unscheduledFilter === 'all' ? 'white' : '#64748b',
                      cursor: 'pointer',
                      fontWeight: unscheduledFilter === 'all' ? 500 : 400,
                    }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setUnscheduledFilter('recent')}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: unscheduledFilter === 'recent' ? 'none' : '1px solid #e2e8f0',
                      background: unscheduledFilter === 'recent' ? '#3b82f6' : 'white',
                      color: unscheduledFilter === 'recent' ? 'white' : '#64748b',
                      cursor: 'pointer',
                      fontWeight: unscheduledFilter === 'recent' ? 500 : 400,
                    }}
                  >
                    Recent
                  </button>
                </div>

                {/* Helper text */}
                <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
                  Drag to schedule or click to schedule
                </p>

                {unscheduledTodos.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                    No unscheduled tasks
                  </p>
                ) : (
                  unscheduledTodos.map((todo) => (
                    <UnscheduledTaskItem
                      key={todo.id}
                      todo={todo}
                      color={getCategoryColor(todo.category)}
                      onClick={() => openScheduleModal(todo)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Schedule Modal */}
        <ScheduleModal
          isOpen={scheduleModalOpen}
          currentStartAt={scheduleModalTask?.startAt || null}
          currentDurationMin={scheduleModalTask?.durationMin || 30}
          currentDescription={scheduleModalTask?.description || null}
          taskId={scheduleModalTask?.id || null}
          events={events}
          workingHours={settings.workingHours}
          workingDays={settings.workingDays}
          onSave={handleModalSchedule}
          onClose={closeScheduleModal}
        />

        {/* Create Task Modal (for clicking empty timeslot) */}
        <CreateTaskModal
          isOpen={createTaskModalOpen}
          onClose={closeCreateTaskModal}
          onCreate={handleCreateTask}
          userId={me?.userId ?? null}
        />

        {/* Notification Toast */}
        <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
      </DragProvider>
    </Layout>
  );
}
