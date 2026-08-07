import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type {
  ClientAction,
  HomeView,
  PublicAccount,
  SessionView,
} from '../../../core/protocol';
import { api, ApiError } from '../api/http';
import { Realtime, type ConnectionStatus } from '../api/socket';

const TOKEN_KEY = 'thefloor.token';

/** SecureStore has no web implementation; the browser is only used for checks. */
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface AppState {
  ready: boolean;
  token: string | null;
  me: PublicAccount | null;
  home: HomeView | null;
  sessionView: SessionView | null;
  status: ConnectionStatus;
  lastError: string | null;
}

interface AppValue extends AppState {
  /** Server time, tracked against the server's clock rather than the device's. */
  serverNow: () => number;
  requestCode: (identifier: string) => Promise<void>;
  verify: (
    identifier: string,
    code: string,
    displayName?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  requestContact: (identifier: string) => Promise<{ accepted: boolean }>;
  acceptContact: (contactId: string) => Promise<void>;
  declineContact: (contactId: string) => Promise<void>;
  startSession: (contactId: string) => Promise<string>;
  watchSession: (sessionId: string) => void;
  leaveSessionView: (sessionId: string) => void;
  act: (sessionId: string, action: ClientAction) => void;
  clearError: () => void;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    ready: false,
    token: null,
    me: null,
    home: null,
    sessionView: null,
    status: 'closed',
    lastError: null,
  });

  const realtime = useRef(new Realtime()).current;
  /**
   * serverNow - Date.now() at the last snapshot. Countdowns are derived from
   * this rather than the device clock, which drifts and which the user can set.
   */
  const clockOffset = useRef(0);
  /**
   * Snapshots only arrive when something changes, so a local tick is what keeps
   * a running countdown moving between them. The counter is a dependency of the
   * context value below, not merely local state: re-rendering this provider is
   * not enough, because a memoised value with an unchanged identity lets React
   * skip every consumer. Without it the timers only advance when the server
   * happens to push, which looks like the countdowns are frozen.
   */
  const [tick, forceTick] = useState(0);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  const connect = useCallback(
    (token: string) => {
      realtime.connect(token, {
        onServerTime: (value) => {
          clockOffset.current = value - Date.now();
        },
        // Restoring a stored token skips the sign-in response, so this is the
        // only thing that tells a relaunched app who it is. Without it `me`
        // stays null, and every screen that compares against the current user
        // — the whole floor mechanic — silently compares against nothing.
        onHello: (account) => setState((s) => ({ ...s, me: account })),
        onHome: (home) => setState((s) => ({ ...s, home })),
        onSession: (view) => setState((s) => ({ ...s, sessionView: view })),
        onSessionGone: (sessionId) =>
          setState((s) =>
            s.sessionView?.session.id === sessionId
              ? { ...s, sessionView: null }
              : s
          ),
        onStatus: (status) => setState((s) => ({ ...s, status })),
        onError: (message) => setState((s) => ({ ...s, lastError: message })),
      });
      realtime.watchHome();
    },
    [realtime]
  );

  // Restore a previous sign-in before showing anything.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await storage.get(TOKEN_KEY);
      if (cancelled) return;
      if (!token) {
        setState((s) => ({ ...s, ready: true }));
        return;
      }
      try {
        const home = await api.home(token);
        if (cancelled) return;
        setState((s) => ({ ...s, ready: true, token, home }));
        connect(token);
      } catch (error) {
        // An expired or revoked token should land on sign-in, not an error.
        if (error instanceof ApiError && error.status === 401) {
          await storage.remove(TOKEN_KEY);
          if (!cancelled) setState((s) => ({ ...s, ready: true }));
          return;
        }
        if (!cancelled) {
          setState((s) => ({
            ...s,
            ready: true,
            lastError: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connect]);

  // Drives countdowns while a session is on screen.
  useEffect(() => {
    if (!state.sessionView) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [state.sessionView !== null]);

  useEffect(() => () => realtime.disconnect(), [realtime]);

  const value = useMemo<AppValue>(
    () => ({
      ...state,
      serverNow,

      requestCode: async (identifier) => {
        await api.requestCode(identifier);
      },

      verify: async (identifier, code, displayName) => {
        const { token, account } = await api.verify(identifier, code, displayName);
        await storage.set(TOKEN_KEY, token);
        setState((s) => ({ ...s, token, me: account, lastError: null }));
        connect(token);
      },

      signOut: async () => {
        const token = state.token;
        realtime.disconnect();
        await storage.remove(TOKEN_KEY);
        setState({
          ready: true,
          token: null,
          me: null,
          home: null,
          sessionView: null,
          status: 'closed',
          lastError: null,
        });
        // Best effort: the local session is already gone either way.
        if (token) await api.signOut(token).catch(() => {});
      },

      requestContact: async (identifier) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const result = await api.requestContact(state.token, identifier);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
        return { accepted: result.accepted };
      },

      acceptContact: async (contactId) => {
        if (!state.token) return;
        await api.acceptContact(state.token, contactId);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
      },

      declineContact: async (contactId) => {
        if (!state.token) return;
        await api.declineContact(state.token, contactId);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
      },

      startSession: async (contactId) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const { sessionId } = await api.startSession(state.token, contactId);
        realtime.watchSession(sessionId);
        return sessionId;
      },

      watchSession: (sessionId) => realtime.watchSession(sessionId),

      leaveSessionView: (sessionId) => {
        realtime.unwatchSession(sessionId);
        setState((s) => ({ ...s, sessionView: null }));
      },

      act: (sessionId, action) => realtime.act(sessionId, action),

      clearError: () => setState((s) => ({ ...s, lastError: null })),
    }),
    [state, serverNow, connect, realtime, tick]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
