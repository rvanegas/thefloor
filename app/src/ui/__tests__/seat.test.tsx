import React from 'react';
import { act } from 'react-test-renderer';

import type { GuestView } from '../../../../core/protocol';
import { SeatView } from '../SeatView';
import {
  findButton,
  mockApp,
  render,
  resetHarness,
  textOf,
} from '../testing/harness';

jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * The screen a seat gets in the app, which is not the channel screen.
 *
 * **What these tests are actually holding is the boundary.** A seat is sent
 * `GuestView` and nothing else — names, no ids, no recordings, no roster — so
 * everything here is written against that type alone, and a test that reached
 * for a `ChannelState` to set something up would be describing a screen this
 * one deliberately is not. See planning/GUEST-LADDER.md and
 * planning/decisions/2026-09-22-a-seat-rides-the-member-socket.md.
 */

const SEAT: GuestView = {
  channelId: 'sess_1',
  channelName: 'Alice and Bob',
  you: {
    id: 'guest_1',
    name: 'Dana',
    mic: 'listening',
    silenced: false,
    accountId: 'acct_me',
    canAsk: true,
    publishConsent: false,
  },
  others: [
    { name: 'Alice', kind: 'member', speaking: false },
    { name: 'Bob', kind: 'member', speaking: true },
  ],
  asks: [],
  invites: [],
  recording: false,
  clip: null,
  serverNow: 1_700_000_000_000,
};

const seatOf = (mutate: (v: GuestView) => GuestView = (v) => v): GuestView =>
  mutate({ ...SEAT, you: { ...SEAT.you }, others: [...SEAT.others] });

describe('the seat screen', () => {
  beforeEach(() => {
    resetHarness();
  });

  it('says whose room it is and that you are a guest of it', () => {
    // The standing above the name, because every other thing this screen does
    // or refuses follows from it.
    const tree = render(<SeatView view={seatOf()} onClose={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Guest');
    expect(text).toContain('Alice and Bob');
    // Names, and nothing that means anything elsewhere.
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
    act(() => tree.unmount());
  });

  it('offers the microphone to somebody who has not asked, and sends the ask', () => {
    const tree = render(<SeatView view={seatOf()} onClose={() => {}} />);
    expect(textOf(tree)).toContain('You are listening');
    act(() => findButton(tree, 'Ask to speak')!.props.onPress());
    expect(mockApp.actAsSeat).toHaveBeenCalledWith('sess_1', {
      type: 'REQUEST_SPEECH',
    });
    act(() => tree.unmount());
  });

  it('withholds the ask when the room has no microphone left', () => {
    // `canAsk` is the server's own reading of the two-guest ceiling, so the
    // control is absent in exactly the case the reducer would refuse — and
    // the sentence says why rather than leaving a gap.
    const full = seatOf((v) => ({ ...v, you: { ...v.you, canAsk: false } }));
    const tree = render(<SeatView view={full} onClose={() => {}} />);
    expect(findButton(tree, 'Ask to speak')).toBeUndefined();
    expect(textOf(tree)).toContain('Two guests have the microphone');
    act(() => tree.unmount());
  });

  it('draws the mute control only once there is a microphone to mute', () => {
    const listening = render(<SeatView view={seatOf()} onClose={() => {}} />);
    expect(findButton(listening, 'Mute')).toBeUndefined();
    act(() => listening.unmount());

    const open = seatOf((v) => ({ ...v, you: { ...v.you, mic: 'open' } }));
    const tree = render(<SeatView view={open} onClose={() => {}} />);
    act(() => findButton(tree, 'Mute')!.props.onPress());
    expect(mockApp.actAsSeat).toHaveBeenCalledWith('sess_1', {
      type: 'SET_SELF_MUTE',
      muted: true,
    });
    act(() => tree.unmount());
  });

  it('flips the mute label once muted, as the footer does everywhere', () => {
    const muted = seatOf((v) => ({ ...v, you: { ...v.you, mic: 'muted' } }));
    const tree = render(<SeatView view={muted} onClose={() => {}} />);
    expect(findButton(tree, 'Mute')).toBeUndefined();
    act(() => findButton(tree, 'Unmute')!.props.onPress());
    expect(mockApp.actAsSeat).toHaveBeenCalledWith('sess_1', {
      type: 'SET_SELF_MUTE',
      muted: false,
    });
    act(() => tree.unmount());
  });

  it('says when somebody else’s claim is why the room cannot hear you', () => {
    // The floor's one remaining appearance on a guest's screen, and
    // withholding it would be the failure the microphone sentences exist to
    // prevent: somebody talking into a room that is not listening.
    const silenced = seatOf((v) => ({
      ...v,
      you: { ...v.you, mic: 'open', silenced: true },
    }));
    const tree = render(<SeatView view={silenced} onClose={() => {}} />);
    expect(textOf(tree)).toContain('Somebody has the floor');
    act(() => tree.unmount());
  });

  it('says a recording is running, for as long as it is', () => {
    const quiet = render(<SeatView view={seatOf()} onClose={() => {}} />);
    expect(textOf(quiet)).not.toContain('being recorded');
    act(() => quiet.unmount());

    const running = seatOf((v) => ({ ...v, recording: true }));
    const tree = render(<SeatView view={running} onClose={() => {}} />);
    expect(textOf(tree)).toContain('being recorded');
    act(() => tree.unmount());
  });

  it('steps out of the room and leaves the screen with it', () => {
    const closed = jest.fn();
    const tree = render(<SeatView view={seatOf()} onClose={closed} />);
    act(() => findButton(tree, 'Step out')!.props.onPress());
    expect(mockApp.actAsSeat).toHaveBeenCalledWith('sess_1', {
      type: 'STEP_OUT',
    });
    expect(closed).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('closes without stepping out, which is the other way off the screen', () => {
    const closed = jest.fn();
    const tree = render(<SeatView view={seatOf()} onClose={closed} />);
    act(() => findButton(tree, 'Back to Home')!.props.onPress());
    expect(closed).toHaveBeenCalled();
    expect(mockApp.actAsSeat).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('answers a member’s contact ask, both ways', async () => {
    const asked = seatOf((v) => ({
      ...v,
      asks: [{ askerId: 'acct_3', from: 'Alice' }],
    }));
    const tree = render(<SeatView view={asked} onClose={() => {}} />);
    expect(textOf(tree)).toContain('Alice would like to add you as a contact');

    // Refusing is a channel action, and the refusal is kept rather than
    // swallowed — one is a question nobody answered, the other is a no.
    act(() => findButton(tree, 'No thanks')!.props.onPress());
    expect(mockApp.actAsSeat).toHaveBeenCalledWith('sess_1', {
      type: 'REFUSE_CONTACT',
      askerId: 'acct_3',
    });
    act(() => tree.unmount());
  });

  it('shows no invitation to make an account, this seat having one', () => {
    // `GuestView.invites` is empty for a seat with an account behind it, which
    // every seat in the app is — the screen exists only for those.
    const tree = render(<SeatView view={seatOf()} onClose={() => {}} />);
    expect(textOf(tree)).not.toContain('should be on The Floor');
    act(() => tree.unmount());
  });

  it('reads the channel’s clipboard and offers to replace it', () => {
    const empty = render(<SeatView view={seatOf()} onClose={() => {}} />);
    expect(textOf(empty)).toContain('Nothing on the clipboard');
    // Nothing to clear when there is nothing on it.
    expect(findButton(empty, 'Clear')).toBeUndefined();
    act(() => empty.unmount());

    const withClip = seatOf((v) => ({
      ...v,
      clip: {
        id: 'clip_1',
        authorId: 'guest_1',
        pastedAt: v.serverNow,
        kind: 'text' as const,
        text: 'https://example.com',
      },
    }));
    const tree = render(<SeatView view={withClip} onClose={() => {}} />);
    expect(textOf(tree)).toContain('https://example.com');
    act(() => findButton(tree, 'Clear')!.props.onPress());
    expect(mockApp.actAsSeat).toHaveBeenCalledWith('sess_1', {
      type: 'CLEAR_CLIP',
    });
    act(() => tree.unmount());
  });
});
