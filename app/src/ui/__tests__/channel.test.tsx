import React from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { type Guest } from '../../../../core/types';
import { type RecordingView } from '../../../../core/protocol';
import { ChannelView, uploadingLabel } from '../ChannelView';
import { Screen, SectionLabel, Segmented } from '../components';
import { BellIcon, StepIcon } from '../icons';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
} from 'react-native';
import { colors, radius } from '../theme';
import { PaneContext } from '../layout';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  findButton,
  findExactButton,
  labelOf,
  mockApp,
  render,
  resetHarness,
  showChannel,
  showInvites,
  showNotepad,
  showPlayer,
  showRecordings,
  showMembers,
  showWatch,
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
  /**
   * Every line of text currently drawn in `colors.danger`, as strings.
   *
   * By style rather than by wording, because what is being tested is that the
   * red and the word cannot drift apart — a test that looked for the sentence
   * would have passed throughout the period the roster said "Nearby" in it.
   * Identity comparison is safe: `colors` builds one value per key at import
   * and every style holds that same object.
   */
  /**
   * Every label drawn in the colour reserved for a microphone somebody else
   * has shut — which since 2026-09-15 is the whole of what says so. See
   * `colors.silenced`, and the footer's `tone`.
   */
  const silencedLabels = (tree: ReactTestRenderer) =>
    tree.root
      .findAll(
        (node) =>
          node.type === Text &&
          StyleSheet.flatten(node.props.style)?.color === colors.silenced
      )
      .map((node) => labelOf(node).trim());

  const dangerLines = (tree: ReactTestRenderer) =>
    tree.root
      .findAll(
        (node) =>
          node.type === Text &&
          StyleSheet.flatten(node.props.style)?.color === colors.danger
      )
      .map((node) => labelOf(node).trim());

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

  it('survives the snapshot arriving after the screen has opened', () => {
    // What a tap on any channel actually does: this screen opens first and the
    // snapshot follows a moment later, so the wait above and the channel below
    // are two renders of one mount. Every hook has to run in both.
    //
    // It did not, for one build. The attention clock's `useEffect` was written
    // below the `!view` return, where the code it belongs beside sits — so the
    // second render called one hook more than the first and React refused it,
    // crashing the app on entering any channel at all. The suite missed it
    // because every other test here seeds the snapshot before mounting, which
    // is the one order the app never takes.
    //
    // The assertion is that this does not throw. `not.toContain` is the proof
    // the second render really went past the return; without it a screen stuck
    // on "Loading channel…" would pass by never running the extra hook.
    const screen = () => (
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const tree = render(screen());
    expect(textOf(tree)).toContain('Loading channel');

    showChannel(channelOf());
    act(() => tree.update(screen()));

    expect(textOf(tree)).not.toContain('Loading channel');
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
    // Nobody holds it, which the screen says by omission and not in words
    // since the floor card went: no roster card is marked, and the footer's
    // claim is live.
    expect(text).not.toContain('has the floor');
    const claim = findButton(tree, 'Claim')!;
    expect(claim.props.accessibilityState.disabled).toBe(false);
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
    // Nothing in the body about the ways in and out, since 2026-09-13: the
    // card that carried them was the footer's three rungs with sentences
    // under them, and the rung you are standing on is what the bar is for.
    expect(findButton(tree, 'Step in')).toBeUndefined();
    expect(findButton(tree, 'Step out')).toBeUndefined();
    expect(findButton(tree, 'Be nearby')).toBeUndefined();
    // Out is the lit rung, and the two above it are live.
    expect(findButton(tree, 'Out')!.props.accessibilityState.selected).toBe(
      true
    );
    expect(findButton(tree, 'In')!.props.accessibilityState).toEqual({
      disabled: false,
      selected: false,
    });
    // And nothing about the audio, which is the other half of this test:
    // somebody who has not stepped in has no session for a card to report
    // on. The idle status that would otherwise draw *Audio* is exactly what
    // an onlooker's session is, which is why this is gated on presence
    // rather than on the status alone.
    expect(text).not.toContain('Your microphone');
    expect(text).not.toContain('Audio not connected');
    expect(findButton(tree, 'Mute yourself')).toBeUndefined();
    // The floor is somebody else's business until you are in the room, so the
    // footer's claim is refused. Which of the several reasons it is refused
    // for is no longer said anywhere: see the note on the floor card's
    // removal in ChannelView.
    expect(findButton(tree, 'Claim')!.props.accessibilityState.disabled).toBe(
      true
    );

    // Stepping in stays put: you are already looking at the channel, and the
    // screen fills in around the tap rather than closing and reopening.
    act(() => findButton(tree, 'In')!.props.onPress());
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
    expect(textOf(tree)).toContain('Step in to answer for what a guest may do');

    // A tab apiece from here down. The rule is one rule and the sentence
    // explaining it is different on each, which is the thing worth checking:
    // a disabled cluster with nothing saying why is the shape this codebase
    // does not allow.
    showNotepad(tree);
    expect(disabled('Paste my clipboard')).toEqual(off('Paste my clipboard'));
    expect(textOf(tree)).toContain(
      'Step in to put something on the channel clipboard'
    );

    showPlayer(tree);
    expect(disabled('Play something together')).toEqual(
      off('Play something together')
    );
    expect(textOf(tree)).toContain(
      'What everybody is listening to is for whoever is listening'
    );

    showInvites(tree);
    expect(disabled('Invite')).toEqual(off('Invite'));
    expect(disabled('Share a guest link')).toEqual(off('Share a guest link'));
    const invites = textOf(tree);
    expect(invites).toContain('Step in to invite anybody');
    expect(invites).toContain('Step in to make a link');
    // And the list of contacts is still shown rather than emptied by the
    // filter, which would have claimed every contact was already in here.
    expect(invites).toContain('Miro Okafor');

    showRecordings(tree);
    // The recording row's actions are behind a tap, and two of the three are
    // refused. Share is not, and that is the assertion worth having.
    act(() => findButton(tree, 'Book club')!.props.onPress());
    expect(disabled('Rename')).toEqual(off('Rename'));
    expect(disabled('Delete')).toEqual(off('Delete'));
    expect(findExactButton(tree, 'Share')!.props.accessibilityState).toEqual({
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
      contacts: [
        { account: { id: 'acct_3', displayName: 'Miro Okafor' }, status: 'accepted' },
      ],
    };
    // The watch party is behind Labs, and this test is about what an
    // empty channel refuses rather than about the gate. See `labs` in
    // core/settings.ts.
    mockApp.labs = true;
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

    showNotepad(tree);
    expect(on('Paste my clipboard')).toEqual({ disabled: false });

    showInvites(tree);
    expect(on('Invite')).toEqual({ disabled: false });
    expect(on('Share a guest link')).toEqual({ disabled: false });

    showRecordings(tree);
    act(() => findButton(tree, 'Book club')!.props.onPress());
    expect(on('Rename')).toEqual({ disabled: false });
    expect(on('Delete')).toEqual({ disabled: false });

    // Still outside, so the things that are about presence for their own
    // reasons are still refused — the rule did not turn into "anything goes
    // in an empty room".
    showMembers(tree);
    // The way in is the footer's rung and nothing else since 2026-09-13 — the
    // card that used to say "Step in" in full was the same act with a
    // sentence under it.
    expect(on('In')).toEqual({ disabled: false, selected: false });
    expect(on('Claim').disabled).toBe(true);

    showRecordings(tree);
    expect(on('Record')).toEqual({ disabled: true });

    showPlayer(tree);
    // And since 2026-08-24, putting something on. This asserted the opposite
    // until then: loading a track and starting a party are the two acts that
    // leave something behind for whoever steps in next, so they ask presence
    // where driving what is already there asks only the room. `canLoadTrack`
    // and `canStartWatch` in core.
    expect(on('Play something together')).toEqual({ disabled: true });

    showWatch(tree);
    expect(on('Watch something together')).toEqual({ disabled: true });
    // The screen link is not one of them — it changes nothing, and an empty
    // channel is nobody's conversation to intrude on.
    expect(on('Watch on another screen')).toEqual({ disabled: false });
    act(() => tree.unmount());
  });

  /**
   * The same rule one screen in. A channel's name is what the people in it
   * call the place they are in, so it is not for somebody who is somewhere
   * else to change under them — and `canEditChannel` governs the notepad with
   * it, the two being one question, asked on two screens since the field
   * moved to the Notepad tab.
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

  it('does not tell a silenced user they are still being recorded', () => {
    /*
      It said so until 2026-09-15, on the reading that being unheard is easily
      mistaken for being unrecorded. Both halves of that turned out to be
      about the recorder rather than about the person: the ungated stem does
      reach the bucket, and every way out of it — the mix, one speaker's stem,
      the transcript — is gated by the same function in server/src/export.ts,
      deliberately so that it cannot be right in one place and wrong in
      another. So nobody can hear the remark and nobody can obtain it, and a
      warning saying otherwise described an internal of the capture in words
      that read as a warning about being overheard.

      The accurate version is on the privacy page, which is where a fact about
      what is retained and for how long belongs. This asserts the absence so
      that restoring the sentence is a decision rather than an accident.
    */
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
    expect(text).not.toContain('still being recorded');
    expect(text).not.toContain('left out of the mix anybody can play or share');
    // The recording itself is still announced, and in the one place that
    // cannot scroll away.
    expect(text).toContain('Recording');
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
    showRecordings(tree);
    const text = textOf(tree);
    expect(text).toContain('Recording failed');
    expect(text).toContain('no supported codec');
    // And it can be attempted again: the failure is stated above the button,
    // which is offered unchanged rather than relabelled about it.
    expect(findButton(tree, 'Record')).toBeDefined();
    act(() => tree.unmount());
  });

  it('reports the last run only when it ended early', () => {
    /*
      The two halves of the 2026-09-13 clearing-out, in one test.

      *Saved — 4:12 captured* is the recordings list directly below saying the
      same thing about the same run, so it went with the rest of the prose.
      *Ended early* is the half the list cannot tell you — there a run that
      failed is just a short recording — so it stays, and it stays as a
      warning rather than a muted aside.
    */
    const ended = (failure: string | null) => {
      const channel = channelOf();
      return {
        ...channel,
        lastRecording: {
          runId: 'rec_1',
          startedAt: NOW - 60_000,
          endedAt: NOW,
          durationMs: 60_000,
          failure,
        },
      };
    };
    const open = () => {
      const tree = render(<ChannelView
          channelId="sess_1"
          audio={AUDIO}
          onClose={() => {}}
          onExit={() => {}}
        />);
      showRecordings(tree);
      return tree;
    };

    showChannel(ended(null));
    const saved = open();
    expect(textOf(saved)).not.toContain('Saved');
    act(() => saved.unmount());

    showChannel(ended('the egress stopped'));
    const early = open();
    expect(textOf(early)).toContain('Ended early');
    act(() => early.unmount());
  });

  it('shows a disconnected party as nearby, not present', () => {
    // **Not "left"**: they are still in the channel, still hold whatever they
    // hold, and have a minute to come back — which is why the grace exists and
    // why it is not being shortened. **And not "present"** either, since
    // 2026-09-08: for the length of that minute they cannot hear anybody, and
    // a card saying otherwise is the roster asserting the one thing that is
    // not true of them. *Nearby* is what they are to everybody else, and the
    // ping this row already offered was right before the word was.
    const channel = channelOf();
    showChannel({ ...channel, disconnectedAt: { [THEM]: NOW - 5_000 } });

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Nearby');
    expect(text).not.toContain('Present · reconnecting…');
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
    // The one status that earns the red: they are here, and your voice is
    // missing them.
    expect(dangerLines(tree)).toEqual(['Present · not receiving you']);
    act(() => tree.unmount());
  });

  it('says nearby when both planes agree, rather than unreachable', () => {
    // **Both planes agreeing is a phone that has gone**, and the screenshot
    // that produced this test read "not receiving you" for minutes after a
    // force quit. That phrasing asserts the one thing a departed phone is not:
    // that they are here and your voice is missing them. `failing` still leads
    // on its own — the test above holds that case — and gives way the moment
    // the socket corroborates it.
    const channel = channelOf();
    showChannel({ ...channel, disconnectedAt: { [THEM]: NOW - 5_000 } });

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={{ ...AUDIO, failing: [THEM] }}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Nearby');
    expect(text).not.toContain('not receiving you');
    // **And in the colour the word deserves, not the flag's.** The red is for
    // a live problem you can act on; being out of reach is the rung half the
    // roster sits on and is drawn muted everywhere else. The tone was still
    // keyed on `failing` alone after the word gave way, so this card said
    // "Nearby" in danger red.
    expect(dangerLines(tree)).toEqual([]);
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
    /*
      Whose claim it is comes off the roster card, and that it has cut you
      comes off the footer alone — the microphone's tint, and the Claim it
      refuses. It was said in words as well until 2026-09-15, on a card headed
      *Your microphone*; the card went when the last of its sentences did.

      This is the state that lost the most, so it is the one worth asserting:
      what is left has to be enough to tell somebody their microphone is shut
      and that they did not shut it.
    */
    expect(text).toContain('has the floor');
    expect(text).not.toContain("Silenced by Dana Chu's floor claim.");
    expect(silencedLabels(tree)).toEqual(['Mute']);
    expect(findButton(tree, 'Claim')!.props.accessibilityState.disabled).toBe(
      true
    );
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
    const claim = findButton(tree, 'Claim');
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
    showPlayer(tree);
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
    showPlayer(tree);

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
    showPlayer(tree);

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
    showPlayer(tree);
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
    showPlayer(tree);

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

  /**
   * Taking a copy of what is on, which is a read and not a control.
   *
   * The floor is claimed by the other person deliberately: every other button
   * on the card goes grey at that moment, and this one must not — it changes
   * nothing anybody in the room can hear.
   */
  it('shares the track, and does so even without the floor', async () => {
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
        return reduce(withTrack, { type: 'CLAIM_FLOOR', userId: THEM }, NOW);
      })
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showPlayer(tree);

    const share = findExactButton(tree, 'Share')!;
    expect(share.props.accessibilityState.disabled).toBe(false);

    const { shareTrack } = require('../../api/download');
    shareTrack.mockClear();
    await act(async () => share.props.onPress());
    // The title it is playing under, so the file that lands in the share sheet
    // is recognisable as the thing on screen.
    expect(shareTrack).toHaveBeenCalledWith('token', 'sess_1', 'Kind of Blue');
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
    showPlayer(tree);
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
    // The holder is named where the claim is a fact about a person, which is
    // the roster and, since 2026-09-15, nowhere else — the sentence naming
    // them on the microphone card went with the card.
    expect(text).toContain('Miro Okafor Present  · has the floor');
    expect(text).not.toContain("Silenced by Miro Okafor's floor claim.");
    act(() => tree.unmount());
  });

  it('offers to invite an accepted contact who is not in the channel', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
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
    showInvites(tree);
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

    const home = findButton(tree, 'Home');
    expect(home).toBeDefined();
    act(() => home!.props.onPress());

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

    // The way in is the footer's rung, and the way out is not offered: this
    // copy of the app is not holding anything to give up.
    const stepIn = findButton(tree, 'In')!;
    expect(stepIn.props.accessibilityState.selected).toBe(false);
    // And the sentence says which of the two "not in it" cases this is. It is
    // the one thing about being outside that no rung and no roster card can
    // say, which is why it outlived the card that used to carry it — see the
    // note under the roster in ChannelView.
    expect(textOf(tree)).toContain('not on this device');

    act(() => stepIn.props.onPress());
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

    expect(findButton(tree, 'In')).toBeDefined();
    expect(textOf(tree)).toContain('on another device');
    act(() => tree.unmount());
  });

  /**
   * A channel this account is not in at all is the third case, and since
   * 2026-09-13 it is the one with nothing to say.
   *
   * It used to have its own sentence — *you are looking at this channel
   * without being in it* — on the Step in card. The two above are facts a
   * snapshot cannot show you, another device being invisible to this screen;
   * that one was a readout of which rung you are on, which the footer lights
   * and your own roster card says in words. It went with the card.
   */
  it('says nothing extra for a channel this account is not in', () => {
    const channel = reduce(channelOf(), { type: 'STEP_OUT', userId: ME }, NOW);
    showChannel(channel);
    mockApp.standingIn = null;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Out')!.props.accessibilityState.selected).toBe(
      true
    );
    expect(textOf(tree)).not.toContain('without being in it');
    expect(textOf(tree)).not.toContain('not on this device');
    // The roster card is what says it instead, and says it about a person
    // rather than about a device.
    expect(textOf(tree)).toContain('Stepped out');
    act(() => tree.unmount());
  });

  it('offers only stepping out on the channel screen', () => {
    // Leaving lives in settings. Beside the way out, in the colour reserved
    // for danger, it drew the eye straight to the least likely action.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    // The Out rung, which since 2026-09-13 is the whole of the way out. It
    // had a card of its own until then, and by the end the card was two
    // buttons the bar already had — the last of its words having gone when
    // the sublabel did. See the note where `controlCards` used to be
    // declared in ChannelView.
    const stepOut = findButton(tree, 'Out')!;
    expect(stepOut.props.accessibilityState).toEqual({
      disabled: false,
      selected: false,
    });
    expect(findButton(tree, 'Step out')).toBeUndefined();
    expect(findButton(tree, 'Leave channel')).toBeUndefined();

    act(() => stepOut.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    act(() => tree.unmount());
  });

  /**
   * Being nearby from inside the room, which since 2026-09-13 is the footer's
   * rung and nothing else.
   *
   * Out of Labs on 2026-09-09. It was gated while it was one experiment among
   * two, and a gate is what let the same action carry two names — "Step in
   * nearby" from outside, "Nearby" from inside — for something the reducer has
   * always treated as one act.
   *
   * It had a card too, above the way out, until the pair were deleted for
   * being the bar again in longer words. That card is also where the drift a
   * duplicated control invites actually happened: its *Be nearby* had lost
   * the `markTried('nearby')` its footer twin kept, so declaring nearby from
   * the card never ticked the checklist rung. Hence the assertion here.
   */
  it('offers being nearby from inside the room, and no longer behind Labs', () => {
    mockApp.labs = false;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Be nearby')).toBeUndefined();
    expect(textOf(tree)).not.toContain('Give the audio system back');
    const nearby = findButton(tree, 'Nearby')!;
    expect(nearby.props.accessibilityState.selected).toBe(false);

    act(() => nearby.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'DECLARE_NEARBY' });
    expect(mockApp.markTried).toHaveBeenCalledWith('nearby');
    // Staying within reach is staying, so the screen it offers the step in on
    // is not taken away.
    expect(mockApp.leaveChannelView).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('offers a way in and a way out to somebody who is nearby', () => {
    mockApp.labs = false;
    showChannel(
      channelOf((c) => reduce(c, { type: 'DECLARE_NEARBY', userId: ME }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    const text = textOf(tree);
    // No long forms anywhere: the card that spelled these two out in
    // sentences went on 2026-09-13, and the bar is the whole of the ladder.
    expect(text).not.toContain('Be nearby');
    expect(text).not.toContain('You are nearby rather than in this channel');
    // The lit rung is where you are, and the other two are live. Nearby stays
    // pressable while lit — the tap restarts the wait.
    expect(findButton(tree, 'Nearby')!.props.accessibilityState.selected).toBe(
      true
    );
    expect(findButton(tree, 'In')).toBeDefined();

    act(() => findButton(tree, 'Out')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    act(() => tree.unmount());
  });

  /**
   * The arrival, which was a card with two buttons until 2026-09-15 and had
   * no test at all. It is one line now, and the reason it is one line is that
   * everything else on the card was already on the screen — so what these two
   * pin is the line's presence and the buttons' absence together.
   */
  it('says an arrival in a line, and offers no buttons for it', () => {
    mockApp.nearbyIn = ['sess_1'];
    mockApp.nearbyArrival = { sess_1: [THEM] };
    showChannel(
      channelOf((c) => reduce(c, { type: 'DECLARE_NEARBY', userId: ME }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    const text = textOf(tree);
    // *Just* is the whole of what this line carries that the roster does not:
    // the roster row above says only *Present*, of somebody who walked in a
    // second ago and of somebody who has been there an hour alike.
    expect(text).toContain('Dana Chu just stepped in.');
    // The heading said less than the sentence under it, and both buttons were
    // elsewhere: *Step in* is the `In` rung, and *Stay nearby* only put the
    // card away.
    expect(text).not.toContain('Somebody arrived');
    expect(findButton(tree, 'Step in')).toBeUndefined();
    expect(findButton(tree, 'Stay nearby')).toBeUndefined();
    // The answer is the rung, which is where every other act here lives.
    expect(findButton(tree, 'In')).toBeDefined();
    act(() => tree.unmount());
  });

  it('drops the arrival line when the person who arrived has left', () => {
    mockApp.nearbyIn = ['sess_1'];
    mockApp.nearbyArrival = { sess_1: [THEM] };
    // Nothing clears `nearbyArrival` on a departure, deliberately: the line is
    // filtered against the roster rather than expired on a clock, so a line
    // outliving the arrival cannot contradict the list directly above it.
    showChannel(
      channelOf((c) => {
        const nearby = reduce(c, { type: 'DECLARE_NEARBY', userId: ME }, NOW);
        return reduce(nearby, { type: 'STEP_OUT', userId: THEM }, NOW + 1_000);
      })
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    expect(textOf(tree)).not.toContain('just stepped in.');
    act(() => tree.unmount());
  });

  it('orders each tab by what somebody in a conversation reaches for', () => {
    /*
      Roughly by how often it is wanted, and pinned here because the order is
      a decision rather than an accident of how the JSX was written. It has
      changed three times: the floor used to sit at the top, inviting directly
      under the roster, and the clipboard between the audio cards — and this
      test is what noticed each time.

      **Six tabs since 2026-09-12, and the order is now two orders.** The tabs
      run in the order somebody reaches for them, and within each the sections
      do too. What was one column of ten labels under a *What the channel is
      carrying* heading is the heading made structural: the seam that used to
      be a rule and a phrase is the switch itself, and the group heading has
      gone with it.

      Labs on, so the order under test is the whole screen rather than the
      screen minus its experimental tab.
    */
    mockApp.labs = true;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);

    /*
      Read off the `SectionLabel`s themselves rather than by searching the
      flattened text for each word.
      **The search version was quietly wrong and the watch card is what
      exposed it**: that card's own prose contains the word "Recording", so
      `indexOf('Recording')` found a sentence rather than the heading, and the
      order it computed depended on which cards happened to mention each
      other.
    */
    const sections = () =>
      tree.root
        .findAll((node) => node.type === SectionLabel)
        .map((node) => labelOf(node).trim());

    /*
      **The tabs, in their own order**, read off the switch rather than
      restated: what this asserts is the order they are offered in, and the
      labels are the whole of what somebody chooses between.

      Members first because it is what the screen is for and what you land on.
      Then the people: what they have written down, and how somebody who is
      not here gets in. Then the three things the channel carries, with Watch
      last because it is the one tab that can be absent — see the type in
      ChannelView, which is where the whole argument for this order is.
    */
    // `findAll` with a predicate rather than `findByType`, which the installed
    // react-test-renderer types do not declare.
    expect(
      tree.root
        .findAll((node) => node.type === Segmented)[0]!
        .props.options.map((option: { label: string }) => option.label)
    ).toEqual([
      'Members',
      'Notepad',
      'Invite',
      'Player',
      'Recordings',
      'Watch',
    ]);

    /*
      The roster's own, which is what is true of the conversation right now.
      **One, and only when something is wrong**, which is the state of it
      since 2026-09-15.

      There were four. *The floor* went first: what its card held was the
      state of the floor in a sentence, and the roster above it says the same
      thing about the people it is about. *Step in* and *Step out* followed
      the same afternoon, being the footer's three rungs with sentences under
      them. *Your microphone* survived that round and lost its button, on the
      grounds that the bar greys without saying which of four reasons it is.

      Then the sentences went too. Three of the four were said again by the
      footer's tint and the roster's `· muted` and `· has the floor`, and the
      fourth explained a control rather than reporting the room. What was
      left was the connection — which nothing else on this screen has a word
      for — and it is worth a card only when it is not working.

      So this heading is *Audio* and it is here because the harness's session
      is idle. A connected one draws nothing, which is asserted on its own in
      channelMembers.test.tsx.
    */
    expect(sections()).toEqual(['Audio']);

    // What the channel has written down, at two speeds — and in that order
    // since 2026-09-13: the clipboard, which is minutes old and is what
    // somebody opened this tab to find, above the notepad, which is a standing
    // sheet that changes about as often as the channel's name. The tab is
    // named after the slower half even so; what it is called is not an
    // argument about which half is looked at first.
    showNotepad(tree);
    expect(sections()).toEqual(['Shared clipboard', 'Notepad']);

    // Nothing at all, since 2026-09-13: the recording transport moved to
    // *Recordings* on 2026-09-12, and what was left was one card under a
    // SHARED AUDIO label on a tab called *Player* — the screen naming itself
    // twice over a card whose own sentence says everyone hears this.
    showPlayer(tree);
    expect(sections()).toEqual([]);

    // The transport above the list it produces, and one heading rather than
    // two: the transport lost its RECORDING label on 2026-09-13, three
    // glyphs under the tab named after them needing no second announcement
    // of what they are. It is back in a card as of the same day — the
    // player's shape — and a card is not a heading.
    showRecordings(tree);
    expect(sections()).toEqual(['Recordings']);

    showWatch(tree);
    expect(sections()).toEqual(['Watch together']);

    /*
      The ways in, which are two sections with no heading over them: the tab
      is the heading, and *Who gets in* said over it read as a second,
      narrower claim about the pair. A contact who already has an account
      first, then a link for somebody who has not.
    */
    showInvites(tree);
    expect(sections()).toEqual(['Contacts', 'Guest link']);
    act(() => tree.unmount());
  });

  /*
    Every tab carries a glyph, and the switch is the only thing that draws
    them — which is what this asserts rather than which glyph is which. The
    shapes are a judgement and are argued at each one in icons.tsx; that a tab
    was added without one is a mistake, and it is silent, since a segment with
    no icon simply draws its word a size larger than its neighbours.
  */
  it('gives every tab a glyph as well as a word', () => {
    mockApp.labs = true;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const options = tree.root.findAll((node) => node.type === Segmented)[0]!
      .props.options as Array<{ label: string; icon?: unknown }>;
    expect(options).toHaveLength(6);
    expect(options.every((option) => typeof option.icon === 'function')).toBe(
      true
    );
    act(() => tree.unmount());
  });

  /*
    **Where the tabs are drawn, which is the top and is not a setting.** It
    was one between 2026-09-12 and 2026-09-13 — the switch could put them
    above the footer, and an account that had never said got a coin toss. See
    planning/decisions/2026-09-13-the-channel-tabs-stay-at-the-top.md.

    Read as a position in the rendered tree rather than by looking for a
    header: `Screen` puts its `footer` below the scroll, so a switch drawn
    before the roster's first heading is at the top of the screen and one
    drawn after every heading on it is at the foot. The assertion is that
    there is exactly one of them and it is the first thing — one switch being
    half of what went, a second home for a set of controls being a second
    place to look for them.
  */
  it('draws the tabs at the top of the screen, and only there', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const nodes = tree.root.findAll(
      (node) => node.type === Segmented || node.type === SectionLabel
    );
    const switches = nodes.filter((node) => node.type === Segmented);
    expect(switches).toHaveLength(1);
    expect(nodes.indexOf(switches[0]!)).toBe(0);
    expect(nodes.length - 1).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  /*
    **Landing somewhere other than the roster, because a caller said so.**
    The one caller that does is the introduction checklist on Home — a rung
    about the guest link or the player names a tab, and landing on the roster
    to hunt for it is the failure the rung exists to fix. See
    `ui/Introduction.tsx` and `ui/detail.ts`.

    What is asserted is that the request is honoured on arrival, that it is
    followed when it changes under a screen already up (which is the split,
    where the channel can be open beside the card), and that it is a request
    rather than a setting — a tap on the tab bar stands.
  */
  it('lands on the tab it was asked for, and lets the bar override it', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        tab="player"
        onClose={() => {}}
        onExit={() => {}}
      />);
    const shown = () =>
      tree.root.findAll((node) => node.type === Segmented)[0]!.props.value;
    expect(shown()).toBe('player');

    // The screen stays up and is asked for another one.
    act(() =>
      tree.update(<ChannelView
          channelId="sess_1"
          audio={AUDIO}
          tab="invites"
          onClose={() => {}}
          onExit={() => {}}
        />)
    );
    expect(shown()).toBe('invites');

    // And the bar wins from there: nothing new is being asked for, so the
    // rerender does not put the screen back.
    showMembers(tree);
    expect(shown()).toBe('members');
    act(() =>
      tree.update(<ChannelView
          channelId="sess_1"
          audio={AUDIO}
          tab="invites"
          onClose={() => {}}
          onExit={() => {}}
        />)
    );
    expect(shown()).toBe('members');
    act(() => tree.unmount());
  });

  /*
    The watch tab is the one that comes and goes, and what decides is Labs
    rather than anything about the room — a tab that appeared and vanished as
    people started and stopped things would be the wrong one pressed. The
    exception is a party already running, which somebody without Labs has to
    be able to see and stop; `watchOffered` is both halves.
  */
  it('offers the watch tab to Labs, and to anybody in a party already on', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(findButton(tree, 'Watch')).toBeUndefined();
    act(() => tree.unmount());

    // The same account, the same channel, and a party running in it: the tab
    // is there, because the Stop button is on it.
    showChannel(
      channelOf((s) =>
        reduce(
          s,
          {
            type: 'START_WATCH',
            userId: ME,
            videoId: 'dQw4w9WgXcQ',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          },
          NOW
        )
      )
    );
    const party = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showWatch(party);
    expect(findButton(party, 'Stop')).toBeDefined();
    act(() => party.unmount());
  });

  /*
    The tabs themselves: two views of one channel, one at a time, and the
    roster is the one you land on. Asserted from both directions — what each
    tab shows *and* what it hides — because a switch that renders both bodies
    at once would pass every assertion about what is on the screen.
  */
  it('shows the roster first, and the ways in one tap away', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
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

    expect(textOf(tree)).toContain('Dana Chu');
    expect(findButton(tree, 'Share a guest link')).toBeUndefined();

    showInvites(tree);
    expect(findButton(tree, 'Share a guest link')).toBeDefined();
    expect(textOf(tree)).toContain('whoever is in the channel decides');
    // The roster is not drawn underneath: the tab is the screen, not a band
    // at the top of it.
    expect(textOf(tree)).not.toContain('Nobody has the floor');

    // And back, because a tab somebody cannot leave is a screen they are
    // stuck on.
    showMembers(tree);
    expect(textOf(tree)).toContain('Dana Chu');
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
    expect(findButton(header, 'Home')).toBeDefined();
    expect(findButton(header, 'Settings')).toBeDefined();

    // And the description stayed behind, in the scroll — on *Notepad* since the
    // six tabs, and out of the header either way. It is prose of any length,
    // and a pinned header is the one place on this screen that cannot afford
    // something that grows. Asserted against a description the channel
    // actually has, so that the absence means something.
    expect(textOf(header)).not.toContain('Reading Dune on Thursdays.');
    showNotepad(tree);
    expect(textOf(tree)).toContain('Reading Dune on Thursdays.');
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
   *
   * **The surviving word is *Home* again since 2026-09-12**, with the house
   * to match — one control that names where it goes, rather than one of two
   * chosen by layout. These assert the absence of *Close* for the reason they
   * used to assert the absence of *Home*: two ways out of this header, by
   * whatever names, is the bug.
   */
  const headerOf = (element: React.ReactElement) => {
    const tree = render(element);
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    return { tree, header: render(screen!.props.header) };
  };

  it('offers Home on a phone', () => {
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
    expect(findButton(header, 'Close')).toBeUndefined();
    act(() => findButton(header, 'Home')!.props.onPress());
    expect(closed).toHaveBeenCalled();
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  it('offers the same Home in the detail pane', () => {
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
    expect(findButton(header, 'Close')).toBeUndefined();
    act(() => findButton(header, 'Home')!.props.onPress());
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

    **By accessible name, not by text.** The header carries the whole pill
    again — the disc, the word and the clock — and a search for the word
    would find the *Recordings* tab in the pinned switch beside it either
    way, which is how the earlier split was noticed. The name is on the pill
    and on nothing else.
  */
  const recordingDots = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (node) =>
        node.props?.accessibilityLabel === 'Recording' ||
        node.props?.accessibilityLabel === 'Recording paused'
    );


  /*
    The transport, which is three glyphs and is all three of them whatever the
    run is doing. It used to be one full-width button that changed its word,
    swapped for a pair when a run started — so the control somebody reaches for
    in a hurry was never twice in the same place. Greyed is how this row says
    *not now*; nothing leaves it.

    Asserted through `accessibilityState`, which is what a screen reader is
    told and so is the assertion worth making. Found by the word under the
    glyph — *Record*, *Pause*, *Stop* — since `findButton` prefers the text on
    screen to the `accessibilityLabel`, and since 2026-09-13 there is text on
    screen. The label a screen reader hears is still the longer phrase.
  */
  it('draws record, pause and stop at all times, greying what cannot be pressed', () => {
    const transport = (tree: ReactTestRenderer, label: string) => {
      const button = findButton(tree, label);
      expect(button).toBeDefined();
      return button!.props.accessibilityState.disabled as boolean;
    };

    // Idle, in a room with somebody in it: start, and nothing to stop.
    showChannel(channelOf());
    const idle = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    showRecordings(idle);
    expect(transport(idle, 'Record')).toBe(false);
    expect(transport(idle, 'Pause')).toBe(true);
    expect(transport(idle, 'Stop')).toBe(true);
    act(() => idle.unmount());

    // Running: the two that end it, and no second run to start.
    showChannel(
      channelOf((c) =>
        reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW)
      )
    );
    const live = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    showRecordings(live);
    expect(transport(live, 'Record')).toBe(true);
    expect(transport(live, 'Pause')).toBe(false);
    expect(transport(live, 'Stop')).toBe(false);
    act(() => live.unmount());

    // Paused: the record glyph is what sets it going again — one control for
    // *start capturing*, rather than a fourth shape that appears only here.
    showChannel(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW),
          { type: 'PAUSE_RECORDING', userId: ME },
          NOW
        )
      )
    );
    const paused = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    showRecordings(paused);
    expect(transport(paused, 'Resume')).toBe(false);
    expect(transport(paused, 'Pause')).toBe(true);
    expect(transport(paused, 'Stop')).toBe(false);
    act(() =>
      findButton(paused, 'Resume')!.props.onPress()
    );
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'RESUME_RECORDING',
    });
    act(() => paused.unmount());
  });

  it('pins the recording indicator, and only while one is running', () => {
    showChannel(channelOf());
    const idle = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const [idleScreen] = idle.root.findAll((node) => node.type === Screen);
    const idleHeader = render(idleScreen.props.header);
    expect(recordingDots(idleHeader)).toHaveLength(0);
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
    expect(recordingDots(liveHeader).length).toBeGreaterThan(0);
    // And it says the whole of it: the word and the clock are up here now,
    // not on a card behind a tab.
    expect(textOf(liveHeader)).toContain('Recording');
    expect(textOf(liveHeader)).toContain('0:00');
    act(() => liveHeader.unmount());
    act(() => live.unmount());
  });

  /*
    The name gives way to it, which is the price of the pill being pinned.
    Asserted as the property that makes the truncation work rather than as a
    rendered width, which a test renderer does not have: the name's column
    takes the slack and the row of controls does not shrink, so whatever the
    pill needs comes out of the name and the name ends in an ellipsis.
  */
  it('truncates the channel name rather than the controls beside it', () => {
    showChannel(
      channelOf((c) => ({
        ...c,
        name: 'A channel with a name far longer than any header is wide',
      }))
    );
    const { tree, header } = headerOf(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const [name] = header.root.findAll(
      (node) =>
        node.type === Text &&
        typeof node.props.children === 'string' &&
        node.props.children.startsWith('A channel with a name')
    );
    expect(name.props.numberOfLines).toBe(1);
    const column = header.root.findAll(
      (node) =>
        node.type === View && StyleSheet.flatten(node.props.style)?.flex === 1
    );
    expect(column.length).toBeGreaterThan(0);
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  /*
    The disc's two colours, found by colour rather than by shape, for the
    reason `dangerLines` gives and because a disc is a `View` with no text in
    it and there is nothing else to find it by. Inside the pill rather than
    anywhere in the tree: the radius is the only thing on this screen shaped
    like one, and scoping to it says the disc is part of the indicator rather
    than loose somewhere. The paused case is asserted rather than assumed,
    being a second style laid over the first and so the one that can silently
    stop being applied.
  */
  const recordingDiscs = (tree: ReactTestRenderer, color: ColorValue) =>
    tree.root
      .findAll(
        (node) =>
          node.type === View &&
          StyleSheet.flatten(node.props.style)?.borderRadius === radius.pill
      )
      .flatMap((pill) =>
        pill.findAll(
          (node) =>
            node.type === View &&
            StyleSheet.flatten(node.props.style)?.backgroundColor === color
        )
      );

  it('says Recording running and Paused paused, in the one pill', () => {
    showChannel(
      channelOf((c) =>
        reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW)
      )
    );
    const running = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const [runningScreen] = running.root.findAll((node) => node.type === Screen);
    const tree = render(runningScreen.props.header);
    const text = textOf(tree);
    expect(text).toContain('Recording');
    expect(text).toContain('0:00');
    expect(recordingDiscs(tree, colors.recording)).not.toHaveLength(0);
    expect(recordingDiscs(tree, colors.textFaint)).toHaveLength(0);
    act(() => tree.unmount());
    act(() => running.unmount());

    showChannel(
      channelOf((c) => {
        const started = reduce(
          c,
          { type: 'START_RECORDING', userId: ME, runId: 'rec_1' },
          NOW
        );
        return reduce(started, { type: 'PAUSE_RECORDING', userId: ME }, NOW);
      })
    );
    const pausedTree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const [pausedScreen] = pausedTree.root.findAll((node) => node.type === Screen);
    const paused = render(pausedScreen.props.header);
    expect(textOf(paused)).toContain('Paused');
    expect(recordingDiscs(paused, colors.textFaint)).not.toHaveLength(0);
    expect(recordingDiscs(paused, colors.recording)).toHaveLength(0);
    act(() => paused.unmount());
    act(() => pausedTree.unmount());
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

  it('pins five controls under the conversation', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    // Present and unmuted with nobody else here: mute is yours to use, the
    // floor is not (it wants two people), and all three rungs are always
    // drawn, whichever one you are on.
    expect(textOf(footer)).toContain('Mute');
    expect(textOf(footer)).toContain('Claim');
    expect(textOf(footer)).toContain('In');
    expect(textOf(footer)).toContain('Nearby');
    expect(textOf(footer)).toContain('Out');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /**
   * Presence is three rungs — in, nearby, out — and since 2026-09-09 the bar
   * draws one slot for each, in that order.
   *
   * **What is asserted is that nothing here moves.** The words are the same
   * three on every rung and in the same places; the only thing that changes
   * between the three cases below is which slot is lit. That is the whole of
   * the design — a bar whose shape is a fact about the ladder rather than
   * about you — and it replaced a pair of slots that flipped their words,
   * where the accent could only ever sit on a word naming an act you had
   * already performed.
   */
  it('draws all three rungs, and lights the one you are on', () => {
    const barIn = (channel: Parameters<typeof showChannel>[0]) => {
      showChannel(channel);
      const tree = render(
        <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
      );
      const footer = footerOf(tree);
      const rungs = ['In', 'Nearby', 'Out'].map((word) => {
        const slot = findButton(footer, word)!;
        expect(slot).toBeDefined();
        return {
          word,
          // Lit, which on two of the three also means inert — there is
          // nothing for a tap to do on a rung you are standing on. *Nearby*
          // is the exception and has its own case below; what is asserted
          // here is only which slot is lit.
          on: slot.props.accessibilityState.selected === true,
          // Never greyed. Grey is this bar's word for refused, and no move
          // along this ladder is ever refused.
          refused: slot.props.accessibilityState.disabled === true,
        };
      });
      act(() => footer.unmount());
      act(() => tree.unmount());
      return rungs;
    };

    const lit = (channel: Parameters<typeof showChannel>[0]) => {
      const rungs = barIn(channel);
      expect(rungs.map((r) => r.word)).toEqual(['In', 'Nearby', 'Out']);
      expect(rungs.some((r) => r.refused)).toBe(false);
      return rungs.filter((r) => r.on).map((r) => r.word);
    };

    // Exactly one at a time, which is what makes it a ladder rather than a set
    // of switches.
    expect(lit(channelOf())).toEqual(['In']);
    expect(
      lit(channelOf((c) => reduce(c, { type: 'DECLARE_NEARBY', userId: ME }, NOW)))
    ).toEqual(['Nearby']);
    expect(
      lit(channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW)))
    ).toEqual(['Out']);
  });

  /**
   * The bell is the *nearby* glyph and draws nothing else.
   *
   * It sat over the word "Step out" for as long as the nearby slot flipped
   * between two acts, which is what a screenshot caught: a bell is a claim on
   * a notification, and leaving is not one. With a slot per rung the glyph is
   * fixed to its meaning, so what this holds is that the bar carries exactly
   * one bell and two doors whatever state it is drawn in.
   */
  it('draws one bell, in the nearby slot, on every rung', () => {
    const glyphsIn = (channel: Parameters<typeof showChannel>[0]) => {
      showChannel(channel);
      const tree = render(
        <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
      );
      const footer = footerOf(tree);
      const found = {
        // The slot it is in, named by the control that contains it rather than
        // by position, so a reordering of the bar cannot quietly pass this.
        // Host nodes only: `findAll` matches the composite and the element it
        // renders, so an unfiltered search counts one slot three times. The
        // Host nodes only, for the reason `findAll` always needs it.
        bell: footer.root
          .findAll(
            (node) =>
              typeof node.type === 'string' &&
              node.props?.accessibilityRole === 'button'
          )
          .filter((slot) => slot.findAll((node) => node.type === BellIcon).length > 0)
          .map(labelOf)
          .join(),
        // Both departures draw this one, so it is counted rather than found.
        doors: footer.root.findAll((node) => node.type === StepIcon).length,
      };
      act(() => footer.unmount());
      act(() => tree.unmount());
      return found;
    };

    const expected = { bell: 'Nearby', doors: 2 };
    expect(glyphsIn(channelOf())).toEqual(expected);
    expect(
      glyphsIn(channelOf((c) => reduce(c, { type: 'DECLARE_NEARBY', userId: ME }, NOW)))
    ).toEqual(expected);
    expect(
      glyphsIn(channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW)))
    ).toEqual(expected);
  });

  it('ends a declaration from the footer, as a departure rather than a toggle', () => {
    // The same `stepOut` the door uses: the reducer is told, the view is
    // dropped and the caller is told, because leaving *Nearby* is leaving and
    // whether that closes the screen is one question with one answer.
    showChannel(
      channelOf((c) => reduce(c, { type: 'DECLARE_NEARBY', userId: ME }, NOW))
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    act(() => findButton(footer, 'Out')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    expect(mockApp.leaveChannelView).toHaveBeenCalledWith('sess_1');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /**
   * The lit *Nearby* rung is the one control on this bar that a tap still does
   * something to, and what it does is restart the wait.
   *
   * Every other rung is a place: you are in the room or you are not, and there
   * is nothing for a tap to do on the one you are standing on. Nearby is a
   * claim with a clock on it, and the renewal used to be unreachable from the
   * screen that draws the number — "Nearby 14m", lit rung, no way to the
   * fifteenth minute except stepping off and back on. See `repeatable` on
   * `FooterAction` and `DECLARE_NEARBY` in core/channel.ts.
   */
  it('keeps the nearby rung live while it is lit, and lit while it is live', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'DECLARE_NEARBY', userId: ME }, NOW))
    );
    const onExit = jest.fn();
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={onExit} />
    );
    const footer = footerOf(tree);
    const nearby = findButton(footer, 'Nearby')!;

    // Still the rung you are standing on, and still says so. Nothing about
    // being tappable takes it off the bar.
    expect(nearby.props.accessibilityState.selected).toBe(true);
    expect(nearby.props.accessibilityState.disabled).toBe(false);
    // And unlike the other two, it is not inert: `In` while present and `Out`
    // while out are, which is what makes this one the exception rather than
    // the rule.
    expect(nearby.props.disabled).toBe(false);
    expect(findButton(footer, 'Out')!.props.disabled).toBe(false);

    act(() => nearby.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'DECLARE_NEARBY' });
    // A renewal is not a departure and not an arrival: the screen stays where
    // it is, since staying is where the offer is drawn.
    expect(mockApp.leaveChannelView).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  it('leaves the rung you are standing on inert, for the other two', () => {
    // The rule this bar keeps everywhere else, stated once so that making
    // Nearby the exception cannot quietly become making all three one.
    const inertWhenLit = (
      word: string,
      channel: Parameters<typeof showChannel>[0]
    ) => {
      showChannel(channel);
      const tree = render(
        <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
      );
      const footer = footerOf(tree);
      const slot = findButton(footer, word)!;
      const state = {
        lit: slot.props.accessibilityState.selected === true,
        inert: slot.props.disabled === true,
      };
      act(() => footer.unmount());
      act(() => tree.unmount());
      return state;
    };

    expect(inertWhenLit('In', channelOf())).toEqual({ lit: true, inert: true });
    expect(
      inertWhenLit('Out', channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW)))
    ).toEqual({ lit: true, inert: true });
  });

  it('declares nearby from the footer without leaving the screen', () => {
    // Being nearby is staying within reach, and the screen is where the offer
    // is drawn when somebody arrives — so this one never closes it, whichever
    // way "Tap a channel to step in" is set.
    showChannel(channelOf());
    const onExit = jest.fn();
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={onExit} />
    );
    const footer = footerOf(tree);

    act(() => findButton(footer, 'Nearby')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'DECLARE_NEARBY' });
    expect(mockApp.leaveChannelView).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
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

  /**
   * A Mac mini has no built-in microphone, and this app publishes nothing
   * without one — asking WebRTC to capture from a device that does not exist
   * dereferences null inside `AVFAudio` and takes the process with it. So the
   * control has to say what is true: muted, and no way to change it. Offering
   * an Unmute that the reducer would accept and nobody would hear is the one
   * outcome worse than the crash being fixed.
   */
  it('reads muted and refuses the control when there is no microphone', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={{ ...AUDIO, inputAvailable: false }}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const footer = footerOf(tree);

    // Labelled for the state it is in, not for the action it cannot offer.
    expect(textOf(footer)).toContain('Unmute');
    expect(findButton(footer, 'Unmute')!.props.accessibilityState.disabled).toBe(
      true
    );

    act(() => footer.unmount());
  });

  it('leaves the control alone when there is one', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    expect(findButton(footer, 'Mute')!.props.accessibilityState.disabled).toBe(
      false
    );

    act(() => footer.unmount());
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
    const stepIn = findButton(footer, 'In')!;
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

    act(() => findButton(footer, 'Out')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    // Stepping out of the footer leaves the screen exactly as the card does —
    // the view is dropped and the caller told, not just the reducer poked.
    expect(mockApp.leaveChannelView).toHaveBeenCalledWith('sess_1');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /**
   * The other half of "Tap a channel to look, not step in", and the reason
   * that setting is not only about taps.
   *
   * Stepping out closing this screen was never a decision about stepping out;
   * it was true because arriving here *was* stepping in, so there was nothing
   * to be left looking at. Somebody who has turned the tap off has said the
   * screen and the room are two things, and a Step Out that closed the screen
   * anyway would make them say it twice — walk in deliberately, step out, and
   * find the channel gone from under you.
   *
   * One site since 2026-09-13, the card having been deleted for being the
   * footer in longer words. It was two sites, and the pair is exactly the
   * kind that drifts — which is why both shared `stepOut` and why the
   * function is still a function with one caller.
   */
  it('leaves the screen open when stepping out, if a tap only looks', () => {
    mockApp.tapToLook = true;
    showChannel(channelOf());
    const onExit = jest.fn();
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={onExit} />
    );
    const footer = footerOf(tree);

    act(() => findButton(footer, 'Out')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    expect(mockApp.leaveChannelView).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();

    // And nowhere else says the act at all any more.
    expect(findButton(tree, 'Step out')).toBeUndefined();

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
    showRecordings(tree);
    const text = textOf(tree);
    expect(text).toContain('Book club');
    expect(text).not.toContain('Nothing recorded here yet');

    // Closed until asked: the list is what this section is for, and the
    // actions belong to whichever row somebody has opened.
    expect(findExactButton(tree, 'Share')).toBeUndefined();
    act(() => findButton(tree, 'Book club')!.props.onPress());

    // Shared under the recording's own name, which the server fixed when the
    // run stopped — not a label rebuilt here from the roster, which is how two
    // people came to call one recording two different things.
    const { shareRecording } = require('../../api/download');
    shareRecording.mockClear();
    await act(async () => findExactButton(tree, 'Share')!.props.onPress());
    expect(shareRecording).toHaveBeenCalledWith(
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
    showRecordings(mine);
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
    showRecordings(theirs);
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
    showRecordings(tree);

    // Share, Rename and Delete rather than Play, which is also the name of
    // the shared audio control further up the screen — and 'Share' is that
    // card's own button too.
    for (const label of ['Share', 'Rename', 'Delete']) {
      expect(findExactButton(tree, label)).toBeUndefined();
    }

    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    for (const label of ['Share', 'Rename', 'Delete']) {
      expect(findExactButton(tree, label)).toBeDefined();
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
    showRecordings(tree);
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
    showRecordings(tree);
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
    showRecordings(tree);

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
    showRecordings(tree);
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

  it('renders the notepad for somebody who cannot write on it', () => {
    // Stepped out, so `canEditChannel` is false and the notepad is a sheet to
    // read rather than one to write on — no field, and no *Edit* beside it.
    showChannel(
      channelOf((c) => {
        const out = reduce(c, { type: 'STEP_OUT', userId: ME }, NOW);
        return reduce(
          out,
          {
            type: 'SET_DESCRIPTION',
            userId: THEM,
            description: 'Reading Dune, notes at https://example.com.',
          },
          NOW
        );
      })
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    // Not on the roster, which is where it was until the six tabs: it is what
    // the channel is *for*, which is a slower fact than anything the roster
    // carries, and a line of it was being paid for by every screenful of every
    // other section. Asserted from both sides, a tab being worth nothing if
    // the thing it holds is drawn on the one beside it too.
    expect(textOf(tree)).not.toContain('Dune');

    showNotepad(tree);
    const text = textOf(tree);
    // Verbatim, since 2026-09-13: what is on the sheet is the characters
    // somebody typed, with nothing parsed out of them and nothing rendered
    // from them.
    expect(text).toContain('Reading Dune, notes at https://example.com.');

    // No field and no way to open one, and a sentence saying why rather than
    // a disabled box: the rule on this tab is the one the name keeps on the
    // settings screen.
    expect(tree.root.findAll((n) => n.type === TextInput)).toEqual([]);
    expect(findExactButton(tree, 'Edit')).toBeUndefined();
    expect(text).toContain('Step in to write on this');
    act(() => tree.unmount());
  });

  it('says the notepad is empty, to somebody who cannot write on it', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showNotepad(tree);
    // A heading with nothing under it reads as something that failed to load,
    // which the tab made possible: nothing was drawn where the description
    // went when it sat above the switch, and nothing was the right answer
    // there. Whoever has the room gets the field's placeholder instead, which
    // is the same sentence said by the box itself.
    expect(textOf(tree)).toContain('Nothing on the notepad');
    act(() => tree.unmount());
  });

  it('opens the notepad for writing behind Edit, and closes on Done', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    // On the tab, not behind Settings: it moved on 2026-09-12, a notepad
    // somebody has to leave the page to write on not being one.
    showNotepad(tree);

    const field = () =>
      tree.root.findAll(
        (n) =>
          n.props?.placeholder === 'Links, a reading list, what this is for…'
      )[0];

    // A sheet first, since 2026-09-13. Arriving at the notepad is arriving to
    // read it, so the box is behind *Edit* rather than being the notepad.
    expect(field()).toBeUndefined();
    act(() => findExactButton(tree, 'Edit')!.props.onPress());
    expect(field()).toBeDefined();

    act(() => field().props.onChangeText('Dune, Thursdays'));

    // Nothing is written while the field has focus, this tab being a place
    // somebody stays rather than a screen they close.
    expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', {
      type: 'SET_DESCRIPTION',
      description: 'Dune, Thursdays',
    });

    // Leaving the field is the save, which is what the settings screen did
    // when you tapped the way back straight out of it.
    act(() => field().props.onBlur());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_DESCRIPTION',
      description: 'Dune, Thursdays',
    });

    // And *Done* puts the sheet back, a multiline field having no return key
    // that means finished.
    act(() => findExactButton(tree, 'Done')!.props.onPress());
    expect(field()).toBeUndefined();
    expect(textOf(tree)).toContain('Dune, Thursdays');
    act(() => tree.unmount());
  });

  it('asks to be revealed when the box opens over the keyboard', () => {
    /*
      The box sits far enough down this tab that `Screen`'s avoider, which
      shortens the viewport without scrolling it, can leave the field and
      *Done* underneath the keyboard. `Reveal` is the answer, and the half
      that is worth a test is not the arithmetic — that is `reveal.test.ts` —
      but *where the request is made from*.

      `RevealContext`'s provider lives inside `Screen`'s own tree, so a
      reveal asked for by the component that renders `<Screen>`, which this
      one is, reads the default and moves nothing. It shipped that way on
      2026-09-13 and looked exactly like a feature that had been written and
      did not work. A subscription and no complaint is the pair that says the
      card is asking from inside.
    */
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let listeners = 0;
    jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation(((event: string) => {
        if (event === 'keyboardDidShow') listeners += 1;
        return { remove: jest.fn() };
      }) as unknown as typeof Keyboard.addListener);

    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showNotepad(tree);

    // Nothing while the sheet is a sheet: no field is open, so no keyboard
    // here is the notepad's.
    expect(listeners).toBe(0);

    act(() => findExactButton(tree, 'Edit')!.props.onPress());
    expect(listeners).toBe(1);
    expect(warn).not.toHaveBeenCalled();

    // And it lets go again when the box does, rather than holding a listener
    // for a keyboard that now belongs to some other tab.
    act(() => findExactButton(tree, 'Done')!.props.onPress());
    act(() => tree.unmount());
  });

  it('keeps the notepad as typed, markup and all', () => {
    // The five marks the field used to accept are five characters now. What
    // killed the parser is the word: a notepad is a sheet somebody writes a
    // reading list on, not a document format.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showNotepad(tree);
    act(() => findExactButton(tree, 'Edit')!.props.onPress());
    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Links, a reading list, what this is for…'
    )[0];
    act(() => field.props.onChangeText('See [notes](https://notes.example)'));
    act(() => findExactButton(tree, 'Done')!.props.onPress());

    // No preview, and no rendering: the asterisks and brackets are on the
    // sheet because that is what was written on it.
    expect(textOf(tree)).not.toContain('Preview');
    expect(textOf(tree)).toContain('See [notes](https://notes.example)');
    act(() => tree.unmount());
  });

  it('writes a pending edit when the field goes away without a blur', () => {
    /*
      The settings screen got this for free: *Close* persisted on the way out.
      A tab has no Close, so leaving the notepad with something typed in it —
      by changing tab, or by shutting the screen — has to write too. Only the
      second could actually lose it, the draft living on ChannelView rather
      than in the TextInput, but a notepad nobody else can see until its
      author taps the box again reads as one that did not save.
    */
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showNotepad(tree);
    const field = () =>
      tree.root.findAll(
        (n) =>
          n.props?.placeholder === 'Links, a reading list, what this is for…'
      )[0]!;
    /** Opens the box, the notepad being a sheet until somebody says to write. */
    const edit = () => act(() => findExactButton(tree, 'Edit')!.props.onPress());

    edit();
    act(() => field().props.onChangeText('typed, then away'));
    showMembers(tree);
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_DESCRIPTION',
      description: 'typed, then away',
    });

    // And once written, leaving again says nothing: `saved` has moved, so
    // there is no change to report.
    mockApp.act.mockClear();
    showNotepad(tree);
    edit();
    showMembers(tree);
    expect(mockApp.act).not.toHaveBeenCalledWith(
      'sess_1',
      expect.objectContaining({ type: 'SET_DESCRIPTION' })
    );

    // The screen going is the one that would otherwise drop it.
    showNotepad(tree);
    edit();
    act(() => field().props.onChangeText('typed, then gone'));
    act(() => tree.unmount());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_DESCRIPTION',
      description: 'typed, then gone',
    });
  });

  it('leaves the field alone while it holds an unsaved edit', () => {
    /*
      The tab, unlike the settings screen this moved off, is somewhere a
      snapshot lands every few seconds — the floor's clock alone redraws it.
      A field bound straight to `channel.description` would lose a keystroke
      to each, so the draft is local and the snapshot is adopted only when
      there is nothing unsaved to lose.
    */
    const screen = () => (
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    /** A snapshot in which somebody else has written on the notepad. */
    const theyWrote = (text: string) =>
      showChannel(
        channelOf((c) =>
          reduce(
            c,
            { type: 'SET_DESCRIPTION', userId: THEM, description: text },
            NOW
          )
        )
      );
    showChannel(channelOf());
    const tree = render(screen());
    showNotepad(tree);
    act(() => findExactButton(tree, 'Edit')!.props.onPress());
    const field = () =>
      tree.root.findAll(
        (n) =>
          n.props?.placeholder === 'Links, a reading list, what this is for…'
      )[0]!;
    act(() => field().props.onChangeText('half a thought'));

    // Somebody else writes on it while this one is mid-sentence. The words on
    // screen are the ones being typed, not the ones that just arrived.
    theyWrote('theirs');
    act(() => tree.update(screen()));
    expect(field().props.value).toBe('half a thought');

    // And with nothing unsaved, the channel is the authority: what it holds
    // is what the field shows.
    act(() => field().props.onBlur());
    theyWrote('theirs, later');
    act(() => tree.update(screen()));
    expect(field().props.value).toBe('theirs, later');
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
    expect(textOf(tree)).toContain('Channel Settings');

    // The placeholder is what the channel is called while nobody has named
    // it — the same roster description the header draws — rather than a
    // prompt asking what the channel is about. An empty field is not an
    // unnamed channel; it is a channel named after who is in it, and this is
    // the one place that says so.
    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Dana Chu'
    )[0];
    expect(field).toBeDefined();
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
    expect(textOf(tree)).toContain('Channel Settings');
    act(() => findButton(tree, 'Close')!.props.onPress());
    expect(textOf(tree)).toContain('Audio');
    act(() => tree.unmount());
  });

  it('turns automatic recording on from the channel settings', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    expect(textOf(tree)).toContain('Record automatically');
    act(() => findButton(tree, 'On')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_AUTO_RECORD',
      autoRecord: true,
    });
    act(() => tree.unmount());
  });

  /*
    The sentence this asserted until 2026-09-13 is gone, and its absence is
    what is asserted now.

    It said, under the transport, that the channel records itself and what it
    was waiting for. True, and said to somebody who had switched the setting
    on themselves in this channel's own settings, every time they opened the
    tab — and it was one of four muted paragraphs there. The transport carries
    its words now, and prose under it is reserved for a capture that failed.
  */
  it('offers Record to somebody alone in the room, and withdraws it when they mute', () => {
    // The user-visible half of 2026-09-14. Alone with an open microphone the
    // control is live; alone with nothing to capture it is not, and that is
    // now the only thing being alone decides. See
    // planning/decisions/2026-09-14-a-room-of-one-is-a-room.md.
    const solo = (mute: boolean) =>
      channelOf((s) => {
        const left = reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW);
        return mute
          ? reduce(left, { type: 'SET_SELF_MUTE', userId: ME, muted: true }, NOW)
          : left;
      });

    showChannel(solo(false));
    const speaking = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showRecordings(speaking);
    expect(findButton(speaking, 'Record')!.props.disabled).toBe(false);
    act(() => speaking.unmount());

    showChannel(solo(true));
    const muted = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showRecordings(muted);
    expect(findButton(muted, 'Record')!.props.disabled).toBe(true);
    act(() => muted.unmount());
  });

  it('says nothing under the transport about the channel recording itself', () => {
    // Idle and not yet recordable, which is still a state a channel set to
    // record itself can be in — though no longer the one it used to be. Being
    // alone stopped being what makes a room unrecordable on 2026-09-14; having
    // nothing to capture is, so the person left here is muted. The greying of
    // Record is what says *not now*, and the point of the test is that nothing
    // says it a second time in prose.
    showChannel(
      channelOf((s) =>
        reduce(
          reduce(
            { ...s, autoRecord: true },
            { type: 'STEP_OUT', userId: THEM },
            NOW
          ),
          { type: 'SET_SELF_MUTE', userId: ME, muted: true },
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
    showRecordings(tree);
    expect(textOf(tree)).not.toContain('records itself');
    expect(findButton(tree, 'Record')!.props.disabled).toBe(true);
    act(() => tree.unmount());
  });
});
