'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import GlobalSearch from './GlobalSearch';
import OcrQueuePanel from './ocr/OcrQueuePanel';
import { useTheme } from '../contexts/ThemeContext';

const Icon = ({ children }: { children: ReactNode }) => (
  <span style={{ display: 'inline-flex', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  </span>
);

const IconHome = () => (
  <Icon>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Icon>
);

const IconCalendar = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M8 2v4M16 2v4M3 10h18" />
  </Icon>
);

const IconSliders = () => (
  <Icon>
    <path d="M4 7h16M4 17h16" />
    <circle cx="9" cy="7" r="2" />
    <circle cx="15" cy="17" r="2" />
  </Icon>
);

const IconActivity = () => (
  <Icon>
    <path d="M3 12h5l2-4 4 8 2-4h5" />
  </Icon>
);

const IconUsers = () => (
  <Icon>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2" />
    <path d="M4 20c0-3 3-5 6-5s6 2 6 5" />
    <path d="M14 20c0-2 2-3 4-3 1 0 2 .2 3 .7" />
  </Icon>
);

const IconTag = () => (
  <Icon>
    <path d="M3 12l9 9 9-9-9-9H5a2 2 0 00-2 2z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </Icon>
);

const IconChart = () => (
  <Icon>
    <path d="M4 19V5" />
    <path d="M9 19v-6" />
    <path d="M14 19v-9" />
    <path d="M19 19v-12" />
  </Icon>
);

const IconUser = () => (
  <Icon>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6" />
  </Icon>
);

const IconLogout = () => (
  <Icon>
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H4" />
    <path d="M20 4v16" />
  </Icon>
);

const IconChevronLeft = () => (
  <Icon>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);

const IconChevronRight = () => (
  <Icon>
    <path d="M9 18l6-6-6-6" />
  </Icon>
);

const IconSun = () => (
  <Icon>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

const IconMoon = () => (
  <Icon>
    <path d="M21 14.5A8 8 0 019.5 3a7 7 0 1011.5 11.5z" />
  </Icon>
);

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
  const { theme, toggleTheme } = useTheme();
  const sidebarWidth = isCollapsed ? 60 : 250;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--page-background)' }}>
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
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        <div style={{
          padding: isCollapsed ? '24px 12px' : '24px 20px',
          borderBottom: '1px solid var(--sidebar-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
        }}>
          {!isCollapsed && <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-heading)', letterSpacing: '-0.025em' }}>TaskFlow</h1>}
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
            {isCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
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
            <IconHome />
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
            <IconCalendar />
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
                <IconSliders />
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
                <IconActivity />
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
                <IconUsers />
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
                <IconTag />
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
                <IconChart />
                {!isCollapsed && <span style={{ fontSize: 14, fontWeight: 500 }}>ML Metrics</span>}
              </Link>
            </>
          )}
        </nav>

        {/* Theme Toggle */}
        <div
          style={{
            padding: isCollapsed ? '12px 8px' : 20,
            borderTop: '1px solid var(--sidebar-border)',
          }}
        >
          <button
            onClick={toggleTheme}
            style={{
              width: '100%',
              padding: isCollapsed ? 6 : 8,
              borderRadius: 999,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-toggle-bg)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: theme === 'dark' ? 'var(--surface)' : 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                transition: 'transform 0.35s ease',
                transform: theme === 'dark' ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: theme === 'dark' ? 'var(--surface-hover)' : 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme === 'dark' ? 'var(--text-primary)' : '#ffffff',
                  transition: 'transform 0.35s ease',
                  transform: theme === 'dark' ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {theme === 'dark' ? <IconMoon /> : <IconSun />}
              </div>
            </div>
          </button>
        </div>

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
                {isCollapsed ? <IconUser /> : 'Profile'}
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
                  {isCollapsed ? <IconLogout /> : 'Logout'}
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
