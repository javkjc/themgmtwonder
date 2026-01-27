'use client';

import { useMemo } from 'react';

export type CalendarEvent = {
  start: Date;
  end: Date;
  [key: string]: any;
};

export type TimeSlot = {
  start: Date;
  end: Date;
  label: string;
};

export type WorkingHours = {
  start: string; // "09:00"
  end: string;   // "17:00"
};

export type AvailabilityOptions = {
  events: CalendarEvent[];
  date: Date;
  durationMin: number;
  workingHours?: WorkingHours;
  workingDays?: number[];
  maxSuggestions?: number;
};

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function formatTimeSlot(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Find available time slots for a single day starting from the given time context.
 */
function findSlotsForDay(
  dayDate: Date,
  events: CalendarEvent[],
  durationMin: number,
  workingHours: WorkingHours,
  maxSlots: number,
  skipPast: boolean,
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  const { hours: startHours, minutes: startMinutes } = parseTime(workingHours.start);
  const { hours: endHours, minutes: endMinutes } = parseTime(workingHours.end);

  const workStart = new Date(dayDate);
  workStart.setHours(startHours, startMinutes, 0, 0);

  const workEnd = new Date(dayDate);
  workEnd.setHours(endHours, endMinutes, 0, 0);

  // Get events for this day
  const dayStart = new Date(dayDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayDate);
  dayEnd.setHours(23, 59, 59, 999);

  const dayEvents = events
    .filter((e) => {
      const eventStart = new Date(e.start);
      return eventStart >= dayStart && eventStart <= dayEnd;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  let currentSlotStart = new Date(workStart);

  // If skipPast is true and this is today, start from next 30-min interval after now
  if (skipPast) {
    const now = new Date();
    if (dayDate.toDateString() === now.toDateString()) {
      currentSlotStart = new Date(now);
      currentSlotStart.setSeconds(0, 0);
      const minutes = currentSlotStart.getMinutes();
      const roundedMinutes = Math.ceil(minutes / 30) * 30;
      if (roundedMinutes >= 60) {
        currentSlotStart.setHours(currentSlotStart.getHours() + 1);
        currentSlotStart.setMinutes(0);
      } else {
        currentSlotStart.setMinutes(roundedMinutes);
      }
      if (currentSlotStart < workStart) {
        currentSlotStart = new Date(workStart);
      }
    }
  }

  while (currentSlotStart < workEnd && slots.length < maxSlots) {
    const slotEnd = new Date(currentSlotStart.getTime() + durationMin * 60000);
    if (slotEnd > workEnd) break;

    const hasConflict = dayEvents.some((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      return currentSlotStart < eventEnd && slotEnd > eventStart;
    });

    if (!hasConflict) {
      slots.push({
        start: new Date(currentSlotStart),
        end: slotEnd,
        label: `${formatTimeSlot(currentSlotStart)} - ${formatTimeSlot(slotEnd)}`,
      });
    }

    currentSlotStart = new Date(currentSlotStart.getTime() + 30 * 60000);
  }

  return slots;
}

/**
 * Find available time slots on a given date that don't conflict with existing events.
 * If no slots are available on the target date (past working hours or non-working day),
 * searches up to 7 days ahead for the next working day with availability.
 */
export function findAvailableSlots(options: AvailabilityOptions): TimeSlot[] {
  const {
    events,
    date,
    durationMin,
    workingHours = { start: '09:00', end: '17:00' },
    workingDays = [1, 2, 3, 4, 5],
    maxSuggestions = 5,
  } = options;

  // Try the target date first, then fall forward up to 7 days
  for (let offset = 0; offset < 7; offset++) {
    const candidateDate = new Date(date);
    candidateDate.setDate(candidateDate.getDate() + offset);
    candidateDate.setHours(0, 0, 0, 0);

    const dayOfWeek = candidateDate.getDay();
    if (!workingDays.includes(dayOfWeek)) {
      continue;
    }

    const slots = findSlotsForDay(
      candidateDate,
      events,
      durationMin,
      workingHours,
      maxSuggestions,
      offset === 0, // only skip past times for the original target date
    );

    if (slots.length > 0) {
      return slots;
    }
  }

  return [];
}

/**
 * Hook to get available time slots
 */
export function useAvailability(options: AvailabilityOptions | null): TimeSlot[] {
  return useMemo(() => {
    if (!options) return [];
    return findAvailableSlots(options);
  }, [
    options?.events,
    options?.date?.toISOString(),
    options?.durationMin,
    options?.workingHours?.start,
    options?.workingHours?.end,
    options?.workingDays?.join(','),
    options?.maxSuggestions,
  ]);
}
