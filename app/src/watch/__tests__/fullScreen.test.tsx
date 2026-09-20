import React from 'react';
import { Text } from 'react-native';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { FullScreen, HIDE_AFTER_MS } from '../FullScreen';
import { isTap } from '../Dock';
import { WholeWindowContext } from '../../ui/layout';

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
 * **And since 2026-09-20 the turn is not the only way out, because it is not
 * available on most surfaces.** A browser window and a tablet are landscape
 * sitting still and have no turn to perform, so *Exit full screen* is back —
 * on every platform, the phone included, since one control that means the same
 * thing everywhere beats one that appears on some surfaces. It is the only
 * thing on the scrim besides the transport: the channel's own pinned bar went
 * the same day and stays gone, and *Back to portrait* was replaced by this
 * rather than kept beside it.
 *
 * What this file asserts is therefore as much about what is absent as about
 * what is there — a room control creeping back onto the scrim is the
 * regression this catches.
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

function draw(onExit: () => void = () => {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <FullScreen
        picture={<Text>picture</Text>}
        chrome={<Text>transport</Text>}
        onExit={onExit}
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
            onExit={() => {}}
          />
        </WholeWindowContext.Provider>
      );
    });
    expect(claim).toHaveBeenCalledWith(true);
    act(() => tree.unmount());
    expect(claim).toHaveBeenLastCalledWith(false);
  });

  it('carries the transport, the way out, and nothing of the room', () => {
    /*
      **Two things on the scrim and no third.** The transport, which arrives as
      `chrome` and is the caller's, and *Exit full screen*.

      The channel's own pinned bar — mute, the floor, the three rungs of
      presence — was here for a day on the argument that this is a talking
      application before it is a video one. What it bought was reachability
      that was never more than one press away; what it cost was a fifth of a
      sideways phone.

      Named rather than counted, because the regression is a control creeping
      back one at a time: every word listed here is one that was over the film
      within the last two days, and a test that counted buttons would pass
      while the wrong one showed. *Back to portrait* is in the list because it
      was replaced by the exit rather than joined by it — two ways out on one
      scrim is the thing the channel's bar was taken off for.
    */
    const tree = draw();
    expect(press(tree, 'Exit full screen')).toBeDefined();
    for (const word of [
      'Back to portrait',
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

  it('reports the press rather than collapsing itself', () => {
    /*
      **The state is the caller's, which is what stops the old bug coming
      back.** The pair of controls removed on 2026-09-19 set a flag this
      component owned, and the flag could disagree with the glass: the expanded
      picture locked the phone sideways, exiting released the lock, and an
      unlocked phone goes back to how it is being held. There is no lock now
      and nothing here decides anything — `ChannelView` holds what was pressed
      and weighs it against the shape of the window.
    */
    const onExit = jest.fn();
    const tree = draw(onExit);
    act(() => press(tree, 'Exit full screen')!.props.onPress());
    expect(onExit).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('shows the transport before hiding it', () => {
    /*
      **Up first, then away.** Somebody arriving here is shown the transport
      and the way out before either goes, rather than having to discover that a
      tap produces them. Both are drawn throughout and it is their opacity that
      changes; what a test can hold is that neither was left out of the tree.
    */
    const tree = draw();
    const text = tree.root
      .findAll((n: ReactTestInstance) => n.type === Text)
      .flatMap((n: ReactTestInstance) => n.props.children);
    expect(text).toContain('transport');
    act(() => tree.unmount());
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
