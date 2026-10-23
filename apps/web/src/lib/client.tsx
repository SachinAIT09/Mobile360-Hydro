import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createApi, type Api, type AuthUser, type ClientToServerEvents, type ServerToClientEvents } from '@demo/shared';

// In production the API server hosts this app at /staff and the customer app at /app on the same origin.
// In dev (pnpm dev) the three run on separate ports. Either can be overridden with VITE_* env vars.
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3000');
export const MOBILE_WEB_URL: string =
  (import.meta.env.VITE_MOBILE_WEB_URL as string | undefined) || (import.meta.env.PROD ? `${window.location.origin}/app` : 'http://localhost:8081');

export const STAFF_EMAIL = 'staff@demo.test';
const TOKEN_KEY = 'h1demo.staffToken';
const USER_KEY = 'h1demo.staffUser';

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: token stays in memory only */
  }
}

/* Session storage lives at module level so the API client can read the token without React refs. */
let currentToken: string | null = readStore(TOKEN_KEY);
let unauthorizedHandler: (() => void) | null = null;

export const session = {
  token: () => currentToken,
  setToken(t: string | null) {
    currentToken = t;
    writeStore(TOKEN_KEY, t);
  },
  readUser(): AuthUser | null {
    const raw = readStore(USER_KEY);
    try {
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  },
  writeUser(u: AuthUser | null) {
    writeStore(USER_KEY, u ? JSON.stringify(u) : null);
  },
  setUnauthorizedHandler(fn: (() => void) | null) {
    unauthorizedHandler = fn;
  },
};

/** The one API client for the staff app. Reads the current token on every call. */
export const api: Api = createApi({
  baseUrl: API_URL,
  getToken: () => currentToken,
  onUnauthorized: () => unauthorizedHandler?.(),
});

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Live-update connection state.
 * - connected: socket is up.
 * - reconnecting: socket.io is retrying after a drop (or the first connect attempt failed).
 * - offline: no socket yet, or disconnected with no retry scheduled (e.g. server-side disconnect).
 */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export interface ClientCtx {
  api: Api;
  user: AuthUser | null;
  ready: boolean;
  authError: string | null;
  socket: AppSocket | null;
  /** @deprecated prefer `status === 'connected'`; kept for existing pages. */
  connected: boolean;
  status: ConnectionStatus;
  /** Incremented on every socket `connect` (including reconnects). `useLoad` refetches when it changes. */
  connectionEpoch: number;
  retryLogin: () => void;
}

export const ClientContext = createContext<ClientCtx | null>(null);

export function useClient(): ClientCtx {
  const c = useContext(ClientContext);
  if (!c) throw new Error('useClient outside ClientProvider');
  return c;
}

export function useApi(): Api {
  return useClient().api;
}

/** Live-update connection status plus the epoch that bumps on every (re)connect. */
export function useConnection(): { status: ConnectionStatus; connectionEpoch: number } {
  const { status, connectionEpoch } = useClient();
  return { status, connectionEpoch };
}

/** Keeps a ref pointing at the latest value, updated after render (not during it). */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]) {
  const { socket } = useClient();
  const ref = useLatest(handler);
  useEffect(() => {
    if (!socket) return;
    const fn = ((...args: unknown[]) => (ref.current as (...a: unknown[]) => void)(...args)) as never;
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event, ref]);
}

/**
 * Fetch helper: runs when the session is ready and whenever deps change; `reload()` refetches silently.
 * `loading` is true until the first result (data or error) arrives; later refetches keep the current data
 * on screen instead of flashing a spinner. Also refetches after every socket (re)connect, since events
 * may have been missed while offline.
 */
export function useLoad<T>(fn: (api: Api) => Promise<T>, deps: unknown[] = []) {
  const { api, ready, connectionEpoch } = useClient();
  const [result, setResult] = useState<{ data: T | null; error: string | null; settled: boolean }>({ data: null, error: null, settled: false });
  const fnRef = useLatest(fn);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const d = await fnRef.current(api);
      if (my === seq.current) setResult({ data: d, error: null, settled: true });
    } catch (e) {
      if (my === seq.current) setResult((r) => ({ data: r.data, error: e instanceof Error ? e.message : 'Request failed', settled: true }));
    }
  }, [api, fnRef]);

  useEffect(() => {
    if (!ready) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reload, connectionEpoch, ...deps]);

  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setResult((r) => ({ ...r, data: typeof updater === 'function' ? (updater as (p: T | null) => T | null)(r.data) : updater }));
  }, []);

  return { data: result.data, error: result.error, loading: !result.settled, reload, setData };
}
