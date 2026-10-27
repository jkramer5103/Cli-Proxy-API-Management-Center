import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MainRoutes } from '@/router/MainRoutes';
import {
  IconLogOut,
  IconMenu,
  IconSidebarAuthFiles,
  IconSidebarLogs,
  IconSidebarOauth,
  IconSidebarProviders,
  IconSidebarQuota,
  IconSidebarSystem,
  IconX,
} from '@/components/ui/icons';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { useAuthStore, useConfigStore } from '@/stores';

interface NavItem {
  path: string;
  labelKey: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/quota', labelKey: 'nav.quota', icon: <IconSidebarQuota size={18} /> },
  { path: '/auth-files', labelKey: 'nav.auth_files', icon: <IconSidebarAuthFiles size={18} /> },
  { path: '/oauth', labelKey: 'nav.oauth', icon: <IconSidebarOauth size={18} /> },
  { path: '/ai-providers', labelKey: 'nav.providers', icon: <IconSidebarProviders size={18} /> },
  { path: '/logs', labelKey: 'nav.logs', icon: <IconSidebarLogs size={18} /> },
  { path: '/system', labelKey: 'nav.system', icon: <IconSidebarSystem size={18} /> },
];

export function MainLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isLogsPage = location.pathname.startsWith('/logs');

  useEffect(() => {
    fetchConfig().catch(() => {
      // The login flow shows the user-facing prompt.
    });
  }, [fetchConfig]);

  useEffect(() => {
    setSidebarOpen(false);
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Bottom overlays (batch action bar) center themselves on the content column.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--content-center-x',
        `${rect.left + rect.width / 2}px`
      );
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--content-center-x');
    };
  }, []);

  const menuLabel = sidebarOpen ? t('common.close') : t('sidebar.open');

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button
          type="button"
          className="icon-button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={menuLabel}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
        >
          {sidebarOpen ? <IconX size={18} /> : <IconMenu size={18} />}
        </button>
        <span className="mobile-topbar-title">{t('title.abbr')}</span>
      </header>

      <button
        type="button"
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-label={t('common.close')}
        aria-hidden={!sidebarOpen}
        tabIndex={sidebarOpen ? 0 : -1}
      />

      <aside id="app-sidebar" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src={INLINE_LOGO_JPEG} alt="" className="sidebar-brand-logo" />
          <span className="sidebar-brand-title">{t('title.abbr')}</span>
        </div>

        <nav className="sidebar-nav" aria-label={t('sidebar.navigation')}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {serverVersion && (
            <span className="sidebar-version" title={t('footer.api_version')}>
              v{serverVersion.replace(/^v/i, '')}
            </span>
          )}
          <button type="button" className="nav-item sidebar-logout" onClick={logout}>
            <span className="nav-item-icon">
              <IconLogOut size={18} />
            </span>
            <span className="nav-item-label">{t('header.logout')}</span>
          </button>
        </div>
      </aside>

      <div className={`content${isLogsPage ? ' content-logs' : ''}`} ref={contentRef}>
        <main
          key={location.pathname}
          className={`main-content${isLogsPage ? ' main-content-logs' : ''}`}
        >
          <MainRoutes />
        </main>
      </div>
    </div>
  );
}
