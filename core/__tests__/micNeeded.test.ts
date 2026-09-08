import { createChannel, reduce } from '../channel';
import type { ChannelState } from '../types';
import { channelHasAudio, microphoneNeeded } from '../micNeeded';

/**
 * The one rule, since 2026-09-08: **a session is held if and only if the phone
 * is stepped in.**
 *
 * This file used to be a decision table over the roster, the watch party and
 * shared playback, on the principle that being in an empty channel should cost
 * the speakers nothing. That principle is reversed — see `micNeeded.ts` — so
 * most of what was tested here is now tested by its absence: the rows that
 * asked *who else is here* have gone, and what is left pins the two predicates
 * apart at the one place they still differ, which is a guest.
 */

const ME = 'user-me';
const THEM = 'user-them';
const T0 = 1_700_000_000_000;

const alone = () =>
  createChannel({ id: 'c1', initiator: ME, invitees: [THEM], now: T0 });

const together = () =>
  reduce(alone(), { type: 'ENTER', userId: THEM }, T0 + 1_000);

const stepOut = (state: ChannelState, who: string) =>
  reduce(state, { type: 'STEP_OUT', userId: who }, T0 + 8_000);

const mute = (state: ChannelState, who: string) =>
  reduce(state, { type: 'SET_SELF_MUTE', userId: who, muted: true }, T0 + 6_000);

const asGuest = (state: ChannelState, maySpeak: boolean): ChannelState => ({
  ...state,
  guests: {
    guest_1: {
      id: 'guest_1',
      name: 'A visitor',
      admittedAt: T0,
      maySpeak,
      request: 'none',
    },
  },
});

describe('the microphone, which follows your own mode and nobody else’s', () => {
  it('is open alone in an empty channel, which is the reversal', () => {
    // The row that changed. Under the old rule this was false and the whole
    // point of the rule; now the claim is what standing in a room *is*, so an
    // arriving voice is heard rather than waited for.
    expect(microphoneNeeded(alone(), ME)).toBe(true);
  });

  it('is open with somebody else present', () => {
    expect(microphoneNeeded(together(), ME)).toBe(true);
  });

  it('does not move when somebody else arrives or leaves', () => {
    // The occupancy clause is gone, and this is what that means: the roster is
    // not an input, so nobody else's coming and going crosses the category
    // boundary a Bluetooth handover sits on.
    expect(microphoneNeeded(together(), ME)).toBe(microphoneNeeded(alone(), ME));
    expect(microphoneNeeded(stepOut(together(), THEM), ME)).toBe(true);
  });

  it('is not open for somebody who has stepped out', () => {
    const s = stepOut(together(), ME);
    expect(s.present).not.toContain(ME);
    expect(microphoneNeeded(s, ME)).toBe(false);
  });

  it('is not open for somebody nearby, which is what nearby means', () => {
    const s = reduce(
      together(),
      { type: 'DECLARE_NEARBY', userId: ME },
      T0 + 9_000
    );
    expect(s.waiting).toContain(ME);
    expect(microphoneNeeded(s, ME)).toBe(false);
    expect(channelHasAudio(s, ME)).toBe(false);
  });

  it('is not open for a member of a channel they are not standing in', () => {
    expect(microphoneNeeded(alone(), THEM)).toBe(false);
  });

  it('stays open through a self-mute, which is about what you send', () => {
    // Muting is not stepping out: a muted person still hears the room, still
    // holds the claim, and is still an occupant. The device is held open and
    // the intent handles the rest — see `useSessionAudio`.
    expect(microphoneNeeded(mute(together(), ME), ME)).toBe(true);
  });

  it('is not open for a guest with no speech grant', () => {
    // The one place the two predicates still part company, and it is
    // permanent: opening a device microphone that nothing is allowed to carry
    // would buy the whole call-profile handover to publish nothing.
    const s = asGuest(alone(), false);
    expect(microphoneNeeded(s, 'guest_1')).toBe(false);
    expect(channelHasAudio(s, 'guest_1')).toBe(true);
  });

  it('is open for a guest who may speak', () => {
    const s = asGuest(alone(), true);
    expect(microphoneNeeded(s, 'guest_1')).toBe(true);
  });
});

describe('the claim on the audio system, which is stepping in and nothing else', () => {
  it('is held alone in an empty channel', () => {
    expect(channelHasAudio(alone(), ME)).toBe(true);
  });

  it('is not held by somebody who has stepped out', () => {
    expect(channelHasAudio(stepOut(together(), ME), ME)).toBe(false);
  });

  it('is held through a watch party, the film being on another device', () => {
    // The watch-party clause left both predicates. The Floor carries no video
    // — each person's player follows a transport clock — so an exclusive claim
    // here does not silence the film, and occupants mute while it runs, which
    // is ordinary self-mute.
    const withTrack = reduce(
      together(),
      {
        type: 'SET_TRACK',
        userId: ME,
        track: { id: 'trk_1', title: 'A film', durationMs: 60_000 },
      },
      T0 + 5_000
    );
    expect(channelHasAudio(withTrack, ME)).toBe(true);
    expect(microphoneNeeded(withTrack, ME)).toBe(true);
  });
});
