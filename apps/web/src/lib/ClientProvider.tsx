import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { AuthUser } from '@demo/shared';
import { API_URL, ClientContext, STAFF_EMAIL, api, session, type AppSocket, type ClientCtx, type ConnectionStatus } from './client';

/**
 * Demo staff session: logs in automatically as staff@demo.test (any password),
 * keeps the token in localStorage, re-logs in on 401, and owns the Socket.IO connection.
 */
export function ClientProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => session.token());
  const [user, setUser] = useState<AuthUser | null>(() => session.readUser());
  const [authError, setAuthError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const loggingIn = useRef(false);

  const setToken = useCallback((t: string | null) => {
    session.setToken(t);
    setTokenState(t);
  }, []);

  const login = useCallback((): Promise<void> => {
    if (loggingIn.current) return Promise.resolve();
    loggingIn.current = true;
    // Promise chain rather than async/await: state updates happen in callbacks, never synchronously in an effect.
    return api
      .login({ email: STAFF_EMAIL, password: 'demo' })
      .then(
        (res) => {
          session.writeUser(res.user);
          setUser(res.user);
          setToken(res.token);
          setAuthError(null);
        },
        (e: unknown) => setAuthError(e instanceof Error ? e.message : 'Could not reach the API'),
      )
      .finally(() => {
        loggingIn.current = false;
      });
  }, [setToken]);

  // 401 from any call: drop the token and sign in again.
  useEffect(() => {
    session.setUnauthorizedHandler(() => {
      setToken(null);
      void login();
    });
    return () => session.setUnauthorizedHandler(null);
  }, [login, setToken]);

  useEffect(() => {
    if (!token) void login();
  }, [token, login]);

  // Retry login every 5 s while the API is unreachable.
  useEffect(() => {
    if (!authError) return;
    const t = window.setInterval(() => void login(), 5000);
    return () => window.clearInterval(t);
  }, [authError, login]);

  // The socket object is created per token (no network until connect()); the effect below connects it.
  const socket = useMemo<AppSocket | null>(
    () => (token ? io(API_URL, { auth: { token }, transports: ['websocket', 'polling'], autoConnect: false }) : null),
    [token],
  );

  useEffect(() => {
    if (!socket) return;
    const s = socket;
    // Every successful connect (first or re-) bumps the epoch so pages refetch what they missed while offline.
    s.on('connect', () => {
      setStatus('connected');
      setConnectionEpoch((n) => n + 1);
    });
    // socket.io auto-reconnects unless the server closed the connection on purpose; in that case stay "offline".
    s.on('disconnect', (reason) => setStatus(reason === 'io server disconnect' || reason === 'io client disconnect' ? 'offline' : 'reconnecting'));
    s.on('connect_error', () => setStatus(s.active ? 'reconnecting' : 'offline'));
    // Manager-level events: fire while the client is retrying in the background.
    s.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    s.io.on('reconnect', () => setStatus('connected'));
    s.io.on('reconnect_failed', () => setStatus('offline'));
    s.connect();
    return () => {
      s.removeAllListeners();
      s.io.removeAllListeners();
      s.disconnect();
      setStatus('offline');
    };
  }, [socket]);

  const value: ClientCtx = {
    api,
    user,
    ready: !!token,
    authError,
    socket,
    connected: status === 'connected',
    status,
    connectionEpoch,
    retryLogin: () => void login(),
  };
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}
