import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { HomeView } from '../../../../core/protocol';
import { NOT_OFFERED } from '../install';
import type { Introduction, StepId } from '../introduction';
import { useIntroduction } from '../useIntroduction';

/**
 * The two ways this card ends other than being finished: put away a rung at a
 * time, and put back by *Show the checklist again*.
 *
 * **Both were reported as the same bug**, on 2026-09-13, from opposite ends.
 * The reset handed an established account the one-line *invited* card — whose
 * five stored rungs it had just cleared and four of which that card cannot
 * draw — because clearing the arrival re-derived it, and `arrivalOf` answers
 * *invited* for anybody with a contact. And a rung somebody had read and
 * decided against had no way out at all, the ladder's only exit being to
 * finish it. See `useIntroduction` and
 * `decisions/2026-09-13-the-checklist-has-a-second-exit.md`.
 *
 * The pure half of the dismissal rules is `introduction.test.ts`; this is the
 * half that touches the keychain and the server.
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

const mockForgetTried = jest.fn(async () => ({}));
jest.mock('../../api/http', () => ({
  api: {
    markTried: jest.fn(async () => ({})),
    forgetTried: () => mockForgetTried(),
  },
}));

beforeEach(() => {
  mockKeychain.clear();
  mockForgetTried.mockClear();
});

/**
 * An established account: contacts, a channel, and a conversation behind it.
 * This is the shape the reset was wrong about — `arrivalOf` calls it
 * *invited*, and it is what almost every account looks like by the time
 * anybody reaches for the debug panel.
 */
const established = {
  invites: [],
  rejoinable: [{ channelId: 'c1' }],
  contacts: [{ id: 'them' }],
  tried: { floor: true, nearby: true, guest: true, player: true },
} as unknown as HomeView;

function Probe({
  report,
  onReady,
}: {
  report: (introduction: Introduction) => void;
  onReady: (actions: {
    dismiss: (id: StepId) => void;
    forget: () => Promise<void>;
  }) => void;
}) {
  const { introduction, dismiss, forget } = useIntroduction({
    ready: true,
    token: 'tok',
    home: established,
    conversing: false,
    install: NOT_OFFERED,
  });
  onReady({ dismiss, forget });
  report(introduction);
  return null;
}

/** One mounted card, and the last thing it said. */
async function mount() {
  let latest!: Introduction;
  let actions!: {
    dismiss: (id: StepId) => void;
    forget: () => Promise<void>;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <Probe
        report={(next) => {
          latest = next;
        }}
        onReady={(next) => {
          actions = next;
        }}
      />
    );
  });
  return {
    tree,
    shown: () => latest,
    ids: () =>
      latest.show === 'alone' ? latest.steps.map((step) => step.id) : [],
    dismiss: (id: StepId) => actions.dismiss(id),
    forget: () => actions.forget(),
  };
}

describe('show the checklist again', () => {
  it('draws the whole ladder on an account that has contacts', async () => {
    // The bug, from the outside. Before 2026-09-13 this returned
    // `show: 'invited'` — one line, on an account that had just had five rungs
    // cleared underneath it.
    const card = await mount();
    // It starts retired: conversed, and all four tried.
    mockKeychain.set('thefloor.intro.doneAt', '1700000000000');
    await act(async () => card.forget());

    expect(card.shown().show).toBe('alone');
    expect(card.ids()).toEqual([
      'somebody',
      'stepIn',
      'floor',
      'nearby',
      'guest',
      'player',
    ]);
    await act(async () => card.tree.unmount());
  });

  it('clears what it holds, and asks the server for what it does not', async () => {
    // **The five are cleared in two places and only one of them is here.**
    // `stepIn` is this install's stamp and goes hollow on the tap; the four
    // *try* rungs belong to the account since 2026-09-13 and are read off the
    // Home snapshot, so what this end can do is ask — they fill in when the
    // push that `DELETE /me/tried` triggers brings a snapshot down. This
    // fixture's snapshot still says all four are done, and the honest drawing
    // of that is that they still say done.
    //
    // `somebody` is neither: a standing fact about an account that has a
    // contact, ticked rather than cleared, which is why the reset is five.
    const card = await mount();
    await act(async () => card.forget());

    const shown = card.shown();
    if (shown.show !== 'alone') throw new Error('expected the ladder');
    expect(
      shown.steps.filter((step) => !step.done).map((step) => step.id)
    ).toEqual(['stepIn']);
    expect(mockForgetTried).toHaveBeenCalled();
    await act(async () => card.tree.unmount());
  });

  it('latches the arrival rather than re-arming the latch', async () => {
    // The fix itself, at the key. A cleared key would be re-derived from the
    // snapshot in hand on the very next render, which is what produced the
    // card; the written one survives a relaunch too.
    const card = await mount();
    await act(async () => card.forget());
    expect(mockKeychain.get('thefloor.intro.arrival')).toBe('alone');
    await act(async () => card.tree.unmount());
  });

  it('puts back the rungs that were dismissed by hand', async () => {
    // A reset that left them standing would return somebody to a ladder with
    // holes in it, which is not what *again* says.
    const card = await mount();
    await act(async () => card.dismiss('guest'));
    await act(async () => card.forget());
    expect(card.ids()).toContain('guest');
    expect(mockKeychain.has('thefloor.intro.dismissed')).toBe(false);
    await act(async () => card.tree.unmount());
  });
});

describe('dismissing one rung', () => {
  it('takes it out and writes it down', async () => {
    const card = await mount();
    await act(async () => card.forget());
    expect(card.ids()).toContain('nearby');

    await act(async () => card.dismiss('nearby'));
    expect(card.ids()).not.toContain('nearby');
    expect(mockKeychain.get('thefloor.intro.dismissed')).toBe('nearby');
    await act(async () => card.tree.unmount());
  });

  it('is idempotent, and keeps the order they were put away in', async () => {
    const card = await mount();
    await act(async () => card.forget());
    await act(async () => card.dismiss('player'));
    await act(async () => card.dismiss('floor'));
    await act(async () => card.dismiss('player'));
    expect(mockKeychain.get('thefloor.intro.dismissed')).toBe('player,floor');
    await act(async () => card.tree.unmount());
  });

  it('says nothing to the server, this being about the list', async () => {
    // The distinction the whole feature turns on: a dismissal is not a claim
    // that the thing was done, so the four stamps must not move.
    const card = await mount();
    await act(async () => card.forget());
    mockForgetTried.mockClear();
    await act(async () => card.dismiss('floor'));
    expect(mockForgetTried).not.toHaveBeenCalled();
    await act(async () => card.tree.unmount());
  });

  it('ignores a stored rung this build does not know', async () => {
    // The key is written by a build that may be newer than the one reading it,
    // and a name nothing recognises must be dropped rather than kept as a
    // filter nothing can match.
    mockKeychain.set('thefloor.intro.dismissed', 'guest,parachute');
    const card = await mount();
    await act(async () => card.forget());
    expect(card.ids()).toContain('guest');
    await act(async () => card.tree.unmount());
  });
});
