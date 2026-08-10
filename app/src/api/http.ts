import type { HomeView, PublicAccount } from '../../../core/protocol';
import { API_URL } from './config';

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

  signOut: (token: string) =>
    request<void>('/auth/sign-out', { method: 'POST', token }),

  home: (token: string) => request<HomeView>('/home', { token }),

  requestContact: (token: string, identifier: string) =>
    request<{ ok: true; accepted: boolean }>('/contacts/request', {
      method: 'POST',
      body: { identifier },
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

  startSession: (token: string, contactId: string) =>
    request<{ sessionId: string }>('/sessions', {
      method: 'POST',
      body: { contactId },
      token,
    }),

  mediaToken: (token: string, sessionId: string) =>
    request<{ token: string; url?: string }>(
      `/sessions/${sessionId}/media-token`,
      { method: 'POST', token }
    ),
};
