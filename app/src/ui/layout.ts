/**
 * How much room there is, and which half of it you are looking at.
 *
 * **Pure where it can be, for the reason `webRoute.ts` is.** The rule that
 * decides one pane or two is a function of a number and is tested exhaustively;
 * the hook around it is three lines that no test in this repository can reach.
 * Getting the table right in something testable leaves only the plumbing
 * unproven, and the plumbing is `useWindowDimensions`.
 *
 * **Not `Device.deviceType`, and not `Platform.isPad`**, though `expo-device`
 * is already a dependency and either would read more directly. A narrow window
 * on an iPad Pro is a phone-shaped surface — the app can be dragged to a third
 * of the screen beside a browser, and it is resized live while that happens —
 * so device identity answers a question nobody asked. The window's own
 * measurements are the only thing that is true, and they are true on the web
 * as well, which is why nothing here is gated on `Platform.OS`.
 *
 * **Two rules live here and they are different questions.** `SPLIT_AT` is a
 * width and asks how much room there is. `HANDHELD_UNDER` is a short side and
 * asks whether the window is one somebody is holding — which is to say whether
 * turning it is a gesture. A phone on its side satisfies the first and is
 * still the second, and nothing would work if they shared a number.
 */
import React from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * One screen at a time, as a phone has always done, or a list beside the
 * screen you are looking at.
 */
export type Layout = 'stack' | 'split';

/**
 * The width at which a list beside a screen beats a screen on its own.
 *
 * Arithmetic rather than taste. `LIST_WIDTH` is a phone-width Home, so Home
 * needs no second design to live in the column, and 800 leaves the detail pane
 * exactly 440 — the widest iPhone there is. That is the whole test a
 * breakpoint has to pass: **the detail pane must never be worse than the phone
 * screen it replaced.**
 *
 * **It used to sit well above the arithmetic floor and now sits on it**, which
 * is what `LIST_WIDTH` going 340 → 360 on 2026-09-22 spent. The floor is
 * `LIST_WIDTH` plus the widest phone, so it was ~780 while the list was 340
 * and the pane came out 460; it is 800 now, and the twenty points of slack
 * this number had are in the list column. Nothing here moves, and the three
 * counts it was also chosen on are unchanged: 768 was tried and fails the test
 * above — by thirty-two points now, by twelve then. An iPad mini in portrait
 * is 744, and splitting it would leave 384, thinner than the screen being
 * replaced. And jest mocks the window at 750×1334 — see
 * `react-native/jest/mocks/NativeModules.js` — so a breakpoint under that
 * would quietly switch every future test that renders `App` into the split
 * layout. **A test should have to ask for split**, by mocking
 * `useWindowDimensions`, rather than getting it by not thinking about it.
 *
 * **So the next widening of the list is a change to this number**, and has to
 * argue about the phone it would leave the detail pane narrower than, rather
 * than about the twenty points that were lying around here.
 */
export const SPLIT_AT = 800;

/**
 * The short side below which a window is something somebody *holds*.
 *
 * **The second rule this file keeps, and it answers a different question from
 * `SPLIT_AT`.** That one asks how much room there is; this one asks whether
 * turning the thing is a *gesture*. They are not the same question and cannot
 * share a number: every phone on its side is already past `SPLIT_AT`, which is
 * the whole reason `WholeWindowContext` exists.
 *
 * **It exists because a phone is the only surface this app turns.** A handheld
 * is locked upright everywhere but the film — see `watch/orientation.ts` —
 * and a tablet and a browser window are landscape sitting still, so telling
 * either of them which way up to be would be moving somebody's furniture. This
 * is the line between the two.
 *
 * **It was drawn for the turn, and the turn is what it still serves.** Full
 * screen is entered by turning a phone sideways, and for a day that rule was
 * applied to every window that happened to be wider than it was tall. A
 * desktop browser window is one. So is an iPad held the way iPads are held.
 * Both went full screen on the *Watch* tab and stayed there. This constant is
 * what keeps the reading to the surfaces that have a wrist; see `isTurned`
 * below, which is the reading.
 *
 * **The short side rather than the width**, so that one number covers both
 * orientations and nothing has to know which way up it is being asked about.
 *
 * ## Why 500
 *
 * It has to sit above the widest phone's short side and below the narrowest
 * tablet's. The table in `__tests__/layout.test.ts` has both: an iPhone 16 Pro
 * Max is 440 across, which is its short side in either orientation, and an
 * iPad mini is 744. That is a gap of three hundred points and the number is
 * near the bottom of it deliberately.
 *
 * **Erring low is the safe direction**, which is the whole of why it is not
 * 600. A surface this calls handheld is one this app rotates; a surface it
 * does not is left exactly as the platform had it. Being wrong about a tablet
 * means holding an iPad upright against its will, which is the kind of thing
 * this constant exists to keep narrow.
 */
export const HANDHELD_UNDER = 500;

/**
 * Whether a window is one somebody is holding, by its short side.
 *
 * Pure and exhaustively tested, for the reason `layoutFor` is: the hook around
 * it is two lines that no test in this repository can reach.
 */
export function isHandheld(size: { width: number; height: number }): boolean {
  return Math.min(size.width, size.height) < HANDHELD_UNDER;
}

/**
 * The list pane, fixed rather than a fraction.
 *
 * A fraction would make the list grow with the window, which is the one thing
 * a list of channel names does not need — the names are short and the extra
 * room belongs to the conversation. Fixed at a phone's width, the detail pane
 * absorbs every point above the breakpoint.
 *
 * **360 since 2026-09-22, and it was 340 until Home's tier grew a fourth
 * tab.** The strip lives inside `headerInner`, which spends `spacing(2.5)` a
 * side, so a 340-point column measured it 300 and four tabs asked for
 * `4 * MIN_SEGMENT` = 320. They wrapped — a two-row tab strip on every browser
 * window and every iPad, while the same four tabs on the phone the rule was
 * written against were one row. 360 measures the strip 320, which is that sum
 * exactly.
 *
 * **It is a transfer, not a widening**, and the detail pane pays: the row is
 * this column plus a `flex: 1`, so twenty points leave the conversation at
 * every width above the breakpoint. That is the cheapest thing on the screen
 * to spend at a laptop's width and the dearest at 800, where it takes the
 * detail pane to 440 — the widest iPhone, which is the floor `SPLIT_AT` is
 * chosen against and not a point above it.
 *
 * **So 360 is the ceiling this constant has**, and the next point the tier
 * wants has to come from `MIN_SEGMENT`, from `headerInner`'s inset, or from
 * moving `SPLIT_AT` — see `SPLIT_AT`, which now has no slack of its own to
 * lend.
 */
export const LIST_WIDTH = 360;

/** The whole of the rule. */
export function layoutFor(width: number): Layout {
  return width >= SPLIT_AT ? 'split' : 'stack';
}

/**
 * The rule, against this window, now.
 *
 * `useWindowDimensions` re-renders on rotation and on a live resize, which is
 * what makes a window dragged narrower fall back to the single-screen stack
 * under your finger rather than at the next launch.
 */
export function useLayout(): Layout {
  const width = useWindowDimensions().width;
  const { taken } = React.useContext(WholeWindowContext);
  // A claimed window is one screen however wide it is; see `WholeWindowContext`.
  return taken ? 'stack' : layoutFor(width);
}

/**
 * The handheld rule, against this window, now.
 *
 * **Not `WholeWindowContext`-aware, unlike `useLayout`.** A claim on the window
 * changes how much room a screen has; it does not change what the window is
 * sitting in. A phone is a phone whether or not the film has taken the glass,
 * and this is read while the film has.
 */
export function useIsHandheld(): boolean {
  const { width, height } = useWindowDimensions();
  return isHandheld({ width, height });
}

/**
 * Whether somebody has turned the device, which is the only thing a landscape
 * window can mean on a handheld.
 *
 * **Both halves are load-bearing and the second one is the lesson.** A window
 * is not landscape because somebody turned it — a desktop browser window is
 * landscape, an iPad held the way iPads are held is landscape, and neither has
 * a turn to perform. `isHandheld` is the line that excludes them, and the
 * decision of 2026-09-20 is the afternoon that drew it.
 *
 * **And a handheld is landscape only where it is allowed to be**, which is
 * the other half and is not in this file: `watch/orientation.ts` locks a phone
 * upright on every screen except the film's. So a `true` from this is not
 * merely *a handheld that happens to be wide*, it is a handheld on the one
 * screen the turn was permitted for, having been turned. That is what makes
 * it safe to read as a gesture, and it is why this went away for a day —
 * between 2026-09-20 and this, the lock was the whole application's and a
 * phone could never be turned at all.
 *
 * The window rather than `getOrientationAsync`: the window is what the layout
 * is drawn into, it is what `useLayout` already reads, and `expo-screen-orientation`
 * reports an *interface* orientation that an iPad in a split does not share
 * with its pane.
 */
export function isTurned(size: { width: number; height: number }): boolean {
  return isHandheld(size) && size.width > size.height;
}

/**
 * The turn, against this window, now.
 *
 * Not `WholeWindowContext`-aware, for `useIsHandheld`'s reason and one more:
 * the expanded picture claims the window, and this is read from inside it to
 * decide whether the way out is a button or the wrist.
 */
export function useIsTurned(): boolean {
  const { width, height } = useWindowDimensions();
  return isTurned({ width, height });
}

/**
 * Which side of the split a subtree is on, or `null` when there is no split.
 *
 * **Pane identity, and never tokens.** This is deliberately not the theme
 * context `theme.ts` argues against: it carries one of three constant values,
 * it changes only when the layout mode does, and nothing reads a colour or a
 * spacing out of it. It exists because the one thing a screen needs to know is
 * not how wide it is but which side it is on, and threading that as a prop
 * would have to pass through `ChannelView` into `ProfileView` into a `Screen`
 * three levels down.
 */
export const PaneContext = React.createContext<'list' | 'detail' | null>(null);

/** Null outside a split, where there are no sides and asking is not an error. */
export function usePane(): 'list' | 'detail' | null {
  return React.useContext(PaneContext);
}

/**
 * Whether something on screen has claimed the whole window.
 *
 * **Because rotating a phone crosses the breakpoint.** Full screen turns the
 * phone sideways, and sideways an iPhone is 852 to 932 points wide — past
 * `SPLIT_AT` — so the very gesture that was meant to give the film the window
 * handed Home a third of it and left the picture *smaller* than it had been in
 * portrait, with the transport covering most of what was left. The breakpoint
 * was not wrong: a 900-point window is one that a list and a screen share
 * happily, and that is true of every screen in this application except the one
 * whose entire purpose is to be the only thing on the glass.
 *
 * So the width rule keeps a second input, and it has two callers: the expanded
 * picture, and the second device — the television — which is the same claim
 * made by a whole screen rather than by a film. This is not a general override
 * and must not become one — a screen that wants a little more room wants a
 * narrower list or a better layout, not the list gone. What earns the claim is
 * being the only thing somebody is looking at, which is a fact about why the
 * screen exists and not about how much room it would like. See
 * {@link WindowClaim} for the two sizes of it.
 */
export const WholeWindowContext = React.createContext<{
  taken: WindowClaim | null;
  claim: (taken: WindowClaim | null) => void;
}>({ taken: null, claim: () => {} });

/**
 * How much a claim takes, there being two surfaces that want the window and
 * only one of them that wants the hardware's gutter with it.
 *
 * - `list` takes the list beside it and nothing else. The second device — the
 *   television, `ChannelView`'s `secondDevice` — is this one: it is the only
 *   thing on the glass, and it still has a footer of three rungs that must
 *   stay off the home indicator.
 * - `glass` takes the bottom inset as well, which is `FullScreen` and is meant
 *   to stay `FullScreen` alone. A strip of `colors.bg` under an expanded film
 *   is the brightest thing on a sideways phone in a dark room; see `Glass` in
 *   `App.tsx` for the whole of that argument.
 *
 * **One claim at a time, which is a fact about the two callers rather than a
 * rule this enforces.** Both are early returns from `ChannelView` and the full
 * screen one comes first, so the television never draws while the film is
 * expanded. React runs every cleanup in a commit before every mount, so the
 * handover in both directions lands the right way round without either of them
 * knowing about the other.
 */
export type WindowClaim = 'list' | 'glass';

/**
 * Whether it is claimed right now, for the two or three things that have to
 * stand aside while it is.
 *
 * `useLayout` is one; the swipe that slides a channel out from under a finger
 * is the other. That gesture was unreachable in landscape until this existed —
 * a sideways phone was a split, and a split has no swipes — so switching the
 * layout back to one screen would have handed the expanded picture a gesture
 * nobody designed for it, and one the picture explicitly declines for itself.
 */
export function useWholeWindowClaimed(): boolean {
  return React.useContext(WholeWindowContext).taken !== null;
}

/**
 * What the claim takes, for the one reader that cares which of the two it is.
 *
 * `Glass` in `App.tsx`, and nothing else: every other reader is asking whether
 * the window is spoken for, which is {@link useWholeWindowClaimed}.
 */
export function useWindowClaim(): WindowClaim | null {
  return React.useContext(WholeWindowContext).taken;
}

/**
 * Claim it for as long as this component is mounted.
 *
 * Claim `null` and it claims nothing, which is how a screen that is only
 * sometimes the television — `ChannelView` is every other channel screen too —
 * asks for this from an unconditional hook call.
 *
 * **The release lives in the cleanup rather than beside a collapse**, which is
 * what makes it survive the exits nobody presses: the party stopping, the film
 * moving to another device, the channel closing underneath, and — since
 * 2026-09-19, when full screen became a reading of the window rather than a
 * flag — the phone simply being turned upright. Every one of those arrives as
 * an unmount, and a window left with no list in it by a picture that is no
 * longer there is a bug with no visible cause.
 *
 * Outside a provider it does nothing, which is what a test rendering the
 * picture on its own should get.
 */
export function useWholeWindow(take: WindowClaim | null = 'glass'): void {
  const { claim } = React.useContext(WholeWindowContext);
  React.useEffect(() => {
    if (!take) return;
    claim(take);
    return () => claim(null);
  }, [claim, take]);
}

/**
 * The narrowest a segment may be and still hold a word.
 *
 * **The number `MAX_PER_ROW` was standing in for.** That rule reads "four at
 * most" and argues its case in points — "a fifth on a phone leaves each of
 * them about forty points, which is not a word" — so what it actually asserts
 * is a *width*, with a phone's width assumed throughout. Assume nothing and
 * the same sentence is this constant, true on every surface rather than on the
 * one it was written against.
 *
 * **80 since 2026-09-22, and it was 90 on two premises that had both already
 * moved.** 90 was carried over from `MAX_PER_ROW` by reading the old rule off
 * the phone it was written for — "four segments across a 393-point iPhone are
 * 98 points each and were allowed" — and the arithmetic was done against the
 * *screen*. No segmented control is ever that wide: Home's tab strip lives
 * inside `headerInner`, which spends `spacing(2.5)` a side, so on that same
 * 393-point iPhone the strip measures 353 and four tabs asked for 360. They
 * missed by seven points and wrapped — while the same four on a 402-point
 * 16 Pro got 362 and did not, which is one strip drawn two ways across the
 * phones in people's hands.
 *
 * The second premise was the label. 90 was sized for the 14pt word a segment
 * carried when it was a word alone; since 2026-09-12 a segment with a glyph
 * captions it at 11pt, where *Contacts* runs about 50 points. Four across the
 * narrowest iPhone still in support is `(335 - 6 - 9) / 4` = 80 points a
 * segment, which is that caption and thirty points of air.
 *
 * **80 is chosen to move exactly one thing and is not a spare-room budget.**
 * On a phone-width strip five still ask for 400 and six for 480 against 353,
 * so both stay two rows and every set but four is drawn where it was. Going
 * lower would start unwrapping those, which is the change this is not.
 *
 * The tightest case that occurs is still *Recordings*, the longest of the six
 * channel tabs: six on the narrowest pane that now takes one row leaves about
 * 67 points of caption, against the 61 that word spells at 11pt. That margin
 * is the floor under this number — six tabs unwrap at 480 rather than 540, and
 * anything under 80 starts clipping the word that made the rule.
 */
export const MIN_SEGMENT = 80;

/**
 * How many rows a set of segments needs, at this width.
 *
 * One when they fit, two when they do not, and never three — a caller wanting
 * more than two rows wants a menu. `segmentRows` in `components.tsx` does the
 * splitting; this decides only how many rows there are to split into.
 *
 * **A width of zero asks for the cautious answer.** A control that has not
 * been laid out yet reports nothing, and the wrong guess in that frame is the
 * one that draws six segments at eighteen points each.
 */
export function segmentRowsFor(count: number, width: number): 1 | 2 {
  if (count <= 1) return 1;
  return width >= count * MIN_SEGMENT ? 1 : 2;
}

/**
 * How wide the picture may ever be, however much room there is.
 *
 * Moved here from `watch/Picture.tsx` on 2026-09-20, the sizing having stopped
 * being a style and become a rule with a height in it. A film wider than this
 * on a desk is one nobody is sitting far enough back for; what the extra room
 * buys past this point is margin, and the picture is centred in it.
 */
export const PICTURE_MAX_WIDTH = 620;

/**
 * The narrowest picture worth giving a column of its own to.
 *
 * A phone's widest, and the same argument `SPLIT_AT` makes about the detail
 * pane: **two columns must never leave the film worse off than one column
 * would have.** Below this the picture has been shrunk to buy room for
 * controls, which is the trade the wrong way round.
 */
export const PICTURE_MIN_WIDTH = 440;

/** The narrowest the controls' own column may be: a full-width button with its
    words on it, unwrapped. */
export const COLUMN_MIN = 300;

/** Between the two columns. `spacing(2)`, written out because this file has no
    business importing the theme. */
export const COLUMN_GAP = 16;

/**
 * The width at which the transport moves beside the picture instead of under
 * it.
 *
 * **A sum rather than a chosen number**, which is the whole of why it can be
 * trusted on a surface nobody has opened yet: the narrowest picture worth
 * having, plus the narrowest column worth having, plus the gap. Move either
 * minimum and this follows.
 *
 * It lands near `SPLIT_AT` and is emphatically not it. That one asks how wide
 * the *window* is and answers whether a list fits beside a screen; this asks
 * how wide the *pane* is and answers whether a transport fits beside a film. A
 * window at 800 has a 460-point pane and is nowhere near this.
 */
export const TWO_COLUMN_AT = PICTURE_MIN_WIDTH + COLUMN_MIN + COLUMN_GAP;

/**
 * What must stay above the fold under a stacked picture.
 *
 * The section label, the progress bar with its two times, and the transport
 * row. **The rest of the card is allowed below it** — *Full screen*, *Unmute
 * the room*, *Change video*, *Stop* and the copy buttons come to some four
 * hundred points, which do not fit under a 16:9 picture at any size and are
 * not meant to; the card scrolls.
 *
 * So this is a promise rather than a target: **the scrubber and the three
 * transport buttons are reachable without scrolling, on every surface.** What
 * went wrong on an iPad on build 251 was not that the card was long but that
 * the fold landed in the middle of a button.
 */
export const RESERVE_UNDER_PICTURE = 150;

/** How the watch body is laid out: the picture's box, and where it sits. */
export type WatchShape = {
  /** One column, the picture above the scroll; or two, beside it. */
  columns: 1 | 2;
  /** The picture's box, 16:9 exactly — the caller sets both sides rather than
      an aspect and a cap, since the binding side is this function's answer. */
  picture: { width: number; height: number };
};

/**
 * The whole of the watch body's arithmetic, as a function of the room it has.
 *
 * **Pure, and decided from the pane rather than from anything it produces.**
 * That is not tidiness, it is the only thing standing between this and an
 * oscillation: *two columns when the controls would not otherwise fit* is a
 * rule whose answer changes what it measured — two columns shrink the picture,
 * the picture fits in one column again, and the layout flips under a finger
 * forever. Both inputs here are given by the window and by the chrome around
 * the body, and neither moves when the answer does.
 *
 * `bodyHeight` is the room the picture and the scroll *share*: what is left of
 * the pane once the header, the tabs and the pinned footer have taken theirs.
 * It is measured rather than computed from constants, so the tabs collapsing
 * to one row on a wide pane arrives here on its own.
 *
 * **Zero means not yet measured**, and the answer then is the old one: fit the
 * width and let the height fall where it may. A first frame with a collapsed
 * picture in it is worse than a first frame with a tall one.
 */
export function watchShapeFor(pane: {
  width: number;
  bodyHeight: number;
}): WatchShape {
  const columns = pane.width >= TWO_COLUMN_AT ? 2 : 1;
  /*
    Beside the picture, the controls take width rather than height — so the
    whole body is the picture's to fill and nothing has to be kept under it.
    Above them, the reserve is the fold.
  */
  const room = {
    width:
      columns === 2
        ? Math.min(PICTURE_MAX_WIDTH, pane.width - COLUMN_MIN - COLUMN_GAP)
        : Math.min(PICTURE_MAX_WIDTH, pane.width),
    height:
      columns === 2
        ? pane.bodyHeight
        : Math.max(0, pane.bodyHeight - RESERVE_UNDER_PICTURE),
  };
  // 16:9 inside that room, by whichever side binds. An unmeasured body binds
  // on nothing and leaves the width rule alone, which is what shipped before
  // there was a height rule at all.
  const width =
    pane.bodyHeight > 0
      ? Math.min(room.width, (room.height * 16) / 9)
      : room.width;
  return { columns, picture: { width, height: (width * 9) / 16 } };
}

/**
 * The room the picture and the scroll share, published by `Screen`.
 *
 * **The body rather than the scroll**, which is the distinction that keeps
 * this out of a feedback loop: the scroll's height is what is left after the
 * picture, so sizing the picture from it would be sizing it from itself. The
 * body's height is the pane's less the chrome, and the picture's size has no
 * bearing on it.
 *
 * Zero outside a `Screen`, which is what a test rendering the picture on its
 * own gets — and is the unmeasured case `watchShapeFor` answers for.
 */
export const BodyHeightContext = React.createContext(0);

/** The shape, against this pane, now. */
export function useWatchShape(): WatchShape {
  const { width } = useWindowDimensions();
  const layout = useLayout();
  const bodyHeight = React.useContext(BodyHeightContext);
  // The pane rather than the window: in a split the picture lives in the
  // detail pane, and the list is not room it may have.
  const pane = layout === 'split' ? width - LIST_WIDTH : width;
  return watchShapeFor({ width: pane, bodyHeight });
}
