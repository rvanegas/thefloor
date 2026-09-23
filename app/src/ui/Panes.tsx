import React from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useText } from '../i18n';
import { LIST_WIDTH, PaneContext, type Layout } from './layout';
import { shouldCapture, swipeOf } from './swipe';
import { colors, spacing, type } from './theme';

/**
 * Where a swipe goes, in each direction it can go anywhere.
 *
 * An absent handler is a direction with nothing in it, and the gesture is not
 * taken at all — no movement, no bounce, nothing to explain. Which is the
 * whole of what *otherwise inert* means: a left swipe with no hoisted channel
 * behind it must be indistinguishable from a left swipe on a screen that has
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
  open,
}: {
  layout: Layout;
  list: React.ReactNode;
  detail: React.ReactNode;
  swipes?: Swipes;
  /**
   * Whether the detail slot is holding a screen of its own rather than the
   * list it falls back to — which is to say, whether you are *in* something.
   *
   * **This is the whole of what makes a screen travel, and it is why the
   * motion is not the gesture's.** A swipe and a tap on a channel card are the
   * same journey, and a screen that slides for one and appears for the other
   * says they are different. So the animation is not fired by the thumb: it is
   * fired by this changing, whatever changed it — a card, the Home button in a
   * channel header, a swipe, or being closed out of a room by something that
   * happened elsewhere.
   *
   * Two states rather than a depth, because below the breakpoint there are
   * two: the list, and a screen over it. Which screen is not this component's
   * business, and moving between two of them is not an arrival — it is the
   * same slot with something else in it.
   */
  open?: boolean;
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
   * Whether an arrival is something that travels at all.
   *
   * Nothing moves in a split: both screens are already up, the slot is not a
   * way in or out of anything, and a window being dragged across the
   * breakpoint must not fling the pane about.
   *
   * **And nothing moves on the web**, which is the same line the gesture draws
   * and drawn for the same reason: there the way back is the address bar and
   * the browser's own history, and a screen that slides when the back button
   * is pressed is this application animating something it does not own. If
   * that is ever wanted it is this condition and nothing else.
   */
  const travels = !split && Platform.OS !== 'web';

  /**
   * Put the arriving screen where it comes from, then bring it home.
   *
   * **A layout effect, which is the earliest this can honestly happen.** The
   * offset wants to be on the slot in the same frame that mounts what is
   * arriving, or the new screen is drawn in place and then jumps to the edge
   * to start — a flash exactly where the eye already is. A layout effect runs
   * inside the commit, so the `setValue` is in the same batch of native
   * operations as the mount. It was tried during render, which is earlier
   * still and is wrong: an `Animated.Value` with a JS subscriber updates that
   * subscriber, so setting one while rendering is setting state in another
   * component mid-render, and React says so.
   *
   * **Going in comes from the right and going out from the left**, which is
   * the direction of travel of the swipe that also does it, and of every back
   * gesture on every phone. See `App.tsx`.
   *
   * The previous value is recorded either way, so a change that happens while
   * nothing is allowed to move is not saved up and played later.
   */
  const wasOpen = React.useRef(open);
  React.useLayoutEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    if (!travels) return;
    slide.setValue(open ? width : -width);
    Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, travels, width, slide]);

  /**
   * Read through a ref, because `PanResponder.create` captures what it can see
   * and is built once. Rebuilding it whenever the handlers change identity —
   * which is every render, they are closures — would hand a live gesture to a
   * new responder mid-drag.
   */
  const swipesRef = React.useRef(swipes);
  swipesRef.current = swipes;

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
            And that is all the gesture does. The travel is `open` changing,
            which is what `go` is about to do — so a swipe in and a tap on the
            card that does the same thing are the same 220ms, rather than the
            gesture owning a piece of motion nothing else can reach.
          */
          go();
        },
        /**
         * A scroll underneath asking for the gesture back gets it. Nothing is
         * held mid-drag, so there is nothing to unwind.
         */
        onPanResponderTerminationRequest: () => true,
      }),
    []
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
  const t = useText().panes;
  return (
    <View style={styles.empty}>
      <Text style={type.title}>{t.brand()}</Text>
      <Text style={[type.muted, styles.emptyLine]}>{t.pickAConversation()}</Text>
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
   *
   * **The rule is drawn outside the width, not inside it.** A border is part
   * of the box in React Native, so `width: LIST_WIDTH` with a border on it
   * hands the pane `LIST_WIDTH` minus a hairline to lay anything out in — and
   * that hairline is exactly what `LIST_WIDTH` has no slack for. 360 is
   * chosen so Home's strip measures `4 * MIN_SEGMENT` = 320 to the point, so
   * 359.67 measured it 319.67, the tabs wrapped to two rows, and the widening
   * that was meant to unwrap them changed nothing anybody could see. Adding
   * the hairline back makes the *content* LIST_WIDTH, which is what every
   * sentence about this number in `layout.ts` assumes it is.
   */
  list: {
    width: LIST_WIDTH + StyleSheet.hairlineWidth,
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
