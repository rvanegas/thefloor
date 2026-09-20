import React from 'react';
import { Text } from 'react-native';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import * as ScreenOrientation from 'expo-screen-orientation';
import { FullScreen, HIDE_AFTER_MS } from '../FullScreen';
import { PORTRAIT_HOLD_MS, returnToPortrait } from '../orientation';
import { isTap } from '../Dock';
import { WholeWindowContext } from '../../ui/layout';

jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => {}),
  unlockAsync: jest.fn(async () => {}),
  OrientationLock: { PORTRAIT_UP: 3 },
}));

/**
 * What is over the film, which since 2026-09-20 is the transport and nothing.
 *
 * Full screen is drawn by this application rather than by YouTube or by iOS,
 * so nothing outside this file offers an escape from it: there is no `esc` on
 * a phone, no system player to dismiss, and the film's own bar — which used to
 * carry the button — went on 2026-09-18. Since 2026-09-19 the way out is the
 * phone itself: `ChannelView` derives this state from the shape of the window,
 * and turning the device upright collapses it.
 *
 * **And since 2026-09-20 that is the only way out, there being no control here
 * at all beyond the transport.** The channel's own pinned bar and the *Back to
 * portrait* button both went: sideways, the only controls are the film's. What
 * this file asserts is therefore as much about what is absent as about what is
 * there — a room control that creeps back onto the scrim is the regression,
 * and the last test below is the one that catches it.
 */
/**
 * A button by the word it draws, which for these is the point: a `Button`
 * naming itself in `accessibilityLabel` is one whose word is *not* on the
 * screen, and what is being asserted is which words are.
 */
const press = (tree: ReactTestRenderer, label: string) =>
  tree.root
    .findAll((n: ReactTestInstance) => n.props?.accessibilityRole === 'button')
    .find((n: ReactTestInstance) =>
      n
        .findAll((t: ReactTestInstance) => t.type === Text)
        .some((t: ReactTestInstance) => t.props.children === label)
    );

function draw() {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <FullScreen picture={<Text>picture</Text>} chrome={<Text>transport</Text>} />
    );
  });
  return tree;
}

describe('The expanded picture', () => {
  it('takes the window off the list beside it, and gives it back', () => {
    /*
      **The other half of the hardware, and the same trap.** A phone on its
      side is wider than the breakpoint, so without this the rotation that was
      meant to give the film the glass hands Home a third of it and leaves a
      picture *smaller* than it had been in portrait — which is the one
      outcome the layout rule exists to prevent. And a window left with no
      list in it by a picture that is no longer there is as invisible a bug as
      a phone left locked sideways would be, so the release is asserted too.
    */
    const claim = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WholeWindowContext.Provider value={{ taken: false, claim }}>
          <FullScreen
            picture={<Text>picture</Text>}
            chrome={<Text>transport</Text>}
          />
        </WholeWindowContext.Provider>
      );
    });
    expect(claim).toHaveBeenCalledWith(true);
    act(() => tree.unmount());
    expect(claim).toHaveBeenLastCalledWith(false);
  });

  it('carries the transport and no control belonging to the room', () => {
    /*
      **The rule this asserts is one sentence: sideways, the only controls are
      the film's.** Pause and play, the progress bar and the two seeks — which
      arrive as `chrome` and are the caller's — and nothing else.

      Two things were here on 2026-09-19 and are not now. The channel's own
      pinned bar was kept on the argument that this is a talking application
      before it is a video one; what it actually bought was reachability that
      was never more than a turn of the wrist away, at a fifth of a sideways
      phone. And *Back to portrait* went with it.

      Named rather than counted, because the regression is a control creeping
      back one at a time: every word listed here is one that was over the film
      within the last two days, and a test that merely counted buttons would
      pass while the wrong one was showing.
    */
    const tree = draw();
    for (const word of [
      'Back to portrait',
      'Exit full screen',
      'Full screen',
      'Mute',
      'Unmute',
      'Claim',
      'Release',
      'In',
      'Nearby',
      'Out',
    ]) {
      expect(press(tree, word)).toBeUndefined();
    }
    act(() => tree.unmount());
  });

  it('shows the transport before hiding it', () => {
    /*
      **Up first, then away.** Somebody arriving here is shown the transport
      before it goes, rather than having to discover that a tap produces one.
      It is drawn throughout and it is its opacity that changes; what a test
      can hold is that it was not left out of the tree.
    */
    const tree = draw();
    const text = tree.root
      .findAll((n: ReactTestInstance) => n.type === Text)
      .flatMap((n: ReactTestInstance) => n.props.children);
    expect(text).toContain('transport');
    act(() => tree.unmount());
  });

  it('turns the interface upright and then lets the lock go', () => {
    /*
      **Kept although nothing calls it, which is the unusual half.** The
      *Back to portrait* button went on 2026-09-20 and `returnToPortrait` did
      not: a window that is landscape because it is a browser, or an iPad, or
      a phone flat on a table, is the open question — see `ChannelView` — and
      whatever answers it is likely to want a way to turn the interface that
      does not involve turning the device. The mechanism stays proven in the
      meantime, since the half that goes missing is not the lock but the
      release, and a phone left locked upright by a picture that is no longer
      on the screen is a bug with no visible cause.

      The release cannot live in a component's cleanup — the rotation is what
      unmounts the caller, so the cleanup would fire on the frame the lock was
      applied. It is a timer above the tree.
    */
    jest.useFakeTimers();
    try {
      returnToPortrait();
      expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
      expect(ScreenOrientation.unlockAsync).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(PORTRAIT_HOLD_MS + 1);
      });
      expect(ScreenOrientation.unlockAsync).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  /*
    **The chrome goes, and that reverses what this file said for a day.** It
    argued that fading the row would hide the only way out behind a gesture
    nobody was told about. What it cost was the thing full screen is for: the
    transport and the footer together took about a fifth of a sideways phone,
    and a 16:9 film fitted into the rest is well short of the glass. What makes
    the original worry survivable is that the way out is not a control at all
    any more — a person who never finds a button turns the phone upright, as
    they would with any other film on any other phone — and a touch anywhere
    brings the row back.
  */
  it('takes the chrome down after a spell with nothing pressed', () => {
    jest.useFakeTimers();
    try {
      const tree = draw();
      const chrome = () =>
        tree.root.findAll(
          (n: ReactTestInstance) => n.props?.testID === 'chrome'
        )[0]!.props;
      // Up on arrival, so the row is seen at least once.
      expect(chrome().pointerEvents).toBe('box-none');

      act(() => {
        jest.advanceTimersByTime(HIDE_AFTER_MS + 1);
      });
      // Down, and inert with it — an invisible full-width bar that still
      // caught touches would swallow the tap aimed at bringing it back.
      expect(chrome().pointerEvents).toBe('none');
      act(() => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for the controls back on a tap and on nothing else', () => {
    // A finger that travels is a finger that changed its mind. The swipe that
    // used to be the way out went with the flag it set: leaving is a rotation
    // now, so the gesture had nothing left to mean.
    expect(isTap({ dx: 2, dy: -3 })).toBe(true);
    expect(isTap({ dx: 0, dy: 40 })).toBe(false);
  });
});
