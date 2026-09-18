import { useMemo, useRef } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { Button } from '../ui/components';
import { spacing } from '../ui/theme';
import { useLandscapeWhile } from './orientation';

/**
 * How far a finger has to travel down before it is a swipe at all.
 *
 * Exported with `swipeCompleted` because the two numbers are the whole of the
 * gesture and a responder is not reachable from a test renderer: what a test
 * can hold is the pair of decisions, and what it must be able to say is that a
 * sideways drag and a short one both leave the picture alone.
 */
export const swipeStarted = (gesture: { dx: number; dy: number }): boolean =>
  gesture.dy > 12 && gesture.dy > Math.abs(gesture.dx);

/** And how far it has to have travelled by the time it is let go. */
export const swipeCompleted = (gesture: { dy: number }): boolean =>
  gesture.dy > 80;

/**
 * The film, filling the phone, with the channel still underneath it.
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
 *   everywhere else on the phone.
 * - **The chrome never hides.** Every other video player fades its controls
 *   after a few seconds and brings them back on a tap; here that would hide
 *   the only way out behind a gesture nobody was told about — and the same row
 *   is how a floor-holder pauses. It costs the bottom inch of the picture,
 *   which is the price of a way out that is always visible.
 * - **The exits nobody presses**, which are the caller's: the party stopping,
 *   the film being refused, the picture moving to another device. See
 *   `ChannelView`, which collapses this rather than leaving somebody holding a
 *   black rectangle with nothing on it.
 *
 * Some of these will look like too many with a month's use. That is the
 * expected outcome and the cheap direction to be wrong in: a redundant way out
 * costs a row of pixels, and a missing one costs somebody the app.
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
   * microphone without first leaving the film is the wrong trade. A sibling
   * below the picture rather than another overlay, as `Screen` documents.
   */
  footer: React.ReactNode;
  onCollapse: () => void;
}): React.ReactElement {
  useLandscapeWhile(true);

  /**
   * The swipe, which has to be a responder rather than a `Pressable`.
   *
   * It claims the gesture on the *move* and only downwards, so a finger that
   * travels sideways or barely at all is left alone — there is nothing else to
   * press on the picture today, but a picture that swallows every touch is one
   * that cannot be given anything later.
   *
   * `PanResponder` rather than `react-native-gesture-handler`, which this app
   * does not carry and which this one gesture is not worth adding.
   */
  const collapse = useRef(onCollapse);
  collapse.current = onCollapse;
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => swipeStarted(gesture),
        onPanResponderRelease: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => {
          if (swipeCompleted(gesture)) collapse.current();
        },
      }),
    []
  );

  return (
    <View style={styles.screen}>
      <View style={styles.stage}>
        {picture}
        {/*
          The gesture surface, over the picture and under the chrome. The
          frame beneath it answers no touch at all — `WatchPlayer` makes it
          inert wherever there is nothing on it to press — so this takes
          nothing away, and a refused film is one of the exits above rather
          than something to reach through this.
        */}
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
          {...swipe.panHandlers}
        />
        <View style={styles.chrome}>
          {chrome}
          <Button label="Exit full screen" onPress={onCollapse} />
        </View>
      </View>
      {footer}
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
   */
  stage: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  /**
   * **Over the picture, which is the one departure this file makes from
   * § *The shape of a screen*.** The rule is that pinned rows are siblings of
   * the body and take their own height out of it; that rule buys a body that
   * is never covered, and here it would buy a *smaller picture in landscape
   * than in portrait* — a stacked transport and footer leave about 200pt of a
   * sideways phone, where portrait full width gives 219. Expanding a picture
   * to make it smaller is not a feature. So the transport sits on a scrim, as
   * every video player's does, and the footer below stays a sibling.
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
