import React from 'react';
import Svg, { Circle, Path, Rect, type NumberProp } from 'react-native-svg';
import type { ColorValue } from 'react-native';

/**
 * The icons this app draws, from Lucide path data copied into this file.
 *
 * Three of them are the channel footer's, and were the reason the file
 * exists; the two below them are the header's *Close* and *Settings*, which
 * were words until 2026-09-02.
 *
 * **Vendored rather than imported.** `lucide-react-native` would be a second
 * dependency on top of `react-native-svg`, and Metro does not tree-shake by
 * default on SDK 54 — so the barrel import that reads most naturally is the
 * one that risks dragging a 25MB, 9,251-file package into the graph. Six
 * glyphs do not need an icon system. See DECISIONS.md § *The channel grows a
 * footer*. That argument is about the dependency rather than about the number
 * of glyphs, so it holds unchanged as this file grows.
 *
 * The cost of vendoring is that the geometry is ours to get right, and a
 * mistyped path is silent — it draws the wrong shape and nothing fails. So
 * these were taken from the published `lucide-static@1.38.0` package rather
 * than written out, and each carries the name of the icon it came from. To
 * change or add one, take it from that package again rather than editing the
 * numbers by hand.
 *
 * Lucide is ISC, which is what permits the copy.
 */

/** Lucide draws on a 24-unit grid; everything here inherits that. */
const BOX = 24;

/**
 * Lighter than Lucide's own default of 2.
 *
 * These sit under 11px labels in a screen whose heaviest rule is a hairline,
 * and at 22px a 2-unit stroke reads as a heavier weight than any type on the
 * screen — the icon stops being a label and starts being a button. One
 * constant rather than a prop, because the three of them differing would be
 * the thing anybody notices first.
 */
const STROKE = 1.75;

function Glyph({
  color,
  size,
  children,
}: {
  color: ColorValue;
  size: number;
  children: React.ReactNode;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      fill="none"
      // `as NumberProp` is not needed for the colour: react-native-svg takes a
      // ColorValue, which is what `colors.*` hands us — a DynamicColorIOS
      // object on iOS and a `var(--floor-*)` string on web, neither of which
      // this component ever has to resolve. That is the whole reason the icons
      // take a colour rather than reading the palette themselves: the caller
      // knows which of `text`, `textFaint`, `floor` or `silenced` this is.
      stroke={color}
      strokeWidth={STROKE as NumberProp}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/**
 * Your microphone, open or muted.
 *
 * The one icon here that changes glyph rather than colour, because a struck-
 * through microphone is the one piece of this vocabulary somebody already
 * knows from every other application. `lucide/mic` and `lucide/mic-off`.
 */
export function MicIcon({
  color,
  muted,
  size = 22,
}: {
  color: ColorValue;
  muted: boolean;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      {muted ? (
        <>
          <Path d="M12 19v3" />
          <Path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
          <Path d="M16.95 16.95A7 7 0 0 1 5 12v-2" />
          <Path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
          <Path d="m2 2 20 20" />
          <Path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
        </>
      ) : (
        <>
          <Path d="M12 19v3" />
          <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <Rect x="9" y="2" width="6" height="13" rx="3" />
        </>
      )}
    </Glyph>
  );
}

/**
 * The floor, held or not. `lucide/hand`.
 *
 * **One glyph for both states, unlike the microphone**, and the difference is
 * deliberate rather than an omission. Muting has a struck-through counterpart
 * everybody recognises; claiming the floor does not, and no icon set has one,
 * because the floor is this application's own idea rather than a borrowed one.
 * Inventing a "released hand" would mean teaching two shapes for a mechanic
 * whose whole state is already carried twice over — by the accent colour here
 * and by the word under it, which changes between Claim and Release.
 *
 * A raised hand rather than a megaphone: the floor is something you ask for
 * and are granted, and a megaphone is about volume, which is the one thing
 * holding the floor does not change.
 */
export function FloorIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <Path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <Path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <Path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </Glyph>
  );
}

/**
 * Stepping in or out. `lucide/log-in` and `lucide/log-out`.
 *
 * The arrow reverses with the act, which is the one place in this footer where
 * the glyph carries the direction and the label merely agrees. Chosen over
 * `door-open`/`door-closed`, which read as a state the room is in rather than
 * as something you are about to do — and a door is shut in plenty of rooms
 * somebody is standing in.
 */
export function StepIcon({
  color,
  out,
  size = 22,
}: {
  color: ColorValue;
  out: boolean;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      {out ? (
        <>
          <Path d="m16 17 5-5-5-5" />
          <Path d="M21 12H9" />
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        </>
      ) : (
        <>
          <Path d="m10 17 5-5-5-5" />
          <Path d="M15 12H3" />
          <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        </>
      )}
    </Glyph>
  );
}

/**
 * Off this screen. `lucide/x`.
 *
 * **A cross rather than an arrow**, which is the same distinction the word it
 * replaced was making: every header this appears in says *Close* rather than
 * *Back* on purpose, because in a split pane there is nothing underneath to go
 * back to and all the control can do is empty the pane. An arrow would put the
 * destination back into a control that deliberately names only the act. The
 * reasoning is written out at the top of `HomeSettingsView`.
 */
export function CloseIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </Glyph>
  );
}

/**
 * The settings behind this screen. `lucide/settings`.
 *
 * The gear, which is the one glyph in this file nobody has to be taught. It
 * stands for two different screens — the app's settings from the home tier,
 * and a channel's from its own header — and that is what the word did too:
 * *Settings* means "the settings of what you are looking at", and the shape
 * inherits that without any help.
 */
export function SettingsIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <Circle cx="12" cy="12" r="3" />
    </Glyph>
  );
}
