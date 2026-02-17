import type { Notification } from '@/app/components/NotificationToast';

export const notify = (
  type: Notification['type'],
  title: string,
  message?: string,
): Notification => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  title,
  message,
});

export const notifySuccess = (title: string, message?: string) =>
  notify('success', title, message);

export const notifyError = (title: string, message?: string) =>
  notify('error', title, message);

export const notifyInfo = (title: string, message?: string) =>
  notify('info', title, message);
