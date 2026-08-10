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
  ProfileView,
  PublicAccount,
  ChannelView,
} from '../../../core/protocol';
import { api, ApiError, onSignedOut } from '../api/http';
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
  channelView: ChannelView | null;
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
  /** Takes back a sent request, by the address it went to. */
  withdrawContact: (identifier: string) => Promise<void>;
  acceptContact: (contactId: string) => Promise<void>;
  declineContact: (contactId: string) => Promise<void>;
  /** Reads a profile. Rejects when it is not yours to see. */
  loadProfile: (accountId: string) => Promise<ProfileView>;
  /**
   * Asks somebody you share a channel with to be a contact. Resolves to
   * whether it went straight through, which happens when they had already
   * asked you.
   */
  connectWith: (accountId: string) => Promise<{ accepted: boolean }>;
  /** Writes your own; whatever is left undefined is left alone. */
  saveProfile: (changes: {
    displayName?: string;
    bio?: string;
  }) => Promise<void>;
  startChannel: (contactIds: string[]) => Promise<string>;
  watchChannel: (channelId: string) => void;
  leaveChannelView: (channelId: string) => void;
  act: (channelId: string, action: ClientAction) => void;
  clearError: () => void;
  /** Invites this user has dismissed, by channel id. */
  dismissedInvites: string[];
  dismissInvite: (channelId: string) => void;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  /**
   * Dismissed invites, by channel id. Held here rather than in the view
   * because a dismissal is an action, and one that forgets itself the moment
   * you navigate away is not really a dismissal.
   *
   * Keyed by channel, so it is permanent for that invitation and no longer:
   * there is only ever one live channel per set of people, so being invited
   * again means a new channel with a new id, which raises a new banner. That
   * gives both halves of what a dismissal should mean without a second rule.
   *
   * It does not survive relaunching the app. Channels are short-lived, and
   * reopening to see what is currently live is reasonable rather than a fault.
   */
  const [dismissedInvites, setDismissedInvites] = useState<string[]>([]);
  const [state, setState] = useState<AppState>({
    ready: false,
    token: null,
    me: null,
    home: null,
    channelView: null,
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
        onChannel: (view) => setState((s) => ({ ...s, channelView: view })),
        onChannelGone: (channelId) =>
          setState((s) =>
            s.channelView?.channel.id === channelId
              ? { ...s, channelView: null }
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

  // Drives countdowns while a channel is on screen.
  useEffect(() => {
    if (!state.channelView) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [state.channelView !== null]);

  /**
   * Turns a refused credential — from any request, any file transfer, or a
   * socket closed with 4401 — into a clean sign-out.
   *
   * Deliberately does not call `/auth/sign-out`: the token the server would
   * want is the one it has just told us it no longer honours, so the only
   * thing left to do is forget it here. The notice is worded for the cause
   * that now produces this almost every time, without claiming to know which
   * of the three it was.
   */
  useEffect(() => {
    onSignedOut(() => {
      realtime.disconnect();
      void storage.remove(TOKEN_KEY);
      setState({
        ready: true,
        token: null,
        me: null,
        home: null,
        channelView: null,
        status: 'closed',
        lastError:
          'You were signed out. Signing in on another device ends the channel here.',
      });
    });
    return () => onSignedOut(null);
  }, [realtime]);

  useEffect(() => () => realtime.disconnect(), [realtime]);

  const value = useMemo<AppValue>(
    () => ({
      ...state,
      serverNow,
      dismissedInvites,

      dismissInvite: (channelId) => {
        setDismissedInvites((d) =>
          d.includes(channelId) ? d : [...d, channelId]
        );
      },

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
          channelView: null,
          status: 'closed',
          lastError: null,
        });
        // Best effort: the local channel is already gone either way.
        if (token) await api.signOut(token).catch(() => {});
      },

      requestContact: async (identifier) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const result = await api.requestContact(state.token, identifier);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
        return { accepted: result.accepted };
      },

      withdrawContact: async (identifier) => {
        if (!state.token) return;
        await api.withdrawContact(state.token, identifier);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
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

      loadProfile: async (accountId) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        return api.profile(state.token, accountId);
      },

      connectWith: async (accountId) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const result = await api.requestContactById(state.token, accountId);
        // Home is where the request shows up, on both sides.
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
        return { accepted: result.accepted };
      },

      saveProfile: async (changes) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const profile = await api.saveProfile(state.token, changes);
        // `me` is what every screen compares against to decide what is yours,
        // so a rename has to land here rather than waiting for a reconnect.
        setState((s) => ({ ...s, me: profile.account }));
      },

      startChannel: async (contactIds) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const { channelId } = await api.startChannel(state.token, contactIds);
        realtime.watchChannel(channelId);
        return channelId;
      },

      watchChannel: (channelId) => realtime.watchChannel(channelId),

      leaveChannelView: (channelId) => {
        realtime.unwatchChannel(channelId);
        setState((s) => ({ ...s, channelView: null }));
      },

      act: (channelId, action) => realtime.act(channelId, action),

      clearError: () => setState((s) => ({ ...s, lastError: null })),
    }),
    [state, serverNow, connect, realtime, tick, dismissedInvites]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
