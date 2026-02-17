export type AuditActionInfo = {
  label: string;
  color: string;
  icon: string;
};

const ACTION_LABELS: Record<string, AuditActionInfo> = {
  'auth.login': { label: 'Signed in', color: '#10b981', icon: '+' },
  'auth.logout': { label: 'Signed out', color: '#737373', icon: '-' },
  'auth.register': { label: 'Account created', color: '#F43F5E', icon: '*' },
  'auth.password_change': { label: 'Password changed', color: '#f97316', icon: '!' },
  'auth.password_reset': { label: 'Password reset', color: '#f97316', icon: '!' },
  'admin.toggle_admin': { label: 'Admin toggled', color: '#F43F5E', icon: '~' },
  'admin.reset_password': { label: 'Admin password reset', color: '#f97316', icon: '!' },
  'user.role.grant': { label: 'Role granted', color: '#22c55e', icon: '+' },
  'user.role.revoke': { label: 'Role revoked', color: '#ef4444', icon: '-' },
  'todo.create': { label: 'Created', color: '#10b981', icon: '+' },
  'todo.update': { label: 'Updated', color: '#F43F5E', icon: '~' },
  'todo.stage_change': { label: 'Stage changed', color: '#F43F5E', icon: '~' },
  'todo.delete': { label: 'Deleted', color: '#dc2626', icon: '-' },
  'todo.delete_child': { label: 'Child task deleted (detached)', color: '#dc2626', icon: '-' },
  'todo.associate': { label: 'Parent set', color: '#F43F5E', icon: '>' },
  'todo.disassociate': { label: 'Parent removed', color: '#f97316', icon: '<' },
  'todo.schedule': { label: 'Scheduled', color: '#F43F5E', icon: '>' },
  'todo.unschedule': { label: 'Unschedule', color: '#f97316', icon: '!' },
  'todo.bulk_update': { label: 'Bulk updated', color: '#F43F5E', icon: '~' },
  'todo.bulk_delete': { label: 'Bulk deleted', color: '#dc2626', icon: '-' },
  'category.create': { label: 'Category created', color: '#14b8a6', icon: '+' },
  'category.update': { label: 'Category updated', color: '#F43F5E', icon: '~' },
  'category.delete': { label: 'Category deleted', color: '#ef4444', icon: '-' },
  'settings.update': { label: 'Settings updated', color: '#E11D48', icon: '~' },
  'settings.duration.update': { label: 'Duration updated', color: '#E11D48', icon: '>' },
  'remark.create': { label: 'Remark added', color: '#10b981', icon: '+' },
  'remark.delete': { label: 'Remark deleted', color: '#dc2626', icon: '-' },
  'attachment.upload': { label: 'Attachment uploaded', color: '#F43F5E', icon: '+' },
  'attachment.delete': { label: 'Attachment deleted', color: '#dc2626', icon: '-' },
  OCR_REQUESTED: { label: 'Extraction requested', color: '#f97316', icon: '>' },
  OCR_SUCCEEDED: { label: 'Extraction succeeded', color: '#22c55e', icon: '+' },
  OCR_FAILED: { label: 'Extraction failed', color: '#dc2626', icon: '!' },
  'ocr.apply.remark': { label: 'Extracted text added to remark', color: '#14b8a6', icon: '+' },
  'ocr.apply.description': { label: 'Extracted text appended to description', color: '#14b8a6', icon: '+' },
};

const DEFAULT_ACTION_INFO: AuditActionInfo = {
  label: 'Activity logged',
  color: '#737373',
  icon: '?',
};

const capitalizeSegment = (segment: string) => {
  const normalized = segment.trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  if (lower === 'ocr') return 'Extraction';
  if (lower === 'id') return 'ID';
  return normalized[0].toUpperCase() + normalized.slice(1).toLowerCase();
};

const humanizeAuditAction = (action: string) =>
  action
    .split(/[._\/-]/)
    .map(capitalizeSegment)
    .filter(Boolean)
    .join(' ');

export const getAuditActionInfo = (action: string): AuditActionInfo => {
  if (!action) return DEFAULT_ACTION_INFO;
  const normalized = action.trim();
  if (normalized in ACTION_LABELS) {
    return ACTION_LABELS[normalized];
  }
  return {
    ...DEFAULT_ACTION_INFO,
    label: humanizeAuditAction(normalized) || DEFAULT_ACTION_INFO.label,
  };
};
