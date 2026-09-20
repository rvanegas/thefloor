import React from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import {
  HOME_CORNER,
  PIP_HEIGHT,
  PIP_WIDTH,
  WatchDock,
  cornerOrigin,
  isTap,
  nearestCorner,
} from '../Dock';

/** The gap the picture keeps from the edges, which `spacing(1.5)` is. */
const INSET = 12;

/** Somewhere for the docked picture to be, when the arrangement is the point. */
const SLOT = { x: 0, y: 44, width: 390, height: 219 };

/**
 * The picture that does not belong to the screen it is watched from.
 *
 * Two things are asserted here and they are the two that cost something when
 * they are wrong. **That the player survives the move** is the whole design:
 * a `WebView` reparented is a `WebView` rebuilt, and a rebuild is a black
 * rectangle and a reload of the film every time somebody touches the tab bar —
 * which would be a worse version of the defect this replaces. And **that the
 * floating picture is always in a corner of the application**, because nothing
 * would bring it back from anywhere else: there is no scroll under it, no edge
 * to throw it in from and no way to reach a control that is no longer drawn.
 */
describe('The floating picture rests in a corner', () => {
  const box = { width: 390, height: 780 };

  it('puts each corner where its name says, an inset in from both edges', () => {
    expect(cornerOrigin('top-left', box)).toEqual({ x: INSET, y: INSET });
    expect(cornerOrigin('top-right', box)).toEqual({
      x: box.width - PIP_WIDTH - INSET,
      y: INSET,
    });
    expect(cornerOrigin('bottom-left', box)).toEqual({
      x: INSET,
      y: box.height - PIP_HEIGHT - INSET,
    });
    expect(cornerOrigin('bottom-right', box)).toEqual({
      x: box.width - PIP_WIDTH - INSET,
      y: box.height - PIP_HEIGHT - INSET,
    });
  });

  it('starts in the corner a thumb covers least of', () => {
    expect(HOME_CORNER).toBe('bottom-right');
  });

  it('pins it to the top-left in a box too small to hold it', () => {
    // A naive clamp inverts its own range here and puts the picture somewhere
    // no gesture asked for. Nothing draws a box this small today; a narrow
    // pane in a small window could.
    expect(cornerOrigin('bottom-right', { width: 100, height: 60 })).toEqual({
      x: INSET,
      y: INSET,
    });
  });

  /*
    By quadrant rather than by distance, which is the decision worth writing a
    test around. A phone is more than twice as tall as the picture is wide, so
    a rectangle let go halfway up the left edge is *nearer* the corner it came
    from than either corner on the left — and a snap that measured distance
    would put it back where it started, which reads as the drag having failed.
  */
  it('sends it to the corner of the quadrant it was let go in', () => {
    expect(nearestCorner({ x: 10, y: 10 }, box)).toBe('top-left');
    expect(nearestCorner({ x: 300, y: 10 }, box)).toBe('top-right');
    expect(nearestCorner({ x: 10, y: 700 }, box)).toBe('bottom-left');
    expect(nearestCorner({ x: 300, y: 700 }, box)).toBe('bottom-right');
  });

  it('takes a drag halfway up the left edge as the left, not as where it came from', () => {
    // Dropped just above the middle on the left: much further from the two top
    // corners in a straight line than from bottom-right, and plainly meant for
    // the top-left all the same.
    const origin = { x: 20, y: box.height / 2 - PIP_HEIGHT };
    expect(nearestCorner(origin, box)).toBe('top-left');
  });

  /*
    The same surface is the drag and the way to the controls, there being
    nothing else on a 168pt rectangle to put a second one on. So the two are
    told apart by distance, and a thumb that misses by a couple of points on
    the way to the tab is still asking for the tab.
  */
  it('reads a short movement as a tap and a long one as a drag', () => {
    expect(isTap({ dx: 2, dy: -3 })).toBe(true);
    expect(isTap({ dx: 40, dy: 0 })).toBe(false);
    expect(isTap({ dx: 0, dy: -60 })).toBe(false);
  });
});

/**
 * **The one structural fact this component exists to hold.**
 *
 * The docked picture and the floating one are one element in two styles. If
 * they ever become two renders in two branches this test fails, and the thing
 * it is protecting is not tidiness: React unmounts a subtree that moves, the
 * subtree here is a `WebView`, and unmounting one throws away the loaded page,
 * the player inside it and the place in the film.
 */
describe('Moving the picture does not rebuild it', () => {
  const box = { width: 390, height: 780 };
  let mounts = 0;

  function Film(): React.ReactElement {
    React.useEffect(() => {
      mounts += 1;
    }, []);
    return <Text>film</Text>;
  }

  const docked = (
    <WatchDock place="docked" slot={SLOT} box={box} onOpen={() => {}}>
      <Film />
    </WatchDock>
  );
  const floating = (
    <WatchDock place="floating" slot={null} box={box} onOpen={() => {}}>
      <Film />
    </WatchDock>
  );

  it('keeps the player mounted across every move', () => {
    mounts = 0;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(docked);
    });
    expect(mounts).toBe(1);

    // Onto another tab, and back, and away again — and out to Home, which is
    // the move that used to take the channel screen and the film with it.
    act(() => tree.update(floating));
    act(() => tree.update(docked));
    act(() => tree.update(floating));

    expect(mounts).toBe(1);
    act(() => tree.unmount());
  });

  /*
    And the two styles are the two arrangements rather than one drawn twice:
    docked lands in the hole the channel screen measured for it, and floating
    goes to a corner of the application. Both are absolute now — the hole is
    what takes the height out of the body — so what tells them apart is where
    they are put rather than whether they are positioned at all. An inversion
    here draws a full-width picture across the notepad.
  */
  it('fills the measured hole docked and sits in a corner floating', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(docked);
    });
    const outer = () =>
      StyleSheet.flatten(
        tree.root.findAll((node) => node.type === 'View')[0]!.props.style
      );
    expect(outer()).toMatchObject({
      position: 'absolute',
      left: SLOT.x,
      top: SLOT.y,
      width: SLOT.width,
      height: SLOT.height,
    });

    act(() => tree.update(floating));
    expect(outer()).toMatchObject({
      position: 'absolute',
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
      left: cornerOrigin(HOME_CORNER, box).x,
      top: cornerOrigin(HOME_CORNER, box).y,
    });
    act(() => tree.unmount());
  });

  /*
    **Docked with nowhere to be is drawn and not shown, and never unmounted.**
    The obvious handling — nothing until a rectangle arrives — is the one thing
    this component must not do: null unmounts the `WebView`, which is the reload
    everything here is arranged to avoid, and it would happen on the very frame
    somebody taps *Watch*. `Picture` reads the place off the presence of a hole
    so the two cannot disagree, but this is the guard for everyone else.
  */
  it('stays mounted and invisible docked until the hole has been measured', () => {
    mounts = 0;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WatchDock place="docked" slot={null} box={box} onOpen={() => {}}>
          <Film />
        </WatchDock>
      );
    });
    expect(mounts).toBe(1);
    const outer = () =>
      StyleSheet.flatten(
        tree.root.findAll((node) => node.type === 'View')[0]!.props.style
      );
    expect(outer().opacity).toBe(0);

    // And the measurement puts it where the hole is, without rebuilding it.
    act(() => {
      tree.update(
        <WatchDock place="docked" slot={SLOT} box={box} onOpen={() => {}}>
          <Film />
        </WatchDock>
      );
    });
    expect(outer().opacity).toBeUndefined();
    expect(outer().top).toBe(SLOT.y);
    expect(mounts).toBe(1);
    act(() => tree.unmount());
  });

  /*
    **A paused film is floating and not shown, by the same handling.** The
    corner exists so that a film goes on running where somebody can see it
    while they are somewhere else in the application; a still frame parked over
    the notepad is not that. Unmounting it would be the reload again — and
    pausing is the most ordinary thing anybody does to a film, so this is the
    one place that could not afford it.

    The drag surface goes with the paint: an invisible 168-point rectangle that
    answers a tap by opening the *Watch* tab is worse than no rectangle at all.
  */
  it('stays mounted and invisible floating while the film is paused', () => {
    mounts = 0;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WatchDock place="floating" slot={null} box={box} hidden onOpen={() => {}}>
          <Film />
        </WatchDock>
      );
    });
    expect(mounts).toBe(1);
    const view = () => tree.root.findAll((node) => node.type === 'View')[0]!;
    expect(StyleSheet.flatten(view().props.style).opacity).toBe(0);
    expect(view().props.pointerEvents).toBe('none');
    // Nothing to take a finger: the surface that opens the tab is gone with it.
    expect(
      tree.root.findAll(
        (node) => node.props.accessibilityLabel === 'Open the watch tab'
      )
    ).toHaveLength(0);

    // And play puts it back in its corner, the same element throughout.
    act(() => tree.update(floating));
    expect(StyleSheet.flatten(view().props.style).opacity).toBeUndefined();
    expect(
      tree.root.findAll(
        (node) => node.props.accessibilityLabel === 'Open the watch tab'
      ).length
    ).toBeGreaterThan(0);
    expect(mounts).toBe(1);
    act(() => tree.unmount());
  });
});
