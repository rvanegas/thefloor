import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { inRoom } from '../../../core/guests';
import { useApp } from '../state/AppProvider';
import { COLUMN_GAP, useWatchShape } from '../ui/layout';
import { colors } from '../ui/theme';
import { WatchDock, type Rect } from './Dock';
import { usePortraitUnlessFullScreen } from './orientation';
import { WatchPlayer } from './WatchPlayer';

/**
 * **Where the one player lives, which is above every screen in the app.**
 *
 * The picture used to belong to the *Watch* tab, and then to the channel
 * screen; both were the same mistake at different depths. A `WebView` is
 * rebuilt the instant it is reparented — the page reloads, the film starts
 * from black and the follower drives it back — so wherever the player is
 * mounted is the furthest a person can go without losing the film. Mounted on
 * the tab, a tab bar stopped it; mounted on the channel screen, going Home did.
 *
 * So it is mounted here, once, for as long as this device is the party's
 * *screen*, and every screen in the application is drawn underneath it. Home,
 * the settings, a profile, a transcript: the film goes on playing in the corner
 * through all of them, because none of them is its parent any more.
 *
 * **What moves is a style object and nothing else.** Docked, the channel screen
 * leaves a hole — `DockSlot` — measures it, and this puts the picture in it.
 * Floating, the picture rests in one of the four corners of the application
 * rather than of a body, which is what lets it sit over the pinned header and
 * footer and what makes it reachable from a screen that has neither.
 *
 * **Full screen is the one thing it stands down for.** `FullScreen` mounts a
 * player of its own — expanding has always cost a reload, and that price is
 * argued where it is paid, in `ChannelView` — so this one is torn down for as
 * long as that one is up. Two players on one party would be two sets of audio.
 */

/** A rectangle in window coordinates, which is what a measurement returns. */
type Measured = Rect;

type PictureApi = {
  /**
   * Says where the docked row is, and that there is one.
   *
   * The presence of a slot *is* the answer to where the picture goes: a screen
   * that wants it docked leaves a hole, and every other screen in the
   * application leaves none. Nothing has to be told which tab is showing.
   */
  dock: (owner: object, at: Measured) => void;
  /**
   * Takes a hole away again, by the one who left it.
   *
   * Keyed on the owner because two screens overlap for a moment when one
   * replaces another, and an unconditional clear on unmount lets the outgoing
   * screen undo the incoming one's measurement — a frame of the picture in the
   * corner on a screen that had just made room for it.
   */
  undock: (owner: object) => void;
  /** Whether the expanded picture is up, and so whether this one stands down. */
  fullScreen: boolean;
  setFullScreen: (taken: boolean) => void;
  /** What the player last said about being refused, for whoever must react. */
  refused: boolean;
};

const PictureContext = createContext<PictureApi | null>(null);

/**
 * The picture's controls, for the screens that have something to say to it.
 *
 * Null outside the provider rather than a throw: `ChannelView` is rendered by
 * a test harness that has no reason to care about a watch party, and a screen
 * that cannot reach the picture simply has no picture to reach.
 */
export function usePicture(): PictureApi | null {
  return useContext(PictureContext);
}

/**
 * The hole the docked picture is drawn into, left by the screen that wants one.
 *
 * **It is the thing in flow, and that is the whole of why it exists.** A pinned
 * row takes its own height out of the body so that nothing is ever hidden
 * beneath it — STYLE.md § *The shape of a screen* — and the picture cannot do
 * that any more, being absolutely positioned over the entire application. So
 * the height is taken out by this, which is an empty black rectangle, and the
 * picture is laid over it.
 *
 * It keeps the 16:9 and the cap on the measure, those being what decide how
 * much height comes out; and it is black, so that the frame between the
 * measurement and the picture arriving is the colour of the film rather than a
 * hole in the screen.
 */
export function DockSlot(): React.ReactElement {
  const picture = usePicture();
  const box = useRef<View>(null);
  /** Identity, so this slot's own removal cannot cancel another's arrival. */
  const owner = useRef({}).current;

  /**
   * The two calls, taken off the context object deliberately.
   *
   * **Depending on `picture` itself is a bug, and it shipped.** The value is
   * rebuilt whenever `fullScreen` or `refused` changes — they are fields on
   * it — so an effect keyed on the object runs its cleanup on a flip that has
   * nothing to do with this slot, and the cleanup here is an `undock`. The
   * picture then has no hole to sit in and goes to a corner, on the *Watch*
   * tab, over the black rectangle that is this slot; and nothing puts it
   * back, because re-docking needs a fresh `onLayout` and the layout did not
   * change. The way in was a film being refused and then not — turn a VPN
   * off, the film loads, `refused` goes true → false — which is a flip the
   * slot survives mounted. The *Full screen* route flips it too and self-heals
   * only because this component is unmounted for the duration of that one.
   *
   * `dock` and `undock` are `useCallback([])` in the provider and never
   * change, so keyed on these the effect runs exactly when this slot is
   * mounted and unmounted, which is what it was always for.
   */
  const dock = picture?.dock;
  const undock = picture?.undock;

  const measure = useCallback(
    (_event: LayoutChangeEvent) => {
      const node = box.current;
      // `measureInWindow` is a native method, and a renderer that draws views
      // without laying them out has none. Nothing measures in a test today —
      // `onLayout` never fires there — but a harness that grew a layout pass
      // would otherwise take the whole screen down over a picture.
      if (!node || !dock || typeof node.measureInWindow !== 'function') {
        return;
      }
      // In window coordinates, deliberately: `onLayout` reports a position
      // relative to the immediate parent, and this one sits several views deep
      // inside a screen whose own offset nothing here knows. The host measures
      // itself the same way and the two are subtracted. Same move `Screen`'s
      // `reveal` makes, and for the same reason.
      node.measureInWindow((x, y, width, height) => {
        if (!width || !height) return;
        dock(owner, { x, y, width, height });
      });
    },
    [dock, owner]
  );

  React.useEffect(
    () => () => {
      undock?.(owner);
    },
    [undock, owner]
  );

  /*
    **The box, decided rather than constrained.** This was `width: '100%'`, a
    `maxWidth` and an `aspectRatio` — three style rules that between them
    answered *how wide*, and nothing at all about how tall. On a short window
    that is a picture taking the whole body and a transport below the fold,
    which is a browser's ordinary shape and was an iPad's on build 251. See
    `watchShapeFor`, which answers both sides at once and is where the
    reasoning is.
  */
  const { picture: size, columns } = useWatchShape();
  return (
    <View
      ref={box}
      onLayout={measure}
      style={[
        styles.slot,
        size,
        // Beside the scroll, the gap is the aside's; above it, the hairline
        // that separates the picture from the card is.
        columns === 2 ? styles.slotBeside : styles.slotAbove,
      ]}
    />
  );
}

export function Picture({
  onOpen,
  children,
}: {
  /** Takes somebody to the channel whose film this is, on its *Watch* tab. */
  onOpen: (channelId: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  const app = useApp();
  const [slot, setSlot] = useState<{ owner: object; at: Measured } | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [refused, setRefused] = useState(false);
  /*
    Which way up the phone may be, which is decided here because this is the
    only place that knows the answer for the whole application. The rule is
    about *every* screen — a phone is upright on Home and on a transcript as
    much as on the roster — and the one exception is the expanded picture,
    whose flag this component holds precisely because the picture outlives the
    screen that asked for it. See orientation.ts; on a tablet and in a browser
    it does nothing.
  */
  usePortraitUnlessFullScreen(fullScreen);
  /** Where the host itself is, which is what turns a window measurement into
      one of its own. */
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState({ width: 0, height: 0 });

  const dock = useCallback((owner: object, at: Measured) => {
    setSlot((was) =>
      was &&
      was.owner === owner &&
      was.at.x === at.x &&
      was.at.y === at.y &&
      was.at.width === at.width &&
      was.at.height === at.height
        ? was
        : { owner, at }
    );
  }, []);
  const undock = useCallback((owner: object) => {
    setSlot((was) => (was && was.owner === owner ? null : was));
  }, []);

  const api = useMemo<PictureApi>(
    () => ({ dock, undock, fullScreen, setFullScreen, refused }),
    [dock, undock, fullScreen, refused]
  );

  /**
   * Whose film this is, which is one channel at a time.
   *
   * `screenFor` is the account's single slot — this device is the screen for at
   * most one party — so there is no choosing to do here and no list to walk.
   */
  const channelId = app.screenFor;
  const channel = channelId ? (app.channelViews[channelId]?.channel ?? null) : null;
  const watch = channel?.watch ?? null;
  const party = watch?.party ?? null;
  const me = app.me?.id ?? '';

  /**
   * **Nobody outside the room gets one**, checked here rather than only where
   * the screen role is given up: an effect runs after a commit, so a rule
   * written only there would load the page and take it away again. *Nearby*
   * fails it exactly as *out* does, and a *guest* passes — which is the whole
   * of `inRoom`, and the same line the reducer draws for `WATCH_HERE`.
   */
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((was) =>
      was.width === width && was.height === height ? was : { width, height }
    );
  };

  /**
   * **Nobody outside the room gets one**, checked here rather than only where
   * the screen role is given up: an effect runs after a commit, so a rule
   * written only there would load the page and take it away again. *Nearby*
   * fails it exactly as *out* does, and a *guest* passes — which is the whole
   * of `inRoom`, and the same line the reducer draws for `WATCH_HERE`.
   */
  const picture =
    channelId && channel && watch && party && inRoom(channel, me) && !fullScreen ? (
      <WatchDock
        place={slot ? 'docked' : 'floating'}
        slot={
          slot
            ? {
                x: slot.at.x - origin.x,
                y: slot.at.y - origin.y,
                width: slot.at.width,
                height: slot.at.height,
              }
            : null
        }
        box={box}
        onOpen={() => onOpen(channelId)}
      >
        <WatchPlayer
          watch={watch}
          channelId={channelId}
          fill
          onDuration={(durationMs) =>
            app.act(channelId, { type: 'WATCH_READY', durationMs })
          }
          onRefusal={(message) => setRefused(message !== null)}
        />
      </WatchDock>
    ) : null;

  const place = useRef<View>(null);
  const locate = () => {
    const node = place.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x, y) => {
      setOrigin((was) => (was.x === x && was.y === y ? was : { x, y }));
    });
  };

  return (
    <PictureContext.Provider value={api}>
      {children}
      {/*
        The layer, over every screen and answering no touch of its own — a
        layer that swallowed the body would make the whole application
        unpressable while a film was on. Last, so it is painted over what it
        floats above; `zIndex` as well, since a sibling that is later in the
        tree still loses to one that has claimed a stacking order.
      */}
      <View
        ref={place}
        style={styles.layer}
        pointerEvents="box-none"
        onLayout={(event) => {
          measure(event);
          locate();
        }}
      >
        {picture}
      </View>
    </PictureContext.Provider>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  /**
   * The hole, black so that the frame between the measurement and the picture
   * arriving is the colour of the film rather than a gap in the screen.
   *
   * **Its size comes from `watchShapeFor` and not from here**, which is the
   * 2026-09-20 change: a width cap and an aspect ratio cannot say anything
   * about height, and height is the axis that runs out. Centred, so what the
   * cap leaves over is a margin either side rather than a picture shoved
   * against the left edge of an iPad.
   */
  slot: { alignSelf: 'center', backgroundColor: '#000' },
  /** Under the tabs and over the card, with the hairline that separates them. */
  slotAbove: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  /**
   * Beside the card, where the separator would be a vertical hairline and is
   * not drawn at all: two columns of a body are not two surfaces, and the film
   * is already a black rectangle against the page.
   *
   * `COLUMN_GAP` is spent here because the arithmetic that chose the widths
   * subtracted it here; the scroll beside this takes the slack and knows
   * nothing about it.
   */
  slotBeside: { marginRight: COLUMN_GAP, alignSelf: 'flex-start' },
});
