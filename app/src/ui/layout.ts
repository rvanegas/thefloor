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
 * 460 — wider than any iPhone, the widest being 440. That is the whole test a
 * breakpoint has to pass: **the detail pane must never be worse than the phone
 * screen it replaced.**
 *
 * It sits well above the arithmetic floor of ~700, on three counts. 768 was
 * tried and fails the test above by twelve points. An iPad mini in portrait is
 * 744, and splitting it would leave 404, thinner than the screen being
 * replaced. And jest mocks the window at 750×1334 — see
 * `react-native/jest/mocks/NativeModules.js` — so a breakpoint under that
 * would quietly switch every future test that renders `App` into the split
 * layout. **A test should have to ask for split**, by mocking
 * `useWindowDimensions`, rather than getting it by not thinking about it.
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
 * is locked upright everywhere but full screen — see `watch/orientation.ts` —
 * and a tablet and a browser window are landscape sitting still, so telling
 * either of them which way up to be would be moving somebody's furniture. This
 * is the line between the two.
 *
 * **It was drawn for the route that is gone**, which is worth knowing because
 * the number was chosen against it: full screen was entered by turning a phone
 * sideways, and for a day that rule was applied to every window that happened
 * to be wider than it was tall. A desktop browser window is one. So is an iPad
 * held the way iPads are held. Both went full screen on the *Watch* tab and
 * stayed there. The turn is not a route any more — the lock removed the
 * sideways channel screen it was read on — but the question this constant
 * answers is the same one, and so is the answer.
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
 */
export const LIST_WIDTH = 340;

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
 * So the width rule keeps a second input, and it has exactly one caller. This
 * is not a general override and must not become one — a screen that wants a
 * little more room wants a narrower list or a better layout, not the list
 * gone.
 */
export const WholeWindowContext = React.createContext<{
  taken: boolean;
  claim: (taken: boolean) => void;
}>({ taken: false, claim: () => {} });

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
  return React.useContext(WholeWindowContext).taken;
}

/**
 * Claim it for as long as this component is mounted.
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
export function useWholeWindow(): void {
  const { claim } = React.useContext(WholeWindowContext);
  React.useEffect(() => {
    claim(true);
    return () => claim(false);
  }, [claim]);
}
