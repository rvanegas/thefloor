import React from 'react';
import { act } from 'react-test-renderer';

import { ChannelView } from '../ChannelView';
import {
  AUDIO,
  channelOf,
  findExactButton,
  mockApp,
  render,
  resetHarness,
  showChannel,
  showNotepad,
  textOf,
} from '../testing/harness';

/**
 * The card that says why somebody is in a channel with four people they have
 * never met.
 *
 * **The tests worth having are the three ways it goes wrong quietly.** Drawn
 * on an ordinary channel it is nonsense; drawn on one tab only, most people
 * never see it; and hidden by `hideControlCards` it disappears for exactly the
 * accounts most likely to have switched that on without reading it — which
 * would leave a room of strangers and nothing explaining them.
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

jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

beforeEach(() => {
  resetHarness();
  mockKeychain.clear();
});

/** The screen, with the store's first read settled. */
async function show(cohort: number | null) {
  const channel = channelOf();
  showChannel(channel, [], { cohort });
  const tree = render(
    <ChannelView
      channelId={channel.id}
      audio={AUDIO}
      onClose={() => {}}
      onExit={() => {}}
      onEnterChannel={() => {}}
    />
  );
  // The dismissal list is read asynchronously and the card is withheld until
  // it lands — see `useCohortNotice`, which starts at null rather than false
  // so the card cannot flash and vanish.
  await act(async () => {});
  return tree;
}

const drawn = (tree: Awaited<ReturnType<typeof show>>) =>
  textOf(tree).includes('Your getting-started channel');

describe('the getting-started card', () => {
  it('is not drawn on an ordinary channel', async () => {
    expect(drawn(await show(null))).toBe(false);
  });

  it('is drawn on a cohort, and says what it is and how to leave', async () => {
    const tree = await show(1);
    const text = textOf(tree);

    expect(drawn(tree)).toBe(true);
    // The two things somebody would otherwise assume, and the way out. The
    // wording of the last one has to match the control it names — the alert on
    // the settings screen says *Leave this channel*.
    expect(text).toContain('Nobody here is one of your contacts');
    expect(text).toContain('Leave this channel');
  });

  it('is drawn whichever tab is showing', async () => {
    const tree = await show(1);
    expect(drawn(tree)).toBe(true);

    // It sits above the tab content rather than on one tab, so somebody who
    // lands on the notepad and finds four strangers gets the same answer as
    // somebody who lands on the roster.
    await act(async () => showNotepad(tree));
    expect(drawn(tree)).toBe(true);
  });

  it('goes when it is dismissed, and stays gone', async () => {
    const tree = await show(1);
    await act(async () => findExactButton(tree, 'Got it')!.props.onPress());
    expect(drawn(tree)).toBe(false);

    // Remounted: the card was put away on this install, not merely in this
    // render.
    const again = await show(1);
    expect(drawn(again)).toBe(false);
  });

  it('is not hidden by the setting about repeated controls', async () => {
    // `hideControlCards` governs cards that repeat a pinned control. This card
    // repeats nothing — it is a readout, and STYLE.md § *The cards a footer
    // made redundant* says in as many words that the setting has no claim on
    // one. Hiding it here would be the one shape a channel full of strangers
    // must not have: no reason given.
    mockApp.hideControlCards = true;
    expect(drawn(await show(1))).toBe(true);
  });
});
