import type {
  HomeView,
  LeaderboardEntry,
  PublicAccount,
  ProfileView,
  SupportView,
} from '../../../core/protocol';
import { appBuild, BUILD_HEADER } from './build';
import { API_URL } from './config';
import type { HealthReport } from './expiry';
import { deviceRegion } from './region';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Told whenever the server refuses our credentials.
 *
 * A 401 can reach the app from three places — this module, the two file
 * transfers that bypass `fetch`, and a websocket closed with 4401 — and none
 * of them can reach React state on their own. A single listener, registered by
 * AppProvider, is what turns any of them into one sign-out.
 *
 * It matters more since signing in on a second device began revoking the
 * first: before that, a token only died by expiring after ninety days, so a
 * live app meeting a 401 was hardly possible. Now it is ordinary.
 */
type SignedOutListener = () => void;
let signedOutListener: SignedOutListener | null = null;

export function onSignedOut(listener: SignedOutListener | null): void {
  signedOutListener = listener;
}

/** Reports a refused credential from wherever it was noticed. */
export function reportSignedOut(): void {
  signedOutListener?.();
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  if (!API_URL) throw new ApiError('No server configured.', 0);

  let response: Response;
  try {
    response = await fetch(API_URL + path, {
      method: options.method ?? 'GET',
      headers: {
        // Only claim a JSON body when there is one. Declaring the content type
        // on a bodyless POST makes Fastify reject it outright
        // (FST_ERR_CTP_EMPTY_JSON_BODY), which silently broke every request
        // without a payload: accept, decline, sign out, and the audio token.
        ...(options.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        // Which build is calling, so the server's compatibility floor has a
        // source other than judgement. Omitted rather than sent empty when the
        // platform will not say — the server reads absence as "older than this
        // header", and a blank value would have to be parsed into the same
        // conclusion by a second rule. See build.ts.
        ...(appBuild() === null ? {} : { [BUILD_HEADER]: String(appBuild()) }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // A refused connection here almost always means the wrong LAN address or a
    // server that is not running, so say that rather than "Network request
    // failed", which sends people looking in the wrong place.
    throw new ApiError(`Cannot reach the server at ${API_URL}.`, 0);
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload as { error?: string; code?: string } | null;
    if (response.status === 401) reportSignedOut();
    throw new ApiError(
      body?.error ?? `Request failed (${response.status}).`,
      response.status,
      body?.code
    );
  }
  return payload as T;
}

export const api = {
  /**
   * What the server is and what it still answers to.
   *
   * Unauthenticated, and asked before anyone has signed in: a build below the
   * floor is one that should not be signing in either. It rejects like any
   * other request when the server cannot be reached, and the caller treats
   * that as no answer rather than as an expiry. See expiry.ts.
   */
  health: () => request<HealthReport>('/healthz'),

  requestCode: (identifier: string) =>
    request<{ sent: true }>('/auth/request-code', {
      method: 'POST',
      body: { identifier },
    }),

  verify: (identifier: string, code: string, displayName?: string) =>
    request<{ token: string; account: PublicAccount }>('/auth/verify', {
      method: 'POST',
      body: { identifier, code, displayName },
    }),

  /**
   * Signs out, and forgets this device while doing it.
   *
   * The device token travels with the request rather than being deleted
   * separately, because the credential that authorises forgetting it is the
   * one about to be revoked. Two calls would have to be ordered, and the wrong
   * order leaves a signed-out phone still receiving notifications.
   */
  signOut: (token: string, deviceToken?: string) =>
    request<void>('/auth/sign-out', {
      method: 'POST',
      body: { deviceToken },
      token,
    }),

  /**
   * Deletes the account this token belongs to, and everything it is.
   *
   * No device token, unlike sign-out. That one names a single phone, because
   * signing out here must not silence a tablet; this ends the account, so the
   * server forgets every device registered to it and there is nothing for the
   * caller to single out.
   */
  deleteAccount: (token: string) =>
    request<void>('/me', { method: 'DELETE', token }),

  registerDevice: (token: string, deviceToken: string, platform: 'ios' | 'android') =>
    request<{ ok: true }>('/devices', {
      method: 'POST',
      body: { token: deviceToken, platform },
      token,
    }),

  home: (token: string) => request<HomeView>('/home', { token }),

  /** Reads a profile. Refused as a 404 unless you are entitled to see it. */
  profile: (token: string, accountId: string) =>
    request<ProfileView>(`/profiles/${accountId}`, { token }),

  /**
   * Writes your own profile. A partial write: whatever is left undefined is
   * left alone, so saving one field cannot blank the other.
   */
  saveProfile: (
    token: string,
    changes: { displayName?: string; bio?: string }
  ) => request<ProfileView>('/me', { method: 'POST', body: changes, token }),

  /**
   * The invitation standings.
   *
   * Refused as a 404 to anybody whose account has not been granted them, which
   * is nobody by default — the same answer the server gives for a profile you
   * may not read, and for the same reason. `hello` says whether to offer the
   * screen at all, so in practice this is only called by somebody who has it.
   */
  leaderboard: (token: string) =>
    request<{ entries: LeaderboardEntry[] }>('/leaderboard', { token }),

  /**
   * Where to donate, and what this person has already given.
   *
   * The URL comes from the server rather than the binary, on the same principle
   * as the media server's: a link that can be withdrawn by editing one
   * environment variable is one that does not need an App Store submission to
   * take down. `url` is null when donations are not configured, and the screen
   * shows nothing at all.
   */
  support: (token: string) => {
    // Reported rather than acted on. The server decides whether this device is
    // somewhere the donate link may be shown, so the rule can be changed
    // without a release — and an absent answer means hidden, which is the safe
    // direction.
    const { locale, tz } = deviceRegion();
    const query = new URLSearchParams();
    if (locale) query.set('locale', locale);
    if (tz) query.set('tz', tz);
    const suffix = query.toString();
    return request<SupportView>(`/donations${suffix ? `?${suffix}` : ''}`, {
      token,
    });
  },

  requestContact: (token: string, identifier: string) =>
    request<{ ok: true; accepted: boolean }>('/contacts/request', {
      method: 'POST',
      body: { identifier },
      token,
    }),

  withdrawContact: (token: string, identifier: string) =>
    request<{ ok: true }>('/contacts/withdraw', {
      method: 'POST',
      body: { identifier },
      token,
    }),

  /**
   * Asks somebody you share a channel with to be a contact. By id, because
   * meeting someone in a channel gives you that and not their address.
   */
  requestContactById: (token: string, accountId: string) =>
    request<{ ok: true; accepted: boolean }>(`/contacts/${accountId}/request`, {
      method: 'POST',
      token,
    }),

  acceptContact: (token: string, contactId: string) =>
    request<{ ok: true }>(`/contacts/${contactId}/accept`, {
      method: 'POST',
      token,
    }),

  declineContact: (token: string, contactId: string) =>
    request<{ ok: true }>(`/contacts/${contactId}/decline`, {
      method: 'POST',
      token,
    }),

  /**
   * Ends a contact, for both of them, and leaves the channels that held only
   * the two of them. The server does the second half; see `leavePairChannels`.
   */
  removeContact: (token: string, contactId: string) =>
    request<{ ok: true }>(`/contacts/${contactId}`, {
      method: 'DELETE',
      token,
    }),

  startChannel: (token: string, contactIds: string[]) =>
    request<{ channelId: string }>('/channels', {
      method: 'POST',
      body: { contactIds },
      token,
    }),

  /**
   * Asks one absent participant to come to a channel, in the sender's words.
   *
   * `text` is optional; without it the notification still says somebody is
   * asking. Refusals here are ordinary and expected rather than faults — they
   * have walked in since the screen was drawn, or were pinged a moment ago —
   * so the caller shows what came back instead of treating it as an error.
   */
  pingParticipant: (
    token: string,
    channelId: string,
    targetId: string,
    text?: string
  ) =>
    request<{ ok: true }>(`/channels/${channelId}/ping`, {
      method: 'POST',
      body: { targetId, text: text ?? null },
      token,
    }),

  mediaToken: (token: string, channelId: string) =>
    request<{ token: string; url?: string }>(
      `/channels/${channelId}/media-token`,
      { method: 'POST', token }
    ),

  /**
   * Loads a recording as its channel's shared track. The channel is the
   * recording's own and is never named here — the server takes it from the
   * row, so a recording cannot be played anywhere but where it was made.
   *
   * Slow on purpose: the mix is encoded from the stems on the way through, the
   * same as an export, so this is a wait of seconds and the caller shows it.
   */
  playRecording: (token: string, recordingId: string) =>
    request<{ track: { id: string; title: string; durationMs: number } }>(
      `/recordings/${recordingId}/play`,
      { method: 'POST', token }
    ),

  /**
   * Marks a recording for deletion. It leaves every list at once and its audio
   * is removed by the sweep a week later, which is the whole of the recovery
   * story and is only reachable by hand.
   */
  deleteRecording: (token: string, recordingId: string) =>
    request<{ ok: true }>(`/recordings/${recordingId}`, {
      method: 'DELETE',
      token,
    }),

  /**
   * Renames a recording, for everybody in its channel rather than only for
   * whoever typed — the name is one shared thing, which is what makes it
   * worth having. The server refuses an empty one; nothing here needs to
   * re-render on success, since the channel snapshot arrives with the new
   * name in it.
   */
  renameRecording: (token: string, recordingId: string, name: string) =>
    request<{ ok: true }>(`/recordings/${recordingId}`, {
      method: 'PATCH',
      body: { name },
      token,
    }),
};
