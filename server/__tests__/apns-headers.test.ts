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
import { ApnsPusher, notifications } from '../src/push';

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
    await pusher().send(['token'], notifications.arrived('Standup', 'Alice', 'chan_1'));

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
      notifications.pinged('Standup', 'Alice', 'we are starting', 'chan_1')
    );

    expect('apns-collapse-id' in requests[0].headers).toBe(false);
  });

  /**
   * Grouping and replacing are different things, and losing the first would be
   * the obvious over-correction for the second: pings should still gather under
   * their channel in Notification Center rather than scattering through it.
   */
  it('still threads a ping under its channel', async () => {
    await pusher().send(
      ['token'],
      notifications.pinged('Standup', 'Alice', null, 'chan_1')
    );

    const aps = requests[0].payload.aps as { 'thread-id': string };
    expect(aps['thread-id']).toBe('chan_1');
  });
});
