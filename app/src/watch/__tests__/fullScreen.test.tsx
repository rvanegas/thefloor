import React from 'react';
import { Text } from 'react-native';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import * as ScreenOrientation from 'expo-screen-orientation';
import { FullScreen, HIDE_AFTER_MS } from '../FullScreen';
import { PORTRAIT_HOLD_MS } from '../orientation';
import { isTap } from '../Dock';
import { WholeWindowContext } from '../../ui/layout';

jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => {}),
  unlockAsync: jest.fn(async () => {}),
  OrientationLock: { PORTRAIT_UP: 3 },
}));

/**
 * The way out of a state that has no other way out.
 *
 * Full screen is drawn by this application rather than by YouTube or by iOS,
 * so nothing outside this file offers an escape from it: there is no `esc` on
 * a phone, no system player to dismiss, and the film's own bar — which used to
 * carry the button — went on 2026-09-18. Since 2026-09-19 the way out is the
 * phone itself: `ChannelView` derives this state from the shape of the window,
 * and turning the device upright collapses it. What is left here is the one
 * control for somebody the accelerometer cannot help — lying down, or holding
 * the phone flat — and it is about the hardware rather than about the picture.
 */
/**
 * A button by the word it draws, which for this one is the point: a `Button`
 * naming itself in `accessibilityLabel` is one whose word is *not* on the
 * screen, and the way out's whole argument is that its word is.
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
      <FullScreen
        picture={<Text>picture</Text>}
        chrome={<Text>transport</Text>}
        footer={<Text>footer</Text>}
      />
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
            footer={<Text>footer</Text>}
          />
        </WholeWindowContext.Provider>
      );
    });
    expect(claim).toHaveBeenCalledWith(true);
    act(() => tree.unmount());
    expect(claim).toHaveBeenLastCalledWith(false);
  });

  it('turns the phone upright rather than collapsing itself', () => {
    /*
      **The control does not touch this state, and that is the design.** Full
      screen is derived from the shape of the window, so a button that set a
      flag could leave the flag and the glass disagreeing — which is exactly
      what the old pair did: the expanded picture locked the device sideways,
      and exiting released the lock, so somebody who pressed *Exit full
      screen* while still holding the phone sideways got the channel screen
      sideways. This turns the interface, and the collapse follows from that.
    */
    jest.useFakeTimers();
    try {
      const tree = draw();
      const out = press(tree, 'Back to portrait');
      expect(out).toBeDefined();
      act(() => out!.props.onPress());
      expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
      // Nothing about the picture is asked to change; the window is.
      expect(press(tree, 'Exit full screen')).toBeUndefined();
      act(() => tree.unmount());

      /*
        **And the lock is let go of, which is the half that goes missing.** A
        phone left locked upright by a picture that is no longer on the screen
        is a bug with no visible cause, and the release cannot live in this
        component's cleanup — the rotation is what unmounts it, so the
        cleanup would fire on the frame the lock was applied. It is a timer
        above the tree, and the unmount above proves it outlives the caller.
      */
      expect(ScreenOrientation.unlockAsync).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(PORTRAIT_HOLD_MS + 1);
      });
      expect(ScreenOrientation.unlockAsync).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the transport and the channel’s own bar before hiding them', () => {
    /*
      **Up first, then away.** The row that turns the phone is also the row
      that pauses, so somebody arriving here is shown both before either goes.
      Both are drawn throughout and it is their opacity that changes; what a
      test can hold is that neither was left out of the tree.
    */
    const tree = draw();
    const text = tree.root
      .findAll((n: ReactTestInstance) => n.type === Text)
      .flatMap((n: ReactTestInstance) => n.props.children);
    expect(text).toContain('transport');
    expect(text).toContain('footer');
    act(() => tree.unmount());
  });

  /*
    **The chrome goes, and that reverses what this file said for a day.** It
    argued that fading the row would hide the only way out behind a gesture
    nobody was told about. What it cost was the thing full screen is for: the
    transport and the footer together take about a fifth of a sideways phone,
    and a 16:9 film fitted into the rest is well short of the glass. What makes
    the original worry survivable is that the way out is not a control at all
    any more — a person who never finds the button turns the phone upright, as
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
