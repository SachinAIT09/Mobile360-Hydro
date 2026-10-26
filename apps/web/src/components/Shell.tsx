import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ASSISTANT, BRAND } from '@demo/shared';
import { useAssistantChat } from '../lib/assistant';
import type { AssistantCtx } from '../lib/assistantContext';
import { api, useClient, type ConnectionStatus } from '../lib/client';
import { setThemePref, useTheme, type ThemePref } from '../lib/themeMode';
import { Icon, type IconName } from './icons';
import { PresenterBar } from './PresenterBar';

/** Connection dot: green when live, amber pulsing while socket.io retries, red when offline. */
const CONN: Record<ConnectionStatus, { dot: string; title: string }> = {
  connected: { dot: 'on', title: 'Live updates connected' },
  reconnecting: { dot: 'reconnecting', title: 'Live updates interrupted, reconnecting' },
  offline: { dot: 'off', title: 'Live updates offline' },
};

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/feeders', label: 'Dashboard', icon: 'dashboard' },
  { to: '/campaigns', label: 'Campaign 360', icon: 'campaign' },
  { to: '/events', label: 'DR events', icon: 'bolt' },
  { to: '/reports', label: 'Reports', icon: 'chart' },
  { to: '/assistant', label: 'AI Assistant', icon: 'bot' },
];
const DEMO_NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/demo', label: 'Demo control panel', icon: 'settings' },
  { to: '/audit', label: 'Audit log', icon: 'clock' },
];

function initials(first?: string, last?: string) {
  const s = `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  return s || 'ST';
}

const THEMES: { pref: ThemePref; label: string; icon: IconName }[] = [
  { pref: 'dark', label: 'Dark', icon: 'moon' },
  { pref: 'light', label: 'Light', icon: 'sun' },
  { pref: 'system', label: 'Match system', icon: 'monitor' },
];

/** Theme menu: Dark / Light / Match system. Arrow keys move, Escape closes and returns focus to the button. */
function ThemeMenu() {
  const { pref } = useTheme();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    items().find((b) => b.getAttribute('aria-checked') === 'true')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
      } else if (e.key === 'Tab') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const current = THEMES.find((t) => t.pref === pref) ?? THEMES[0];
  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="iconbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Theme: ${current.label}`}
        title="Theme"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="palette" size={18} />
      </button>
      {open && (
        <div className="menu" role="menu" id={menuId} aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.pref}
              type="button"
              role="menuitemradio"
              aria-checked={pref === t.pref}
              onClick={() => {
                setThemePref(t.pref);
                setOpen(false);
                button.current?.focus();
              }}
            >
              <Icon name={t.icon} size={16} />
              <span>{t.label}</span>
              {pref === t.pref && <Icon name="check" size={16} className="tick" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBar({ navOpen, onToggleNav }: { navOpen: boolean; onToggleNav: () => void }) {
  const { user, status } = useClient();
  const { theme } = useTheme();
  const conn = CONN[status];
  const logo = theme === 'light' ? 'powerconnect-logo-trimmed.png' : 'powerconnect-logo-white.png';
  return (
    <header className="topbar">
      <button
        type="button"
        className="iconbtn navtoggle"
        aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={navOpen}
        aria-controls="app-rail"
        onClick={onToggleNav}
      >
        <Icon name={navOpen ? 'close' : 'menu'} size={20} />
      </button>
      <Link to="/feeders" className="topbar-logo" aria-label={`${BRAND.staffProductName} home`}>
        <img src={`${import.meta.env.BASE_URL}brand/${logo}`} alt={`${BRAND.vendorName} logo`} />
      </Link>
      <div className="topbar-actions">
        <span className="welcome">
          <Icon name="building" size={15} />
          Welcome {user?.firstName ?? 'back'}
        </span>
        <span className="lang" role="img" aria-label="Language: English">
          <Icon name="globe" size={15} />
          EN
        </span>
        <ThemeMenu />
        <span className="iconbtn" role="status" aria-live="polite" title={conn.title}>
          <Icon name="bell" size={18} />
          <span className={`dot ${conn.dot}`} aria-hidden="true" />
          <span className="sr-only">{conn.title}</span>
        </span>
        <span className="avatar" title={user ? `${user.firstName} ${user.lastName} · Customer Programs` : undefined} aria-hidden="true">
          {initials(user?.firstName, user?.lastName)}
          <span className="online" />
        </span>
      </div>
    </header>
  );
}

function RailLink({ to, label, icon, onNavigate }: { to: string; label: string; icon: IconName; onNavigate: () => void }) {
  return (
    <NavLink to={to} aria-label={label} onClick={onNavigate}>
      <Icon name={icon} size={20} />
      <span className="lbl-text" aria-hidden="true">
        {label}
      </span>
    </NavLink>
  );
}

/**
 * Icon rail that widens over the page on hover (or keyboard focus) to show the section names.
 * On phones it is an off-canvas drawer opened from the top bar.
 */
function Rail({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="rail-slot">
      <aside className="rail" id="app-rail">
        <Link to="/assistant" className="rail-search" aria-label={`Ask the ${ASSISTANT.staffName}`} title={ASSISTANT.placeholderStaff} onClick={onNavigate}>
          <Icon name="search" size={18} />
          <span className="lbl-text" aria-hidden="true">
            Ask the assistant…
          </span>
        </Link>
        <nav className="snav" aria-label="Sections">
          {NAV.map((n) => (
            <RailLink key={n.to} {...n} onNavigate={onNavigate} />
          ))}
        </nav>
        <div className="rail-divider" />
        <nav className="snav" aria-label="Demo">
          {DEMO_NAV.map((n) => (
            <RailLink key={n.to} {...n} onNavigate={onNavigate} />
          ))}
        </nav>
      </aside>
    </div>
  );
}

export function Shell() {
  const { authError, retryLogin } = useClient();
  const { pathname } = useLocation();
  const chat = useAssistantChat(api.askStaff);
  const [history, setHistory] = useState<string[]>([]);
  // Answers use the page the user was on before opening the assistant as context.
  const lastPage = useRef(pathname);
  useEffect(() => {
    if (pathname !== '/assistant') lastPage.current = pathname;
  }, [pathname]);
  const { ask: chatAsk, clear, turns, busy } = chat;
  const ask = useCallback(
    (q: string) => {
      const question = q.trim();
      if (!question) return;
      setHistory((h) => [question, ...h.filter((x) => x !== question)].slice(0, 20));
      chatAsk(question, lastPage.current);
    },
    [chatAsk],
  );
  const assistant = useMemo<AssistantCtx>(() => ({ turns, busy, ask, clear, history }), [turns, busy, ask, clear, history]);
  // Phone navigation drawer: closes on navigation, Escape or a tap outside.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);
  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <TopBar navOpen={navOpen} onToggleNav={() => setNavOpen((o) => !o)} />
      <div className="body">
        <Rail onNavigate={closeNav} />
        {navOpen && <div className="nav-scrim" aria-hidden="true" onClick={closeNav} />}
        <div className="main" id="main-content" tabIndex={-1}>
          {authError && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="notice err" role="alert">
                Can't reach the API ({authError}). Is it running on port 3000? Retrying every 5 seconds…{' '}
                <button type="button" className="linkbtn" onClick={retryLogin}>
                  Retry now
                </button>
              </div>
            </div>
          )}
          <Outlet context={assistant} />
          <PresenterBar />
          <footer className="footer">
            <span>
              {BRAND.conceptLabel} · {BRAND.vendorName}
            </span>
            <Link to="/demo">Demo control panel</Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
