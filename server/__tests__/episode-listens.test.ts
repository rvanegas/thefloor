import { USAGE_RETENTION_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { EPISODE_PROBE_BYTES, startsAnEpisode } from '../src/usage';

/**
 * Starts of a published episode, counted.
 *
 * **Two halves, and the first is the one with the judgement in it.** A media
 * player asks for one file a dozen times — a probe, the moov atom at the end,
 * then chunks forward — and `episode_listens` holds no address and no session,
 * so there is nothing to tell a second request from a second listener except
 * what the request asks for. `startsAnEpisode` is that whole decision, and it
 * is tested here as a pure function because it is a rule rather than a detail
 * of a route.
 *
 * **The second half is what is deliberately not recorded**, which is
 * `nav.test.ts`' reason exactly. This is the first thing this application
 * measures about somebody who has no account, was never in the channel and
 * agreed to nothing; /privacy now says the tally holds nobody and stops at the
 * published pages, and the only thing keeping either sentence true is the
 * shape of the table. So the shape is asserted rather than left to the schema
 * comment — a column added here in good faith a year from now fails a test
 * instead of quietly falsifying a published promise.
 *
 * The route that calls it is covered in `publication.test.ts` § *the
 * enclosure*, against a real transcode.
 */

let app: App;
let clock = 1_700_000_000_000;

const T0 = 1_700_000_000_000;

beforeEach(() => {
  clock = T0;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

/** A file big enough that the probe threshold is the constant, not the size. */
const WHOLE = 5_000_000;

describe('what counts as starting an episode', () => {
  it('counts a request with no range at all', () => {
    // The whole file in one reply. A download, and the least ambiguous start
    // there is.
    expect(startsAnEpisode(null, WHOLE)).toBe(true);
  });

  it('counts an open-ended range from the first byte', () => {
    // `bytes=0-`, which parseRange has already resolved against the length.
    // This is what a browser sends when it actually means to play something.
    expect(startsAnEpisode({ start: 0, end: WHOLE - 1 }, WHOLE)).toBe(true);
  });

  it('does not count the probe that arrives just before it', () => {
    // `bytes=0-1`. Safari and several podcast apps ask this to find out
    // whether ranges are honoured, and then ask for audio — so counting it
    // would double every listen from those players rather than add a stray
    // one.
    expect(startsAnEpisode({ start: 0, end: 1 }, WHOLE)).toBe(false);
    expect(startsAnEpisode({ start: 0, end: 0 }, WHOLE)).toBe(false);
    // The boundary is the constant, and it is asserted on both sides so that
    // moving it is a deliberate act.
    expect(
      startsAnEpisode({ start: 0, end: EPISODE_PROBE_BYTES - 1 }, WHOLE)
    ).toBe(false);
    expect(startsAnEpisode({ start: 0, end: EPISODE_PROBE_BYTES }, WHOLE)).toBe(
      true
    );
  });

  it('does not count a read that begins anywhere else', () => {
    // Somebody already listening: the chunks of a stream in progress, or a
    // seek. Neither is a new play, and both outnumber the starts.
    expect(startsAnEpisode({ start: 1, end: WHOLE - 1 }, WHOLE)).toBe(false);
    expect(startsAnEpisode({ start: WHOLE - 100, end: WHOLE - 1 }, WHOLE)).toBe(
      false
    );
  });

  it('does not count the moov atom read at the end of the file', () => {
    // `bytes=-50` reaches here as a read near the end, parseRange having
    // turned the suffix into absolute offsets. ffprobe and several players
    // send one before playing anything at all.
    expect(startsAnEpisode({ start: WHOLE - 50, end: WHOLE - 1 }, WHOLE)).toBe(
      false
    );
  });

  it('still counts a file shorter than a probe', () => {
    // No real episode is a few hundred bytes, but the threshold is capped by
    // the file so that such a thing could not become permanently uncountable
    // by being smaller than the constant — which is the kind of silence that
    // reads as "nobody listened".
    const tiny = 500;
    expect(startsAnEpisode({ start: 0, end: tiny - 1 }, tiny)).toBe(true);
    expect(startsAnEpisode(null, tiny)).toBe(true);
  });
});

describe('the tally', () => {
  const listen = (recordingId = 'rec_1', channelId = 'chn_1') =>
    app.channels.usage.recordListen({ channelId, recordingId });

  const rows = () =>
    app.db
      .prepare(
        `SELECT channel_id AS channelId, recording_id AS recordingId,
                day, count
           FROM episode_listens
          ORDER BY day, recording_id`
      )
      .all() as Array<{
      channelId: string;
      recordingId: string;
      day: string;
      count: number;
    }>;

  it('adds to one row per episode per day rather than inserting rows', () => {
    listen();
    listen();
    listen();

    // Three plays, one row. A row per play would have carried a time to the
    // millisecond, which for an episode nobody has found yet is very nearly an
    // identity whatever the columns are called.
    expect(rows()).toEqual([
      { channelId: 'chn_1', recordingId: 'rec_1', day: '2023-11-14', count: 3 },
    ]);
  });

  it('keeps episodes and days apart', () => {
    listen('rec_1');
    listen('rec_2');
    clock += 36 * 60 * 60 * 1000;
    listen('rec_1');

    expect(rows()).toEqual([
      { channelId: 'chn_1', recordingId: 'rec_1', day: '2023-11-14', count: 1 },
      { channelId: 'chn_1', recordingId: 'rec_2', day: '2023-11-14', count: 1 },
      { channelId: 'chn_1', recordingId: 'rec_1', day: '2023-11-16', count: 1 },
    ]);
  });

  it('holds no column that could name anybody', () => {
    // The assertion that matters most, and the reason this file exists. An
    // account, an address, a user agent or a timestamp finer than the day
    // would each make the report better and each falsify /privacy, which now
    // says this tally is attached to nobody.
    const columns = (
      app.db.prepare('PRAGMA table_info(episode_listens)').all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);

    expect(columns).toEqual(['channel_id', 'recording_id', 'day', 'count']);
  });

  it('survives the sweep and the erasure of an account', () => {
    listen();
    // Neither rule the rest of the meter obeys applies: there is nobody in
    // these rows to have a thirty-day history or a right to be forgotten, and
    // the question — is this episode being listened to — is asked over the
    // life of the episode. `nav_counts` departs the same way and for the same
    // reason.
    app.channels.usage.sweep(T0 + USAGE_RETENTION_MS * 2);
    app.channels.usage.forget('acc_whoever');

    expect(rows()).toEqual([
      { channelId: 'chn_1', recordingId: 'rec_1', day: '2023-11-14', count: 1 },
    ]);
  });
});
