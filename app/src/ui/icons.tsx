import React from 'react';
import Svg, { Circle, Path, Rect, type NumberProp } from 'react-native-svg';
import type { ColorValue } from 'react-native';

/**
 * The icons this app draws, from Lucide path data copied into this file.
 *
 * Four of them are the channel footer's, and were the reason the file
 * exists; the two after them are the header's *Close* and *Settings*, which
 * were words until 2026-09-02; the six at the end are that same screen's tabs,
 * which were words until 2026-09-12.
 *
 * **Vendored rather than imported.** `lucide-react-native` would be a second
 * dependency on top of `react-native-svg`, and Metro does not tree-shake by
 * default on SDK 54 — so the barrel import that reads most naturally is the
 * one that risks dragging a 25MB, 9,251-file package into the graph. A dozen
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
 * constant rather than a prop, because the four of them differing would be
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
 * Nearby: within reach, one notification away. `lucide/bell`.
 *
 * **A bell, though nothing here rings.** What being nearby actually is, in the
 * reducer, is a claim on a notification and on nothing else — no microphone,
 * no subscription, no audio session — so the glyph names the one thing the
 * state buys you. A door was the obvious alternative and is wrong twice over:
 * the slot beside this one already *is* a door, and standing outside one is a
 * picture of not being let in rather than of being called.
 *
 * **One rung, and it never moves, since 2026-09-09.** This drew both halves of
 * a slot whose word flipped, until the bell was found standing over "Step
 * out" — a departure, and not a bell at all. The bar now has a slot per rung
 * and this glyph is fixed to the middle one, so it is drawn exactly once
 * whatever state the screen is in, lit when you are nearby and plain when you
 * are not.
 *
 * A struck-through bell for the unlit case was the alternative and reads as
 * *notifications off*, which is a preference this application does not have
 * here.
 */
export function BellIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <Path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
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

/**
 * The channel screen's six tabs, below.
 *
 * Added 2026-09-12, when the tabs stopped being words alone. They follow the
 * footer's construction exactly — same grid, same stroke, same `Glyph` — for
 * the reason the footer's own note gives: a screen whose pinned controls and
 * whose tabs drew icons two different weights would read as two applications.
 * Each names what the tab *holds* rather than what you do there, since a tab
 * is a place and not an act; the footer's are the other way round, which is
 * the one difference between the two sets and is the correct one.
 */

/**
 * Who is in the room. `lucide/users`.
 *
 * People rather than a door or a microphone: the roster tab is the
 * conversation as it is happening, and what is on it is a card per person.
 */
export function RosterIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <Circle cx="9" cy="7" r="4" />
    </Glyph>
  );
}

/**
 * What the channel has written down. `lucide/clipboard-list`.
 *
 * A clipboard because the tab's larger half *is* the shared clipboard, and the
 * description above it is the same kind of thing — text this channel keeps.
 * A pencil would have said "write", which is an act and only half of what the
 * tab is for; most visits to it are reading.
 */
export function NotesIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <Path d="M12 11h4" />
      <Path d="M12 16h4" />
      <Path d="M8 11h.01" />
      <Path d="M8 16h.01" />
    </Glyph>
  );
}

/**
 * The ways somebody who is not here gets in. `lucide/user-plus`.
 *
 * A person gained rather than a chain link, though the tab is called *Invite
 * links*: what both controls on it produce is a new member, and the link is
 * the mechanism. `lucide/link` was the obvious alternative and names the
 * mechanism instead — and this application already spends that shape on
 * sharing a recording.
 *
 * It stands beside `RosterIcon`, which is two figures to this one's one; that
 * adjacency is deliberate rather than a collision, the two tabs being the same
 * subject at two times — who is here, and who is not here yet.
 */
export function InviteIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M19 8v6" />
      <Path d="M22 11h-6" />
    </Glyph>
  );
}

/**
 * What is playing into the room. `lucide/music`.
 *
 * Notes rather than a triangle: a play arrow is a button, and there is a real
 * one on the tab it would be labelling. What the tab holds is a track the
 * whole channel hears, which is a thing rather than an act.
 */
export function PlayerIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M9 18V5l12-2v13" />
      <Circle cx="6" cy="18" r="3" />
      <Circle cx="18" cy="16" r="3" />
    </Glyph>
  );
}

/**
 * What has been kept. `lucide/circle-dot`.
 *
 * The record dot, which is the one glyph in this set nobody has to be taught —
 * it has meant this on hardware since before any of it was software. Drawn
 * plain whether or not a recording is running: the tab is where recordings
 * live, and a tab bar that started pulsing would be saying something the
 * screen already says twice, on the roster and in the header.
 */
export function RecordingsIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Circle cx="12" cy="12" r="1" />
      <Circle cx="12" cy="12" r="10" />
    </Glyph>
  );
}

/**
 * Watching together. `lucide/monitor-play`.
 *
 * A screen on a stand, which is literally what the feature is: the video plays
 * on a laptop or a tablet that follows the channel, and the phone in your hand
 * is the remote. The play triangle inside it is the one place a triangle is
 * right here — it is part of the picture of a screen rather than a control.
 */
export function WatchIcon({
  color,
  size = 22,
}: {
  color: ColorValue;
  size?: number;
}) {
  return (
    <Glyph color={color} size={size}>
      <Path d="M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z" />
      <Path d="M12 17v4" />
      <Path d="M8 21h8" />
      <Rect x="2" y="3" width="20" height="14" rx="2" />
    </Glyph>
  );
}
