import React from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { type Guest } from '../../../../core/types';
import { type RecordingView } from '../../../../core/protocol';
import { ChannelView, GroupHeading, uploadingLabel } from '../ChannelView';
import { Screen, SectionLabel } from '../components';
import { Alert, KeyboardAvoidingView, Share, TextInput } from 'react-native';
import { PaneContext } from '../layout';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  findButton,
  labelOf,
  linksIn,
  mockApp,
  render,
  resetHarness,
  showChannel,
  textOf,
  uploads,
} from '../testing/harness';

/**
 * The three module mocks. They live in each test file rather than in the
 * harness because `jest.mock` is hoisted above the imports of its own file and
 * of no other — `testing/harness` holds the factories, and the single copy of
 * the state they close over.
 */
jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * The channel screen proper: the floor, recording, uploading, and what the
 * footer does. The largest of these files and still one describe, because it
 * is one screen.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

beforeEach(resetHarness);

describe('Channel', () => {
  it('waits rather than rendering a stale screen before the first snapshot', () => {
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Loading channel');
    expect(mockApp.watchChannel).toHaveBeenCalledWith('sess_1');
    act(() => tree.unmount());
  });

  it('is not emptied by a snapshot for another channel', () => {
    // The app watches several channels and is sent a snapshot for each. This
    // screen reads the one it is about; taking whichever arrived last is what
    // put a live conversation behind "Loading channel…" and hung up its audio.
    showChannel(channelOf());
    mockApp.channelViews['chan_elsewhere'] = {
      ...mockApp.channelViews['sess_1']!,
      channel: { ...channelOf(), id: 'chan_elsewhere' },
      serverNow: NOW + 1000,
    };
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).not.toContain('Loading channel');
    act(() => tree.unmount());
  });

  it('says a gone channel is gone rather than loading forever', () => {
    // An ended channel is kept for half a minute and then deleted, and the
    // server reports it gone. No snapshot is ever coming, so a wait is a lie.
    mockApp.goneChannels = ['sess_1'];
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Channel gone');
    expect(textOf(tree)).not.toContain('Loading channel');
    expect(findButton(tree, 'Back to home')).toBeDefined();
    act(() => tree.unmount());
  });

  /**
   * The rename field lives in this screen's scroll view, and a bare
   * `ScrollView` does not shrink when the keyboard opens: the field ends up
   * underneath it with nothing to scroll to, because the space is there and is
   * merely covered. Every other screen goes through `Screen` for exactly this,
   * and this one hand-rolled its own scroll view and did not — so renaming a
   * recording on a handset meant typing into a field nobody could see.
   *
   * Asserted on the wrapper rather than on `Screen` itself, because what has to
   * hold is the behaviour rather than which component supplies it.
   */
  it('keeps its scroll view inside a keyboard-avoiding wrapper', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(tree.root.findAll((n) => n.type === KeyboardAvoidingView)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('shows the claim control when eligible', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Nobody has the floor');
    expect(text).toContain('Claim the floor');
    act(() => tree.unmount());
  });

  /**
   * The screen somebody lands on with "Tap a channel to step in" turned off.
   *
   * Watching has never been being there — the server has always drawn that
   * line, and every `can…` in core asks about the room rather than the roster
   * — so what is new here is only that the app can now be on this side of it.
   * What the screen must not do is describe a microphone nobody opened.
   */
  it('offers a way in, and no microphone, to somebody who has not stepped in', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    const onExit = jest.fn();
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={onExit}
      />);

    const text = textOf(tree);
    // Sentence case since the two departures stopped sharing a label.
    expect(text).toContain('Step in');
    expect(text).toContain('Nobody can hear you');
    expect(text).not.toContain('Your microphone');
    expect(findButton(tree, 'Step out')).toBeUndefined();
    expect(findButton(tree, 'Mute yourself')).toBeUndefined();
    // The floor is somebody else's business until you are in the room, and the
    // hint says which of the several reasons this is.
    expect(text).toContain('Step in to claim the floor');
    expect(findButton(tree, 'Claim the floor')!.props.accessibilityState)
      .toEqual({ disabled: true });

    // Stepping in stays put: you are already looking at the channel, and the
    // screen fills in around the tap rather than closing and reopening.
    act(() => findButton(tree, 'Step in')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'ENTER' });
    expect(onExit).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * Answering needs presence — `canAnswerKnock` — so offering the door to
   * somebody who has stepped out would be two buttons the reducer refuses.
   * Whoever is actually in the channel is being asked the same question.
   */
  it('does not offer the door to somebody who is not in the room', () => {
    showChannel(
      channelOf((c) => ({
        ...reduce(c, { type: 'STEP_OUT', userId: ME }, NOW),
        knocks: [{ id: 'knock_1', name: 'Sam', at: NOW }],
      }))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(textOf(tree)).not.toContain('is at the door');
    expect(findButton(tree, 'Let them in')).toBeUndefined();
    act(() => tree.unmount());
  });

  /**
   * `hasTheRoom`, seen from the screen. The rule is that nobody reaches into a
   * conversation they are not in, so everything that changes what the people
   * in the channel can see is disabled for somebody looking at it from
   * outside — and every one of them says the same word, "step in", because
   * that is the only way it is ever false.
   *
   * Disabled rather than hidden, unlike the microphone card and the knocks.
   * These are things this person may genuinely do, a tap on Step In from now,
   * and a control that vanished when somebody else walked in would read as a
   * bug rather than as a rule.
   */
  it('disables what belongs to the conversation, for somebody watching it', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: 'acct_3', displayName: 'Miro Okafor' }, status: 'accepted' },
      ],
    };
    // Dana is in there; I am not.
    showChannel(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'STEP_OUT', userId: ME }, NOW),
          {
            type: 'GUEST_ENTERED',
            guest: {
              id: 'guest_dana',
              name: 'Dana',
              admittedAt: NOW,
              maySpeak: false,
              request: 'asking',
            },
          },
          NOW
        )
      ),
      [
        {
          id: 'rec_1',
          channelId: 'sess_1',
          name: 'Book club',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          startedAt: NOW - 60_000,
          endedAt: NOW - 30_000,
          durationMs: 30_000,
        },
      ]
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const disabled = (label: string) => {
      const button = findButton(tree, label);
      expect([label, button !== undefined]).toEqual([label, true]);
      return [label, button!.props.accessibilityState];
    };
    const off = (label: string) => [label, { disabled: true }];

    // The guest's two buttons, which were live to anybody watching and refused
    // by the reducer — and the microphone one renders `primary` while a guest
    // is asking, so the loudest button on the screen was wired to nothing.
    expect(disabled('Let them speak')).toEqual(off('Let them speak'));
    expect(disabled('Remove')).toEqual(off('Remove'));

    expect(disabled('Invite')).toEqual(off('Invite'));
    expect(disabled('Share a guest link')).toEqual(off('Share a guest link'));
    expect(disabled('Paste my clipboard')).toEqual(off('Paste my clipboard'));
    expect(disabled('Play something together')).toEqual(
      off('Play something together')
    );

    const text = textOf(tree);
    expect(text).toContain('Step in to answer for what a guest may do');
    expect(text).toContain('Step in to invite anybody');
    expect(text).toContain('Step in to make a link');
    expect(text).toContain('Step in to put something on the channel clipboard');
    // The shared-audio hint, which is a different sentence and was the one
    // disabled cluster on this screen with nothing explaining itself.
    expect(text).toContain('What everybody is listening to is for whoever is listening');
    // And the list of contacts is still shown rather than emptied by the
    // filter, which would have claimed every contact was already in here.
    expect(text).toContain('Miro Okafor');

    // The recording row's actions are behind a tap, and two of the three are
    // refused. Export is not, and that is the assertion worth having.
    act(() => findButton(tree, 'Book club')!.props.onPress());
    expect(disabled('Rename')).toEqual(off('Rename'));
    expect(disabled('Delete')).toEqual(off('Delete'));
    expect(findButton(tree, 'Export')!.props.accessibilityState).toEqual({
      disabled: false,
    });
    expect(textOf(tree)).toContain('Step in to rename or delete');
    act(() => tree.unmount());
  });

  /**
   * The other half of the rule, and the half that keeps it from locking the
   * absent out of their own channel: an empty channel belongs to all of its
   * members equally, so a member outside one is interrupting nothing.
   */
  it('gives all of it back once nobody is in the channel', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: 'acct_3', displayName: 'Miro Okafor' }, status: 'accepted' },
      ],
    };
    showChannel(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'STEP_OUT', userId: ME }, NOW),
          { type: 'STEP_OUT', userId: THEM },
          NOW
        )
      ),
      [
        {
          id: 'rec_1',
          channelId: 'sess_1',
          name: 'Book club',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          startedAt: NOW - 60_000,
          endedAt: NOW - 30_000,
          durationMs: 30_000,
        },
      ]
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const on = (label: string) =>
      findButton(tree, label)!.props.accessibilityState;

    expect(on('Invite')).toEqual({ disabled: false });
    expect(on('Share a guest link')).toEqual({ disabled: false });
    expect(on('Paste my clipboard')).toEqual({ disabled: false });

    act(() => findButton(tree, 'Book club')!.props.onPress());
    expect(on('Rename')).toEqual({ disabled: false });
    expect(on('Delete')).toEqual({ disabled: false });

    // Still outside, so the things that are about presence for their own
    // reasons are still refused — the rule did not turn into "anything goes
    // in an empty room".
    expect(textOf(tree)).toContain('Step in');
    expect(on('Claim the floor')).toEqual({ disabled: true });
    expect(on('Record')).toEqual({ disabled: true });

    // And since 2026-08-24, putting something on. This asserted the opposite
    // until then: loading a track and starting a party are the two acts that
    // leave something behind for whoever steps in next, so they ask presence
    // where driving what is already there asks only the room. `canLoadTrack`
    // and `canStartWatch` in core.
    expect(on('Play something together')).toEqual({ disabled: true });
    expect(on('Watch something together')).toEqual({ disabled: true });
    // The screen link is not one of them — it changes nothing, and an empty
    // channel is nobody's conversation to intrude on.
    expect(on('Watch on another screen')).toEqual({ disabled: false });
    act(() => tree.unmount());
  });

  /**
   * The same rule one screen in. A channel's name is what the people in it
   * call the place they are in, so it is not for somebody who is somewhere
   * else to change under them — and `canEditChannel` governs the description
   * with it, the two being one question.
   */
  it('will not let somebody outside the conversation rename the channel', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const fields = tree.root.findAll((node) => node.type === TextInput);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(field.props.editable).toBe(false);
    expect(textOf(tree)).toContain('Step in to rename this channel');

    // Leaving is not covered, and must not be: giving up your own membership
    // is yours whatever anybody else is doing.
    expect(findButton(tree, 'Leave channel')!.props.accessibilityState).toEqual(
      { disabled: false }
    );
    act(() => tree.unmount());
  });

  it('says plainly that a silenced user is still being recorded', () => {
    // Being unheard is easily mistaken for being unrecorded, and someone might
    // speak freely on that assumption. The capture is complete; only the export
    // omits them.
    let channel = channelOf((s) =>
      reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW)
    );
    channel = reduce(channel, { type: 'START_RECORDING', userId: THEM, runId: 'rec_1' }, NOW);
    showChannel(channel);

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('still being recorded');
    expect(text).toContain('left out of the exported recording');
    act(() => tree.unmount());
  });

  it('says a recording failed rather than showing it as never started', () => {
    // Silence about this is the specific fault: the indicator promised audio
    // was being kept while nothing was captured at all.
    let channel = channelOf();
    channel = {
      ...channel,
      recording: {
        ...channel.recording,
        failure: 'no supported codec is compatible with all outputs',
      },
    };
    showChannel(channel);

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Recording failed');
    expect(text).toContain('no supported codec');
    // And it can be attempted again: the failure is stated above the button,
    // which is offered unchanged rather than relabelled about it.
    expect(findButton(tree, 'Record')).toBeDefined();
    act(() => tree.unmount());
  });

  it('shows a disconnected party as present but reconnecting', () => {
    // Not "left": they are still in the channel, still hold whatever they
    // hold, and have a minute to come back.
    const channel = channelOf();
    showChannel({ ...channel, disconnectedAt: { [THEM]: NOW - 5_000 } });

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Present · reconnecting…');
    expect(text).not.toContain('Stepped out');
    act(() => tree.unmount());
  });

  it('warns that the room is not reaching somebody, ahead of the server', () => {
    // The earliest thing anybody can be told, and the reason it exists: the
    // server has noticed nothing — `disconnectedAt` is empty — because it
    // cannot until the heartbeat fails. The media plane already knows, and
    // whoever is mid-sentence is the person who needs telling.
    const channel = channelOf();
    showChannel(channel);

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={{ ...AUDIO, failing: [THEM] }}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Present · not receiving you');
    expect(text).not.toContain('Present · reconnecting…');
    act(() => tree.unmount());
  });

  it('says nothing about your own connection on your own row', () => {
    // Your connection failing is already said once, in the first person, on
    // the audio status line. Said again here it would be the same failure
    // reported twice, one of them phrased as though you were watching yourself
    // from outside.
    const channel = channelOf();
    showChannel(channel);

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={{ ...AUDIO, failing: [ME] }}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).not.toContain('not receiving you');
    act(() => tree.unmount());
  });

  it('reflects being silenced by the other party', () => {
    showChannel(
      channelOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Dana Chu has the floor — your mic is cut');
    expect(text).toContain('cannot claim the floor while you are silenced');
    act(() => tree.unmount());
  });

  it('counts down against the server clock, not the device clock', () => {
    const claimed = channelOf((s) =>
      reduce(s, { type: 'CLAIM_FLOOR', userId: ME }, NOW)
    );
    showChannel(claimed);
    // Device clock is irrelevant; serverNow decides. 40s into a 60s claim,
    // said in seconds — the claim cannot reach a minute, so a clock face would
    // spend its left digit on a zero.
    mockApp.serverNow = () => NOW + 40_000;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('20s');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('dispatches a claim rather than mutating anything locally', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const claim = findButton(tree, 'Claim the floor');
    expect(claim).toBeDefined();
    expect(claim!.props.accessibilityState.disabled).toBe(false);
    act(() => claim!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'CLAIM_FLOOR' });
    act(() => tree.unmount());
  });

  it('offers to load a track when there is none', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(findButton(tree, 'Play something together')).toBeDefined();
    act(() => tree.unmount());
  });

  /**
   * An upload that has stalled looks exactly like one that is working, and
   * before this there was nothing to do about either. The percentage says
   * which it is and Cancel is the way out; both of them are about the middle
   * of an upload, so all of this happens while the promise is still open.
   */
  it('counts an upload up and offers a way out of it', async () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    await act(async () => {
      findButton(tree, 'Play something together')!.props.onPress();
    });

    // The picker has closed and the bytes have not moved: there is no
    // percentage yet, and a Cancel with nothing to cancel is offered and
    // refused rather than hidden and then appearing.
    expect(textOf(tree)).toContain('Uploading…');
    expect(textOf(tree)).not.toContain('%');
    expect(findButton(tree, 'Cancel upload')!.props.disabled).toBe(true);

    const cancel = jest.fn();
    act(() => uploads[0]!.hooks.onStart!(cancel));
    act(() => uploads[0]!.hooks.onProgress!(42));
    expect(textOf(tree)).toContain('Uploading… 42%');

    act(() => findButton(tree, 'Cancel upload')!.props.onPress());
    expect(cancel).toHaveBeenCalled();

    // Cancelling is a decision rather than a failure, so the screen goes back
    // to offering the upload and says nothing about an error.
    await act(async () => uploads[0]!.finish({ cancelled: true }));
    expect(findButton(tree, 'Cancel upload')).toBeUndefined();
    expect(findButton(tree, 'Play something together')).toBeDefined();
    expect(textOf(tree)).not.toContain('Uploading');
    act(() => tree.unmount());
  });

  it('says what failed, and stops uploading, when an upload fails', async () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    await act(async () => {
      findButton(tree, 'Play something together')!.props.onPress();
    });
    await act(async () => uploads[0]!.fail(new Error('Cannot reach the server.')));

    expect(textOf(tree)).toContain('Cannot reach the server.');
    expect(findButton(tree, 'Cancel upload')).toBeUndefined();
    expect(findButton(tree, 'Play something together')!.props.disabled)
      .toBeFalsy();
    act(() => tree.unmount());
  });

  it('has a label for an upload whose size the platform will not say', () => {
    // -1 expected bytes reaches the screen as a null percentage, and a button
    // reading "Uploading… null%" is worse than one that only says it is busy.
    expect(uploadingLabel(null)).toBe('Uploading…');
    expect(uploadingLabel(0)).toBe('Uploading… 0%');
    expect(uploadingLabel(100)).toBe('Uploading… 100%');
  });

  it('shows the track and its position against the server clock', () => {
    showChannel(
      channelOf((s) => {
        const withTrack = reduce(
          s,
          {
            type: 'SET_TRACK',
            userId: ME,
            track: { id: 'trk_1', title: 'Kind of Blue', durationMs: 120_000 },
          },
          NOW
        );
        return reduce(withTrack, { type: 'PLAY', userId: ME }, NOW);
      })
    );
    mockApp.serverNow = () => NOW + 30_000;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Kind of Blue');
    expect(text).toContain('0:30');
    expect(text).toContain('2:00');
    expect(findButton(tree, 'Pause')).toBeDefined();
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The mechanic, at the point where it is visible: the other party's claim
   * takes the controls away without taking the music away.
   */
  it('disables the controls, but not playback, while they hold the floor', () => {
    showChannel(
      channelOf((s) => {
        const withTrack = reduce(
          s,
          {
            type: 'SET_TRACK',
            userId: ME,
            track: { id: 'trk_1', title: 'Kind of Blue', durationMs: 120_000 },
          },
          NOW
        );
        const playing = reduce(withTrack, { type: 'PLAY', userId: ME }, NOW);
        return reduce(playing, { type: 'CLAIM_FLOOR', userId: THEM }, NOW);
      })
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(textOf(tree)).toContain('Dana Chu has the floor, so they decide what plays');
    expect(findButton(tree, 'Pause')!.props.accessibilityState.disabled).toBe(
      true
    );
    expect(findButton(tree, '+15s')!.props.accessibilityState.disabled).toBe(
      true
    );
    expect(findButton(tree, 'Louder')!.props.accessibilityState.disabled).toBe(
      true
    );
    act(() => tree.unmount());
  });

  it('seeks by dispatching a position rather than moving anything locally', () => {
    showChannel(
      channelOf((s) =>
        reduce(
          s,
          {
            type: 'SET_TRACK',
            userId: ME,
            track: { id: 'trk_1', title: 'Kind of Blue', durationMs: 120_000 },
          },
          NOW
        )
      )
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, '+15s')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SEEK',
      positionMs: 15_000,
    });
    act(() => tree.unmount());
  });

  it('warns that a dropped connection counts as leaving, once it has lasted', () => {
    jest.useFakeTimers();
    showChannel(channelOf());
    mockApp.status = 'connecting';
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    // Held back at first: foregrounding drops the socket every time, and this
    // warning is alarming enough that crying wolf on it teaches people to
    // ignore it.
    expect(textOf(tree)).not.toContain('dropped connection counts as leaving');

    act(() => void jest.advanceTimersByTime(3_000));
    expect(textOf(tree)).toContain('dropped connection counts as leaving');
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('renders a roster and generalised copy with four people', () => {
    let channel = createChannel({
      id: 'sess_1',
      initiator: ME,
      invitees: [THEM, 'acct_3', 'acct_4'],
      now: NOW,
    });
    channel = reduce(channel, { type: 'ENTER', userId: THEM }, NOW);
    channel = reduce(channel, { type: 'ENTER', userId: 'acct_3' }, NOW);
    channel = reduce(channel, { type: 'CLAIM_FLOOR', userId: 'acct_3' }, NOW);
    showChannel(channel);

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    // Named after who else is in it, two names and a count — not "4 people",
    // which threw away names the same screen goes on to list.
    expect(text).toContain('Dana Chu, Miro Okafor and 1 other');
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('Priya Raman');
    // acct_4 was invited and has never entered. "Invited" rather than
    // "Waiting for them to join", which it read until 2026-08-20: the roster
    // now has a genuine waiting state for somebody who is holding on for
    // *others*, and two adjacent rows both beginning "Waiting" meant opposite
    // things — one person who has not come, one who has and is still there.
    expect(text).toContain('Invited');
    // The holder is named wherever the claim bites.
    expect(text).toContain('Miro Okafor has the floor — your mic is cut');
    expect(text).toContain("Silenced by Miro Okafor's floor claim.");
    act(() => tree.unmount());
  });

  it('offers to invite an accepted contact who is not in the channel', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: 'acct_3', displayName: 'Miro Okafor' }, status: 'accepted' },
      ],
    };
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const invite = findButton(tree, 'Invite');
    expect(invite).toBeDefined();
    act(() => invite!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'INVITE',
      contactId: 'acct_3',
    });
    act(() => tree.unmount());
  });

  it('closes without giving up presence or the connection', () => {
    // The whole point of the change. Stepping out dispatches STEP_OUT and
    // unwatches; closing the screen must do neither, or the snapshot that
    // proves you are still present disappears and the connection above goes
    // with it.
    const onClose = jest.fn();
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={onClose}
        onExit={() => {}}
      />
    );

    const close = findButton(tree, 'Close');
    expect(close).toBeDefined();
    act(() => close!.props.onPress());

    expect(onClose).toHaveBeenCalled();
    expect(mockApp.act).not.toHaveBeenCalled();
    expect(mockApp.leaveChannelView).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * **Which device the button is about**, which is the whole of what it had
   * been getting wrong.
   *
   * The roster is one account's answer and the button is one device's
   * question, and a snapshot only carries the first. A second phone opening a
   * channel its owner is already in read `present` as though it described
   * itself, offered Step out, and connected the audio — and since the media
   * room admits one participant per account, the two devices then took it from
   * each other in turn. `standingIn` is the fact the roster cannot carry.
   */
  it('offers a way in on a device that is not the one standing there', () => {
    showChannel(channelOf());
    // The account is in the channel; this copy of the app is not what is
    // holding it. `showChannel` assumes the ordinary case, so this is the
    // line that makes it the two-device one.
    mockApp.standingIn = null;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Step out')).toBeUndefined();
    const stepIn = findButton(tree, 'Step in');
    expect(stepIn).toBeDefined();
    // And it says which of the two "not in it" cases this is, rather than the
    // copy for a channel nobody is in.
    expect(textOf(tree)).toContain('not on this device');
    expect(textOf(tree)).not.toContain('without being in it');

    act(() => stepIn!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'ENTER' });
    act(() => tree.unmount());
  });

  /**
   * The server says so only when another session *acts*, and when it has, the
   * screen can name the reason instead of describing the state.
   */
  it('names the other device once the server has said so', () => {
    showChannel(channelOf());
    mockApp.standingIn = null;
    mockApp.displaced = true;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Step in')).toBeDefined();
    expect(textOf(tree)).toContain('on another device');
    act(() => tree.unmount());
  });

  /**
   * A channel nobody is in is the third case, and must keep its own words —
   * the two above are about being present somewhere you are not holding, and
   * this is about not being present at all.
   */
  it('keeps the plain copy for a channel this account is not in', () => {
    const channel = reduce(channelOf(), { type: 'STEP_OUT', userId: ME }, NOW);
    showChannel(channel);
    mockApp.standingIn = null;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Step in')).toBeDefined();
    expect(textOf(tree)).toContain('without being in it');
    expect(textOf(tree)).not.toContain('not on this device');
    act(() => tree.unmount());
  });

  it('offers only stepping out on the channel screen', () => {
    // Leaving lives in settings. Beside Step out, in the colour reserved for
    // danger, it drew the eye straight to the least likely action.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    const stepOut = findButton(tree, 'Step out');
    expect(stepOut).toBeDefined();
    // Bare: no sublabel and no heading over it. Somebody reaching for this one
    // knows what it does, and the words were saying so a second time.
    expect(labelOf(stepOut!)).not.toContain('You stay a member');
    expect(findButton(tree, 'Leave channel')).toBeUndefined();

    act(() => stepOut!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    act(() => tree.unmount());
  });

  it('orders the screen by what somebody in a conversation reaches for', () => {
    // Roughly by how often it is wanted, and pinned here because the order is
    // a decision rather than an accident of how the JSX was written. It has
    // changed twice already: the floor used to sit at the top, inviting
    // directly under the roster, and the clipboard between the audio cards —
    // and this test is what noticed each time. The three audio sections are
    // contiguous on purpose, which is the constraint most easily broken by
    // adding a section in the obvious place.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    const order = [
      // The floor is first among the controls as of 2026-08-31, directly under
      // the roster. It was fifth — under the microphone and under the
      // departure — which put the one mechanic the application is named after
      // below a readout about yourself and at the same weight as the guest
      // link. It is about the roster above it: it decides who among those
      // people may be heard.
      'The floor',
      'Your microphone',
      // Sentence case now, with the rest of them. It was "Step Out",
      // capitalised, because one label served both departures and flipped to
      // "Step In" when you were not present; splitting them left nothing for
      // the capital to distinguish. The lowercase hazard the capital guarded
      // against is gone with the text search — this reads the `SectionLabel`s
      // themselves, so a "step out" in some card's prose cannot be mistaken
      // for the heading.
      'Step out',
      'Shared clipboard',
      // Above the audio rather than below it, moved 2026-08-23. Both are
      // things the channel can be attending to and only one can be, so the
      // order is a claim about which is reached for first — and a party is a
      // deliberate act somebody sets up, where a track is loaded and left.
      'Watch together',
      'Shared audio',
      'Recording',
      'Recordings',
      'Invite',
      // Last, and absent from this list until the structural read insisted on
      // it. A list that named eight of nine sections was only ever checking
      // the eight it happened to name.
      'Guest link',
    ];
    /*
      Read off the `SectionLabel`s themselves rather than by searching the
      flattened text for each word.
      **The search version was quietly wrong and this move is what exposed it**:
      the watch card's own prose contained the word "Recording", so
      `indexOf('Recording')` found a sentence rather than the heading, and the
      order it computed depended on which cards happened to mention each
      other. It passed for the wrong reason until the card moved above the one
      whose name it mentioned.
    */
    const labels = tree.root
      .findAll((node) => node.type === SectionLabel)
      .map((node) => labelOf(node).trim());
    expect(labels).toEqual(order);

    /*
      And the seams, in among the sections rather than checked apart from
      them. Two groups, not ten equal sections: everything before the first
      heading is the conversation — the room, the floor, your microphone, the
      way out — and the headings are the only thing on this screen that says
      the sections below them are a different kind of thing.

      Read as one interleaved sequence on purpose. Asking separately whether
      both headings render would pass with either of them in the wrong run,
      which is the only way this can actually go wrong.
    */
    const structure = tree.root
      .findAll(
        (node) => node.type === SectionLabel || node.type === GroupHeading
      )
      .map((node) => labelOf(node).trim());
    expect(structure).toEqual([
      'The floor',
      'Your microphone',
      'Step out',
      'What the channel is carrying',
      'Shared clipboard',
      'Watch together',
      'Shared audio',
      'Recording',
      'Recordings',
      'Who gets in',
      'Invite',
      'Guest link',
    ]);
    act(() => tree.unmount());
  });

  /*
    Pinned rather than scrolled, and asserted on the prop because nothing else
    can see it. `Screen` renders `header` as a sibling above the ScrollView, so
    handing it there is the whole of what "fixed" means — and both arrangements
    flatten to the same string, so a text search reads a header that scrolls
    away and one that does not as identical.
  */
  it('pins the channel header rather than scrolling it away', () => {
    showChannel(
      channelOf((s) =>
        reduce(
          s,
          {
            type: 'SET_DESCRIPTION',
            userId: THEM,
            description: 'Reading Dune on Thursdays.',
          },
          NOW
        )
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);

    // Where you are and the two ways out of it, which is what has to stay: on
    // the longest screen in the application, the way off it used to be a flick
    // away from wherever anybody actually was.
    expect(textOf(header)).toContain('Dana Chu');
    expect(findButton(header, 'Close')).toBeDefined();
    expect(findButton(header, 'Settings')).toBeDefined();

    // And the description stayed behind, in the scroll. It is prose of any
    // length, and a pinned header is the one place on this screen that cannot
    // afford something that grows. Asserted against a description the channel
    // actually has, so that the absence means something.
    expect(textOf(tree)).toContain('Reading Dune on Thursdays.');
    expect(textOf(header)).not.toContain('Reading Dune on Thursdays.');
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  /**
   * The one way out, and the same word for it in both panes.
   *
   * **It was two buttons and three cases until 2026-09-01**: *Home* on a
   * phone, *Close* in the detail pane, and neither there while you were
   * present — because closing the conversation you were talking in, then
   * putting Contacts in the pane beside it, left somebody in a call with
   * nothing on screen saying so. The tier answers that from above: the pane
   * this closes into carries the live bar whichever list it is showing. So
   * there is one prop, one word, and no case where the screen cannot be
   * dismissed.
   */
  const headerOf = (element: React.ReactElement) => {
    const tree = render(element);
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    return { tree, header: render(screen!.props.header) };
  };

  it('offers Close on a phone', () => {
    showChannel(channelOf());
    const closed = jest.fn();
    const { tree, header } = headerOf(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={closed}
        onExit={() => {}}
      />
    );
    expect(findButton(header, 'Home')).toBeUndefined();
    act(() => findButton(header, 'Close')!.props.onPress());
    expect(closed).toHaveBeenCalled();
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  it('offers the same Close in the detail pane', () => {
    showChannel(channelOf());
    const closed = jest.fn();
    const { tree, header } = headerOf(
      <PaneContext.Provider value="detail">
        <ChannelView
          channelId="sess_1"
          audio={AUDIO}
          onClose={closed}
          onExit={() => {}}
        />
      </PaneContext.Provider>
    );
    expect(findButton(header, 'Home')).toBeUndefined();
    act(() => findButton(header, 'Close')!.props.onPress());
    expect(closed).toHaveBeenCalled();
    // And Settings is still there, so the header did not simply fail to draw.
    expect(findButton(header, 'Settings')).toBeDefined();
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  /*
    The recording indicator joins them while a recording runs, and only then.
    It marked the top of the scroll, so the one fact somebody needs at every
    moment — that they are being captured — was the first thing to leave the
    viewport.
  */
  it('pins the recording indicator, and only while one is running', () => {
    showChannel(channelOf());
    const idle = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const [idleScreen] = idle.root.findAll((node) => node.type === Screen);
    const idleHeader = render(idleScreen.props.header);
    expect(textOf(idleHeader)).not.toContain('Recording');
    act(() => idleHeader.unmount());
    act(() => idle.unmount());

    showChannel(
      channelOf((c) =>
        reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW)
      )
    );
    const live = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const [liveScreen] = live.root.findAll((node) => node.type === Screen);
    const liveHeader = render(liveScreen.props.header);
    expect(textOf(liveHeader)).toContain('Recording');
    act(() => liveHeader.unmount());
    act(() => live.unmount());
  });

  /*
    The footer, rendered on its own for two reasons. It is passed through
    `Screen`'s `footer` slot, which is the whole of what "pinned" means and is
    invisible to a text search — and its Step out shares a label with the card
    further down the screen, so `findButton` over the whole tree would find
    whichever comes first rather than the one meant.
  */
  const footerOf = (tree: ReactTestRenderer) => {
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    return render(screen.props.footer);
  };

  it('pins three controls under the conversation', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    // Present and unmuted with nobody else here: mute is yours to use, the
    // floor is not (it wants two people), and stepping out always is.
    expect(textOf(footer)).toContain('Mute');
    expect(textOf(footer)).toContain('Claim');
    expect(textOf(footer)).toContain('Step out');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /*
    Every label says the act it would perform rather than the state it is in —
    the icon and its colour carry the state, so a label reading "Muted" would
    leave nothing on the control saying what a tap does.

    Muted and holding the floor are asserted separately because they cannot
    both hold: claiming the floor is holding it open to speak, so the reducer
    clears the self-mute. Written as one case first, which is how that was
    found — the footer was right and the fixture was impossible.
  */
  it('flips the mute label when you have muted yourself', () => {
    showChannel(
      channelOf((c) =>
        reduce(c, { type: 'SET_SELF_MUTE', userId: ME, muted: true }, NOW)
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);
    expect(textOf(footer)).toContain('Unmute');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  it('flips the floor label while you hold it', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'CLAIM_FLOOR', userId: ME }, NOW))
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);
    expect(textOf(footer)).toContain('Release');
    // And the mute goes back to offering a mute, the claim having cleared it.
    expect(textOf(footer)).toContain('Mute');
    expect(textOf(footer)).not.toContain('Unmute');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  it('greys what the reducer would refuse, and never the way out', () => {
    // Outside the room. The mute is not yours — the microphone is shut and
    // muting it changes nothing anybody can hear — and the floor wants
    // presence. Step in is the one thing that must stay live, since it is the
    // only control on this bar that could get you the other two.
    showChannel(
      channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    expect(findButton(footer, 'Mute')!.props.accessibilityState.disabled).toBe(true);
    expect(findButton(footer, 'Claim')!.props.accessibilityState.disabled).toBe(true);
    const stepIn = findButton(footer, 'Step in')!;
    expect(stepIn.props.accessibilityState.disabled).toBe(false);

    act(() => stepIn.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'ENTER' });
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  it('acts on the same actions the cards send', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    act(() => findButton(footer, 'Mute')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_SELF_MUTE',
      muted: true,
    });

    act(() => findButton(footer, 'Step out')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    // Stepping out of the footer leaves the screen exactly as the card does —
    // the view is dropped and the caller told, not just the reducer poked.
    expect(mockApp.leaveChannelView).toHaveBeenCalledWith('sess_1');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /**
   * The one setting on this screen that is about the reader rather than about
   * the channel. It shows what they are on, and every level says in a sentence
   * what it does — "Quiet" in particular has to make clear that notifications
   * still arrive, or the people who want exactly it avoid it.
   */
  it('offers the three notification levels, on the default', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const quiet = findButton(tree, 'Quiet');
    const pings = findButton(tree, 'Pings only');
    const everything = findButton(tree, 'Everything');
    expect(quiet).toBeDefined();
    expect(everything).toBeDefined();
    expect(labelOf(quiet!)).toContain('pings included');
    // The default is the one shown as chosen, without anybody having chosen
    // it. Compared against a sibling rather than against a colour, so this
    // says "one of them is marked" without pinning the palette.
    const background = (button: typeof pings) =>
      JSON.stringify(button!.props.style({ pressed: false }));
    expect(background(pings)).not.toEqual(background(quiet));
    expect(background(quiet)).toEqual(background(everything));
    act(() => tree.unmount());
  });

  it('sends the level somebody taps, and shows it as chosen', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    act(() => findButton(tree, 'Quiet')!.props.onPress());

    expect(mockApp.setNotificationLevel).toHaveBeenCalledWith('sess_1', 'low');
    act(() => tree.unmount());
  });

  it('keeps leaving in settings, plain rather than alarming', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const leave = findButton(tree, 'Leave channel');
    expect(leave).toBeDefined();
    expect(labelOf(leave!)).toContain('Removes it from your home screen');
    // Behind a confirmation, so the tap alone dispatches nothing.
    act(() => leave!.props.onPress());
    expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', {
      type: 'LEAVE_CHANNEL',
    });
    act(() => tree.unmount());
  });

  it('offers the last member a delete rather than a leave', () => {
    // With somebody else there it merely removes you. Alone, the same tap
    // destroys the channel, and that is when the colour is telling the truth.
    showChannel(
      channelOf((s) => reduce(s, { type: 'LEAVE_CHANNEL', userId: THEM }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    // Not "Leave": for the last member the control is a different action with
    // a different name, because what it does is destroy the channel and
    // everything recorded in it.
    expect(findButton(tree, 'Leave channel')).toBeUndefined();
    expect(labelOf(findButton(tree, 'Delete channel')!)).toContain(
      'destroys it for good'
    );
    act(() => tree.unmount());
  });

  it('opens the system output picker from settings', async () => {
    // Ours to place, not ours to build: iOS knows what is connected and this
    // app cannot — nothing in the audio stack tells JavaScript what outputs
    // exist. So the button raises the system sheet and nothing more.
    const { AudioSession } = require('@livekit/react-native');
    AudioSession.showAudioRoutePicker.mockClear();

    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const picker = findButton(tree, 'Choose where sound comes out');
    expect(picker).toBeDefined();
    await act(async () => picker!.props.onPress());
    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('lists the recordings made in it, which is where they now live', async () => {
    // They were on Home, which put every conversation anyone had ever recorded
    // into one list belonging to nothing. A recording belongs to the channel:
    // it is what names it, and what deleting takes it with.
    showChannel(channelOf(), [
      {
        id: 'rec_1',
        channelId: 'sess_1',
        name: 'Book club',
        others: [{ id: THEM, displayName: 'Dana Chu' }],
        startedAt: NOW - 60_000,
        endedAt: NOW - 30_000,
        durationMs: 30_000,
      },
    ]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Book club');
    expect(text).not.toContain('Nothing recorded here yet');

    // Closed until asked: the list is what this section is for, and the
    // actions belong to whichever row somebody has opened.
    expect(findButton(tree, 'Export')).toBeUndefined();
    act(() => findButton(tree, 'Book club')!.props.onPress());

    // Exported under the recording's own name, which the server fixed when the
    // run stopped — not a label rebuilt here from the roster, which is how two
    // people came to call one recording two different things.
    const { exportRecording } = require('../../api/download');
    exportRecording.mockClear();
    await act(async () => findButton(tree, 'Export')!.props.onPress());
    expect(exportRecording).toHaveBeenCalledWith(
      'token',
      'rec_1',
      'Book club',
      NOW - 30_000
    );
    act(() => tree.unmount());
  });

  it('offers to play one, and says who decides when it cannot', () => {
    // Playing loads the recording as the channel's shared track, so the rule
    // is the one that already governs a track: whoever holds the floor decides
    // what plays. A disabled button with no reason beside it is the thing this
    // avoids.
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };

    showChannel(channelOf(), [recording]);
    const mine = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(mine, 'Tuesday')!.props.onPress());
    expect(findButton(mine, 'Play')!.props.disabled).toBeFalsy();
    act(() => mine.unmount());

    showChannel(
      channelOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW)),
      [recording]
    );
    const theirs = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(theirs, 'Tuesday')!.props.onPress());
    expect(findButton(theirs, 'Play')!.props.disabled).toBe(true);
    expect(textOf(theirs)).toContain('the floor decides what plays');
    act(() => theirs.unmount());
  });

  it('opens a recording to its actions, and closes it again', async () => {
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    // Export, Rename and Delete rather than Play, which is also the name of
    // the shared audio control further up the screen.
    for (const label of ['Export', 'Rename', 'Delete']) {
      expect(findButton(tree, label)).toBeUndefined();
    }

    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    for (const label of ['Export', 'Rename', 'Delete']) {
      expect(findButton(tree, label)).toBeDefined();
    }

    // One row's worth of actions at a time: tapping it again puts them away.
    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    expect(findButton(tree, 'Delete')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('asks before deleting one, and marks it when told to', async () => {
    // Deleting is marking: it leaves every list now and the audio goes in the
    // sweep a week later. Everyone in the channel loses it, which is why this
    // is the one row action that asks first.
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Tuesday')!.props.onPress());

    const { Alert } = require('react-native');
    const asked = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { api } = require('../../api/http');
    const deleted = jest
      .spyOn(api, 'deleteRecording')
      .mockResolvedValue({ ok: true } as never);

    act(() => findButton(tree, 'Delete')!.props.onPress());
    expect(asked).toHaveBeenCalled();
    // Nothing has happened yet — the question is the point.
    expect(deleted).not.toHaveBeenCalled();

    // Take the destructive choice the alert offered.
    const actions = asked.mock.calls[0][2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const confirm = actions.find((a) => a.style === 'destructive')!;
    await act(async () => confirm.onPress!());
    expect(deleted).toHaveBeenCalledWith('token', 'rec_1');

    asked.mockRestore();
    deleted.mockRestore();
    act(() => tree.unmount());
  });

  it('renames one from the row, starting on the name it already has', async () => {
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Tuesday')!.props.onPress());

    const { api } = require('../../api/http');
    const renamed = jest
      .spyOn(api, 'renameRecording')
      .mockResolvedValue({ ok: true } as never);

    act(() => findButton(tree, 'Rename')!.props.onPress());
    // The field takes the place of the actions, so nothing destructive sits
    // beside a keyboard somebody is typing into.
    expect(findButton(tree, 'Delete')).toBeUndefined();
    // And it says who else this reaches, before the tap rather than after.
    expect(textOf(tree)).toContain('Everyone in this channel sees the new name');

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'What was this conversation?'
    )[0];
    // Amending, not starting over: the current name is already in it.
    expect(field.props.value).toBe('Tuesday');

    // An empty name is refused here rather than at the server, since clearing
    // one is not a thing a recording can be.
    act(() => field.props.onChangeText('   '));
    expect(findButton(tree, 'Save')!.props.disabled).toBe(true);

    act(() => field.props.onChangeText('Tuesday planning'));
    await act(async () => findButton(tree, 'Save')!.props.onPress());
    expect(renamed).toHaveBeenCalledWith('token', 'rec_1', 'Tuesday planning');

    // Done: the row is back to offering actions, and the new name arrives on
    // the next snapshot rather than being patched in here.
    expect(findButton(tree, 'Delete')).toBeDefined();

    renamed.mockRestore();
    act(() => tree.unmount());
  });

  it('abandons a rename when the row is closed', async () => {
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    act(() => findButton(tree, 'Rename')!.props.onPress());
    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    // Reopening offers the actions again, not the half-typed name of something
    // somebody had already changed their mind about.
    expect(findButton(tree, 'Rename')).toBeDefined();
    act(() => tree.unmount());
  });

  it('survives a server too old to send them', () => {
    // The field is additive, so a build carrying this screen meets a server
    // without it between its release and the deploy that follows.
    showChannel(channelOf());
    mockApp.channelViews['sess_1'] = {
      ...mockApp.channelViews['sess_1']!,
      recordings: undefined as never,
    };
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Nothing recorded here yet');
    act(() => tree.unmount());
  });

  it('no longer counts elapsed time', () => {
    // A channel is permanent, so time since it was created says nothing.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).not.toContain('elapsed');
    act(() => tree.unmount());
  });

  it('renders the ended state', () => {
    // One leaves and the last deletes, which is the only thing that ends a
    // channel now.
    showChannel(
      channelOf((s) => {
        const half = reduce(s, { type: 'LEAVE_CHANNEL', userId: THEM }, NOW);
        return reduce(half, { type: 'DELETE_CHANNEL', userId: ME }, NOW);
      })
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Channel ended');
    act(() => tree.unmount());
  });

  it('shows the channel name as the header, with the roster kept below', () => {
    showChannel(
      channelOf((s) =>
        reduce(s, { type: 'SET_NAME', userId: THEM, name: 'Book club' }, NOW)
      )
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Book club');
    // Under a channel name the roster is the only place the other party's
    // name appears, so it must carry it even in a 1:1 — which the card does
    // unconditionally, the old status line having spelt it only sometimes.
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });

  it('renders the description under the title, above the roster', () => {
    showChannel(
      channelOf((s) =>
        reduce(
          s,
          {
            type: 'SET_DESCRIPTION',
            userId: THEM,
            description: 'Reading **Dune**, see [notes](https://example.com).',
          },
          NOW
        )
      )
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    // The markup is gone and the words remain.
    expect(text).toContain('Reading');
    expect(text).toContain('Dune');
    expect(text).toContain('notes');
    expect(text).not.toContain('**Dune**');
    expect(text).not.toContain('https://example.com');

    // The link is a link, and the roster still follows it. Host nodes only:
    // findAll matches the composite and the host element for one <Text>.
    expect(linksIn(tree)).toEqual(['notes']);
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });

  it('shows nothing where the description would be when there is none', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(linksIn(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it('edits the description in settings, with a preview', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Links, a reading list, what this is for…'
    )[0];
    act(() => field.props.onChangeText('See [notes](https://notes.example)'));

    // The preview renders it, so nobody has to save to find out what it
    // becomes. A URL of its own, because the card's help text quotes
    // example.com as an illustration and would match either way.
    expect(textOf(tree)).toContain('Preview');
    expect(textOf(tree)).not.toContain('](https://notes.example)');
    expect(linksIn(tree)).toContain('notes');

    // Tapping the way back straight from the field keeps it, which is the trap
    // the old pair of Save buttons set: Done sat above both and discarded.
    act(() => findButton(tree, 'Close')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_DESCRIPTION',
      description: 'See [notes](https://notes.example)',
    });
    act(() => tree.unmount());
  });

  it('opens settings, and saving a name dispatches SET_NAME', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    const settings = findButton(tree, 'Settings');
    expect(settings).toBeDefined();
    act(() => settings!.props.onPress());
    expect(textOf(tree)).toContain('Channel settings');

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'What is this channel about?'
    )[0];
    act(() => field.props.onChangeText('Book club'));
    // No Save button: leaving the field is what keeps it.
    expect(findButton(tree, 'Save name')).toBeUndefined();
    act(() => field.props.onBlur());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_NAME',
      name: 'Book club',
    });

    // And it does not close the screen out from under somebody who was also
    // going to write a description.
    expect(textOf(tree)).toContain('Channel settings');
    act(() => findButton(tree, 'Close')!.props.onPress());
    expect(textOf(tree)).toContain('The floor');
    act(() => tree.unmount());
  });
});
