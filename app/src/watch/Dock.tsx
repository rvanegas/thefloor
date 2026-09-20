import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { colors, radius, spacing } from '../ui/theme';

/**
 * Where the picture is, which is the whole of what this component decides.
 *
 * Two places and no third: **docked**, a pinned row under the tabs on the
 * *Watch* tab, and **floating**, a small rectangle over the corner of every
 * other tab. Full screen is not one of them — it replaces the screen rather
 * than sitting in it, and `FullScreen` mounts its own player.
 */
export type Place = 'docked' | 'floating';

/** How wide the floating picture is, and the height follows from 16:9. */
export const PIP_WIDTH = 168;
export const PIP_HEIGHT = Math.round((PIP_WIDTH * 9) / 16);

/** The gap it keeps from the edges of the body, and from its own corner. */
const INSET = spacing(1.5);

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
 * Keeps the floating picture inside the body it floats over.
 *
 * The rectangle is anchored to the bottom-right corner and moved by a
 * translation, so **every reachable position is zero or negative** in both
 * axes: left is negative x, up is negative y, and the anchor itself is the
 * origin. That is what makes the arithmetic one line per axis rather than
 * four, and it is why the clamp is written against the box rather than
 * against a pair of corners.
 *
 * Pure, and exported, for `FullScreen`'s reason: a responder is not reachable
 * from a test renderer, so what a test can hold is the decision the responder
 * makes. A picture dragged off the top of a phone is not recoverable by
 * anything — there is no scroll under it and no edge to throw it back from —
 * so this is the one piece of the gesture that must not be wrong.
 */
export function clampOffset(
  at: { x: number; y: number },
  box: { width: number; height: number }
): { x: number; y: number } {
  // A box too small to hold the picture pins it to the anchor rather than
  // inverting the range, which is what a naive clamp does when the minimum
  // ends up above the maximum. Nothing draws that today; a split pane on a
  // small window could.
  const left = Math.min(0, -(box.width - PIP_WIDTH - INSET * 2));
  const up = Math.min(0, -(box.height - PIP_HEIGHT - INSET * 2));
  return {
    x: Math.min(0, Math.max(left, at.x)),
    y: Math.min(0, Math.max(up, at.y)),
  };
}

/**
 * **The picture, which does not belong to the tab it is watched from.**
 *
 * Until 2026-09-19 the player was a child of the *Watch* tab's card, and so it
 * existed only while that tab was showing: somebody who stepped into a room
 * with a film running and landed on *Members* — which is where everybody
 * lands — saw nothing, heard nothing, and was reported to the room as
 * watching, their microphone closed on the strength of it. Tapping another tab
 * mid-film did the same thing to somebody who had been watching.
 *
 * So the player is mounted for as long as this device is the party's *screen*,
 * and this component is where it lives. **The two places are one element in
 * two styles**, deliberately and load-bearingly: a `WebView` reparented is a
 * `WebView` rebuilt — the page reloads, the film starts from black and the
 * follower drives it back — so the docked picture and the floating one cannot
 * be two renders in two branches. They are the same three views throughout,
 * and what changes between them is a style object and whether the drag
 * surface is there. Anything added here that is structural rather than
 * cosmetic reintroduces the reload, and the symptom is a black rectangle and
 * a few seconds of buffering every time somebody touches the tab bar.
 *
 * Its own parent is `Screen`'s `aside`, which is a sibling of the scroll
 * rather than an overlay on it — so docked, the picture takes its own height
 * out of the body and covers nothing, exactly as the pinned header does. See
 * STYLE.md § *The shape of a screen*.
 */
export function WatchDock({
  place,
  onOpen,
  children,
}: {
  place: Place;
  /**
   * The tap on the floating picture, which goes to the *Watch* tab.
   *
   * The rectangle is too small for a transport and has no room for one, so
   * what it offers instead is the way to the controls — which is also the
   * only thing a person who has just noticed a film in the corner wants.
   */
  onOpen: () => void;
  /** The player. One of these, for the life of the party. */
  children: React.ReactNode;
}): React.ReactElement {
  const floating = place === 'floating';

  /**
   * The body this floats over, measured rather than assumed.
   *
   * `useWindowDimensions` would be the cheap answer and it is the wrong one:
   * what bounds the picture is the space between the pinned header and the
   * pinned footer, in a pane that may be 340pt narrower than the window. The
   * layer being `absoluteFill` inside that space is what makes its own layout
   * the right measurement.
   */
  const [box, setBox] = useState({ width: 0, height: 0 });
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((was) =>
      was.width === width && was.height === height ? was : { width, height }
    );
  };

  /**
   * Where the picture has been dragged to, as an offset from its corner.
   *
   * `Animated` with `useNativeDriver: false`, layout properties not being
   * drivable natively — the cost is a bridge message per frame for one small
   * view while a finger is down, which is what `PanResponder` costs anyway.
   */
  const pan = useRef(new Animated.ValueXY()).current;
  /** What the clamp is written against, read inside a responder that outlives
      the render it was made in. */
  const bounds = useRef(box);
  bounds.current = box;
  const open = useRef(onOpen);
  open.current = onOpen;

  const drag = useMemo(
    () =>
      PanResponder.create({
        // On the *start*, not the move: this surface has no competitor and a
        // tap on it is a control. `FullScreen`'s swipe is the other case —
        // there the picture must be able to ignore a finger.
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          // The offset pattern: what the gesture reports is a delta, and
          // extracting the offset is what makes a second drag continue from
          // where the first one stopped rather than from the corner.
          pan.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => {
          pan.flattenOffset();
          if (isTap(gesture)) {
            // A tap leaves the picture exactly where it was — `flattenOffset`
            // has already folded the (zero) movement in — and opens the tab.
            open.current();
            return;
          }
          const at = clampOffset(
            {
              // `__getValue` is the documented way to read an `Animated.Value`
              // that is not being rendered from; there is no public getter,
              // and a listener kept for this one read would have to be torn
              // down somewhere.
              x: (pan.x as unknown as { __getValue(): number }).__getValue(),
              y: (pan.y as unknown as { __getValue(): number }).__getValue(),
            },
            bounds.current
          );
          Animated.spring(pan, {
            toValue: at,
            useNativeDriver: false,
            // Nothing about this should overshoot: the picture is being put
            // back inside an edge it has just crossed, and a bounce would put
            // it back over that edge for a moment.
            bounciness: 0,
          }).start();
        },
      }),
    [pan]
  );

  return (
    <View
      style={floating ? styles.layer : styles.dock}
      // Docked, the row is the picture and nothing else is behind it.
      // Floating, everything but the rectangle itself must fall through to
      // the tab underneath — a layer that swallowed the body would make the
      // whole channel unpressable while a film was on.
      pointerEvents={floating ? 'box-none' : 'auto'}
      onLayout={measure}
    >
      <Animated.View
        style={
          floating
            ? [styles.pip, { transform: pan.getTranslateTransform() }]
            : styles.picture
        }
      >
        {children}
        {floating ? (
          // Over the picture rather than around it, for `FullScreen`'s
          // reason: the frame beneath is a native view that answers a touch
          // whatever the page inside it says about pointer events, so the
          // gesture has to be taken above it.
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents="box-only"
            accessibilityRole="button"
            accessibilityLabel="Open the watch tab"
            {...drag.panHandlers}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The docked row: full bleed on a phone, capped at the measure beyond one,
   * with the hairline the pinned header has and for the same reason — without
   * an edge the cards below slide up to the film and stop, with nothing
   * saying which of the two moved.
   */
  dock: {
    backgroundColor: '#000',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  /** 16:9, and the player fills it. Centred, so the cap is a column rather
      than a left-hand picture with a black margin on an iPad. */
  picture: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  /**
   * The floating layer, over the body and under the footer.
   *
   * `zIndex` because it is drawn *before* the scroll in `Screen` — which is
   * what puts the docked row above the cards rather than below them — and a
   * layer that keeps its place in the flow would otherwise be painted over by
   * the very content it floats above.
   */
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  /**
   * The rectangle itself, anchored bottom-right and moved from there.
   *
   * Bottom-right because it is the corner a thumb covers least of on the way
   * to the footer, and because the two tabs that have a field in them — the
   * notepad and the invite box — put it furthest from the text. It is
   * draggable precisely so that being wrong about this costs a gesture rather
   * than a tab.
   */
  pip: {
    position: 'absolute',
    right: INSET,
    bottom: INSET,
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    // A hairline, because the film is black and so is most of what it will
    // sit over: without an edge a dark scene has no boundary at all.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
