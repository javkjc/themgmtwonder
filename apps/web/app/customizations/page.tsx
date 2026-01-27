'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../lib/api';
import type { Me } from '../types';
import Layout from '../components/Layout';
import ForcePasswordChange from '../components/ForcePasswordChange';
import NotificationToast, { type Notification } from '../components/NotificationToast';
import { getDurationSettings, updateDurationSettings } from '../lib/durationSettings';

type Category = {
  id: string;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
};

export default function CustomizationsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Edit/Add modal state
  const [editModal, setEditModal] = useState<{ category?: Category; isNew: boolean } | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalColor, setModalColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

 // Working hours settings
  const [workingHoursStart, setWorkingHoursStart] = useState<string | null>(null);
  const [workingHoursEnd, setWorkingHoursEnd] = useState<string | null>(null);
  const [workingDays, setWorkingDays] = useState<number[] | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Duration settings
  const [minDuration, setMinDuration] = useState('5');
  const [maxDuration, setMaxDuration] = useState('1440');
  const [defaultDuration, setDefaultDuration] = useState('30');
  const [durationLoading, setDurationLoading] = useState(true);
  const [savingDuration, setSavingDuration] = useState(false);

  const DEFAULT_START = '09:00';
  const DEFAULT_END = '17:00';
  const DEFAULT_DAYS = [1, 2, 3, 4, 5];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const addNotification = useCallback((
    type: 'success' | 'error' | 'info',
    title: string,
    message?: string
  ) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, title, message }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);


  // Predefined colors for quick selection
  const colorOptions = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899',
    '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6b7280',
  ];

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const meJson = (await apiFetchJson('/auth/me')) as Me;
        setMe(meJson);
      } catch (e: any) {
        if (isUnauthorized(e)) {
          setMe(null);
        }
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Load categories and settings when auth is confirmed
  useEffect(() => {
    if (me) {
      loadCategories();
      loadSettings();
      loadDurationSettings();
    }
  }, [me]);

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const data = await apiFetchJson('/settings') as {
        workingHours?: { start: string; end: string };
        workingDays?: number[];
      };

      setWorkingHoursStart(data?.workingHours?.start ?? DEFAULT_START);
      setWorkingHoursEnd(data?.workingHours?.end ?? DEFAULT_END);
      setWorkingDays(
        Array.isArray(data?.workingDays) ? data.workingDays : DEFAULT_DAYS
      );
    } catch (e: any) {
      if (isForbidden(e)) {
        addNotification('error', 'Access denied', 'Admin privileges required');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      console.error('Failed to load settings:', e);

      // fallback ONLY if fetch fails
      setWorkingHoursStart(DEFAULT_START);
      setWorkingHoursEnd(DEFAULT_END);
      setWorkingDays(DEFAULT_DAYS);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await apiFetchJson('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          workingHours: {
            start: workingHoursStart ?? DEFAULT_START,
            end: workingHoursEnd ?? DEFAULT_END,
          },
          workingDays: workingDays ?? DEFAULT_DAYS,
        }),
      });
      addNotification('success', 'Working hours saved', 'Your working hours have been updated successfully.');
    } catch (e: any) {
      if (isForbidden(e)) {
        addNotification('error', 'Access denied', 'Admin privileges required');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      addNotification('error', 'Failed to save settings', e?.message || 'Could not save working hours.');
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleWorkingDay = (day: number) => {
    if (settingsLoading || !workingDays) return;

    setWorkingDays(prev => {
      const days = prev ?? [];
      return days.includes(day)
        ? days.filter(d => d !== day)
        : [...days, day].sort((a, b) => a - b);
    });
  };

  const loadDurationSettings = async () => {
    setDurationLoading(true);
    try {
      const settings = await getDurationSettings();
      setMinDuration(String(settings.minDurationMin));
      setMaxDuration(String(settings.maxDurationMin));
      setDefaultDuration(String(settings.defaultDurationMin));
    } catch (err) {
      console.error('Failed to load duration settings:', err);
      addNotification('error', 'Failed to load duration settings', 'Could not load duration settings from the server.');
    } finally {
      setDurationLoading(false);
    }
  };

  const handleSaveDuration = async () => {
    // Parse strings
    const minVal = parseInt(minDuration, 10);
    const maxVal = parseInt(maxDuration, 10);
    const defaultVal = parseInt(defaultDuration, 10);

    // Validate guards
    if (defaultVal < minVal) {
      addNotification('error', 'Validation error', 'Default duration must be >= minimum duration.');
      return;
    }
    if (defaultVal > maxVal) {
      addNotification('error', 'Validation error', 'Default duration must be <= maximum duration.');
      return;
    }

    setSavingDuration(true);
    try {
      await updateDurationSettings({
        minDurationMin: minVal,
        maxDurationMin: maxVal,
        defaultDurationMin: defaultVal,
      });
      addNotification('success', 'Duration settings saved', 'Your duration settings have been updated successfully.');
    } catch (err) {
      console.error('Failed to save duration settings:', err);
      addNotification('error', 'Failed to save duration settings', 'Could not save duration settings to the server.');
    } finally {
      setSavingDuration(false);
    }
  };



  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const data = await apiFetchJson('/categories');
      setCategories(data as Category[]);
    } catch (e: any) {
      if (isForbidden(e)) {
        addNotification('error', 'Access denied', 'Admin privileges required');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      addNotification('error', 'Failed to load categories', e?.message || 'Could not load categories from the server.');
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleSeedDefaults = async () => {
    setLoadingCategories(true);
    try {
      await apiFetchJson('/categories/seed-defaults', { method: 'POST', body: JSON.stringify({}) });
      await loadCategories();
      addNotification('success', 'Default categories created', 'The default categories have been added to your account.');
    } catch (e: any) {
      addNotification('error', 'Failed to create default categories', e?.message || 'Could not create default categories.');
    } finally {
      setLoadingCategories(false);
    }
  };

  const openAddModal = () => {
    setEditModal({ isNew: true });
    setModalName('');
    setModalColor('#3b82f6');
  };

  const openEditModal = (category: Category) => {
    setEditModal({ category, isNew: false });
    setModalName(category.name);
    setModalColor(category.color);
  };

  const closeModal = useCallback(() => {
    setEditModal(null);
    setModalName('');
    setModalColor('#3b82f6');
  }, []);

  // ESC key handler for category edit modal
  useEffect(() => {
    if (!editModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editModal, closeModal]);

  // ESC key handler for delete confirmation modal
  useEffect(() => {
    if (!deleteConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeleteConfirm(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirm]);

  const handleSaveCategory = async () => {
    if (!modalName.trim()) {
      addNotification('error', 'Category name is required', 'Please enter a name for the category.');
      return;
    }

    setSaving(true);

    try {
      if (editModal?.isNew) {
        await apiFetchJson('/categories', {
          method: 'POST',
          body: JSON.stringify({ name: modalName.trim(), color: modalColor }),
        });
        addNotification('success', 'Category created', `The category "${modalName.trim()}" has been created.`);
      } else if (editModal?.category) {
        await apiFetchJson(`/categories/${editModal.category.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: modalName.trim(), color: modalColor }),
        });
        addNotification('success', 'Category updated', `The category "${modalName.trim()}" has been updated.`);
      }
      await loadCategories();
      closeModal();
    } catch (e: any) {
      addNotification('error', 'Failed to save category', e?.message || 'Could not save the category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);

    try {
      await apiFetchJson(`/categories/${deleteConfirm.id}`, { method: 'DELETE' });
      await loadCategories();
      const categoryName = deleteConfirm.name;
      setDeleteConfirm(null);
      addNotification('success', 'Category deleted', `The category "${categoryName}" has been deleted.`);
    } catch (e: any) {
      addNotification('error', 'Failed to delete category', e?.message || 'Could not delete the category.');
    } finally {
      setDeleting(false);
    }
  };

  const logout = async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // Ignore
    } finally {
      setMe(null);
      window.location.href = '/';
    }
  };

  // Force password change handler
  const forceChangePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      await apiFetchJson('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMe(null);
      return true;
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setAuthError('Current password is incorrect, or session expired.');
        return false;
      }
      setAuthError(e?.message || 'Change password failed.');
      return false;
    }
  };

  if (loading) {
    return null;
  }

  if (!me) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  // Force password change if required
  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={me.email}
        onChangePassword={forceChangePassword}
        error={authError}
      />
    );
  }

  // Check admin access
  if (!me.isAdmin) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  const settingsReady =
    !settingsLoading &&
    workingHoursStart !== null &&
    workingHoursEnd !== null &&
    workingDays !== null;
  return (
    <Layout currentPage="customizations" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
          Customizations
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          Manage your categories and preferences
        </p>
      </div>

      {/* Working Hours Section */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 24,
        marginBottom: 24,
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
            Working Hours
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
            Set your availability for the calendar view
          </p>
        </div>

         {!settingsReady ? (
            <div style={{ padding: 12, color: '#64748b', fontSize: 14 }}>
              Loading settings…
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                {/* Time Range */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#475569' }}>
                    Hours
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="time"
                      value={workingHoursStart}
                      onChange={(e) => setWorkingHoursStart(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        fontSize: 14,
                      }}
                    />
                    <span style={{ color: '#64748b' }}>to</span>
                    <input
                      type="time"
                      value={workingHoursEnd}
                      onChange={(e) => setWorkingHoursEnd(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        fontSize: 14,
                      }}
                    />
                  </div>
                </div>

                {/* Working Days */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#475569' }}>
                    Working Days
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {dayLabels.map((label, index) => {
                      const selected = workingDays.includes(index);
                      return (
                        <button
                          key={index}
                          onClick={() => toggleWorkingDay(index)}
                          style={{
                            width: 40,
                            height: 36,
                            borderRadius: 6,
                            border: selected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                            background: selected ? '#eff6ff' : 'white',
                            color: selected ? '#3b82f6' : '#64748b',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{
                  marginTop: 20,
                  padding: '10px 20px',
                  background: savingSettings ? '#cbd5e1' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: savingSettings ? 'not-allowed' : 'pointer',
                }}
              >
                {savingSettings ? 'Saving...' : 'Save Working Hours'}
              </button>
            </>
          )}
        </div>

      {/* Duration Settings Section */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 24,
        marginBottom: 24,
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
            Duration Settings
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
            Configure the minimum, maximum, and default duration for tasks (in minutes)
          </p>
        </div>

        {durationLoading ? (
          <div style={{ padding: 12, color: '#64748b', fontSize: 14 }}>
            Loading duration settings…
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 16, maxWidth: 600 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#475569' }}>
                  Minimum Duration (minutes)
                </label>
                <input
                  type="number"
                  value={minDuration}
                  onChange={(e) => setMinDuration(e.target.value)}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (isNaN(val) || e.target.value === '') {
                      setMinDuration('1');
                    } else if (val < 1) {
                      setMinDuration('1');
                    } else if (val > 10000) {
                      setMinDuration('10000');
                    } else {
                      setMinDuration(String(val));
                    }
                  }}
                  min={1}
                  max={10000}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#475569' }}>
                  Maximum Duration (minutes)
                </label>
                <input
                  type="number"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(e.target.value)}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (isNaN(val) || e.target.value === '') {
                      setMaxDuration('1');
                    } else if (val < 1) {
                      setMaxDuration('1');
                    } else if (val > 10000) {
                      setMaxDuration('10000');
                    } else {
                      setMaxDuration(String(val));
                    }
                  }}
                  min={1}
                  max={10000}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#475569' }}>
                  Default Duration (minutes)
                </label>
                <input
                  type="number"
                  value={defaultDuration}
                  onChange={(e) => setDefaultDuration(e.target.value)}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (isNaN(val) || e.target.value === '') {
                      setDefaultDuration('1');
                    } else if (val < 1) {
                      setDefaultDuration('1');
                    } else if (val > 10000) {
                      setDefaultDuration('10000');
                    } else {
                      setDefaultDuration(String(val));
                    }
                  }}
                  min={1}
                  max={10000}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleSaveDuration}
              disabled={savingDuration}
              style={{
                marginTop: 20,
                padding: '10px 20px',
                background: savingDuration ? '#cbd5e1' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: savingDuration ? 'not-allowed' : 'pointer',
              }}
            >
              {savingDuration ? 'Saving...' : 'Save Duration Settings'}
            </button>
          </>
        )}
      </div>

      {/* Categories Section */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
              Categories
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0, marginTop: 4 }}>
              Create and manage categories for your tasks
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {categories.length === 0 && (
              <button
                onClick={handleSeedDefaults}
                disabled={loadingCategories}
                style={{
                  padding: '8px 16px',
                  background: 'white',
                  color: '#3b82f6',
                  border: '1px solid #3b82f6',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: loadingCategories ? 'not-allowed' : 'pointer',
                  opacity: loadingCategories ? 0.7 : 1,
                }}
              >
                Use Defaults
              </button>
            )}
            <button
              onClick={openAddModal}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              + Add Category
            </button>
          </div>
        </div>

        {/* Categories List */}
        {loadingCategories ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading...</div>
        ) : categories.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            <p style={{ margin: 0, marginBottom: 8 }}>No categories yet</p>
            <p style={{ margin: 0, fontSize: 13 }}>
              Click "Add Category" to create one, or "Use Defaults" to start with common categories.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderRadius: 8,
                  borderLeft: `4px solid ${cat.color}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      background: cat.color,
                    }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{cat.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => openEditModal(cat)}
                    style={{
                      padding: '6px 12px',
                      background: 'white',
                      color: '#475569',
                      border: '1px solid #e2e8f0',
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(cat)}
                    style={{
                      padding: '6px 12px',
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Category Modal */}
      {editModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            width: '100%',
            maxWidth: 400,
            margin: 16,
          }}>
            <h3 style={{ margin: 0, marginBottom: 20, color: '#1e293b' }}>
              {editModal.isNew ? 'Add Category' : 'Edit Category'}
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#475569' }}>
                Name
              </label>
              <input
                type="text"
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                placeholder="Enter category name"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#475569' }}>
                Color
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    onClick={() => setModalColor(color)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: color,
                      border: modalColor === color ? '3px solid #1e293b' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={modalColor}
                  onChange={(e) => setModalColor(e.target.value)}
                  style={{
                    width: 40,
                    height: 32,
                    padding: 0,
                    border: '1px solid #e2e8f0',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                />
                <input
                  type="text"
                  value={modalColor}
                  onChange={(e) => setModalColor(e.target.value)}
                  placeholder="#3b82f6"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 4,
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={closeModal}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'white',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={saving || !modalName.trim()}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: (saving || !modalName.trim()) ? '#cbd5e1' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: (saving || !modalName.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            width: '100%',
            maxWidth: 400,
            margin: 16,
          }}>
            <h3 style={{ margin: 0, marginBottom: 16, color: '#1e293b' }}>Delete Category</h3>
            <p style={{ margin: 0, marginBottom: 16, color: '#64748b', fontSize: 14 }}>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
              Tasks using this category will keep their current category text, but the color will no longer be defined.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'white',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCategory}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </Layout>
  );
}
