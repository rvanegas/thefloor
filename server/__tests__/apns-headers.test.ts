import { EventEmitter } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';

/**
 * What actually goes on the wire to Apple, which is the one part of push that
 * no other test reaches: everything else stops at `MemoryPusher`, and the
 * headers are composed below that line.
 *
 * Worth a file of its own for the collapse header, which is a *conditional*
 * header — the only one here that is sometimes absent, and whose absence is
 * load-bearing rather than incidental. A ping that quietly grew a collapse id
 * would throw away somebody's words at Apple, after this server had already
 * reported success, and nothing short of two phones would notice.
 */

const requests: Array<{
  headers: Record<string, string>;
  payload: Record<string, unknown>;
}> = [];

jest.mock('node:http2', () => {
  const actual = jest.requireActual('node:http2');
  return {
    ...actual,
    connect: () => {
      const session = new EventEmitter() as EventEmitter & {
        closed: boolean;
        destroyed: boolean;
        request: (headers: Record<string, string>) => EventEmitter;
        close: () => void;
      };
      session.closed = false;
      session.destroyed = false;
      session.close = () => {};
      session.request = (headers) => {
        const stream = new EventEmitter() as EventEmitter & {
          setEncoding: () => void;
          setTimeout: () => void;
          close: () => void;
          end: (payload: string) => void;
        };
        stream.setEncoding = () => {};
        stream.setTimeout = () => {};
        stream.close = () => {};
        // Answered on the next tick so the caller has attached its listeners,
        // which is the order the real stream produces anyway.
        stream.end = (payload: string) => {
          requests.push({ headers, payload: JSON.parse(payload) });
          setImmediate(() => {
            stream.emit('response', { ':status': 200 });
            stream.emit('end');
          });
        };
        return stream;
      };
      return session;
    },
  };
});

// `jest.mock` is hoisted above this, so the module under test is built
// against the stub session rather than a real connection to Apple.
import { ApnsPusher, ASKING_THREAD, notifications } from '../src/push';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

function pusher() {
  return new ApnsPusher(
    {
      key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
      keyId: 'ABCDE12345',
      teamId: '9946JKHZUJ',
      bundleId: 'co.rvanegas.thefloor',
      environment: 'production',
    },
    () => 1_700_000_000_000
  );
}

beforeEach(() => {
  requests.length = 0;
});

describe('what a notification asks APNs to replace', () => {
  it('names the channel for everything the channel says about itself', async () => {
    await pusher().send(
      ['token'],
      notifications.arrived('Standup', 'Alice', 'chan_1'),
      'silent'
    );

    expect(requests[0].headers['apns-collapse-id']).toBe('chan_1');
  });

  /**
   * The absence is the assertion. A header carrying `null`, the string
   * "null", or a key made unique per send would all pass a test that only
   * checked two pings differed; this checks that the request is the one APNs
   * documents for a notification that stands alone.
   */
  it('sends no collapse header at all for a ping', async () => {
    await pusher().send(
      ['token'],
      notifications.pinged('Standup', 'Alice', 'we are starting', 'chan_1'),
      'audible'
    );

    expect('apns-collapse-id' in requests[0].headers).toBe(false);
  });

  /**
   * Grouping and replacing are different things, and this is where that stops
   * being a remark about vocabulary: one notification asks APNs to destroy
   * nothing and to join a pile, in the same request, through two headers that
   * do not know about each other.
   */
  it('sends a ping with no collapse header and a thread all the same', async () => {
    await pusher().send(
      ['token'],
      notifications.pinged('Standup', 'Alice', null, 'chan_1'),
      'audible'
    );

    expect('apns-collapse-id' in requests[0].headers).toBe(false);
    const aps = requests[0].payload.aps as { 'thread-id': string };
    expect(aps['thread-id']).toBe(ASKING_THREAD);
  });

  /**
   * The payload the app reads to tidy up after these. iOS never expires a
   * delivered notification, so the phone removes the stale ones itself — and
   * it can only tell them apart if this field is here. Nothing in the server
   * suite would notice its absence, and the symptom on a phone is an old
   * announcement that never goes away.
   */
  it('says which kind it is, so the phone can clear the stale ones', async () => {
    await pusher().send(
      ['token'],
      notifications.arrived('Standup', 'Alice', 'chan_1'),
      'silent'
    );

    expect(requests[0].payload.kind).toBe('arrived');
    expect(requests[0].payload.channelId).toBe('chan_1');
  });

  it('threads an arrival under its own room', async () => {
    await pusher().send(
      ['token'],
      notifications.arrived('Standup', 'Alice', 'chan_1'),
      'silent'
    );

    const aps = requests[0].payload.aps as { 'thread-id': string };
    expect(aps['thread-id']).toBe('chan_1');
  });
});

describe('what a notification is allowed to interrupt', () => {
  it('arrives silently when the channel is talking about itself', async () => {
    await pusher().send(
      ['token'],
      notifications.arrived('Standup', 'Alice', 'chan_1'),
      'silent'
    );

    // Absent, not empty. There is no quiet sound, and `sound: ''` is a value
    // APNs has opinions about rather than a way of asking for silence.
    const aps = requests[0].payload.aps as Record<string, unknown>;
    expect('sound' in aps).toBe(false);
  });

  it('makes a sound for a ping', async () => {
    await pusher().send(
      ['token'],
      notifications.pinged('Standup', 'Alice', 'we are starting', 'chan_1'),
      'audible'
    );

    const aps = requests[0].payload.aps as Record<string, unknown>;
    expect(aps.sound).toBe('default');
  });

  /**
   * Deliberately claiming nothing above the default. `time-sensitive` pierces
   * a Focus mode and `critical` overrides the ring switch, and somebody who
   * has set either has said something a conversation app is not entitled to
   * talk over. Both also cost an entitlement, one of them an argument with
   * Apple — so this is the assertion that stops a future "make the ping more
   * reliable" from quietly becoming an escalation.
   */
  it('never claims an interruption level above the default', async () => {
    for (const alert of ['silent', 'audible'] as const) {
      for (const message of [
        notifications.started('Alice', 'chan_1'),
        notifications.invited('Alice', null, 'chan_1'),
        notifications.arrived('Standup', 'Alice', 'chan_1'),
        notifications.pinged('Standup', 'Alice', null, 'chan_1'),
      ]) {
        await pusher().send(['token'], message, alert);
      }
    }

    for (const request of requests) {
      const aps = request.payload.aps as Record<string, unknown>;
      expect('interruption-level' in aps).toBe(false);
    }
  });

  /**
   * The one rung this app claims, and it is the rung *below* the default.
   * `passive` needs no entitlement and nothing is escalated by it — the
   * notification is filed rather than announced, which is what somebody who
   * turned a channel down was asking for.
   */
  it('asks for the passive level when somebody has turned a channel down', async () => {
    await pusher().send(
      ['token'],
      notifications.arrived('Standup', 'Alice', 'chan_1'),
      'passive'
    );

    const aps = requests[0].payload.aps as Record<string, unknown>;
    expect(aps['interruption-level']).toBe('passive');
    expect('sound' in aps).toBe(false);
    // And the radio is not woken for news about a room, which is the other
    // half of quiet.
    expect(requests[0].headers['apns-priority']).toBe('5');
  });

  it('delivers everything else immediately', async () => {
    await pusher().send(
      ['token'],
      notifications.arrived('Standup', 'Alice', 'chan_1'),
      'audible'
    );

    expect(requests[0].headers['apns-priority']).toBe('10');
  });

  /**
   * Quieting something and losing it are different, and priority 5 crosses
   * that line for a ping: iOS may defer the delivery while the five-minute
   * expiry runs out underneath it, so the phone least likely to be awake —
   * belonging, by definition, to the person who turned this channel down —
   * gets no ping at all and no record that one was sent.
   */
  it('never defers a ping, however quietly it was asked to arrive', async () => {
    await pusher().send(
      ['token'],
      notifications.pinged('Standup', 'Alice', 'come back', 'chan_1'),
      'passive'
    );

    expect(requests[0].headers['apns-priority']).toBe('10');
    // Quiet, still: what it declines to give up is the delivery, not the hush.
    const aps = requests[0].payload.aps as Record<string, unknown>;
    expect(aps['interruption-level']).toBe('passive');
    expect('sound' in aps).toBe(false);
  });
});
