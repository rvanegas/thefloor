import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Segmented, segmentRows } from '../components';

/**
 * How a set of tabs is laid out when there are more of them than a phone's
 * width will spell.
 *
 * The control was a single flex row from the day it was extracted out of
 * HomeView, which is all a two-way switch ever needs. The channel screen's six
 * tabs are what made it wrap: six labels across a phone is fifty points each,
 * which is not a word, and the alternative — a strip that drags sideways — is
 * a tab most people never learn is there.
 */

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

describe('segmentRows', () => {
  /**
   * One row for anything that fits, which is the whole of what this has to
   * promise the callers that were here first: Home's two-way switch and the
   * channel screen's Roster/Invite pair render exactly as they did.
   */
  it('keeps a set that fits on one row', () => {
    expect(segmentRows(['a', 'b'])).toEqual([['a', 'b']]);
    expect(segmentRows(['a', 'b', 'c', 'd'])).toEqual([['a', 'b', 'c', 'd']]);
  });

  /**
   * Balanced rather than filled. Four and two would leave a short row of wide
   * segments under a full row of narrow ones, which reads as an afterthought
   * stuck on the end rather than as a second row.
   */
  it('balances a set that does not, rather than filling the first row', () => {
    expect(segmentRows(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
    // The closest balance an odd number has, and the longer row first: the
    // channel screen loses its watch tab to Labs, and this is that shape.
    expect(segmentRows(['a', 'b', 'c', 'd', 'e'])).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  /** Every option exactly once, in order, whichever shape it comes out. */
  it('drops nothing and reorders nothing', () => {
    for (let n = 1; n <= 8; n += 1) {
      const options = Array.from({ length: n }, (_, i) => i);
      expect(segmentRows(options).flat()).toEqual(options);
    }
  });
});

describe('Segmented', () => {
  const OPTIONS = [
    { value: 'roster', label: 'Roster' },
    { value: 'notes', label: 'Notes' },
    { value: 'invites', label: 'Invite links' },
    { value: 'player', label: 'Player' },
    { value: 'recordings', label: 'Recordings' },
    { value: 'watch', label: 'Watch' },
  ] as const;

  /**
   * Host nodes only. `Pressable` renders its role onto the composite, the
   * `View` inside it and the host element alike, so an unfiltered `findAll`
   * reports each segment three times — and a count is the whole of what two of
   * these tests assert.
   */
  const segments = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.accessibilityRole === 'button'
    );

  /**
   * Every option is drawn and pressable however many rows it took. Wrapping is
   * a layout decision and must not become a decision about what is offered —
   * a tab that is not on the screen is one nobody can reach.
   */
  it('draws every option once, wrapped or not', () => {
    const tree = render(
      <Segmented options={OPTIONS} value="roster" onChange={() => {}} />
    );
    expect(segments(tree)).toHaveLength(OPTIONS.length);
    act(() => tree.unmount());
  });

  /**
   * The selection is announced by `accessibilityState` rather than by a word
   * in the label, and exactly one segment carries it — including when the
   * selected one is in the second row, which is the case wrapping introduced.
   */
  it('marks the selected one, in whichever row it falls', () => {
    const tree = render(
      <Segmented options={OPTIONS} value="watch" onChange={() => {}} />
    );
    const selected = segments(tree).filter(
      (n) => n.props.accessibilityState.selected
    );
    expect(selected).toHaveLength(1);
    act(() => tree.unmount());
  });

  /**
   * And a press reports the option rather than its position — which is the
   * thing wrapping could plausibly have broken, the second row's segments
   * being rendered from a slice rather than from the array itself.
   *
   * The `Pressable` composites rather than the host nodes `segments` finds:
   * the handler is on the composite, and the host element below it carries
   * only the role.
   */
  it('reports the option pressed', () => {
    const onChange = jest.fn();
    const tree = render(
      <Segmented options={OPTIONS} value="roster" onChange={onChange} />
    );
    const pressable = tree.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && n.type !== 'View'
    );
    act(() => pressable[5]!.props.onPress());
    expect(onChange).toHaveBeenCalledWith('watch');
    act(() => tree.unmount());
  });
});
