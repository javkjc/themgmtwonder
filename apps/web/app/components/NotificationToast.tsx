'use client';

import { useEffect } from 'react';

export type Notification = {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  taskTitle?: string;
  taskId?: string;
};

type NotificationToastProps = {
  notifications: Notification[];
  onDismiss: (id: string) => void;
};

export default function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  // Auto-dismiss: success after 4s, error after 8s, info after 6s
  useEffect(() => {
    if (notifications.length === 0) return;

    const timers = notifications.map((notification) => {
      const duration = notification.type === 'success' ? 4000 : notification.type === 'error' ? 8000 : 6000;
      return setTimeout(() => {
        onDismiss(notification.id);
      }, duration);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [notifications, onDismiss]);

  // Limit to 4 most recent toasts
  const visibleNotifications = notifications.slice(-4);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 400,
      }}
    >
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          style={{
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: 16,
            border: `2px solid ${
              notification.type === 'success'
                ? '#10b981'
                : notification.type === 'error'
                ? '#ef4444'
                : '#3b82f6'
            }`,
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>
                {notification.type === 'success' ? '✓' : notification.type === 'error' ? '✕' : 'ℹ'}
              </span>
              <h4
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  color: notification.type === 'success' ? '#10b981' : notification.type === 'error' ? '#ef4444' : '#3b82f6',
                }}
              >
                {notification.title}
              </h4>
            </div>
            <button
              onClick={() => onDismiss(notification.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                color: '#9ca3af',
                padding: 0,
                lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>

          {notification.taskTitle && (
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 4, fontWeight: 500 }}>
              Task: {notification.taskTitle}
            </div>
          )}

          {notification.message && (
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {notification.message}
            </div>
          )}

          {notification.taskId && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              ID: {notification.taskId.slice(0, 8)}
            </div>
          )}
        </div>
      ))}

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
