import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/components';
import { spacing } from '../ui/theme';
import { useWholeWindow } from '../ui/layout';
import { isTap } from './Dock';

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
 * ## What is on the scrim, which is two things
 *
 * **The transport and the way out.** Pause and play, the progress bar, the two
 * fifteen-second seeks — and *Exit full screen*. Nothing else, and in
 * particular nothing about the room: the channel's own pinned bar was drawn
 * here for a day on the argument that this is a talking application before it
 * is a video one, and what that bought was reachability that was never more
 * than one press away, at a fifth of a sideways phone.
 *
 * ## Two ways in and two ways out, and a surface has whichever it can perform
 *
 * **A press of *Full screen* on the watch card opens this and {@link onExit}
 * closes it**, on a laptop, on an iPad, and on a phone held upright or lying
 * flat. **A turn of the wrist opens and closes it on a handheld**, which is
 * the gesture every other film on that phone answers to, and there the button
 * is not drawn: while the phone is sideways the state *is* the window, and an
 * exit that set a flag the window overrules would be a control that visibly
 * did nothing. `ChannelView` holds both and mounts this; see its derivation.
 *
 * That pairing took three tries. From 2026-09-19 the turn was the whole of
 * it and there were no controls at all, which was right about one surface in
 * four: a desktop browser window is landscape, an iPad held the way iPads are
 * held is landscape, and both entered this state on the *Watch* tab with no
 * device to turn. Then the buttons were the whole of it for a few hours,
 * under an application-wide portrait lock that left a phone no way to be
 * turned. The lock is the film's alone now — `watch/orientation.ts` — so both
 * routes hold at once and each is offered where it can be performed.
 *
 * **Portrait is still a supported way to be here**, which is what the press
 * is for: a phone lying flat has no gravity vector to read, iOS holds
 * whatever orientation it last had, and somebody watching a phone on a table
 * is not asking to be rotated.
 *
 * **And the old bug cannot come back.** What made it one was a *landscape*
 * lock — this state pinned the phone sideways, exiting released the pin, and
 * an unlocked phone goes back to how it is being held, so a pressed exit
 * handed back the channel screen sideways with nothing to say otherwise with.
 * Nothing is pinned to landscape now: leaving the film locks portrait, which
 * is a rotation towards what the screen underneath wanted, and the card
 * arrives upright.
 *
 * The exits nobody presses are unchanged and are the caller's: the party
 * stopping, the film being refused, the picture moving to another device. See
 * `ChannelView`, which stops deriving this rather than leaving somebody
 * holding a black rectangle.
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
 * So it fades after {@link HIDE_AFTER_MS}, and a touch anywhere brings it
 * back — which is what every other player on the phone does, and therefore
 * the gesture a person already has. **It starts up rather than down**, so
 * somebody arriving here is shown the transport before it goes rather than
 * having to discover that a tap produces one.
 *
 * And the original worry is answered by the gesture rather than by a second
 * route: the button is the only way out on every surface, and a touch anywhere
 * brings it back, which is the arrangement every player on every phone and
 * every laptop has. The film has no controls of its own to compete with a
 * touch — YouTube's bar is off — so there is no ambiguity about what a tap on
 * the picture means.
 */
export function FullScreen({
  chrome,
  onExit,
}: {
  /**
   * The transport — the same row the card has, drawn over the picture, and
   * with {@link onExit} the whole of what is drawn over the picture.
   */
  chrome: React.ReactNode;
  /**
   * The way out, or `null` when the phone is.
   *
   * It is the caller's because the state is: `ChannelView` holds what was
   * pressed, and this reports the press rather than deciding anything. Null
   * on a handheld that has been turned, where the state is the window's and a
   * press could not move it — see that file's derivation for why a dead
   * button is worse than no button.
   */
  onExit: (() => void) | null;
}): React.ReactElement {
  /*
    The window, for as long as this is up.

    **The phone being sideways is what makes this necessary**, and sideways is
    a shape only this state lets a phone have. An iPhone on its side is wider
    than `SPLIT_AT`, so without this the turn that is meant to give the film
    the glass puts Home back beside it and leaves the picture smaller than it
    was in portrait — which is the thing this state exists to prevent,
    arriving by the other door. See `WholeWindowContext`.
  */
  useWholeWindow();

  /*
    What the hardware takes out of the bottom of the window, which nothing
    else is subtracting any more.

    `App.tsx` drops its bottom inset for exactly this state — the gutter was a
    light bar across the foot of a black screen and a film shorter than the
    glass for no reason — so the film is fitted to all of it and the home
    indicator floats over the picture, as it does over every other player on
    the phone. The one thing that must not be under it is the transport: a
    row of buttons with a white bar lying across them is what that trade
    looks like when nobody pays for it here. So the scrim pays, and the
    picture does not.
  */
  const inset = useSafeAreaInsets();

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
   * state, and any touch at all, on the transport or on the picture, starts it
   * again.
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
   * The touch surface over the picture, which is one gesture now rather than
   * two.
   *
   * A swipe down used to be the way out, back when leaving was something this
   * component did to a flag. Leaving is a press on the scrim, so the gesture
   * had nothing left to mean and is gone — and a tap is all this surface tells
   * apart: it is how the chrome comes back, and a drag that travels is a
   * finger that changed its mind and correctly does nothing.
   *
   * It claims on the **start** rather than on a move, since every touch here is
   * a candidate. Nothing is taken away by that: the frame beneath answers no
   * touch at all, `WatchPlayer` making it inert wherever there is nothing on it
   * to press, and the chrome is drawn above this rather than below it.
   *
   * `PanResponder` rather than `react-native-gesture-handler`, which this app
   * does not carry and which this one gesture is not worth adding.
   */
  const touch = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => {
          if (isTap(gesture)) setShown((was) => !was);
        },
      }),
    []
  );

  /*
    **The scrim alone, since 2026-09-23.** The picture used to be a child of
    this component and is not any more: it stays where it is mounted, above
    the route table, and is merely given the whole box to fill — see
    `Dock.Place`. So this is drawn *over* it rather than around it, by the
    same component that draws the player, and it is transparent throughout.

    What that bought is the reload that expanding used to cost: a `WebView`
    reparented is a `WebView` rebuilt, and a turn of the wrist was tearing one
    down and building another for a second and a half of black.
  */
  return (
    <View
      style={StyleSheet.absoluteFill}
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
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-only"
        {...touch.panHandlers}
      />
        {/*
          Inert while it is down, so that a tap aimed at bringing it back is
          not swallowed by the invisible row it is aimed through. Opacity alone
          would leave a full-width bar catching every touch along the bottom of
          the film.
        */}
      <Animated.View
        testID="chrome"
        style={[
          styles.chrome,
          { opacity: fade, paddingBottom: spacing(1.5) + inset.bottom },
        ]}
        pointerEvents={shown ? 'box-none' : 'none'}
      >
        {chrome}
          {/*
            **Words rather than a glyph**, against § *Icons*' licence for a
            header glyph and for the reason this button existed the first time:
            an icon is findable once it has been learnt, and the way out of a
            state somebody may not know they can leave is not where they learn
            one.

            It says what it does to the picture rather than what it does to the
            device, which is the opposite of what *Back to portrait* said and
            is the right way round now: this collapses the picture directly on
            every platform, where that one turned the phone and let the collapse
            follow. There is no phone to turn in a browser, which is how the
            other one came to be useless on half the surfaces that needed it.
          */}
        {onExit ? <Button label="Exit full screen" onPress={onExit} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    **Nothing here paints a background any more.** This component used to own
    two black surfaces, because the picture was inside it and what showed
    around a 16:9 film was letterbox that belongs to the film rather than to
    the application. The picture is underneath now and brings its own black
    with it — `Dock`'s `full` — so a background here would be a sheet of
    paint over the very thing this is a scrim for.
  */
  /**
   * **Over the picture, which is the one departure this file makes from
   * § *The shape of a screen*.** The rule is that pinned rows are siblings of
   * the body and take their own height out of it; that rule buys a body that is
   * never covered, and here it would buy a *smaller picture in landscape than
   * in portrait*. Expanding a picture to make it smaller is not a feature. So
   * the transport sits on a scrim, as every video player's does, and fades
   * rather than standing over the film for the whole of it. It shares the
   * scrim with the way out and with nothing else; the channel's own footer was
   * on it for a day and is upright-only now.
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
