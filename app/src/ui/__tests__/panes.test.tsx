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
