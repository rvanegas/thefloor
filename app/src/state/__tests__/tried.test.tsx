import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { HomeView } from '../../../../core/protocol';
import type { Tried, TriedId } from '../../../../core/tried';
import { NOT_OFFERED } from '../install';
import { useIntroduction } from '../useIntroduction';

/**
 * The four *try* rungs, now that they belong to the account.
 *
 * They lived in four keychain keys until 2026-09-13, per install, so a second
 * device drew all four hollow for somebody who had done all four — see
 * `core/tried.ts`. Three things had to become true, and this is where they
 * are checked: the ladder reads them off the Home snapshot, doing one says so
 * to the server, and an install that ticked any of them before the move hands
 * its answers up exactly once.
 *
 * The server half is `server/__tests__/tried.test.ts`.
 */

const mockKeychain = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

jest.mock('../../audio/diagnostics', () => ({ recordEvent: jest.fn() }));

const mockMarkTried = jest.fn(
  async (_token: string, _ids: readonly TriedId[]) => ({}) as Tried
);
jest.mock('../../api/http', () => ({
  api: {
    markTried: (token: string, ids: readonly TriedId[]) =>
      mockMarkTried(token, ids),
    forgetTried: jest.fn(async () => ({})),
  },
}));

beforeEach(() => {
  mockKeychain.clear();
  // An account that has conversed, so `stepIn` is ticked above the four and
  // `somebody` is not — its one contact is the one it arrived with, which is
  // the starting line rather than an act. The key's name is historical; see
  // `useIntroduction`.
  mockKeychain.set('thefloor.intro.doneAt', '1700000000000');
  mockMarkTried.mockClear();
  mockMarkTried.mockImplementation(async () => ({}) as Tried);
});

/**
 * An established account that has conversed, so of the rungs above the four
 * only `stepIn` is ticked.
 */
const homeWith = (tried?: Tried): HomeView =>
  ({
    invites: [],
    rejoinable: [],
    contacts: [{ id: 'them' }],
    tried,
  }) as unknown as HomeView;

function Probe({
  home,
  report,
  onMark,
}: {
  home: HomeView;
  report: (ticked: string) => void;
  onMark?: (mark: (id: TriedId) => void) => void;
}) {
  const { introduction, markTried: mark } = useIntroduction({
    ready: true,
    token: 'tok',
    home,
    conversing: false,
    install: NOT_OFFERED,
  });
  onMark?.(mark);
  // Which rungs are ticked, in the order they are drawn, so a test can say
  // what the card says without rendering the card.
  const steps = introduction.show === 'ladder' ? introduction.steps : [];
  report(
    steps
      .filter((step) => step.done)
      .map((step) => step.id)
      .join(',')
  );
  return null;
}

/**
 * One mounted ladder, with the last thing it said about the four rungs.
 *
 * `ticked()` rather than a value, because the hand-up lands a render or two
 * after the mount and a snapshot taken at the door would miss it.
 */
async function draw(
  home: HomeView,
  onMark?: (m: (id: TriedId) => void) => void
) {
  let ticked = '';
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <Probe
        home={home}
        report={(next) => {
          ticked = next;
        }}
        onMark={onMark}
      />
    );
  });
  return { tree, ticked: () => ticked };
}

describe('the try rungs off the snapshot', () => {
  it('ticks whatever the account has behind it, on any device', async () => {
    // The whole point of the move: this install has written nothing down and
    // is still told the truth about the account.
    const { tree, ticked } = await draw(
      homeWith({ floor: true, nearby: false, guest: false, player: true })
    );
    expect(ticked()).toBe('stepIn,floor,player');
    await act(async () => tree.unmount());
  });

  it('draws none of them against a server too old to say', async () => {
    // Absence is not a tick. A server that predates the field sends no key,
    // and reading that as *done* would retire the ladder for everybody.
    const { tree, ticked } = await draw(homeWith(undefined));
    expect(ticked()).toBe('stepIn');
    await act(async () => tree.unmount());
  });

  it('tells the server, and ticks before the answer comes back', async () => {
    let mark!: (id: TriedId) => void;
    const { tree, ticked } = await draw(homeWith(), (m) => {
      mark = m;
    });
    expect(ticked()).toBe('stepIn');
    await act(async () => mark('guest'));
    expect(mockMarkTried).toHaveBeenCalledWith('tok', ['guest']);
    // The snapshot in hand still says nothing — the rung is ticked from the
    // optimistic overlay, which is what keeps a walk back to Home honest.
    expect(ticked()).toBe('stepIn,guest');
    await act(async () => tree.unmount());
  });
});

describe('the one-time hand-up', () => {
  it('offers what this install ticked before the account held it', async () => {
    mockKeychain.set('thefloor.intro.tried.floor', '1');
    mockKeychain.set('thefloor.intro.tried.player', '1');
    const { tree, ticked } = await draw(homeWith());

    expect(mockMarkTried).toHaveBeenCalledWith('tok', ['floor', 'player']);
    // Laid over the snapshot at once, so the rungs do not go hollow for the
    // length of a request on the phone that did the things.
    expect(ticked()).toBe('stepIn,floor,player');
    // And the keys are spent, so a second launch offers nothing.
    expect(mockKeychain.has('thefloor.intro.tried.floor')).toBe(false);
    expect(mockKeychain.has('thefloor.intro.tried.player')).toBe(false);
    await act(async () => tree.unmount());
  });

  it('keeps the keys when the offer does not get through', async () => {
    // A dropped connection must not be the moment a fact is lost: the keys
    // stay where they are and the next launch tries again.
    mockMarkTried.mockImplementation(async () => {
      throw new Error('offline');
    });
    mockKeychain.set('thefloor.intro.tried.nearby', '1');
    const { tree } = await draw(homeWith());
    expect(mockKeychain.has('thefloor.intro.tried.nearby')).toBe(true);
    await act(async () => tree.unmount());
  });

  it('says nothing at all for an install with nothing to say', async () => {
    const { tree } = await draw(homeWith());
    expect(mockMarkTried).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});
