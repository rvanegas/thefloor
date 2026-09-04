import React from 'react';
import renderer, {
  act,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import {
  DISCONNECT_GRACE_MS,
  WAITING_WINDOW_MS,
} from '../../../../core/constants';
import { type Guest } from '../../../../core/types';
import { ChannelView } from '../ChannelView';
import { Screen } from '../components';
import { ProfileView } from '../ProfileView';
import { Share, StyleSheet } from 'react-native';
import { colors } from '../theme';
import * as Clipboard from 'expo-clipboard';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  audioWith,
  channelOf,
  findButton,
  knowing,
  mockApp,
  render,
  resetHarness,
  showChannel,
  textOf,
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
 * Who is in the channel and what the screen says about them — the roster, a
 * guest in the room, being the only one there, reaching somebody who is not,
 * and the screen with its repeated cards turned off.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

beforeEach(resetHarness);

describe('Channel, with a guest in it', () => {
  const DANA_GUEST = 'guest_dana';

  const withGuest = (overrides: Partial<Guest> = {}) =>
    channelOf((c) =>
      reduce(
        c,
        {
          type: 'GUEST_ENTERED',
          guest: {
            id: DANA_GUEST,
            name: 'Dana',
            admittedAt: NOW,
            maySpeak: false,
            request: 'none',
            ...overrides,
          },
        },
        NOW
      )
    );

  it('puts somebody at the door above everything but the roster', () => {
    // A knock is the one thing on this screen that is waiting on an answer
    // from it. Everything else can be got to in a person's own time.
    showChannel(
      channelOf((c) =>
        reduce(
          c,
          { type: 'KNOCKED', knock: { id: 'knock_1', name: 'Dana', at: NOW } },
          NOW
        )
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('is at the door');
    // What letting them in costs, said before the tap rather than after it.
    expect(text).toContain('cannot record');

    act(() => findButton(tree, 'Let them in')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'ANSWER_KNOCK',
      knockId: 'knock_1',
      accept: true,
    });
    act(() => tree.unmount());
  });

  it('shows a guest as a guest, and says nobody can hear them', () => {
    showChannel(withGuest());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('Dana');
    expect(text).toContain('guest');
    expect(text).toContain('Nobody can hear them');
    act(() => tree.unmount());
  });

  it('makes asking to speak the loud thing, and grants it in one tap', () => {
    showChannel(withGuest({ request: 'asking' }));
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    expect(textOf(tree)).toContain('asking to speak');

    act(() => findButton(tree, 'Let them speak')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_GUEST_SPEECH',
      guestId: DANA_GUEST,
      maySpeak: true,
    });
    act(() => tree.unmount());
  });

  it('withdraws the microphone without removing anybody', () => {
    // Two different sizes of act, and the screen offers both rather than
    // making "stop them talking" mean "throw them out".
    showChannel(withGuest({ maySpeak: true }));
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );

    act(() => findButton(tree, 'Turn their microphone off')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_GUEST_SPEECH',
      guestId: DANA_GUEST,
      maySpeak: false,
    });

    act(() => findButton(tree, 'Remove')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'EJECT_GUEST',
      guestId: DANA_GUEST,
    });
    act(() => tree.unmount());
  });

  it('asks a guest to be a contact, and says so once it has', () => {
    // The rule members already have between themselves — being in a channel
    // together is permission to ask — reaching the one person in the room it
    // could not name. Answered on their own page, by them.
    showChannel(withGuest({ maySpeak: true }));
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    act(() => findButton(tree, 'Add contact')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'ASK_GUEST_CONTACT',
      guestId: DANA_GUEST,
    });
    act(() => tree.unmount());

    // Per reader, not per guest: this is what *this* member asked.
    showChannel(withGuest({ asks: { [ME]: 'asking' } }));
    const asked = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    expect(findButton(asked, 'Asked')!.props.disabled).toBe(true);
    act(() => asked.unmount());

    // And a refusal is a different thing to be told than a silence.
    showChannel(withGuest({ asks: { [ME]: 'refused' } }));
    const refused = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    expect(findButton(refused, 'They said no')!.props.disabled).toBe(true);
    act(() => refused.unmount());
  });

  it('shares a link, and says the sharing is not the letting in', async () => {
    // Awaited inside `act`, unlike most of this file: minting is a round trip
    // and the share sheet is a second one, so a synchronous tap leaves two
    // promises settling into a tree that has already been unmounted — which
    // does not merely warn, it leaves the renderer unable to draw anything for
    // the rest of the file.
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    expect(textOf(tree)).toContain('whoever is in the channel decides');

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(mockApp.inviteGuest).toHaveBeenCalledWith('sess_1');
    expect(share).toHaveBeenCalledWith({ message: 'https://example.test/g/tok' });
    act(() => tree.unmount());
    share.mockRestore();
  });

  it('copies the link when there is nowhere to share it, and says where it went', async () => {
    // `react-native-web` answers a rejected promise when the browser has no
    // Web Share API, which turned a desktop into an error message where a
    // guest link should have been. A clipboard is the honest fallback — but
    // silently copying would look exactly like a tap that did nothing, so the
    // card says where the link went.
    const share = jest
      .spyOn(Share, 'share')
      .mockRejectedValue(new Error('Share is not supported in this browser'));
    const copied = jest
      .spyOn(Clipboard, 'setStringAsync')
      .mockResolvedValue(true);
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(copied).toHaveBeenCalledWith('https://example.test/g/tok');
    expect(textOf(tree)).toContain('Link copied');
    // And not as a failure: nothing went wrong.
    expect(textOf(tree)).not.toContain('would not copy');
    act(() => tree.unmount());
    share.mockRestore();
    copied.mockRestore();
  });

  it('says so when the clipboard will not take it either', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockRejectedValue(new Error('Share is not supported in this browser'));
    const copied = jest
      .spyOn(Clipboard, 'setStringAsync')
      .mockResolvedValue(false);
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(textOf(tree)).toContain('would not copy');
    act(() => tree.unmount());
    share.mockRestore();
    copied.mockRestore();
  });

  it('leaves a cancelled share alone rather than copying behind somebody', async () => {
    // The web throws AbortError when the sheet is dismissed. Falling back to
    // the clipboard there would put a link somewhere the person had just
    // decided not to send it.
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    const share = jest.spyOn(Share, 'share').mockRejectedValue(abort);
    const copied = jest.spyOn(Clipboard, 'setStringAsync');
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(copied).not.toHaveBeenCalled();
    expect(textOf(tree)).not.toContain('Link copied');
    act(() => tree.unmount());
    share.mockRestore();
    copied.mockRestore();
  });
});

describe('who is in the channel, and who is talking', () => {
  /**
   * The card for one person, found by the name in its label. A card is a
   * Pressable for everybody but you, so its style is a function of press
   * state rather than an array — both shapes are flattened the same way here.
   */
  function cardFor(tree: ReactTestRenderer, name: string) {
    const node = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          String(n.props?.accessibilityLabel ?? '').startsWith(name)
      )
      .at(0);
    const style = node?.props?.style;
    return {
      node,
      style: StyleSheet.flatten(
        typeof style === 'function' ? style({ pressed: false }) : style
      ) as { borderColor?: unknown },
    };
  }

  it('gives everybody a card, yourself included', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    // Your own card is there and says so, which is where your mute and your
    // own speaking indicator belong.
    expect(text).toContain('Me (you)');
    expect(cardFor(tree, 'Dana Chu').node).toBeDefined();
    expect(cardFor(tree, 'Me, you').node).toBeDefined();
    act(() => tree.unmount());
  });

  it('marks the card of whoever is audible, and only theirs', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={audioWith(THEM)}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    const mine = cardFor(tree, 'Me, you');
    expect(them.style.borderColor).toBe(colors.floor);
    expect(mine.style.borderColor).not.toBe(colors.floor);
    expect(String(them.node!.props.accessibilityLabel)).toContain('Speaking');
    act(() => tree.unmount());
  });

  it('asks the room who is talking rather than the floor', () => {
    // Holding the floor is permission to speak, not speech. A card lit by the
    // reducer would glow through a whole claim of silence — and would leave a
    // self-muted person's card lit while nothing of theirs is heard.
    showChannel(
      channelOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    expect(them.style.borderColor).not.toBe(colors.floor);
    // The claim is still reported, in words, where it belongs.
    expect(String(them.node!.props.accessibilityLabel)).not.toContain(
      'Speaking'
    );
    expect(textOf(tree)).toContain('has the floor');
    act(() => tree.unmount());
  });

  it('leaves the card clear for somebody absent from this channel', () => {
    // The room's active speakers are ids, and an id means the same person in
    // every channel they belong to. A dot next to "Stepped out" is the shape
    // of that going wrong, and it is what a stale speaker survives as while
    // the hold in speaking.ts runs down.
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW))
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={audioWith(THEM)}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    expect(them.style.borderColor).not.toBe(colors.floor);
    expect(String(them.node!.props.accessibilityLabel)).not.toContain(
      'Speaking'
    );
    act(() => tree.unmount());
  });

  it('lights nobody on a channel whose audio is somewhere else', () => {
    // You are standing in one channel and looking at another. The connection
    // belongs to where you are standing, so nothing it hears is evidence
    // about this screen — including about a person present on both rosters,
    // which is why presence alone does not settle it.
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    showChannel(
      reduce(
        createChannel({
          id: 'sess_2',
          initiator: ME,
          invitees: [THEM],
          now: NOW,
        }),
        { type: 'ENTER', userId: THEM },
        NOW
      )
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={audioWith(THEM)}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    expect(them.style.borderColor).not.toBe(colors.floor);
    act(() => tree.unmount());
  });

  it('says how long somebody has been gone, in words', () => {
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW))
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Stepped out 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says somebody is nearby when their connection went, not their finger', () => {
    // A tap and a suspended phone leave the same absence and used to read the
    // same. They do not mean the same thing to whoever has just walked in:
    // this one is expecting company and has already been notified that some
    // arrived. Said as a length rather than a moment, which is what `duration`
    // is for.
    //
    // "Nearby" rather than "Waiting", which reversed who was doing what: the
    // person reading it is standing in an empty room, and they are the one
    // waiting.
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(
          dropped,
          { type: 'TICK' },
          NOW + DISCONNECT_GRACE_MS + 1
        );
      })
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Nearby for 5 minutes');
    expect(textOf(tree)).not.toContain('Waiting');
    expect(textOf(tree)).not.toContain('Stepped out');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The shortcut the state exists to offer. Nearby means one notification
   * would fetch them, and the tap that sends it is on the card saying so
   * rather than two screens away — with no composer, because the thing being
   * said is "come back", which the notification says by arriving.
   */
  it('offers a wordless ping on the card of somebody nearby', async () => {
    knowing(THEM);
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(dropped, { type: 'TICK' }, NOW + DISCONNECT_GRACE_MS + 1);
      })
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );

    const ping = findButton(tree, 'Ping');
    expect(ping).toBeDefined();
    await act(async () => {
      ping!.props.onPress();
    });

    // Empty text, not absent: the composer's contract is a string, and no
    // words is what this shortcut means rather than a missing argument.
    expect(mockApp.ping).toHaveBeenCalledWith('sess_1', THEM, '');
    // And it says so, without waiting for the snapshot that carries the
    // server's window — the notification has already gone.
    expect(textOf(tree)).toContain('Pinged');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The composer, reached the way somebody actually reaches it — through the
   * roster card rather than by rendering `ProfileView` with an `onPing` handed
   * to it. Whether that handler is supplied at all is this screen's decision,
   * and it is the half nothing else covers.
   *
   * Both directions in one test, because the fixture is otherwise identical
   * and the difference between the two runs is the whole claim.
   */
  async function openProfileOfSomebodyAway() {
    showChannel(channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW)));
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const row = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).includes('Dana Chu'));
    await act(async () => row!.props.onPress());
    return tree;
  }

  it('withholds the composer from a stranger and offers it to a contact', async () => {
    knowing();
    const stranger = await openProfileOfSomebodyAway();
    expect(textOf(stranger)).not.toContain('Send ping');
    // The screen is not empty in its place: the act that fits is on it.
    expect(textOf(stranger)).toContain('Add contact');
    act(() => stranger.unmount());

    knowing(THEM);
    const contact = await openProfileOfSomebodyAway();
    expect(textOf(contact)).toContain('Send ping');
    act(() => contact.unmount());
  });

  /**
   * The other half of the gate, and the one `core/` cannot state.
   *
   * A channel holds people a mutual friend brought in, and being in the room
   * with somebody is not permission to put a notification on their lock
   * screen. So the card is drawn exactly as it is for a contact — they are
   * still nearby, and the line still says so — and the one thing that is gone
   * is the button. Asserting the card survives is what keeps this from
   * passing because the roster stopped rendering.
   */
  it('offers no ping on the card of somebody who is only in the room', async () => {
    knowing();
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(dropped, { type: 'TICK' }, NOW + DISCONNECT_GRACE_MS + 1);
      })
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );

    expect(textOf(tree)).toContain('Nearby');
    expect(findButton(tree, 'Ping')).toBeUndefined();
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The minute the grace period used to cost.
   *
   * A phone suspends within a second of being pocketed, so somebody who steps
   * in and vanishes is held in `present` for DISCONNECT_GRACE_MS after the
   * heartbeat gives up. Whoever came in on the arrival notification spent all
   * of that reading "Present · reconnecting…" with nothing to press. The line
   * is unchanged, because it is still true; the button is there while it
   * stands.
   */
  it('offers a ping while the grace period still calls them present', async () => {
    knowing(THEM);
    showChannel(
      channelOf((s) => reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW))
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );

    expect(textOf(tree)).toContain('Present · reconnecting…');
    const ping = findButton(tree, 'Ping');
    expect(ping).toBeDefined();
    await act(async () => {
      ping!.props.onPress();
    });
    expect(mockApp.ping).toHaveBeenCalledWith('sess_1', THEM, '');
    act(() => tree.unmount());
  });

  /**
   * Somebody who stepped out an hour ago is a different act — open their
   * profile and say something. A button on every absent card would turn the
   * roster into a row of controls rather than a picture of the room.
   */
  // A contact, deliberately: the point is that `callable` withholds the button
  // from somebody who chose to leave, and a test with no contact list would
  // pass on the other gate and stop saying that.
  it('offers no ping on a card that is merely absent', () => {
    knowing(THEM);
    showChannel(channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW)));
    mockApp.serverNow = () => NOW + 60 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );

    expect(textOf(tree)).toContain('Stepped out');
    expect(findButton(tree, 'Ping')).toBeUndefined();
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The window the server keeps, arriving on the snapshot. Disabled rather
   * than gone: a button that vanishes under the finger reads as a mistake,
   * where one that says "Pinged" says what happened.
   */
  it('refuses a second ping while the window is open, and says which', () => {
    knowing(THEM);
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(dropped, { type: 'TICK' }, NOW + DISCONNECT_GRACE_MS + 1);
      })
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    mockApp.channelViews.sess_1 = {
      ...mockApp.channelViews.sess_1,
      pingableAt: { [THEM]: NOW + 8 * 60_000 },
    };
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );

    const ping = findButton(tree, 'Pinged');
    expect(ping).toBeDefined();
    expect(ping!.props.accessibilityState.disabled).toBe(true);
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('goes back to having stepped out once the wait has gone stale', () => {
    // The same clock throughout: fifteen minutes of waiting becomes sixteen
    // minutes of absence, never a fresh zero.
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(
          dropped,
          { type: 'TICK' },
          NOW + DISCONNECT_GRACE_MS + 1
        );
      })
    );
    mockApp.serverNow = () => NOW + WAITING_WINDOW_MS + 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Stepped out 16 minutes ago');
    expect(textOf(tree)).not.toContain('Waiting for');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says only that they are gone when it does not know since when', () => {
    // A restart drops presence without anybody stepping out, so there is no
    // moment to report. Dating it from the deploy would be a confident answer
    // to a question nothing here can answer.
    const channel = channelOf((s) =>
      reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW)
    );
    showChannel({ ...channel, lastPresentAt: {} });
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const text = textOf(tree);
    expect(text).toContain('Stepped out');
    expect(text).not.toContain('ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('counts the absence against the server clock', () => {
    // Same reason the floor countdown does: the device's clock drifts and can
    // be set by the user, and this one is compared against a server timestamp.
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW))
    );
    mockApp.serverNow = () => NOW + 3 * 3_600_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Stepped out 3 hours ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('opens their profile from the card', async () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const theirs = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Dana Chu'));
    await act(async () => theirs!.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(THEM);
    // And from there they can be kept, which is what the card is a route to.
    expect(findButton(tree, 'Add contact')).toBeDefined();
    act(() => tree.unmount());
  });

  /**
   * And from there to another room the two of you share, which this screen
   * used to draw and refuse. The cards were always listed — what you share
   * with somebody is worth reading wherever the profile is opened — but
   * `onEnterChannel` was withheld here on the reading that an in-channel
   * screen should not suggest walking out of the conversation you are in.
   * That left one list pressable from Contacts and inert here. Presence is
   * not a screen: going there hangs nothing up, and the room you left is a
   * tap away on Home.
   */
  it('steps into another channel tapped on the profile it opened', async () => {
    showChannel(channelOf());
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_other',
          name: 'Thursday rehearsal',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const onEnterChannel = jest.fn();
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
        onEnterChannel={onEnterChannel}
      />
    );
    const theirs = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Dana Chu'));
    await act(async () => theirs!.props.onPress());

    const card = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) =>
        String(n.props?.accessibilityLabel).startsWith('Thursday rehearsal')
      );
    expect(card).toBeDefined();
    await act(async () => card!.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_other', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_other');
    // And the profile closes behind it, since this screen is about to be
    // about the channel that was tapped rather than the one it was opened in.
    expect(textOf(tree)).not.toContain('Channels with them');
    act(() => tree.unmount());
  });

  /**
   * Except the one you are standing in, which is in the list deliberately —
   * a card saying they have not been in the room you are sitting in for a
   * week is the point of the section. Tapping it can only mean closing the
   * profile; routing to the channel already on screen would be a no-op that
   * looked like navigation.
   */
  it('only closes the profile when the channel tapped is this one', async () => {
    showChannel(channelOf());
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_1',
          name: 'This very room',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const onEnterChannel = jest.fn();
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
        onEnterChannel={onEnterChannel}
      />
    );
    const theirs = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Dana Chu'));
    await act(async () => theirs!.props.onPress());

    const card = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) =>
        String(n.props?.accessibilityLabel).startsWith('This very room')
      );
    await act(async () => card!.props.onPress());

    expect(onEnterChannel).not.toHaveBeenCalled();
    expect(textOf(tree)).not.toContain('Channels with them');
    act(() => tree.unmount());
  });

  /**
   * Your own card is a button like the rest. It used to be the one that was
   * not, because the screen behind it would have offered to add you as your
   * own contact — which ProfileView stopped doing when it learnt `isSelf`.
   * What it is for is reading your own profile as the roster around you
   * reads it — and editing it, which is the one thing the card leads to.
   */
  it('opens your own profile from your own card, without the contact card', async () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    // The Pressable rather than the host node cardFor finds: the role is on
    // both, the handler only on the composite.
    const mine = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Me, you'));
    expect(mine).toBeDefined();
    await act(async () => mine!.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(ME);
    // Nothing about a relationship with yourself, in either direction.
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    expect(findButton(tree, 'Remove contact')).toBeUndefined();
    act(() => tree.unmount());
  });
});

describe('being alone in a channel', () => {
  const showAudio = (micOpen: boolean) => ({ ...AUDIO, micOpen });

  const renderAlone = (micOpen: boolean) => {
    showChannel(channelOf());
    return render(
      <ChannelView
        channelId="sess_1"
        audio={{ ...showAudio(micOpen), status: 'connected' as const }}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
  };

  it('says the microphone is closed, and why', () => {
    const tree = renderAlone(false);
    const text = textOf(tree);
    expect(text).toContain('Closed until somebody else is here');
    expect(text).toContain('your other apps keep the speakers');
    expect(text).not.toContain('Open. Self-mute never affects');
    act(() => tree.unmount());
  });

  it('says so in the audio line too, rather than only waiting', () => {
    expect(textOf(renderAlone(false))).toContain(
      'microphone closed until somebody else is here'
    );
  });

  it('goes back to plain open copy once it is capturing', () => {
    const tree = renderAlone(true);
    const text = textOf(tree);
    expect(text).toContain('Open. Self-mute never affects floor eligibility.');
    expect(text).not.toContain('Closed until somebody else is here');
    act(() => tree.unmount());
  });

  it('still reports self-mute ahead of it, that being a choice', () => {
    // Muting yourself while alone is a decision; the microphone being closed
    // is housekeeping. The decision is what a person needs told back.
    showChannel(
      channelOf((s) =>
        reduce(s, { type: 'SET_SELF_MUTE', userId: ME, muted: true }, NOW)
      )
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={{ ...showAudio(false), status: 'connected' as const }}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Muted by you.');
    expect(textOf(tree)).not.toContain('Closed until somebody else is here');
    act(() => tree.unmount());
  });
});

/**
 * A channel screen with the repeated cards turned off.
 *
 * The setting removes ways of doing a thing twice, and nothing else, so what
 * these assert is a subtraction and the several exceptions to it: the
 * microphone and the two departures go whole, the floor's card stays and loses
 * only its button, the footer is untouched, and the two sentences that are
 * notices rather than explanations survive the cards that used to carry them.
 * The diagnostic panel survives too, on the ground that it is not a control
 * and no footer represents it.
 */

describe('pinging somebody who is not in the room', () => {
  /** Button carries no accessibility label, so it is found by its own props. */
  const buttonFor = (tree: ReactTestRenderer, label: string) =>
    tree.root.findAll((n) => n.props?.label === label)[0];

  const renderProfile = async (
    onPing?: (text: string) => Promise<void>,
    pingableAt?: number | null
  ) => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
          onPing={onPing}
          pingableAt={pingableAt}
        />
      );
    });
    return tree;
  };

  it('offers the composer when a ping is possible', async () => {
    const tree = await renderProfile(async () => {});

    expect(textOf(tree)).toContain('Ping');
    expect(textOf(tree)).toContain('They will get a notification.');
    act(() => tree.unmount());
  });

  /**
   * Not disabled — absent. An affordance that is present and refuses is worse
   * than one that was never offered, which is the same rule the channels
   * section above follows.
   */
  it('says nothing at all about pinging somebody who is here', async () => {
    const tree = await renderProfile(undefined);

    expect(textOf(tree)).not.toContain('Send ping');
    act(() => tree.unmount());
  });

  it('says how long until the next ping instead of a button that would fail', async () => {
    // The server has always refused inside the window. Offering the composer
    // anyway meant the only way to learn that was to type something and be
    // told no, which loses the words as well as the ping.
    const tree = await renderProfile(async () => {}, NOW + 4 * 60_000);

    expect(textOf(tree)).toContain('They have just been pinged.');
    expect(textOf(tree)).toContain('You can ping them again in 4 minutes.');
    expect(textOf(tree)).not.toContain('Send ping');
    act(() => tree.unmount());
  });

  it('offers the composer again once the window has passed', async () => {
    // A deadline in the past is not a wait of zero, it is no wait at all.
    const tree = await renderProfile(async () => {}, NOW - 1_000);

    expect(textOf(tree)).toContain('Send ping');
    expect(textOf(tree)).not.toContain('You can ping them again');
    act(() => tree.unmount());
  });

  it('sends what was typed, and says so afterwards', async () => {
    const onPing = jest.fn(async () => {});
    const tree = await renderProfile(onPing);

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Anything you want to say (optional)'
    )[0];
    await act(async () => field.props.onChangeText('we are starting'));
    await act(async () => buttonFor(tree, 'Send ping').props.onPress());

    expect(onPing).toHaveBeenCalledWith('we are starting');
    expect(textOf(tree)).toContain('Sent.');
    act(() => tree.unmount());
  });

  /**
   * A refusal here is an answer rather than a fault — they walked in, or
   * somebody pinged them a moment ago — so it is shown where it was asked for.
   */
  it('shows what the server said when it refuses', async () => {
    const onPing = jest.fn(async () => {
      throw new Error('They have just been pinged. Try again in a few minutes.');
    });
    const tree = await renderProfile(onPing);

    await act(async () => buttonFor(tree, 'Send ping').props.onPress());

    expect(textOf(tree)).toContain('They have just been pinged');
    expect(textOf(tree)).not.toContain('Sent.');
    act(() => tree.unmount());
  });
});

/**
 * A microphone that is closed because nobody is there to hear it.
 *
 * Being alone in a channel no longer takes the audio session as a call, which
 * is what leaves a Bluetooth speaker on A2DP and other apps audible. The
 * screen has to say so: a microphone the interface calls open and is not is
 * precisely the silent state this app keeps writing warnings about.
 */

describe('a channel screen without the repeated cards', () => {
  const footerOf = (tree: ReactTestRenderer) => {
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    return render(screen.props.footer);
  };

  const showBare = (channel = channelOf()) => {
    mockApp.controlCards = false;
    showChannel(channel);
    return render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
  };

  it('drops the cards the footer already offers', () => {
    const tree = showBare();
    const text = textOf(tree);
    expect(text).not.toContain('Your microphone');
    expect(text).not.toContain('Mute yourself');
    // Step out is in the footer, which `textOf` reaches through `Screen`, so
    // the assertion is that there is one of it rather than none — the card
    // and the heading above it are what went.
    expect(text.split('Step out')).toHaveLength(2);
    act(() => tree.unmount());
  });

  /**
   * The one card that stays, and the only one the setting reaches into rather
   * than removing. What it holds is a readout — who has the floor, how long is
   * left, why a claim is refused — and a footer icon has no room for any of
   * it. Only the button is a second way of doing something already under the
   * thumb.
   */
  it('keeps the floor card and takes only its button', () => {
    const tree = showBare();
    const text = textOf(tree);
    expect(text).toContain('The floor');
    expect(text).toContain('Nobody has the floor');
    expect(text).toContain('Speak uninterrupted for up to a minute.');
    // 'Claim' alone is the footer's, which stays. The card's button is the
    // longer label, and there is none of it.
    expect(text).not.toContain('Claim the floor');
    expect(text).not.toContain('Release the floor');
    act(() => tree.unmount());
  });

  /**
   * The clock, which is the reason the card stays: it is not repeated
   * anywhere, least of all in a bar with room for one word.
   */
  it('still runs the countdown while somebody holds the floor', () => {
    const tree = showBare(
      channelOf((c) => reduce(c, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const text = textOf(tree);
    expect(text).toContain('has the floor');
    // The clock itself, and the sentence saying why the act is refused.
    expect(text).toContain('60s');
    expect(text).toContain('You cannot claim the floor while you are silenced.');
    expect(text).not.toContain('Claim the floor');
    act(() => tree.unmount());
  });

  it('leaves everything the footer does not represent alone', () => {
    const tree = showBare();
    const text = textOf(tree);
    // The roster above the seam and the whole of what is below it.
    expect(text).toContain('Dana Chu');
    expect(text).toContain('What the channel is carrying');
    expect(text).toContain('Shared clipboard');
    expect(text).toContain('Recording');
    act(() => tree.unmount());
  });

  /**
   * The point of the setting, and the reason nothing is actually lost: the bar
   * is the same bar, with the same three acts on it, whichever way this is
   * set. A footer that thinned out with the cards would be a preference that
   * removed abilities rather than repetition.
   */
  it('keeps all three controls in the footer', () => {
    const tree = showBare();
    const footer = footerOf(tree);
    const text = textOf(footer);
    expect(text).toContain('Mute');
    expect(text).toContain('Claim');
    expect(text).toContain('Step out');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /**
   * Being unheard is not being unrecorded, and that sentence lived in the
   * microphone card. It is a notice rather than an explanation of a control,
   * so it moves up under the roster rather than going with the card — the
   * settings screen promises exactly this in as many words.
   */
  it('still says a silenced microphone is being recorded', () => {
    const tree = showBare(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW),
          { type: 'CLAIM_FLOOR', userId: THEM },
          NOW
        )
      )
    );
    expect(textOf(tree)).toContain('You are still being recorded');
    act(() => tree.unmount());
  });

  it('says it exactly once when the cards are drawn', () => {
    mockApp.controlCards = true;
    showChannel(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW),
          { type: 'CLAIM_FLOOR', userId: THEM },
          NOW
        )
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    expect(textOf(tree).split('You are still being recorded')).toHaveLength(2);
    act(() => tree.unmount());
  });

  /**
   * The other exception. Stepping in from here closes a microphone on another
   * phone, which the footer's Step In has no room to say and which somebody
   * would otherwise discover by doing it.
   */
  it('still says the channel is held on another device', () => {
    mockApp.controlCards = false;
    mockApp.displaced = true;
    showChannel(channelOf());
    // Present in the room, not on this device: the case the sentence is for.
    mockApp.standingIn = null;
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('closes the microphone there');
    // And the card it came from is still gone.
    expect(text).not.toContain('You are looking at this channel without');
    act(() => tree.unmount());
  });

  /**
   * The panel is a diagnostic, not one of the three acts, so a setting about
   * repeating the footer must not take it away — it would take it away from
   * the one account in a position to be reading it.
   */
  it('keeps the audio diagnostic panel, under a heading of its own', () => {
    mockApp.debug = true;
    const tree = showBare();
    expect(textOf(tree)).toContain('Audio session');
    act(() => tree.unmount());
  });
});

/**
 * Whether the channel screen repeats its footer as cards.
 *
 * The same three things this screen owes any of its settings: both answers, a
 * mark on the one in force, and reporting a change upward. What the choice
 * does is asserted on the channel screen above.
 */
