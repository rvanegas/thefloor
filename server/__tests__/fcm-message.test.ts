import { generateKeyPairSync, verify } from 'node:crypto';

import {
  FcmPusher,
  isDeadFcmToken,
  notifications,
  PARTICIPATION_LIFETIME_MS,
} from '../src/push';

/**
 * What actually goes to Google, which is the sibling of `apns-headers.test.ts`
 * and exists for the same reason: everything else stops at `MemoryPusher`, and
 * the message is composed below that line.
 *
 * Three of the things asserted here fail silently in production. A `ttl` over
 * Google's ceiling rejects the whole message, and rejects it identically to a
 * bad token. A missing `notification.tag` collapses in flight and stacks on the
 * lock screen, which looks like it works until two arrivals land. And a wrong
 * `channel_id` is dropped by Android with nothing logged at either end.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const SERVICE_ACCOUNT = {
  projectId: 'thefloor-test',
  clientEmail: 'pusher@thefloor-test.iam.gserviceaccount.com',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * A `fetch` that answers the exchange and the send, and records both.
 *
 * `sendStatus` and `sendBody` let one test make Google refuse without any of
 * the others having to know that is possible.
 */
function stubFetch(
  captured: Captured[],
  options: { sendStatus?: number; sendBody?: unknown; tokenStatus?: number } = {}
): typeof fetch {
  let minted = 0;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    captured.push({
      url: href,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ''),
    });
    if (href === TOKEN_URL) {
      const status = options.tokenStatus ?? 200;
      minted += 1;
      return new Response(
        JSON.stringify({ access_token: `access-${minted}`, expires_in: 3599 }),
        { status }
      );
    }
    return new Response(JSON.stringify(options.sendBody ?? {}), {
      status: options.sendStatus ?? 200,
    });
  }) as unknown as typeof fetch;
}

/** The bodies of the sends only, parsed, with the exchange filtered out. */
function sends(captured: Captured[]): Array<Record<string, any>> {
  return captured
    .filter((entry) => entry.url !== TOKEN_URL)
    .map((entry) => JSON.parse(entry.body).message);
}

function pusherWith(
  captured: Captured[],
  options: Parameters<typeof stubFetch>[1] = {},
  now: () => number = () => 1_700_000_000_000
): FcmPusher {
  return new FcmPusher(SERVICE_ACCOUNT, now, stubFetch(captured, options));
}

describe('the FCM message', () => {
  it('goes to the project endpoint with the exchanged token', async () => {
    const captured: Captured[] = [];
    await pusherWith(captured).send(
      ['device-1'],
      notifications.pinged('Standup', 'Alice', 'you about?', 'chan-1'),
      'audible'
    );

    const send = captured.find((entry) => entry.url !== TOKEN_URL)!;
    expect(send.url).toBe(
      'https://fcm.googleapis.com/v1/projects/thefloor-test/messages:send'
    );
    expect(send.headers.authorization).toBe('Bearer access-1');
  });

  it('names the channel that matches the alert', async () => {
    for (const alert of ['passive', 'silent', 'audible'] as const) {
      const captured: Captured[] = [];
      await pusherWith(captured).send(
        ['device-1'],
        notifications.arrived('Standup', 'Alice', 'chan-1'),
        alert
      );
      expect(sends(captured)[0].android.notification.channel_id).toBe(alert);
    }
  });

  /**
   * The `apns-priority` exception, transferred. Deferring a ping while its
   * expiry runs loses it rather than quieting it, and the phone least likely
   * to be awake belongs to the person who turned the channel down.
   */
  it('sends a passive arrival at normal priority and a passive ping at high', async () => {
    const arrival: Captured[] = [];
    await pusherWith(arrival).send(
      ['device-1'],
      notifications.arrived('Standup', 'Alice', 'chan-1'),
      'passive'
    );
    expect(sends(arrival)[0].android.priority).toBe('normal');

    const ping: Captured[] = [];
    await pusherWith(ping).send(
      ['device-1'],
      notifications.pinged('Standup', 'Alice', 'you about?', 'chan-1'),
      'passive'
    );
    expect(sends(ping)[0].android.priority).toBe('high');
  });

  /**
   * Both halves of collapsing, or neither. `collapse_key` discards what is
   * still queued at Google; `tag` replaces what is already on screen. APNs
   * does both with one header, so parity needs the pair to move together.
   */
  it('carries collapse_key and tag together, and omits both for a ping', async () => {
    const arrival: Captured[] = [];
    await pusherWith(arrival).send(
      ['device-1'],
      notifications.arrived('Standup', 'Alice', 'chan-1'),
      'silent'
    );
    const android = sends(arrival)[0].android;
    expect(android.collapse_key).toBe('chan-1');
    expect(android.notification.tag).toBe('chan-1');

    const ping: Captured[] = [];
    await pusherWith(ping).send(
      ['device-1'],
      notifications.pinged('Standup', 'Alice', 'you about?', 'chan-1'),
      'audible'
    );
    const pinged = sends(ping)[0].android;
    expect(pinged).not.toHaveProperty('collapse_key');
    expect(pinged.notification).not.toHaveProperty('tag');
  });

  /**
   * Thirty days is an APNs-shaped constant and stays one; FCM's ceiling is
   * four weeks. Unclamped this rejects every invitation to an Android device.
   */
  it('clamps the invitation lifetime to four weeks', async () => {
    expect(PARTICIPATION_LIFETIME_MS / 1000).toBeGreaterThan(2_419_200);

    const captured: Captured[] = [];
    await pusherWith(captured).send(
      ['device-1'],
      notifications.invited('Alice', 'Standup', 'chan-1'),
      'audible'
    );
    expect(sends(captured)[0].android.ttl).toBe('2419200s');
  });

  it('leaves a shorter lifetime alone', async () => {
    const captured: Captured[] = [];
    await pusherWith(captured).send(
      ['device-1'],
      notifications.arrived('Standup', 'Alice', 'chan-1'),
      'silent'
    );
    expect(sends(captured)[0].android.ttl).toBe('300s');
  });

  /**
   * Google refuses a `data` block with anything but strings in it, which is
   * why the app reads `reachesInApp` as either. See `reachesInApp` there.
   */
  it('sends every data value as a string', async () => {
    const captured: Captured[] = [];
    await pusherWith(captured).send(
      ['device-1'],
      notifications.pinged('Standup', 'Alice', 'you about?', 'chan-1'),
      'audible'
    );
    const data = sends(captured)[0].data;
    for (const value of Object.values(data)) {
      expect(typeof value).toBe('string');
    }
    // The one that is a boolean on the APNs side.
    expect(data.reachesInApp).toBe('true');
    expect(data.kind).toBe('pinged');
    expect(data.alert).toBe('audible');
  });
});

describe('the access token', () => {
  it('is exchanged once for a batch and reused inside the window', async () => {
    const captured: Captured[] = [];
    const pusher = pusherWith(captured);
    const message = notifications.arrived('Standup', 'Alice', 'chan-1');

    await pusher.send(['a', 'b', 'c'], message, 'silent');
    await pusher.send(['d'], message, 'silent');

    const exchanges = captured.filter((entry) => entry.url === TOKEN_URL);
    expect(exchanges).toHaveLength(1);
    expect(captured.filter((entry) => entry.url !== TOKEN_URL)).toHaveLength(4);
  });

  it('is exchanged again once the window has passed', async () => {
    const captured: Captured[] = [];
    let clock = 1_700_000_000_000;
    const pusher = pusherWith(captured, {}, () => clock);
    const message = notifications.arrived('Standup', 'Alice', 'chan-1');

    await pusher.send(['a'], message, 'silent');
    clock += 51 * 60 * 1000;
    await pusher.send(['b'], message, 'silent');

    expect(captured.filter((entry) => entry.url === TOKEN_URL)).toHaveLength(2);
  });

  /**
   * The assertion is the half that can be wrong offline. `mintProviderToken`
   * has the DER trap; this one has no equivalent, since RSA has a single
   * encoding — which is worth pinning so nobody copies `ieee-p1363` across.
   */
  it('signs an assertion Google can verify', async () => {
    const captured: Captured[] = [];
    await pusherWith(captured).send(
      ['device-1'],
      notifications.arrived('Standup', 'Alice', 'chan-1'),
      'silent'
    );

    const exchange = captured.find((entry) => entry.url === TOKEN_URL)!;
    const assertion = new URLSearchParams(exchange.body).get('assertion')!;
    const [header, claims, signature] = assertion.split('.');

    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        publicKey,
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);

    const decoded = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(decoded.iss).toBe(SERVICE_ACCOUNT.clientEmail);
    expect(decoded.aud).toBe(TOKEN_URL);
    expect(decoded.scope).toBe(
      'https://www.googleapis.com/auth/firebase.messaging'
    );
  });

  /**
   * A credential fault is not a dead address. Nothing may be pruned on it,
   * and it must not reject — a notification is a courtesy.
   */
  it('reports a failed exchange without pruning anything', async () => {
    const captured: Captured[] = [];
    const results = await pusherWith(captured, { tokenStatus: 401 }).send(
      ['a', 'b'],
      notifications.arrived('Standup', 'Alice', 'chan-1'),
      'silent'
    );

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.status).toBe(0);
      expect(result.dead).toBe(false);
      expect(result.error).toBeDefined();
    }
    // Nothing was attempted against the send endpoint.
    expect(captured.filter((entry) => entry.url !== TOKEN_URL)).toHaveLength(0);
  });
});

describe('which refusals mean the address is gone', () => {
  it('forgets an unregistered token', () => {
    expect(isDeadFcmToken(404, 'UNREGISTERED')).toBe(true);
  });

  /**
   * The three that must never prune. `INVALID_ARGUMENT` is the dangerous one:
   * FCM returns it for a malformed *message* as well as a malformed token, so
   * pruning on it lets a bug in this file empty the device table.
   */
  it.each([
    [400, 'INVALID_ARGUMENT'],
    [403, 'SENDER_ID_MISMATCH'],
    [403, 'THIRD_PARTY_AUTH_ERROR'],
    [401, undefined],
    [429, 'QUOTA_EXCEEDED'],
    [503, 'UNAVAILABLE'],
  ])('keeps the row on %i %s', (status, reason) => {
    expect(isDeadFcmToken(status, reason as string | undefined)).toBe(false);
  });

  it('surfaces the refusal on the result and prunes the dead one', async () => {
    const captured: Captured[] = [];
    const results = await pusherWith(captured, {
      sendStatus: 404,
      sendBody: {
        error: {
          status: 'NOT_FOUND',
          details: [{ errorCode: 'UNREGISTERED' }],
        },
      },
    }).send(
      ['gone'],
      notifications.arrived('Standup', 'Alice', 'chan-1'),
      'silent'
    );

    expect(results[0].reason).toBe('UNREGISTERED');
    expect(results[0].dead).toBe(true);
  });

  it('does not prune a token belonging to another project', async () => {
    const captured: Captured[] = [];
    const results = await pusherWith(captured, {
      sendStatus: 403,
      sendBody: {
        error: {
          status: 'PERMISSION_DENIED',
          details: [{ errorCode: 'SENDER_ID_MISMATCH' }],
        },
      },
    }).send(
      ['other-project'],
      notifications.arrived('Standup', 'Alice', 'chan-1'),
      'silent'
    );

    expect(results[0].reason).toBe('SENDER_ID_MISMATCH');
    expect(results[0].dead).toBe(false);
  });
});
