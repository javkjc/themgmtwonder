'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import GlobalSearch from './GlobalSearch';
import OcrQueuePanel from './ocr/OcrQueuePanel';

type LayoutProps = {
  children: ReactNode;
  currentPage:
  | 'home'
  | 'calendar'
  | 'profile'
  | 'customizations'
  | 'admin'
  | 'adminFields'
  | 'adminMl'
  | 'activity';
  userEmail?: string;
  userRole?: string;
  isAdmin?: boolean;
  onLogout?: () => void;
};

export default function Layout({ children, currentPage, userEmail, userRole, isAdmin, onLogout }: LayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const sidebarWidth = isCollapsed ? 60 : 250;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f7fa' }}>
      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          background: 'var(--sidebar-background)',
          color: 'var(--sidebar-text)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          height: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 100,
          transition: 'width 0.2s ease',
        }}
      >
        <div style={{
          padding: isCollapsed ? '24px 12px' : '24px 20px',
          borderBottom: '1px solid var(--sidebar-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
        }}>
          {!isCollapsed && <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>TaskFlow</h1>}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'var(--sidebar-toggle-bg)',
              border: 'none',
              borderRadius: 4,
              width: 28,
              height: 28,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--sidebar-text)',
              fontSize: 14,
            }}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? '?' : '?'}
          </button>
        </div>

        {!isCollapsed && (
          <div style={{ padding: '16px 20px' }}>
            <GlobalSearch />
          </div>
        )}

        <nav style={{ flex: 1, padding: '16px 0' }}>
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: isCollapsed ? '12px 0' : '12px 20px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              textDecoration: 'none',
              color: currentPage === 'home' ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
              background: currentPage === 'home' ? 'var(--sidebar-link-active)' : 'transparent',
              borderLeft: currentPage === 'home' ? '3px solid var(--sidebar-link-border)' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
            title="My Tasks"
          >
            <span style={{ fontSize: 18 }}>??</span>
            {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>My Tasks</span>}
          </Link>

          <Link
            href="/calendar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: isCollapsed ? '12px 0' : '12px 20px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              textDecoration: 'none',
              color: currentPage === 'calendar' ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
              background: currentPage === 'calendar' ? 'var(--sidebar-link-active)' : 'transparent',
              borderLeft: currentPage === 'calendar' ? '3px solid var(--sidebar-link-border)' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
            title="Calendar"
          >
            <span style={{ fontSize: 18 }}>??</span>
            {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>Calendar</span>}
          </Link>

          {isAdmin && (
            <>
              {!isCollapsed && (
                <div style={{ margin: '16px 20px 8px', fontSize: 11, textTransform: 'uppercase', opacity: 0.5, fontWeight: 600, color: 'var(--sidebar-text-muted)' }}>
                  Admin
                </div>
              )}

              <Link
                href="/customizations"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsed ? '12px 0' : '12px 20px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  textDecoration: 'none',
                  color: currentPage === 'customizations' ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                  background: currentPage === 'customizations' ? 'var(--sidebar-link-active)' : 'transparent',
                  borderLeft: currentPage === 'customizations' ? '3px solid var(--sidebar-link-border)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                title="Customizations"
              >
                <span style={{ fontSize: 18 }}>??</span>
                {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>Customizations</span>}
              </Link>

              <Link
                href="/activity"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsed ? '12px 0' : '12px 20px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  textDecoration: 'none',
                  color: currentPage === 'activity' ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                  background: currentPage === 'activity' ? 'var(--sidebar-link-active)' : 'transparent',
                  borderLeft: currentPage === 'activity' ? '3px solid var(--sidebar-link-border)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                title="Activity Log"
              >
                <span style={{ fontSize: 18 }}>??</span>
                {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>Activity Log</span>}
              </Link>

              <Link
                href="/admin"
                data-testid="admin-nav"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsed ? '12px 0' : '12px 20px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  textDecoration: 'none',
                  color: currentPage === 'admin' ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                  background: currentPage === 'admin' ? 'var(--sidebar-link-active)' : 'transparent',
                  borderLeft: currentPage === 'admin' ? '3px solid var(--sidebar-link-border)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                title="User Management"
              >
                <span style={{ fontSize: 18 }}>??</span>
                {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>User Management</span>}
              </Link>

              <Link
                href="/admin/fields"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsed ? '12px 0' : '12px 20px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  textDecoration: 'none',
                  color: currentPage === 'adminFields' ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                  background: currentPage === 'adminFields' ? 'var(--sidebar-link-active)' : 'transparent',
                  borderLeft: currentPage === 'adminFields' ? '3px solid var(--sidebar-link-border)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                title="Field Library"
              >
                <span style={{ fontSize: 18 }}>??</span>
                {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>Fields</span>}
              </Link>

              <Link
                href="/admin/ml"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsed ? '12px 0' : '12px 20px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  textDecoration: 'none',
                  color: currentPage === 'adminMl' ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                  background: currentPage === 'adminMl' ? 'var(--sidebar-link-active)' : 'transparent',
                  borderLeft: currentPage === 'adminMl' ? '3px solid var(--sidebar-link-border)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                title="ML Metrics"
              >
                <span style={{ fontSize: 18 }}>??</span>
                {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>ML Metrics</span>}
              </Link>
            </>
          )}
        </nav>

        {userEmail && (
          <div
            style={{
              padding: isCollapsed ? '12px 8px' : 20,
              borderTop: '1px solid var(--sidebar-border)',
            }}
          >
            {!isCollapsed && (
              <>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Logged in as</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, wordBreak: 'break-word' }}>
                  {userEmail}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, flexDirection: isCollapsed ? 'column' : 'row' }}>
              <Link
                href="/profile"
                style={{
                  flex: isCollapsed ? undefined : 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--sidebar-border)',
                  background: currentPage === 'profile' ? 'var(--sidebar-link-active)' : 'transparent',
                  color: 'var(--sidebar-text)',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
                title="Profile"
              >
                {isCollapsed ? '??' : 'Profile'}
              </Link>
              {onLogout && (
                <button
                  onClick={onLogout}
                  style={{
                    flex: isCollapsed ? undefined : 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--sidebar-border)',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'var(--sidebar-toggle-bg)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Logout"
                >
                  {isCollapsed ? '??' : 'Logout'}
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      <main style={{
        marginLeft: sidebarWidth,
        flex: 1,
        padding: '32px 40px',
        minWidth: 0,
        overflowX: 'auto',
        transition: 'margin-left 0.2s ease',
      }}>
        {children}
      </main>
      <OcrQueuePanel />
    </div>
  );
}
