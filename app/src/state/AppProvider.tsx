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
// Aliased: `AppState` is already the name of this file's own state shape.
import { AppState as NativeAppState, Platform } from 'react-native';
import type {
  ClientAction,
  HomeView,
  ProfileView,
  PublicAccount,
  ChannelView,
  SupportView,
} from '../../../core/protocol';
import { api, ApiError, onSignedOut } from '../api/http';
import { Realtime, type ConnectionStatus } from '../api/socket';
import { onNotificationTap, registerForPush } from '../push';
import {
  APPEARANCE_KEY,
  applyPreference,
  isPreference,
  type ColorSchemePreference,
} from '../ui/appearance';

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
  /**
   * The last move the server reported: a conversation that changed channels
   * because somebody was asked into an unnamed one and arrived.
   *
   * Kept as state rather than delivered as an event because the screen that
   * has to follow it may not be mounted at the moment it lands — coming back
   * to a channel you were in should land you where its people actually are.
   */
  movedChannel: { from: string; to: string } | null;
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
  /**
   * Deletes the account and signs out. Rejects — leaving you signed in — if the
   * server did not do it, since the alternative is a screen that says you have
   * no account while the server still has one.
   */
  deleteAccount: () => Promise<void>;
  requestContact: (identifier: string) => Promise<{ accepted: boolean }>;
  /** Takes back a sent request, by the address it went to. */
  withdrawContact: (identifier: string) => Promise<void>;
  acceptContact: (contactId: string) => Promise<void>;
  declineContact: (contactId: string) => Promise<void>;
  /** Reads a profile. Rejects when it is not yours to see. */
  loadProfile: (accountId: string) => Promise<ProfileView>;
  /** Where to donate, and what you have already given. */
  loadSupport: () => Promise<SupportView>;
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
  /**
   * A channel a notification asked to be opened, waiting to be navigated to.
   *
   * Held here rather than acted on where it arrives, because a tap can land
   * before there is anything to navigate — during a cold start the app is
   * still restoring its token when the response is read.
   */
  pendingChannelId: string | null;
  clearPendingChannel: () => void;
  /** Invites this user has dismissed, by channel id. */
  dismissedInvites: string[];
  dismissInvite: (channelId: string) => void;
  /** Light, dark, or follow the phone. Applied to the window immediately. */
  appearance: ColorSchemePreference;
  setAppearance: (preference: ColorSchemePreference) => void;
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
   * Keyed by channel, so it is permanent for that invitation and no longer.
   * Being asked again raises a new banner whenever it is a different channel
   * asking, which is what gives both halves of what a dismissal should mean
   * without a second rule. Two people do share one unnamed channel, though, so
   * a second invitation from the same person into the same unnamed channel is
   * the case this does *not* re-raise.
   *
   * It does not survive relaunching the app. Channels are short-lived, and
   * reopening to see what is currently live is reasonable rather than a fault.
   */
  const [dismissedInvites, setDismissedInvites] = useState<string[]>([]);
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  /**
   * Read before anything is drawn, so a chosen scheme does not arrive as a
   * flash of the other one. Kept alongside the token rather than on the
   * server: it is about this phone, not about the account, and two phones
   * signed in as you may reasonably disagree about it.
   */
  const [appearance, setAppearanceState] =
    useState<ColorSchemePreference>('system');
  useEffect(() => {
    void (async () => {
      const stored = await storage.get(APPEARANCE_KEY);
      if (!isPreference(stored)) return;
      setAppearanceState(stored);
      applyPreference(stored);
    })();
  }, []);
  /**
   * The address this install is registered at, kept so sign-out can hand it
   * back. Without it the row survives, and a phone that has been signed out of
   * goes on receiving somebody else's notifications.
   */
  const deviceToken = useRef<string | null>(null);
  const [state, setState] = useState<AppState>({
    ready: false,
    token: null,
    me: null,
    home: null,
    channelView: null,
    movedChannel: null,
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
        // The conversation is in another channel now. Recorded rather than
        // acted on here: the screen showing it has to follow, and only it
        // knows whether it is the screen in question.
        //
        // The snapshot is left alone. One for the destination is already on
        // its way — the socket re-watched before handing this over — and
        // blanking it in between would flash the channel screen empty.
        onChannelMoved: (from, to) =>
          setState((s) => ({ ...s, movedChannel: { from, to } })),
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
      // Connecting from here on, and it matters that it says so: the socket is
      // not opened until after this keychain read and the fetch below, and
      // `closed` in the meantime is indistinguishable from having tried and
      // failed. Home reads it as the latter and says the app cannot reach the
      // server, at the one moment it has not yet attempted to.
      setState((s) => ({ ...s, status: 'connecting' }));
      try {
        const home = await api.home(token);
        if (cancelled) return;
        setState((s) => ({ ...s, ready: true, token, home }));
        connect(token);
      } catch (error) {
        // An expired or revoked token should land on sign-in, not an error.
        if (error instanceof ApiError && error.status === 401) {
          await storage.remove(TOKEN_KEY);
          if (!cancelled) {
            setState((s) => ({ ...s, ready: true, status: 'closed' }));
          }
          return;
        }
        // Back to `closed`, so the optimism above cannot strand the app
        // claiming to be connecting at something it has stopped trying.
        if (!cancelled) {
          setState((s) => ({
            ...s,
            ready: true,
            status: 'closed',
            lastError: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connect]);

  // Registered on every sign-in and every restored launch, not once ever: iOS
  // reissues a device token after a restore or a reinstall, so a registry
  // written once slowly fills with addresses that no longer resolve.
  useEffect(() => {
    if (!state.token) return;
    let cancelled = false;
    void registerForPush(state.token).then((token) => {
      if (!cancelled) deviceToken.current = token;
    });
    return () => {
      cancelled = true;
    };
  }, [state.token]);

  // A tap on a notification, from either direction it can arrive. Mounted once
  // and independent of sign-in state, because the tap that launched the app is
  // read before the stored token has been restored.
  useEffect(() => onNotificationTap(setPendingChannelId), []);

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
        movedChannel: null,
        status: 'closed',
        lastError:
          'You were signed out. Signing in on another device ends the channel here.',
      });
    });
    return () => onSignedOut(null);
  }, [realtime]);

  /**
   * Reconnects when the app comes back to the foreground.
   *
   * Nothing else does. iOS suspends the process and the socket does not
   * survive it, so without this the app sat on a dead connection until a
   * heartbeat happened to notice — showing stale channels as live, and then
   * announcing the disconnection at the moment the user had just returned.
   * Foregrounding is the commonest thing anyone does with a phone, and it was
   * the one transition the socket knew nothing about.
   */
  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') realtime.resume();
    });
    return () => subscription.remove();
  }, [realtime]);

  useEffect(() => () => realtime.disconnect(), [realtime]);

  const value = useMemo<AppValue>(
    () => ({
      ...state,
      serverNow,
      dismissedInvites,
      pendingChannelId,
      clearPendingChannel: () => setPendingChannelId(null),

      appearance,
      setAppearance: (preference) => {
        // Applied first: the window override is what the colours actually
        // resolve against, and storing is only so it survives a relaunch.
        applyPreference(preference);
        setAppearanceState(preference);
        void storage.set(APPEARANCE_KEY, preference);
      },

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
        const device = deviceToken.current;
        deviceToken.current = null;
        realtime.disconnect();
        await storage.remove(TOKEN_KEY);
        setState({
          ready: true,
          token: null,
          me: null,
          home: null,
          channelView: null,
          movedChannel: null,
          status: 'closed',
          lastError: null,
        });
        // Best effort: the local channel is already gone either way. The
        // device travels with it so the server forgets where to reach this
        // phone while the credential authorising that is still good.
        if (token) await api.signOut(token, device ?? undefined).catch(() => {});
      },

      /**
       * Deletes the account, then lands where signing out lands.
       *
       * The opposite order to `signOut`, and deliberately: signing out clears
       * the app first because the local session is already gone whether the
       * server hears or not. This one has to hear. A failure has to leave the
       * account intact *and* the person still signed in to try again, so the
       * error is rethrown and nothing local is touched until the server has
       * answered.
       */
      deleteAccount: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        await api.deleteAccount(state.token);
        deviceToken.current = null;
        realtime.disconnect();
        await storage.remove(TOKEN_KEY);
        setState({
          ready: true,
          token: null,
          me: null,
          home: null,
          channelView: null,
          movedChannel: null,
          status: 'closed',
          lastError: null,
        });
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

      /**
       * Read when Settings opens rather than held in state: nothing else in the
       * app reads it, donations gate nothing, and a value cached here would go
       * stale the moment somebody gave.
       */
      loadSupport: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        return api.support(state.token);
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
    [
      state,
      serverNow,
      connect,
      realtime,
      tick,
      dismissedInvites,
      pendingChannelId,
      appearance,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
