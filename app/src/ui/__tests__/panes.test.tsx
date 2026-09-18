import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { Panes } from '../Panes';
import { usePane } from '../layout';

/**
 * The two arrangements, and the one property that is invisible until it is
 * gone.
 *
 * `Panes` takes two elements and reads nothing, so it renders without
 * `AppProvider`, without a socket and without a window — which is why the
 * component exists at all rather than the arrangement being inline in
 * `App.tsx`.
 */

/** Counts its own mounts, which is the whole of what is being asserted. */
let mounts = 0;
function Detail() {
  const pane = usePane();
  React.useEffect(() => {
    mounts += 1;
  }, []);
  return <Text>{`detail in ${String(pane)}`}</Text>;
}

function List() {
  const pane = usePane();
  return <Text>{`list in ${String(pane)}`}</Text>;
}

/**
 * Whether anything in the tree is listening for a drag. `PanResponder` hands
 * back the responder system's own prop names rather than its own, so this
 * looks for `onMoveShouldSetResponderCapture` and not the `PanResponder` one.
 */
function responderOf(tree: ReactTestRenderer): boolean {
  return tree.root.findAll(
    (node) =>
      typeof node.props?.onMoveShouldSetResponderCapture === 'function'
  ).length > 0;
}

/**
 * How far the detail slot is from where it belongs, read off the `Animated`
 * value the transform is hung on rather than off a rendered number — which is
 * what a native-driven transform leaves behind to look at.
 */
function offsetOf(tree: ReactTestRenderer): number {
  const styled = tree.root.findAll(
    (node) =>
      Array.isArray(node.props?.style) &&
      node.props.style.some(
        (entry: unknown) =>
          !!entry && typeof entry === 'object' && 'transform' in entry
      )
  );
  const style = styled[0]!.props.style.find(
    (entry: unknown) => !!entry && typeof entry === 'object' && 'transform' in entry
  );
  return style.transform[0].translateX.__getValue();
}

function textOf(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((node) => node.type === Text)
    .map((node) => String(node.props.children));
}

beforeEach(() => {
  mounts = 0;
});

describe('the two arrangements', () => {
  it('shows only the screen below the breakpoint', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Panes layout="stack" list={<List />} detail={<Detail />} />
      );
    });
    expect(textOf(tree)).toEqual(['detail in null']);
  });

  it('shows the list beside the screen above it', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Panes layout="split" list={<List />} detail={<Detail />} />
      );
    });
    expect(textOf(tree)).toEqual(['list in list', 'detail in detail']);
  });

  /**
   * The property the keys and the fixed depth are for. A rotation, or a window
   * dragged across the breakpoint, must not remount the screen somebody is
   * looking at — `ChannelView` holds an open profile, an open transcript and
   * every composer field in local state, and all of it would go silently,
   * because the audio lives above this and would not.
   */
  it('does not remount the screen when the arrangement changes', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Panes layout="stack" list={<List />} detail={<Detail />} />
      );
    });
    expect(mounts).toBe(1);

    act(() => {
      tree.update(<Panes layout="split" list={<List />} detail={<Detail />} />);
    });
    expect(textOf(tree)).toEqual(['list in list', 'detail in detail']);
    expect(mounts).toBe(1);

    act(() => {
      tree.update(<Panes layout="stack" list={<List />} detail={<Detail />} />);
    });
    expect(mounts).toBe(1);
  });

  /**
   * The gesture is attached to the slot it moves, and only when there is
   * somewhere for it to go. A screen with no swipe available must not have a
   * responder sitting over it declining things — that is a drag taken and
   * dropped, which reads as the app having missed the touch.
   */
  it('attaches no responder when there is nowhere to swipe', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Panes layout="stack" list={<List />} detail={<Detail />} />
      );
    });
    expect(responderOf(tree)).toBe(false);

    act(() => {
      tree.update(
        <Panes
          layout="stack"
          list={<List />}
          detail={<Detail />}
          swipes={{ left: () => {} }}
        />
      );
    });
    expect(responderOf(tree)).toBe(true);
    // Gaining and losing the gesture is what navigating does, and it must not
    // cost the screen underneath its state.
    expect(mounts).toBe(1);
  });

  /**
   * The one thing that moves, and what decides that it does.
   *
   * **Not the gesture.** A tap on a channel card and a swipe into the same
   * room are the same journey, and `open` is how both of them arrive here — so
   * what is asserted is that the slot is put at an edge when it changes, and
   * which edge. `-x` is a screen that came from the left, which is going out;
   * `+x` came from the right, which is going in. See the arrival effect.
   */
  it('starts an arriving screen at the edge it came from', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Panes layout="stack" list={<List />} detail={<Detail />} open={false} />
      );
    });
    expect(offsetOf(tree)).toBe(0);

    act(() => {
      tree.update(
        <Panes layout="stack" list={<List />} detail={<Detail />} open />
      );
    });
    // In from the right, and on its way home rather than parked there.
    expect(offsetOf(tree)).toBeGreaterThan(0);

    act(() => {
      tree.update(
        <Panes layout="stack" list={<List />} detail={<Detail />} open={false} />
      );
    });
    expect(offsetOf(tree)).toBeLessThan(0);
    act(() => tree.unmount());
  });

  /**
   * Both screens are already up in a split, so there is no arrival to draw —
   * and a window dragged across the breakpoint with something open changes
   * `open` for reasons that have nothing to do with anybody navigating.
   */
  it('moves nothing in a split', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Panes layout="split" list={<List />} detail={<Detail />} open={false} />
      );
    });
    act(() => {
      tree.update(
        <Panes layout="split" list={<List />} detail={<Detail />} open />
      );
    });
    expect(offsetOf(tree)).toBe(0);
    act(() => tree.unmount());
  });

  it('gives the list a fixed width and the screen the rest', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Panes layout="split" list={<List />} detail={<Detail />} />
      );
    });
    const widths = tree.root
      .findAll((node) => node.type === View)
      .map((node) => node.props.style?.width)
      .filter((width: unknown) => typeof width === 'number');
    expect(widths).toEqual([340]);
  });
});
