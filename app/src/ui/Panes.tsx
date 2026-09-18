import React from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LIST_WIDTH, PaneContext, type Layout } from './layout';
import { shouldCapture, swipeOf } from './swipe';
import { colors, spacing, type } from './theme';

/**
 * Where a swipe goes, in each direction it can go anywhere.
 *
 * An absent handler is a direction with nothing in it, and the gesture is not
 * taken at all — no movement, no bounce, nothing to explain. Which is the
 * whole of what *otherwise inert* means: a right swipe with no live channel
 * behind it must be indistinguishable from a right swipe on a screen that has
 * never heard of swiping.
 */
export type Swipes = { left?: () => void; right?: () => void };

/** How long the arriving screen takes to cross. */
const SLIDE_MS = 220;

/**
 * A list beside the screen you are looking at — or, below the breakpoint, that
 * screen on its own, as a phone has always shown it.
 *
 * **Both arrangements are here, and that is the point of the component.**
 * Crossing the breakpoint is something that happens while somebody watches: a
 * rotation, or a window dragged wider beside another app. React reconciles by
 * position and by key, and it only preserves a subtree that stays at the same
 * place in the tree — so if the stacked layout rendered its screen directly
 * and the split one rendered it two Views down, every crossing would unmount
 * and remount it. `ChannelView` holds `viewing`, `settingsOpen`,
 * `transcriptFor` and every composer field in local state, so that costs an
 * open profile and a half-typed message, mid-drag, for no reason anybody could
 * see. The detail slot therefore sits at one fixed depth under one fixed key
 * in both modes, and only the list beside it comes and goes.
 *
 * The audio survives either way — the session hook is above all of this in
 * `Root` — which is precisely what would have made the loss quiet enough to
 * ship.
 *
 * **It reads no app state.** `Root` decides the mode, decides where each
 * swipe goes, and hands all of it down; the only thing this component asks the
 * platform for is how wide the window is, which is how far an arriving screen
 * has to travel. That is what makes it testable on its own.
 *
 * **The swipes are here because the slot they move is here.** Where they are
 * allowed — below the breakpoint, off the web, and only into a channel
 * somebody is standing in — is `App.tsx`'s judgement, and arrives as handlers
 * that are simply absent when the answer is no. See `Swipes`.
 */
export function Panes({
  layout,
  list,
  detail,
  swipes,
}: {
  layout: Layout;
  list: React.ReactNode;
  detail: React.ReactNode;
  swipes?: Swipes;
}) {
  const split = layout === 'split';
  const { width } = useWindowDimensions();

  /**
   * How far the detail slot is from where it belongs, which is always zero
   * except while a screen is arriving.
   *
   * **The screen being left does not move.** Both of them moving means both of
   * them mounted, and in this arrangement only one ever is — see the fallback
   * in `App.tsx`, where Home *is* the detail slot when nothing is open. Paying
   * for the other half with a permanent second mount of Home, or with
   * `ChannelView` alive behind it, is a great deal more than the difference is
   * worth.
   */
  const slide = React.useRef(new Animated.Value(0)).current;

  /**
   * Read through refs, because `PanResponder.create` captures what it can see
   * and is built once. Rebuilding it whenever the handlers change identity —
   * which is every render, they are closures — would hand a live gesture to a
   * new responder mid-drag.
   */
  const swipesRef = React.useRef(swipes);
  swipesRef.current = swipes;
  const widthRef = React.useRef(width);
  widthRef.current = width;

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        /**
         * Capture rather than a plain responder: every screen this sits over
         * is full of things that claim a touch first, and a gesture that only
         * worked on the gaps between them would be one nobody could find.
         *
         * It declines a direction with no handler, so the drag stays with
         * whatever was under it rather than being taken and dropped.
         */
        onMoveShouldSetPanResponderCapture: (_event, gesture) => {
          const swipes = swipesRef.current;
          if (!swipes) return false;
          if (!shouldCapture(gesture.dx, gesture.dy)) return false;
          return !!(gesture.dx < 0 ? swipes.left : swipes.right);
        },
        onPanResponderRelease: (_event, gesture) => {
          const swipes = swipesRef.current;
          if (!swipes) return;
          const direction = swipeOf(gesture.dx, gesture.dy, gesture.vx);
          if (!direction) return;
          const go = direction === 'left' ? swipes.left : swipes.right;
          if (!go) return;
          /*
            The arriving screen is put where it comes from before it is asked
            for, so it renders already offset and crosses from there. A left
            swipe is a step towards Home, which therefore comes in from the
            right; a right swipe opens the channel, which comes from the left.
            See `swipe.ts` for why those are that way round.
          */
          slide.setValue(direction === 'left' ? widthRef.current : -widthRef.current);
          go();
          Animated.timing(slide, {
            toValue: 0,
            duration: SLIDE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        },
        /**
         * A scroll underneath asking for the gesture back gets it. Nothing is
         * held mid-drag, so there is nothing to unwind.
         */
        onPanResponderTerminationRequest: () => true,
      }),
    [slide]
  );

  return (
    <View style={split ? styles.row : styles.fill}>
      {split ? (
        <View key="list" style={styles.list}>
          <PaneContext.Provider value="list">{list}</PaneContext.Provider>
        </View>
      ) : null}
      {/*
        `Animated.View` in both arrangements, not only where it moves. This is
        the slot the docblock above is about: changing what sits at this depth
        between modes is exactly the remount it exists to prevent, and a
        wrapper added for the stack alone would be one.
      */}
      <Animated.View
        key="detail"
        style={[styles.fill, { transform: [{ translateX: slide }] }]}
        {...(swipes ? responder.panHandlers : null)}
      >
        <PaneContext.Provider value={split ? 'detail' : null}>
          {detail}
        </PaneContext.Provider>
      </Animated.View>
    </View>
  );
}

/**
 * The right-hand pane with nothing in it.
 *
 * **Not a dead end, which is the only thing it has to get right.** The list
 * beside it is a live Home, so there is nothing to offer here and no button
 * worth putting on it: a control here would be a second way to do what the
 * pane to its left is already doing, in the half nobody is looking at.
 */
export function NoDetailView() {
  return (
    <View style={styles.empty}>
      <Text style={type.title}>The Floor</Text>
      <Text style={[type.muted, styles.emptyLine]}>
        Pick a conversation on the left, or start one.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  /**
   * Fixed rather than a fraction, so every point above the breakpoint goes to
   * the conversation. A list of channel names is the one thing on screen that
   * does not get better for being wider.
   */
  list: {
    width: LIST_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
  },
  emptyLine: { marginTop: spacing(1), textAlign: 'center' },
});
