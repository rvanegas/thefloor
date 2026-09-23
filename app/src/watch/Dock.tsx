import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { colors, radius, spacing } from '../ui/theme';

/**
 * Where the picture is, which is the whole of what this component decides.
 *
 * Three places: **docked**, a pinned row under the tabs on the *Watch* tab;
 * **floating**, a small rectangle in one of the four corners of the
 * application; and **full**, the whole of it.
 *
 * **Full screen was not one of them until 2026-09-23**, and the reason it is
 * now is the reason this file exists at all. It used to replace the screen —
 * `FullScreen` mounted a player of its own and this one stood down — so
 * expanding the picture tore one `WebView` down and built another: a black
 * rectangle, a refetch of the IFrame API and a second of buffering, measured
 * at 1.0 to 1.5 seconds on build 276, every time somebody turned their phone.
 * That is the same reload this file's whole arrangement is written to avoid,
 * and it was being paid on the most ordinary gesture a person makes at a film.
 *
 * So full screen is a style like the other two, `FullScreen` is the scrim
 * alone, and the player never moves. See planning/WATCH-RESPONSIVENESS.md.
 */
export type Place = 'docked' | 'floating' | 'full';

/** The four corners the floating picture settles into, and no fifth. */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Where the picture starts, and where it goes back to if it is let go. */
export const HOME_CORNER: Corner = 'bottom-right';

/** How wide the floating picture is, and the height follows from 16:9. */
export const PIP_WIDTH = 168;
export const PIP_HEIGHT = Math.round((PIP_WIDTH * 9) / 16);

/** The gap it keeps from the edges of the application. */
const INSET = spacing(1.5);

/** A rectangle in the host's own coordinates. */
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * How far a finger may travel and still be a tap rather than a drag.
 *
 * The same surface has to do both — there is nothing else on a rectangle this
 * size to put a second control on — so the two are told apart by distance and
 * by nothing else. Generous, because the thing being dragged is under the
 * thumb that is dragging it and a person aiming at a 168pt target is not
 * holding still.
 */
export const isTap = (gesture: { dx: number; dy: number }): boolean =>
  Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8;

/**
 * Where a corner puts the picture's top-left, inside a box of a given size.
 *
 * **Absolute coordinates rather than four style objects**, which is what makes
 * the snap animatable: a spring needs somewhere to travel *to*, and `right`
 * and `bottom` are not a place a translation can be aimed at. Everything from
 * here down is arithmetic on one origin.
 *
 * `Math.max` against the inset rather than a clamp on the result: a box too
 * small to hold the picture with both margins pins it to the top-left instead
 * of inverting the range, which is what the naive form does when the maximum
 * ends up below the minimum. Nothing draws that today; a split pane on a small
 * window could.
 */
export function cornerOrigin(
  corner: Corner,
  box: { width: number; height: number }
): { x: number; y: number } {
  const right = Math.max(INSET, box.width - PIP_WIDTH - INSET);
  const bottom = Math.max(INSET, box.height - PIP_HEIGHT - INSET);
  return {
    x: corner === 'top-left' || corner === 'bottom-left' ? INSET : right,
    y: corner === 'top-left' || corner === 'top-right' ? INSET : bottom,
  };
}

/**
 * Which corner a picture left at `origin` belongs to.
 *
 * **By its centre, and by which quadrant of the box that centre is in.** Not
 * by which corner is nearest in a straight line: a phone's box is far taller
 * than the picture is wide, so a rectangle dropped halfway up the left edge is
 * still closer to the corner it came from than to either one on the left, and
 * measuring distance would send it back where it started. A quadrant says what
 * a person means by *put it up there* every time.
 *
 * Pure and exported for `FullScreen`'s reason: a responder is not reachable
 * from a test renderer, so what a test can hold is the decision the responder
 * makes. A picture dropped somewhere unreachable is not recoverable by
 * anything — there is no scroll under it and no edge to throw it back from —
 * so this is the one piece of the gesture that must not be wrong.
 */
export function nearestCorner(
  origin: { x: number; y: number },
  box: { width: number; height: number }
): Corner {
  const left = origin.x + PIP_WIDTH / 2 < box.width / 2;
  const top = origin.y + PIP_HEIGHT / 2 < box.height / 2;
  if (top) return left ? 'top-left' : 'top-right';
  return left ? 'bottom-left' : 'bottom-right';
}

/**
 * **The picture, which does not belong to the screen it is watched from.**
 *
 * Until 2026-09-19 the player was a child of the *Watch* tab's card, and so it
 * existed only while that tab was showing: somebody who stepped into a room
 * with a film running and landed on *Members* — which is where everybody
 * lands — saw nothing, heard nothing, and was reported to the room as
 * watching, their microphone closed on the strength of it. Tapping another tab
 * mid-film did the same thing to somebody who had been watching.
 *
 * It does not belong to the *channel screen* either. Its parent is `Picture`,
 * above the route table, so going Home or into settings leaves the film
 * running in the corner rather than tearing it down — see that file, which is
 * where the rest of the argument is.
 *
 * **The two places are one element in two styles**, deliberately and
 * load-bearingly: a `WebView` reparented is a `WebView` rebuilt — the page
 * reloads, the film starts from black and the follower drives it back — so the
 * docked picture and the floating one cannot be two renders in two branches.
 * They are the same views throughout, and what changes between them is a style
 * object and whether the drag surface is there. Anything added here that is
 * structural rather than cosmetic reintroduces the reload, and the symptom is
 * a black rectangle and a few seconds of buffering every time somebody touches
 * the tab bar.
 *
 * **Both places are absolutely positioned now, which is the change that let it
 * leave the channel.** Docked used to be a row in flow inside `Screen`'s
 * `aside`, taking its own height out of the body; a row in flow cannot also be
 * a rectangle over Home. So the row is a *hole* the channel screen leaves and
 * measures — `DockSlot` — and this moves itself into it. The body still has
 * its height taken out of it, by the hole rather than by the picture.
 */
export function WatchDock({
  place,
  slot,
  box,
  hidden = false,
  onOpen,
  children,
}: {
  place: Place;
  /**
   * Where the docked row is, in the host's coordinates, or null if no screen
   * showing one has measured it yet.
   *
   * Docked with no slot is drawn invisibly rather than guessed at — see the
   * render — because a picture put at a guessed rectangle and corrected a frame
   * later is a visible jump on the very tap that asked for it, and a picture
   * left out until the measurement arrives is a reload.
   */
  slot: Rect | null;
  /** The application's own box, which is what the corners are corners of. */
  box: { width: number; height: number };
  /**
   * Drawn but not shown, and not touchable either.
   *
   * **A paused film has no corner**, which is what this is for: the floating
   * rectangle is how a film that somebody walked away from keeps playing where
   * they can see it, and a film that is not playing is not doing that — it is
   * a still frame sitting over whatever tab they went to. `Picture` decides
   * when, and the rule is only about the floating half: docked, a paused film
   * is the *Watch* tab's card with the transport under it, which is exactly
   * where a person goes to press play.
   *
   * **Hidden rather than unmounted, which is this file's one rule.** A
   * `WebView` that goes away is a `WebView` that reloads — black rectangle,
   * a few seconds of buffering, the follower driving it back to position —
   * and pausing is the most ordinary thing anybody does to a film. So it
   * keeps its place and its page and stops being painted, the same handling
   * `unplaced` already gets a few lines down.
   */
  hidden?: boolean;
  /**
   * The tap on the floating picture, which goes to the *Watch* tab.
   *
   * The rectangle is too small for a transport and has no room for one, so
   * what it offers instead is the way to the controls — which is also the only
   * thing a person who has just noticed a film in the corner wants. From Home
   * it has a channel to open first; see `Picture`.
   */
  onOpen: () => void;
  /** The player. One of these, for the life of the party. */
  children: React.ReactNode;
}): React.ReactElement {
  const floating = place === 'floating';
  const full = place === 'full';

  /** Which corner it is resting in, which survives every tab and every route. */
  const [corner, setCorner] = useState<Corner>(HOME_CORNER);

  /**
   * How far it has been dragged from that corner, as a translation.
   *
   * `Animated` with `useNativeDriver: false`, layout properties not being
   * drivable natively — the cost is a bridge message per frame for one small
   * view while a finger is down, which is what `PanResponder` costs anyway.
   */
  const pan = useRef(new Animated.ValueXY()).current;

  /** What the snap is computed against, read inside a responder that outlives
      the render it was made in. */
  const bounds = useRef(box);
  bounds.current = box;
  const resting = useRef(corner);
  resting.current = corner;
  const open = useRef(onOpen);
  open.current = onOpen;

  /*
    A rotation moves every corner, and the picture rests *against* one rather
    than at a remembered offset — so there is nothing to recompute here and
    nothing to clamp. What there is to do is drop any half-applied drag, a
    translation measured against the old box meaning nothing against the new.
  */
  useEffect(() => {
    pan.setValue({ x: 0, y: 0 });
  }, [pan, box.width, box.height]);

  const drag = useMemo(
    () =>
      PanResponder.create({
        // On the *start*, not the move: this surface has no competitor and a
        // tap on it is a control. `FullScreen`'s swipe is the other case —
        // there the picture must be able to ignore a finger.
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => {
          if (isTap(gesture)) {
            // A tap leaves the picture exactly where it was and opens the tab.
            pan.setValue({ x: 0, y: 0 });
            open.current();
            return;
          }
          const from = cornerOrigin(resting.current, bounds.current);
          const to = nearestCorner(
            { x: from.x + gesture.dx, y: from.y + gesture.dy },
            bounds.current
          );
          const at = cornerOrigin(to, bounds.current);
          /*
            Aimed at the *difference*, because the translation is still
            measured from the corner the drag started in. Switching `corner`
            first and zeroing the pan would put the picture at its destination
            instantly, which is a jump rather than a snap; switching it in the
            callback, at the moment the translation already equals the
            difference, is the same pixel drawn twice.
          */
          Animated.spring(pan, {
            toValue: { x: at.x - from.x, y: at.y - from.y },
            useNativeDriver: false,
            // Nothing about this should overshoot: the picture is being put
            // back inside an edge it has just crossed, and a bounce would put
            // it back over that edge for a moment.
            bounciness: 0,
          }).start(() => {
            setCorner(to);
            pan.setValue({ x: 0, y: 0 });
          });
        },
      }),
    [pan]
  );

  const at = cornerOrigin(corner, box);
  /*
    **Docked with nowhere to be is drawn and not shown, never unmounted.**
    `Picture` reads the place off the presence of a hole, so the two cannot
    disagree there and this does not arise; it arises for anyone else who
    renders this, and the obvious handling — returning null until a rectangle
    arrives — is the one thing this component must never do. Null unmounts the
    `WebView`, which is the reload the whole file is arranged to avoid, and it
    would happen on the frame somebody taps *Watch*. Invisible in the corner
    costs a frame nobody sees.
  */
  const unplaced = !floating && !full && !slot;

  /*
    The two ways a picture is here and not on show, and they are one style:
    the docked one whose hole has not been measured yet, and the floating one
    whose film is paused. Neither may answer a finger — an invisible 168-point
    rectangle that opens a tab when tapped is worse than no rectangle at all —
    so the drag surface goes with the paint, and the view itself takes no
    touches.
  */
  /*
    **A paused film in full screen is still on show**, which is why `hidden`
    is read only for the floating case. The corner is for a film that is
    running while somebody is elsewhere; the whole glass is where somebody is
    looking, and blanking it on a pause would be blanking the thing they are
    looking at.
  */
  const unshown = unplaced || (floating && hidden);

  return (
    <Animated.View
      pointerEvents={unshown ? 'none' : undefined}
      style={
        full
          ? // The whole application, and the box is what that means. No
            // corner radius and no shadow: those are a card's edge and this
            // has none — the edge is the device's.
            [styles.full, { width: box.width, height: box.height }]
          : floating && !hidden
          ? [
              styles.pip,
              { left: at.x, top: at.y, transform: pan.getTranslateTransform() },
            ]
          : unshown
            ? [styles.pip, { left: at.x, top: at.y, opacity: 0 }]
            : [
                styles.picture,
                {
                  left: slot!.x,
                  top: slot!.y,
                  width: slot!.width,
                  height: slot!.height,
                },
              ]
      }
    >
      {children}
      {floating && !hidden ? (
        // Over the picture rather than around it, for `FullScreen`'s reason:
        // the frame beneath is a native view that answers a touch whatever the
        // page inside it says about pointer events, so the gesture has to be
        // taken above it.
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
          accessibilityRole="button"
          accessibilityLabel="Open the watch tab"
          {...drag.panHandlers}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** The whole glass, which is what full screen is once the player stays put. */
  full: { position: 'absolute', left: 0, top: 0, backgroundColor: '#000' },
  /**
   * The docked row, drawn into the hole the channel screen left for it.
   *
   * It carries the hairline the pinned header has and for the same reason —
   * without an edge the cards below slide up to the film and stop, with
   * nothing saying which of the two moved. The 16:9 and the cap on the measure
   * belong to the hole rather than to this, the hole being the half that has
   * to take the height out of the body.
   */
  picture: {
    position: 'absolute',
    backgroundColor: '#000',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  /**
   * The rectangle itself, resting in one of the four corners.
   *
   * It starts bottom-right, that being the corner a thumb covers least of on
   * the way to the footer, and the one that puts it furthest from the text in
   * the two tabs that have a field in them — the notepad and the invite box.
   * Being wrong about that costs a drag rather than a tab: the other three are
   * reachable, they are over the pinned header and footer as readily as over
   * the body, and where it is left is where it stays for the life of the
   * party.
   */
  pip: {
    position: 'absolute',
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    // A hairline, because the film is black and so is most of what it will sit
    // over: without an edge a dark scene has no boundary at all.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
