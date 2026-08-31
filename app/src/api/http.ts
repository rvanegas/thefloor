import type {
  HomeView,
  LeaderboardEntry,
  PublicAccount,
  ProfileView,
  SupportView,
} from '../../../core/protocol';
import type { ImHandles } from '../../../core/im';
import type { NotificationLevel } from '../../../core/notifications';
import type { AccountSettings } from '../../../core/settings';
import type {
  VoiceDeclarations,
  VoiceEntry,
} from '../../../core/transcript';
import { appBuild, BUILD_HEADER, CLIENT_HEADER, CLIENT_KIND } from './build';
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
        // Sent only by the web client. Native leaves it off entirely, because
        // the server reads absence as native — see CLIENT_KIND in build.ts.
        ...(CLIENT_KIND === null ? {} : { [CLIENT_HEADER]: CLIENT_KIND }),
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

/** One guest link as channel settings lists it. */
export interface GuestLinkSummary {
  token: string;
  url: string;
  createdAt: number;
  createdBy: string;
  /** Null while it is live. */
  revokedAt: number | null;
  /** Null when the channel emptying revoked it rather than a person. */
  revokedBy: string | null;
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

  /**
   * Ships the audio log to the server's journal.
   *
   * Refused for any account without the `debug` column, which is the same gate
   * the panel that produces these lines sits behind — so a 403 here is the
   * ordinary answer for everybody else rather than a fault, and the caller
   * treats it as *done with these lines* rather than as something to retry.
   */
  shipDiagnostics: (
    token: string,
    build: number | null,
    lines: Array<{ at: number; text: string }>
  ) =>
    request<{ ok: true; stored: number }>('/diagnostics', {
      method: 'POST',
      token,
      body: { build, lines },
    }),

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
   * Ends every other session this account has, and forgets every other address
   * it can be reached at.
   *
   * The one operation that reaches a session whose token the caller does not
   * hold, which is what makes it the answer to a lost phone. Signing in used
   * to do this by itself until 2026-08-24, when several sessions at once
   * became the ordinary case; it is the same lever, pulled on purpose.
   *
   * The device token travels with it for the reason it travels with
   * `signOut`: the server knows which session is asking and has no way to know
   * which registered address belongs to the same phone, so the caller has to
   * name the one to keep. An install with no notification permission names
   * none and correctly loses them all.
   */
  signOutOthers: (token: string, deviceToken?: string) =>
    request<{ sessions: number }>('/auth/sign-out-others', {
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
    changes: { displayName?: string; im?: ImHandles }
  ) => request<ProfileView>('/me', { method: 'POST', body: changes, token }),

  /**
  /**
   * Asks for a code at an address you would like to sign in with instead.
   *
   * `requestCode` with a session behind it, and the same answer either way —
   * whether the address is already somebody's is not settled here. See the
   * route.
   */
  requestEmailChange: (token: string, identifier: string) =>
    request<{ sent: true }>('/me/email', {
      method: 'POST',
      body: { identifier },
      token,
    }),

  /** Spends the code and moves the account, answering with the new profile. */
  confirmEmailChange: (token: string, identifier: string, code: string) =>
    request<ProfileView>('/me/email/confirm', {
      method: 'POST',
      body: { identifier, code },
      token,
    }),

  /**
   * Writes the settings that follow the account rather than the phone: the
   * colour scheme and whether tapping a channel steps into it. A partial
   * write, like `saveProfile` — whatever is left undefined is left alone.
   *
   * The answer is the whole of the settings, but the caller does not have to
   * apply it: the server tells every session this account holds, this one
   * included, over the socket. See `onSettings`.
   */
  saveSettings: (
    token: string,
    changes: Partial<AccountSettings>
  ) =>
    request<AccountSettings>('/me/settings', {
      method: 'POST',
      body: changes,
      token,
    }),

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

  /**
   * Shows your own sign-in address to one contact, or stops showing it.
   *
   * Yours, about them — which is why it is under `/contacts` and not under the
   * profile it appears on. There is no global setting behind this: an address
   * is given to a named person, and the decision exists once per person.
   *
   * `shown` comes back from the server rather than being assumed from what was
   * sent, the same reasoning `notificationLevel` gives: they agree today, and
   * the caller should be reading the stored answer on the day they do not.
   */
  setEmailShown: (token: string, contactId: string, shown: boolean) =>
    request<{ ok: true; shown: boolean }>(`/contacts/${contactId}/email`, {
      method: shown ? 'POST' : 'DELETE',
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

  /**
   * Sets how loudly this channel may interrupt the person asking.
   *
   * Theirs alone, which is why there is no target: the server takes the actor
   * from the token, the same rule every other call here follows.
   *
   * The reply echoes the stored level rather than the requested one. They agree
   * today, and the day the default moves they will not — asking for `medium`
   * stores nothing, and the honest answer to "what am I set to" then comes from
   * the server rather than from what the client just sent.
   */
  setNotificationLevel: (
    token: string,
    channelId: string,
    level: NotificationLevel
  ) =>
    request<{ level: NotificationLevel }>(
      `/channels/${channelId}/notifications`,
      { method: 'PUT', body: { level }, token }
    ),

  /**
   * Mints a link that lets anybody knock at this channel from a browser.
   *
   * Asked for each time rather than remembered: the server stores links in the
   * clear precisely so the same one can be handed out twice, and a second call
   * mints a second link — so this is called when somebody taps share, and the
   * list below is what settings reads.
   */
  mintGuestLink: (token: string, channelId: string) =>
    request<{ token: string; url: string; createdAt: number }>(
      `/channels/${channelId}/guest-links`,
      { method: 'POST', token }
    ),

  guestLinks: (token: string, channelId: string) =>
    request<{ links: GuestLinkSummary[] }>(
      `/channels/${channelId}/guest-links`,
      { token }
    ),

  /**
   * Shuts one link. Anybody in the room may, not only whoever minted it —
   * and, when nobody is in it, any member. 409 when somebody else is in there;
   * see `hasTheRoom`.
   */
  revokeGuestLink: (token: string, channelId: string, linkToken: string) =>
    request<void>(`/channels/${channelId}/guest-links/${linkToken}`, {
      method: 'DELETE',
      token,
    }),

  /**
   * A link to follow this channel's watch party on another screen.
   *
   * Returns a URL and not a token, deliberately: the credential belongs in the
   * fragment, and the server is the only thing that should be deciding that.
   * A client assembling its own is a client that might put it in the query
   * string, where every proxy and access log between here and there would see
   * it.
   */
  watchLink: (token: string, channelId: string) =>
    request<{ url: string }>(`/channels/${channelId}/watch-token`, {
      method: 'POST',
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

  /**
   * Asks for a recording to be transcribed.
   *
   * Returns as soon as the work has been started rather than when it finishes:
   * the audio is rendered, uploaded and read by a third party, which is not a
   * wait to hold a request open for. What comes back next is a channel
   * snapshot with `transcript.state` moved, the same way a finished mix
   * arrives.
   *
   * **Costs money, once per recording, and sends everybody's audio.** The
   * caller confirms first and names the provider while doing it.
   */
  startTranscript: (token: string, recordingId: string) =>
    request<{ ok: true }>(`/recordings/${recordingId}/transcript`, {
      method: 'POST',
      token,
    }),

  /** The text itself. Only worth asking for once the state says `ready`. */
  transcript: (token: string, recordingId: string) =>
    request<{
      state: 'pending' | 'ready' | 'failed';
      requestedBy: { id: string; displayName: string } | null;
      failure?: string;
      missing: Array<{ identity: string; failure: string | null }>;
      lines: Array<{
        identity: string;
        displayName: string | null;
        speaker: string | null;
        startMs: number;
        endMs: number;
        text: string;
        confidence: number | null;
      }>;
      /**
       * Every voice the provider found, named as it currently is.
       *
       * Includes the ones declared gone, which `lines` no longer carries —
       * the screen that names them has to be able to bring one back.
       */
      voices?: VoiceEntry[];
    }>(`/recordings/${recordingId}/transcript`, { token }),

  /**
   * Says who the voices in a transcript actually were.
   *
   * The whole declaration, every time: the screen holds all of it, and
   * replacing it wholesale is what makes clearing one voice — or all of them,
   * with `{}` — a thing that can be said at all. Nothing is re-transcribed and
   * nothing is spent; this is a view over lines that are never edited.
   */
  declareVoices: (
    token: string,
    recordingId: string,
    voices: VoiceDeclarations
  ) =>
    request<{ ok: true }>(`/recordings/${recordingId}/transcript/voices`, {
      method: 'PUT',
      token,
      body: { voices },
    }),

  /**
   * Every line in this channel's transcripts matching a query.
   *
   * Across every recording in the channel rather than one, which is the
   * difference between this and the filter on the transcript screen — and the
   * reason it is a request rather than a local `filter`: the text of a year of
   * conversation is not something a phone holds.
   */
  searchTranscripts: (token: string, channelId: string, q: string) =>
    request<{
      hits: Array<{
        recordingId: string;
        recordingName: string | null;
        identity: string;
        displayName: string | null;
        speaker: string | null;
        startMs: number;
        endMs: number;
        text: string;
        confidence: number | null;
      }>;
    }>(
      `/channels/${channelId}/transcripts/search?q=${encodeURIComponent(q)}`,
      { token }
    ),

  /**
   * Removes a transcript and leaves the recording.
   *
   * Nothing is refunded — asking again costs again, which is why the caller
   * says so before it does this.
   */
  deleteTranscript: (token: string, recordingId: string) =>
    request<{ ok: true }>(`/recordings/${recordingId}/transcript`, {
      method: 'DELETE',
      token,
    }),
};
