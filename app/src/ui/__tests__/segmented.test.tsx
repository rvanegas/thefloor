import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Segmented, segmentRows } from '../components';
import { colors } from '../theme';

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
   * The set announces itself as one switch — and that role is what tells a
   * tab from a control on the pane below it, which since 2026-09-13 can carry
   * the same word: the channel screen's *Invite* tab and the *Invite* button
   * on it. The view harness's `findButton` and `findTab` are built on this
   * prop, so losing it would not fail here alone.
   */
  it('announces itself as a tablist', () => {
    const tree = render(
      <Segmented options={OPTIONS} value="roster" onChange={() => {}} />
    );
    expect(
      tree.root.findAll((n) => n.props?.accessibilityRole === 'tablist')
    ).not.toHaveLength(0);
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

/**
 * The dab: something is waiting on this tab.
 *
 * Drawn by `Segmented` and passed by `HomeView` alone — see `ListSwitch` there
 * for the two things that raise one, and `state/helpSeen.ts` for why they are
 * not symmetrical. What is tested here is the mark itself: that it appears only
 * where it was asked for, that it is drawn where the eye is told it will be,
 * and that a screen reader is told the tab has one at all, a bare `!` being a
 * shape rather than a sentence.
 */
describe('the dab on a tab', () => {
  const marks = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props?.style?.backgroundColor === colors.waiting
    );

  /** Nothing anywhere until something asks: the six channel tabs have none. */
  it('draws none where no option asks for one', () => {
    const tree = render(
      <Segmented
        options={[
          { value: 'contacts', label: 'Contacts' },
          { value: 'channels', label: 'Channels' },
          { value: 'support', label: 'Support' },
        ]}
        value="channels"
        onChange={() => {}}
      />
    );
    expect(marks(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  /** One mark, on the one option that asked, whatever the others hold. */
  it('draws one on the option that asks, and only there', () => {
    const tree = render(
      <Segmented
        options={[
          { value: 'contacts', label: 'Contacts', badge: 'requests waiting' },
          { value: 'channels', label: 'Channels' },
          { value: 'support', label: 'Support' },
        ]}
        value="channels"
        onChange={() => {}}
      />
    );
    expect(marks(tree)).toHaveLength(1);
    act(() => tree.unmount());
  });

  /** Both at once is an ordinary state: two things can be waiting. */
  it('draws one on each option that asks', () => {
    const tree = render(
      <Segmented
        options={[
          { value: 'contacts', label: 'Contacts', badge: 'requests waiting' },
          { value: 'channels', label: 'Channels' },
          { value: 'support', label: 'Support', badge: 'answered' },
        ]}
        value="channels"
        onChange={() => {}}
      />
    );
    expect(marks(tree)).toHaveLength(2);
    act(() => tree.unmount());
  });

  /**
   * **The announcement, which is the half a dab cannot make for itself.** The
   * mark carries a bare `!`, which says *something is here* to an eye and
   * nothing at all to a screen reader. `badge` carries the words for exactly
   * that reason — presence is what draws it, so the two cannot come apart.
   */
  it('says what is waiting, in the label a screen reader gets', () => {
    const tree = render(
      <Segmented
        options={[
          { value: 'contacts', label: 'Contacts', badge: 'requests waiting' },
          { value: 'support', label: 'Support' },
        ]}
        value="contacts"
        onChange={() => {}}
      />
    );
    const labels = tree.root
      .findAll(
        (n) => typeof n.type === 'string' && n.props?.accessibilityRole === 'button'
      )
      .map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(['Contacts, requests waiting', undefined]);
    act(() => tree.unmount());
  });

  /**
   * **Up and to the left of the label, and clear of it.** The mark was laid
   * over the trailing end of the word until 2026-09-15 and now carries an `!`
   * instead, which says *asking* outright and so no longer has to say it by
   * obscuring a letter — see the note on `styles.dab`. What is pinned here is
   * that it is off the *leading* edge and far enough off to clear the first
   * glyph: a `left` of more than the disc's own width is the whole of that, and
   * shaving it back is how the mark creeps onto the word again.
   */
  it('sits clear of the leading edge of the label', () => {
    const tree = render(
      <Segmented
        options={[{ value: 'contacts', label: 'Contacts', badge: 'waiting' }]}
        value="contacts"
        onChange={() => {}}
      />
    );
    const style = marks(tree)[0]!.props.style;
    expect(style.position).toBe('absolute');
    expect(style.top).toBeLessThan(0);
    expect(style.right).toBeUndefined();
    expect(-style.left).toBeGreaterThanOrEqual(style.width);
    // A disc rather than a lozenge, and larger than every mark in STYLE.md's
    // dots table, all of which are dots rather than a glyph in a disc.
    expect(style.width).toBe(style.height);
    expect(style.width).toBeGreaterThan(10);
    act(() => tree.unmount());
  });

  /**
   * **The `!` is what the mark says**, and it is the reason the disc may sit
   * beside the word rather than on it. A dab drawn empty is back to being a
   * shape to be guessed at.
   */
  it('carries an exclamation mark', () => {
    const tree = render(
      <Segmented
        options={[{ value: 'contacts', label: 'Contacts', badge: 'waiting' }]}
        value="contacts"
        onChange={() => {}}
      />
    );
    expect(marks(tree)[0]!.props.children).toBeTruthy();
    const glyphs = tree.root
      .findAll((n) => n.type === 'Text')
      .map((n) => n.props.children)
      .filter((c) => c === '!');
    expect(glyphs).toHaveLength(1);
    act(() => tree.unmount());
  });

  /**
   * The same on the tab you are standing on as on the other two. The dab is
   * about what a tab holds, not about where you are — and Home opens on
   * *Channels*, so hiding it on the selected one would hide it exactly when
   * somebody is on Contacts ignoring the request at the bottom of it.
   */
  it('is drawn on the selected tab as readily as an unselected one', () => {
    const tree = render(
      <Segmented
        options={[{ value: 'contacts', label: 'Contacts', badge: 'waiting' }]}
        value="contacts"
        onChange={() => {}}
      />
    );
    expect(marks(tree)).toHaveLength(1);
    act(() => tree.unmount());
  });
});
