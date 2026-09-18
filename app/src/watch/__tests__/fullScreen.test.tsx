import React from 'react';
import { Text } from 'react-native';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import * as ScreenOrientation from 'expo-screen-orientation';
import { FullScreen, swipeCompleted, swipeStarted } from '../FullScreen';

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

  it('keeps the transport and the channel’s own bar on the screen', () => {
    // The chrome never hides, which is the departure from every other video
    // player: the row that exits is also the row that pauses, and a floor
    // holder who cannot pause without first finding a hidden control has been
    // given a film instead of a conversation.
    const tree = draw(() => {});
    const text = tree.root
      .findAll((n: ReactTestInstance) => n.type === Text)
      .flatMap((n: ReactTestInstance) => n.props.children);
    expect(text).toContain('transport');
    expect(text).toContain('footer');
    act(() => tree.unmount());
  });

  it('takes a downward swipe and leaves every other drag alone', () => {
    expect(swipeStarted({ dx: 0, dy: 40 })).toBe(true);
    // Sideways, and upwards: neither is this gesture, and a picture that
    // swallowed them could never be given anything else to do.
    expect(swipeStarted({ dx: 60, dy: 20 })).toBe(false);
    expect(swipeStarted({ dx: 0, dy: -40 })).toBe(false);
    // Started is not finished. A finger that moves an inch and stops has
    // scrolled nothing and must not close anything.
    expect(swipeCompleted({ dy: 40 })).toBe(false);
    expect(swipeCompleted({ dy: 120 })).toBe(true);
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
