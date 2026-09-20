import React from 'react';
import { Text } from 'react-native';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import * as ScreenOrientation from 'expo-screen-orientation';
import { FullScreen, HIDE_AFTER_MS, swipeCompleted } from '../FullScreen';
import { isTap } from '../Dock';
import { WholeWindowContext } from '../../ui/layout';

jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => {}),
  unlockAsync: jest.fn(async () => {}),
  OrientationLock: { LANDSCAPE: 5 },
}));

/**
 * The ways out of a state that has no other way out.
 *
 * Full screen is drawn by this application rather than by YouTube or by iOS,
 * so nothing outside this file offers an escape from it: there is no `esc` on
 * a phone, no system player to dismiss, and the film's own bar — which used to
 * carry the button — went on 2026-09-18. A person who cannot find the control
 * we drew is a person holding a black rectangle. So each way out is asserted
 * here, including the one that is about the hardware.
 */
/**
 * A button by the word it draws, which for these is the point: a `Button`
 * naming itself in `accessibilityLabel` is one whose word is *not* on the
 * screen, and the exit's whole argument is that its word is.
 */
const press = (tree: ReactTestRenderer, label: string) =>
  tree.root
    .findAll((n: ReactTestInstance) => n.props?.accessibilityRole === 'button')
    .find((n: ReactTestInstance) =>
      n
        .findAll((t: ReactTestInstance) => t.type === Text)
        .some((t: ReactTestInstance) => t.props.children === label)
    );

function draw(onCollapse: () => void) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <FullScreen
        onCollapse={onCollapse}
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
      **The other half of the hardware, and the same trap.** Turning the phone
      sideways makes it wider than the breakpoint, so the gesture that was
      meant to hand the film the glass handed Home a third of it — a picture
      *smaller* than it had been in portrait, which is the one outcome the
      layout rule exists to prevent. And a window left with no list in it by a
      picture that is no longer there is as invisible a bug as a phone left
      locked sideways, so the release is asserted too.
    */
    const claim = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WholeWindowContext.Provider value={{ taken: false, claim }}>
          <FullScreen
            onCollapse={() => {}}
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

  it('says the words on the way out rather than drawing a shape', () => {
    // A glyph is findable once it has been learnt, and the exit from a state
    // with no other exit is not where somebody learns one.
    const collapse = jest.fn();
    const tree = draw(collapse);
    const exit = press(tree, 'Exit full screen');
    expect(exit).toBeDefined();
    act(() => exit!.props.onPress());
    expect(collapse).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('shows the transport and the channel’s own bar before hiding them', () => {
    /*
      **Up first, then away.** The row that exits is also the row that pauses,
      so somebody arriving here is shown both before either goes — the exit is
      learnt and then hidden rather than never seen. Both are drawn throughout
      and it is their opacity that changes; what a test can hold is that
      neither was left out of the tree.
    */
    const tree = draw(() => {});
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
    and a 16:9 film fitted into the rest is well short of the glass. The swipe
    is what makes the original worry survivable — it never depended on the
    chrome and is unchanged — and a touch anywhere brings the row back.
  */
  it('takes the chrome down after a spell with nothing pressed', () => {
    jest.useFakeTimers();
    try {
      const tree = draw(() => {});
      const chrome = () =>
        tree.root.findAll(
          (n: ReactTestInstance) => n.props?.testID === 'chrome'
        )[0]!.props;
      // Up on arrival, so the way out is seen at least once.
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

  it('tells a swipe out from a tap that asks for the controls back', () => {
    // Far enough down is the way out; barely anywhere is the tap. A finger
    // that moves an inch and stops has changed its mind and does neither.
    expect(swipeCompleted({ dy: 120 })).toBe(true);
    expect(swipeCompleted({ dy: 40 })).toBe(false);
    expect(isTap({ dx: 2, dy: -3 })).toBe(true);
    expect(isTap({ dx: 0, dy: 40 })).toBe(false);
  });

  it('puts the phone back the way it found it', () => {
    /*
      **The trap this is here for.** The lock is easy and the release is the
      half that goes missing: a phone left locked sideways by a picture that is
      no longer on the screen is a bug with no visible cause, and the exits
      that are not a button — the party stopping, the film moving to another
      device — all arrive as an unmount rather than as a press.
    */
    const tree = draw(() => {});
    expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
      ScreenOrientation.OrientationLock.LANDSCAPE
    );
    act(() => tree.unmount());
    expect(ScreenOrientation.unlockAsync).toHaveBeenCalled();
  });
});
