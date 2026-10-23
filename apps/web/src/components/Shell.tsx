import { useCallback, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ASSISTANT, BRAND } from '@demo/shared';
import { useAssistantChat } from '../lib/assistant';
import { api, useClient, type ConnectionStatus } from '../lib/client';
import { AssistantPanel } from './AssistantPanel';
import { Icon, type IconName } from './icons';
import { PageTitleProvider } from './PageHeader';
import { usePageTitle } from '../lib/pageTitle';
import { PresenterBar } from './PresenterBar';

/** Connection dot: green when live, amber pulsing while socket.io retries, red when offline. */
const CONN: Record<ConnectionStatus, { dot: string; text: string; title: string }> = {
  connected: { dot: 'on', text: 'Live', title: 'Live updates connected' },
  reconnecting: { dot: 'reconnecting', text: 'Reconnecting…', title: 'Live updates interrupted, reconnecting' },
  offline: { dot: 'off', text: 'Offline', title: 'Live updates offline' },
};

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/feeders', label: 'Dashboard', icon: 'dashboard' },
  { to: '/campaigns', label: 'Campaign 360', icon: 'campaign' },
  { to: '/events', label: 'DR events', icon: 'bolt' },
  { to: '/reports', label: 'Reports', icon: 'chart' },
];

function initials(first?: string, last?: string) {
  const s = `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  return s || 'ST';
}

interface TopBarProps {
  assistantOpen: boolean;
  onAsk: (q: string) => void;
  onOpenAssistant: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  badgeRef: RefObject<HTMLButtonElement | null>;
}

function TopBar({ assistantOpen, onAsk, onOpenAssistant, searchRef, badgeRef }: TopBarProps) {
  const { user, status } = useClient();
  const title = usePageTitle();
  const conn = CONN[status];
  const [q, setQ] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) onAsk(q);
    else onOpenAssistant();
    setQ('');
  }

  return (
    <header className="topbar">
      <h1 className="h1">{title || BRAND.staffProductName}</h1>
      <div className="topbar-actions">
        <form className="search" role="search" onSubmit={submit}>
          <label htmlFor="topbar-ask" className="sr-only">
            Ask the {ASSISTANT.staffName} about your feeders
          </label>
          <Icon name="search" size={18} />
          <input
            id="topbar-ask"
            ref={searchRef}
            type="search"
            autoComplete="off"
            maxLength={300}
            placeholder={ASSISTANT.placeholderStaff}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <button
          ref={badgeRef}
          type="button"
          className="iconbtn grad"
          aria-label="Open assistant"
          aria-haspopup="dialog"
          aria-expanded={assistantOpen}
          title={ASSISTANT.staffName}
          onClick={onOpenAssistant}
        >
          <Icon name="bolt" size={18} strokeWidth={2} />
        </button>
        <span className="iconbtn" role="status" aria-live="polite" title={conn.title}>
          <Icon name="bell" size={18} />
          <span className={`dot ${conn.dot}`} aria-hidden="true" />
          <span className="sr-only">{conn.title}</span>
        </span>
        <span className="iconbtn" aria-hidden="true" title="Theme">
          <Icon name="sun" size={18} />
        </span>
        <span className="avatar" aria-hidden="true">
          {initials(user?.firstName, user?.lastName)}
        </span>
        <span className="staffname">
          <strong>{user ? `${user.firstName} ${user.lastName}` : '[Staff name]'}</strong>
          <span>Customer Programs</span>
        </span>
      </div>
    </header>
  );
}

export function Shell() {
  const { status, authError, retryLogin } = useClient();
  const conn = CONN[status];
  const { pathname } = useLocation();
  const chat = useAssistantChat(api.askStaff);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const { ask } = chat;
  const askAssistant = useCallback(
    (q: string, route = pathname) => {
      setAssistantOpen(true);
      ask(q, route);
    },
    [ask, pathname],
  );
  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    // Return focus to the search box (hidden on narrow screens, then to the assistant button).
    const search = searchRef.current;
    (search && search.offsetParent !== null ? search : badgeRef.current)?.focus();
  }, []);
  return (
    <PageTitleProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <img src={`${import.meta.env.BASE_URL}brand/powerconnect-logo-white.png`} alt={`${BRAND.vendorName} logo`} />
          </div>
          <nav className="snav" aria-label="Sections">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}>
                <Icon name={n.icon} size={18} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-divider" />
          <nav className="snav" aria-label="Demo">
            <NavLink to="/demo">
              <Icon name="settings" size={18} />
              Demo control panel
            </NavLink>
            <NavLink to="/audit">
              <Icon name="clock" size={18} />
              Audit log
            </NavLink>
          </nav>
          <div className="sidebar-foot">
            <span className="conn" role="status" aria-live="polite" title={conn.title}>
              <span className={`dot ${conn.dot}`} aria-hidden="true" />
              {conn.text}
            </span>
            <span className="concept">
              {BRAND.staffProductName} for {BRAND.utilityName}
              <br />
              {BRAND.conceptLabel} · {BRAND.vendorName}
            </span>
          </div>
        </aside>
        <div className="main">
          <TopBar
            assistantOpen={assistantOpen}
            onAsk={askAssistant}
            onOpenAssistant={() => setAssistantOpen(true)}
            searchRef={searchRef}
            badgeRef={badgeRef}
          />
          {assistantOpen && <AssistantPanel turns={chat.turns} busy={chat.busy} onAsk={askAssistant} onClose={closeAssistant} />}
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
          <Outlet />
          <PresenterBar />
          <footer className="footer">
            <span>{BRAND.conceptLabel} · {BRAND.vendorName}</span>
            <Link to="/demo">Demo control panel</Link>
          </footer>
        </div>
      </div>
    </PageTitleProvider>
  );
}
