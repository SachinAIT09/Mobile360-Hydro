import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { router } from 'expo-router';
import {
  SocketEvents,
  type DrEvent,
  type EnergyReading,
  type MeSummary,
  type Message,
  type ServerToClientEvents,
  type ClientToServerEvents,
} from '@demo/shared';
import { api, API_URL } from '../lib/config';
import { useAuth } from './AuthProvider';

export interface BannerData {
  id: string;
  title: string;
  body: string;
  route: string | null;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

interface SessionState {
  summary: MeSummary | null;
  summaryError: string | null;
  refreshSummary: () => Promise<void>;
  live: EnergyReading | null;
  /** @deprecated prefer `status === 'connected'`. */
  connected: boolean;
  /** Live connection: amber "reconnecting" while socket.io retries, "offline" when it gave up or isn't started. */
  status: ConnectionStatus;
  /** Bumped whenever messages change, so inbox screens can refetch. */
  messagesVersion: number;
  banner: BannerData | null;
  showBanner: (b: Omit<BannerData, 'id'>) => void;
  dismissBanner: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [live, setLive] = useState<EnergyReading | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [messagesVersion, setMessagesVersion] = useState(0);
  const [banner, setBanner] = useState<BannerData | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerIdRef = useRef<string | null>(null);

  const refreshSummary = useCallback((): Promise<void> => {
    if (!token) return Promise.resolve();
    // Promise chain rather than async/await: state updates happen in callbacks, never synchronously in an effect.
    return api.me().then(
      (s) => {
        setSummary(s);
        customerIdRef.current = s.customer.id;
        setLive((prev) => prev ?? s.live);
        setSummaryError(null);
      },
      (e: unknown) => setSummaryError(e instanceof Error ? e.message : 'Could not load your account'),
    );
  }, [token]);

  const dismissBanner = useCallback(() => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(null);
  }, []);

  const showBanner = useCallback((b: Omit<BannerData, 'id'>) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ ...b, id: String(Date.now()) });
    bannerTimer.current = setTimeout(() => setBanner(null), 6000);
  }, []);

  // load / clear summary on auth change
  useEffect(() => {
    if (!token) return;
    void refreshSummary();
    // Signed out (or switching accounts): clear the previous customer's data.
    return () => {
      setSummary(null);
      setLive(null);
    };
  }, [token, refreshSummary]);

  // realtime
  useEffect(() => {
    if (!token) return;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    let hadConnection = false;
    socket.on('connect', () => {
      setStatus('connected');
      if (hadConnection) {
        // Back after a drop: events were missed, so refetch the summary and let inbox screens refetch too.
        void refreshSummary();
        setMessagesVersion((v) => v + 1);
      }
      hadConnection = true;
    });
    // socket.io retries on its own unless one side closed the connection deliberately.
    socket.on('disconnect', (reason) => setStatus(reason === 'io server disconnect' || reason === 'io client disconnect' ? 'offline' : 'reconnecting'));
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.io.on('reconnect_failed', () => setStatus('offline'));

    socket.on(SocketEvents.energyReading, (r: EnergyReading) => setLive(r));
    socket.on(SocketEvents.meChanged, () => {
      void refreshSummary();
    });
    socket.on(SocketEvents.messageNew, (m: Message) => {
      setMessagesVersion((v) => v + 1);
      void refreshSummary();
      // The EV popup has its own sheet; don't double up with a banner for it.
      if (m.kind !== 'EV_DETECTED') {
        showBanner({ title: m.title, body: m.body, route: m.route });
      }
    });
    socket.on(SocketEvents.messagePopup, () => {
      setMessagesVersion((v) => v + 1);
      void refreshSummary();
      router.push('/ev-detected' as never);
    });
    socket.on(SocketEvents.drEventStatusChanged, (e: DrEvent) => {
      void refreshSummary();
      setMessagesVersion((v) => v + 1);
      if (e.status === 'ENDED') {
        showBanner({
          title: 'Thanks for taking part — see your event result',
          body: 'Your grid event has ended. Tap to see what you earned.',
          route: `/dr-events/${e.id}/result`,
        });
      } else if (e.status === 'ACTIVE') {
        showBanner({ title: 'Grid event has started', body: e.title, route: `/dr-events/${e.id}` });
      }
    });
    // Payload `{ keepSessions }` is optional: no payload = old behaviour (sessions were wiped → sign out).
    socket.on(SocketEvents.demoReset, (payload?: { keepSessions?: boolean }) => {
      if (payload?.keepSessions) {
        void refreshSummary();
        setMessagesVersion((v) => v + 1);
        router.replace('/' as never);
        showBanner({ title: 'Demo was reset', body: 'Sample data is back to its starting point.', route: null });
        return;
      }
      void logout().then(() => router.replace('/login' as never));
    });
    socket.on('connect_error', () => setStatus(socket.active ? 'reconnecting' : 'offline'));
    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      setStatus('offline');
    };
  }, [token, refreshSummary, showBanner, logout]);

  const value = useMemo(
    () => ({ summary, summaryError, refreshSummary, live, connected: status === 'connected', status, messagesVersion, banner, showBanner, dismissBanner }),
    [summary, summaryError, refreshSummary, live, status, messagesVersion, banner, showBanner, dismissBanner],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
