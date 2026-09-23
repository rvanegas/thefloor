import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
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

/**
 * **The width of the control on a phone, which is not the width of the phone**
 * — the correction of 2026-09-22, and the reason this file spent two days
 * certifying a layout the application did not have.
 *
 * Every case below was written against 393, a 16-point iPhone's screen. No
 * segmented control is ever that wide: Home's strip sits inside `headerInner`
 * and the channel screen's inside the same measured column, both of which
 * spend `spacing(2.5)` a side. So what a strip reports to its own `onLayout`
 * on that phone is 353, and a table asserting 393 was answering about a
 * surface that does not exist — which is how four tabs passed here as one row
 * while wrapping to two on the phone.
 *
 * The rule took the count alone until 2026-09-20 and a width was the
 * assumption underneath it; see `segmentRowsFor`. This is that assumption
 * taken out a second time, one layer further in.
 */
const PHONE = 393 - 2 * 20;

describe('segmentRows', () => {
  /**
   * One row for anything that fits, which is the whole of what this has to
   * promise the callers that were here first: Home's two-way switch and the
   * channel screen's Roster/Invite pair render exactly as they did.
   */
  it('keeps a set that fits on one row', () => {
    expect(segmentRows(['a', 'b'], PHONE)).toEqual([['a', 'b']]);
    // Four among them, which is Home's tab strip since it grew Podcasts — and
    // which was true of a 393-point *screen* before `MIN_SEGMENT` moved and
    // false of the 353-point strip that screen actually holds.
    expect(segmentRows(['a', 'b', 'c', 'd'], PHONE)).toEqual([['a', 'b', 'c', 'd']]);
  });

  /**
   * Balanced rather than filled. Four and two would leave a short row of wide
   * segments under a full row of narrow ones, which reads as an afterthought
   * stuck on the end rather than as a second row.
   */
  it('balances a set that does not, rather than filling the first row', () => {
    expect(segmentRows(['a', 'b', 'c', 'd', 'e', 'f'], PHONE)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
    // The closest balance an odd number has, and the longer row first. No
    // tab strip is this shape since the watch tab left Labs, but the choice
    // rows still can be.
    expect(segmentRows(['a', 'b', 'c', 'd', 'e'], PHONE)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  /** Every option exactly once, in order, whichever shape it comes out. */
  it('drops nothing and reorders nothing', () => {
    for (let n = 1; n <= 8; n += 1) {
      const options = Array.from({ length: n }, (_, i) => i);
      expect(segmentRows(options, PHONE).flat()).toEqual(options);
    }
  });

  /**
   * **The same six on a pane that can spell them, which is the 2026-09-20
   * change.** A 740-point iPad pane was given two rows because six is more
   * than four, and the second row cost the watch card a third of what it had
   * left below the picture. Nothing about a phone moves; see
   * `segmentRowsFor`, and `layout.test.ts` for the table of panes.
   */
  it('keeps six on one row where six will fit', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(segmentRows(six, 740)).toEqual([six]);
    expect(segmentRows(six, PHONE)).toHaveLength(2);
  });

  /**
   * **The phone is exactly as it was, at every count.**
   *
   * A width rule replacing a count rule can widen or narrow what fits, and
   * narrowing it here would mean a set of four that has always been one row
   * becoming two on the surface this application is mostly used on — a
   * regression bought with a change meant for iPads. `MIN_SEGMENT` is chosen
   * against this table rather than the other way round; see its own comment.
   *
   * **It survives 90 → 80 unchanged, which is the point of keeping it**: the
   * lower floor was bought for four on a real strip, and five and six still
   * ask 400 and 480 of the 353 they get. What moved is that the table is now
   * measured against the strip rather than the screen, so it says of the
   * phone what the phone does.
   */
  it('lays a phone out exactly as the count rule did', () => {
    const was: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2 };
    for (let n = 1; n <= 6; n += 1) {
      const options = Array.from({ length: n }, (_, i) => String(i));
      expect(segmentRows(options, PHONE)).toHaveLength(was[n]);
    }
  });
});

describe('Segmented', () => {
  const OPTIONS = [
    { value: 'roster', label: 'Roster' },
    { value: 'notes', label: 'Notes' },
    { value: 'invites', label: 'Invite links' },
    { value: 'listen', label: 'Listen' },
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
   * **The top-right corner of the box it hangs on.** The mark sat up and to
   * the left of the *label* until 2026-09-22, which put it in a different
   * place on every tab — a label is as wide as it reads — and on the short
   * ones left it adrift between two tabs rather than on either. What is
   * pinned here is the corner: a negative `top` and a negative `right`, and
   * no `left` to pull it back across the box.
   */
  it('hangs off the top-right corner', () => {
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
    expect(style.right).toBeLessThan(0);
    expect(style.left).toBeUndefined();
    // A disc rather than a lozenge, and larger than every mark in STYLE.md's
    // dots table, all of which are dots rather than a glyph in a disc.
    expect(style.width).toBe(style.height);
    expect(style.width).toBeGreaterThan(10);
    act(() => tree.unmount());
  });

  /**
   * **And the corner it hangs on is the glyph's**, which is what makes the
   * mark land in the same place on every tab: the icon is a fixed box in the
   * middle of the segment where the label is not. Read as the disc being a
   * child of the icon's box rather than of the label's.
   */
  it('hangs on the tab\'s glyph when it has one', () => {
    const tree = render(
      <Segmented
        options={[
          {
            value: 'contacts',
            label: 'Contacts',
            badge: 'waiting',
            icon: () => <View testID="glyph" />,
          },
        ]}
        value="contacts"
        onChange={() => {}}
      />
    );
    const boxes = tree.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.style?.width === 24
    );
    expect(boxes).toHaveLength(1);
    const box = boxes[0]!;
    expect(
      box.findAll(
        (n) => typeof n.type === 'string' && n.props?.testID === 'glyph'
      )
    ).toHaveLength(1);
    expect(
      box.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props?.style?.backgroundColor === colors.waiting
      )
    ).toHaveLength(1);
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
