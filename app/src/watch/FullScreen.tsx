import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { Button } from '../ui/components';
import { spacing } from '../ui/theme';
import { useWholeWindow } from '../ui/layout';
import { isTap } from './Dock';
import { useLandscapeWhile } from './orientation';

/** How far a finger has to have travelled down for a release to be a swipe. */
export const swipeCompleted = (gesture: { dy: number }): boolean =>
  gesture.dy > 80;

/**
 * How long the chrome stays up with nothing being pressed.
 *
 * Exported because a responder and a timer are both out of a test renderer's
 * reach: what a test can hold is the numbers and the decisions, and this is one
 * of them. Three seconds is long enough to read the row and reach for it, and
 * the same figure every other player on the phone uses.
 */
export const HIDE_AFTER_MS = 3000;

/** How long the fade itself takes, either way. */
const FADE_MS = 200;

/**
 * The film, filling the phone.
 *
 * **An app control, because there is no other kind left.** YouTube's own bar
 * went on 2026-09-18 — `WatchPlayer`, and the decision of that date — and its
 * full-screen button went with it; the IFrame API offers no method for it, and
 * the browser's own `requestFullscreen` is unreachable inside a `WKWebView`
 * that nobody has set `isElementFullscreenEnabled` on, which
 * `react-native-webview@13.15.0` does not. So expanding the picture is
 * something this application does to its own layout, and nothing about it is
 * asked of the player.
 *
 * **Which means the way out is ours to draw as well.** There is no `esc` on a
 * phone and no system full-screen to escape from, so a person who cannot find
 * the control we drew has no second way of leaving. That is the whole design
 * of this component, and it is why there are four ways out of it rather than
 * one:
 *
 * - **The button**, in the chrome, saying the words. Not a glyph: the exit
 *   from a state with no other exit is not the place to be teaching a shape,
 *   and the accessibility label of an icon is no help to somebody looking at
 *   the screen.
 * - **A swipe down** over the picture, which is what the gesture means
 *   everywhere else on the phone — and which is the way out that does not
 *   depend on the chrome being up.
 * - **A tap**, which brings the chrome back from anywhere on the picture.
 * - **The exits nobody presses**, which are the caller's: the party stopping,
 *   the film being refused, the picture moving to another device. See
 *   `ChannelView`, which collapses this rather than leaving somebody holding a
 *   black rectangle with nothing on it.
 *
 * ## The chrome fades, which it did not until 2026-09-19
 *
 * **This file argued the other way for a day and the argument was wrong.** It
 * said that fading the row would hide the only way out behind a gesture nobody
 * was told about, and kept the transport and the channel's own footer up for as
 * long as the picture was. What that cost was the thing full screen is *for*:
 * the two of them together take about a fifth of a sideways phone, and a 16:9
 * film fitted into what is left is smaller than the glass by a wide margin —
 * black down both sides, and the picture noticeably smaller than it needed to
 * be. A control whose purpose is a bigger picture cannot be built on a layout
 * that keeps a bar over it.
 *
 * So both fade together after {@link HIDE_AFTER_MS}, and a touch anywhere
 * brings them back — which is what every other player on the phone does, and
 * therefore the gesture a person already has. **They start up rather than
 * down**: somebody arriving in this state is shown the way out of it before it
 * goes, so the exit is learnt and then hidden rather than never seen.
 *
 * And the reason the original worry is survivable is the swipe. It is the one
 * way out that never depended on the chrome, it is the gesture this phone uses
 * for dismissing everything else, and it is unchanged. The film has no
 * controls of its own to compete with a touch — YouTube's bar is off — so
 * there is no ambiguity about what a tap on the picture means.
 */
export function FullScreen({
  picture,
  chrome,
  footer,
  onCollapse,
}: {
  /** The player, which fills whatever it is given. */
  picture: React.ReactNode;
  /** The transport — the same row the card has, drawn over the picture. */
  chrome: React.ReactNode;
  /**
   * The channel's own pinned bar, kept because this is a talking application
   * before it is a video one: an evening where nobody can reach their own
   * microphone without first leaving the film is the wrong trade. Over the
   * picture with the transport rather than below it since 2026-09-19, and
   * fading with it — a bar that is one touch away is still reachable, and a
   * bar that is permanently there is a fifth of the film.
   */
  footer: React.ReactNode;
  onCollapse: () => void;
}): React.ReactElement {
  useLandscapeWhile(true);
  /*
    And the window, for as long as this is up.

    **The turn sideways is what makes this necessary.** An iPhone on its side
    is wider than `SPLIT_AT`, so without this the rotation that was meant to
    give the film the glass puts Home back beside it and leaves the picture
    smaller than it was in portrait — which is the thing this state exists to
    prevent, arriving by the other door. See `WholeWindowContext`.
  */
  useWholeWindow();

  /** Whether the chrome is up. It starts up; see the header. */
  const [shown, setShown] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Puts the clock back to the start, which every touch does.
   *
   * A row that vanished three seconds after this state opened — while somebody
   * was still reaching for the scrubber — would be the fading control at its
   * worst. So the countdown is against *inactivity* rather than against the
   * state, and any touch at all, on the transport or the footer or the picture,
   * starts it again.
   */
  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: shown ? 1 : 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start();
    if (shown) arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [shown, fade, arm]);

  /**
   * The touch surface over the picture, which is now two gestures rather than
   * one.
   *
   * It claims on the **start** and no longer only on a downward move: a tap on
   * the picture is a control now — it is how the chrome comes back — so this
   * surface has to be offered every touch rather than only the ones that are
   * already travelling. Nothing is taken away by that: the frame beneath
   * answers no touch at all, `WatchPlayer` making it inert wherever there is
   * nothing on it to press, and the chrome is drawn above this rather than
   * below it.
   *
   * What the release does is decide which of the two it was — far enough down
   * is the way out, barely anywhere is the tap — and a drag that is neither is
   * a finger that changed its mind, which correctly does nothing.
   *
   * `PanResponder` rather than `react-native-gesture-handler`, which this app
   * does not carry and which these two gestures are not worth adding.
   */
  const collapse = useRef(onCollapse);
  collapse.current = onCollapse;
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => {
          if (swipeCompleted(gesture)) {
            collapse.current();
            return;
          }
          if (isTap(gesture)) setShown((was) => !was);
        },
      }),
    []
  );

  return (
    <View
      style={styles.screen}
      /*
        Every touch in this state, offered to nothing and recorded. Capture
        rather than a handler, and it always declines — so the transport's own
        buttons keep their presses and the scrubber keeps its drag, and pressing
        any of them still counts as somebody being here. The same move
        `Attending` makes in `App.tsx`, for the same reason.
      */
      onStartShouldSetResponderCapture={() => {
        if (shown) arm();
        return false;
      }}
    >
      <View style={styles.stage}>
        {picture}
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
          {...swipe.panHandlers}
        />
        {/*
          Inert while it is down, so that a tap aimed at bringing it back is
          not swallowed by the invisible row it is aimed through. Opacity alone
          would leave a full-width bar catching every touch along the bottom of
          the film.
        */}
        <Animated.View
          testID="chrome"
          style={[styles.chrome, { opacity: fade }]}
          pointerEvents={shown ? 'box-none' : 'none'}
        >
          {chrome}
          <Button label="Exit full screen" onPress={onCollapse} />
          {footer}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  /**
   * Black rather than `colors.bg`, for the reason the card's frame is black:
   * what shows here is letterbox, which belongs to the film rather than to the
   * application, and a light strip down each side of a picture is the one
   * place this palette would be read as a mistake.
   *
   * **It is the whole window now**, the footer having stopped being a sibling
   * that takes its own height: the film is fitted to all the glass there is and
   * cropped by nothing. What is left over at the sides of a 16:9 film on a
   * phone that is wider than that is the film's letterbox and stays black.
   */
  stage: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  /**
   * **Over the picture, which is the one departure this file makes from
   * § *The shape of a screen*.** The rule is that pinned rows are siblings of
   * the body and take their own height out of it; that rule buys a body that is
   * never covered, and here it would buy a *smaller picture in landscape than
   * in portrait*. Expanding a picture to make it smaller is not a feature. So
   * the transport sits on a scrim, as every video player's does — and since
   * 2026-09-19 the channel's own footer sits on it too, both of them fading
   * together rather than standing over the film for the whole of it.
   */
  chrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing(1.5),
    gap: spacing(1),
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
});
