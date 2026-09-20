import React from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import {
  PIP_HEIGHT,
  PIP_WIDTH,
  WatchDock,
  clampOffset,
  isTap,
} from '../Dock';

/**
 * The picture that does not belong to the tab it is watched from.
 *
 * Two things are asserted here and they are the two that cost something when
 * they are wrong. **That the player survives the move** is the whole design:
 * a `WebView` reparented is a `WebView` rebuilt, and a rebuild is a black
 * rectangle and a reload of the film every time somebody touches the tab bar —
 * which would be a worse version of the defect this replaces. And **that the
 * floating picture cannot be dragged off the screen**, because nothing would
 * bring it back: there is no scroll under it, no edge to throw it in from and
 * no way to reach a control that is no longer drawn.
 */
describe('The floating picture stays reachable', () => {
  const body = { width: 390, height: 600 };

  it('lets it move left and up from its corner, and no further', () => {
    // The anchor is the bottom-right corner, so every reachable position is
    // zero or negative: a drag to the far left is the width of the body less
    // the picture and its two insets.
    const far = clampOffset({ x: -10_000, y: -10_000 }, body);
    expect(far.x).toBe(-(body.width - PIP_WIDTH - 24));
    expect(far.y).toBe(-(body.height - PIP_HEIGHT - 24));
  });

  it('refuses to be pushed past the corner it is anchored to', () => {
    // Down and to the right is off the bottom of the phone, under the footer
    // and behind the home indicator.
    expect(clampOffset({ x: 400, y: 400 }, body)).toEqual({ x: 0, y: 0 });
  });

  it('leaves a position inside the body exactly where it was let go', () => {
    expect(clampOffset({ x: -120, y: -300 }, body)).toEqual({
      x: -120,
      y: -300,
    });
  });

  it('pins it to the corner in a body too small to hold it', () => {
    // A naive clamp inverts its own range here and puts the picture somewhere
    // no gesture asked for. Nothing draws a body this small today; a narrow
    // pane in a small window could.
    expect(clampOffset({ x: -50, y: -50 }, { width: 100, height: 60 })).toEqual(
      { x: 0, y: 0 }
    );
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
  let mounts = 0;

  function Film(): React.ReactElement {
    React.useEffect(() => {
      mounts += 1;
    }, []);
    return <Text>film</Text>;
  }

  it('keeps the player mounted across every move', () => {
    mounts = 0;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WatchDock place="docked" onOpen={() => {}}>
          <Film />
        </WatchDock>
      );
    });
    expect(mounts).toBe(1);

    // Onto another tab, and back, and away again.
    act(() => {
      tree.update(
        <WatchDock place="floating" onOpen={() => {}}>
          <Film />
        </WatchDock>
      );
    });
    act(() => {
      tree.update(
        <WatchDock place="docked" onOpen={() => {}}>
          <Film />
        </WatchDock>
      );
    });
    act(() => {
      tree.update(
        <WatchDock place="floating" onOpen={() => {}}>
          <Film />
        </WatchDock>
      );
    });

    expect(mounts).toBe(1);
    act(() => tree.unmount());
  });

  /*
    And the two styles are the two arrangements rather than one drawn twice:
    docked is in the flow, where it takes its own height out of the body the
    way the pinned header takes its own out of the viewport, and floating is
    over it. An inversion here draws a full-width picture across the notepad.
  */
  it('is in the flow docked and over the body floating', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WatchDock place="docked" onOpen={() => {}}>
          <Text>film</Text>
        </WatchDock>
      );
    });
    const outer = () =>
      StyleSheet.flatten(
        tree.root.findAll((node) => node.type === 'View')[0]!.props.style
      );
    expect(outer().position).toBeUndefined();

    act(() => {
      tree.update(
        <WatchDock place="floating" onOpen={() => {}}>
          <Text>film</Text>
        </WatchDock>
      );
    });
    expect(outer().position).toBe('absolute');
    act(() => tree.unmount());
  });
});
