import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { HomeView } from '../../../../core/protocol';
import { NOT_OFFERED } from '../install';
import { useIntroduction } from '../useIntroduction';

/**
 * The checklist coming back on an account that finished with it months ago,
 * reported as "I regularly see *You have not stepped in yet*" by somebody who
 * plainly had.
 *
 * **The cause is a null token that means two different things.** `AppProvider`
 * starts at `token: null` and restores the real one from the mockKeychain in an
 * effect, so every cold launch passes through a frame that is indistinguishable
 * from a sign-out — and the sign-out path is the one place that *deletes* both
 * `thefloor.intro.*` keys. So the retirement was being wiped at every launch,
 * the arrival was re-latched from the snapshot then in hand, and an established
 * account with contacts latches `invited`. With no invitation actually pending
 * the card has no name to show, which is the fallback sentence that was
 * reported.
 *
 * `ready` is the signal that tells the two apart: it is false until the
 * mockKeychain read has resolved, whatever it found. See `useIntroduction`.
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

/** An established account: one contact, and no invitation waiting. */
const home = {
  invites: [],
  rejoinable: [],
  contacts: [{ id: 'them' }],
  recordings: [],
} as unknown as HomeView;

function Probe({
  ready,
  token,
  report,
}: {
  ready: boolean;
  token: string | null;
  report: (show: string) => void;
}) {
  const { introduction } = useIntroduction({
    ready,
    token,
    home,
    conversing: false,
    install: NOT_OFFERED,
  });
  report(introduction.show);
  return null;
}

/** One cold launch: the null frame, then the restored token. */
async function coldLaunch(): Promise<string> {
  let show = '';
  const report = (next: string) => {
    show = next;
  };
  let tree: ReturnType<typeof renderer.create>;
  await act(async () => {
    tree = renderer.create(
      <Probe ready={false} token={null} report={report} />
    );
  });
  await act(async () => {
    tree!.update(<Probe ready token="auth" report={report} />);
  });
  await act(async () => {});
  return show;
}

beforeEach(() => {
  mockKeychain.clear();
});

test('a cold launch does not wipe an account that has already finished', async () => {
  mockKeychain.set('thefloor.intro.arrival', 'alone');
  mockKeychain.set('thefloor.intro.doneAt', '1757700000000');

  const show = await coldLaunch();

  expect(mockKeychain.get('thefloor.intro.doneAt')).toBe('1757700000000');
  // **The symptom, stated as the symptom.** Since the four *try* rungs landed,
  // a stamped account is not necessarily finished — it may have the ladder
  // still, with what is left on it. What it must never be is `invited`, which
  // is the card that was appearing, and which on this account has no name to
  // show and falls back to *You have not stepped in yet*.
  expect(show).not.toBe('invited');
});

test('signing out still clears both keys', async () => {
  mockKeychain.set('thefloor.intro.arrival', 'alone');
  mockKeychain.set('thefloor.intro.doneAt', '1757700000000');

  await act(async () => {
    renderer.create(<Probe ready token={null} report={() => {}} />);
  });

  expect(mockKeychain.has('thefloor.intro.doneAt')).toBe(false);
  expect(mockKeychain.has('thefloor.intro.arrival')).toBe(false);
});
