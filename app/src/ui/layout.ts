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
 * so device identity answers a question nobody asked. Width is the only thing
 * that is true, and it is true on the web as well, which is why nothing here
 * is gated on `Platform.OS`.
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
  return layoutFor(useWindowDimensions().width);
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
