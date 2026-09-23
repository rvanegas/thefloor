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
import { watchPositionMs } from '../../../core/watch';
import { WatchDock, type Rect } from './Dock';
import { FullScreen } from './FullScreen';
import { usePortraitUnlessAtTheFilm } from './orientation';
import { WatchTransport } from './Transport';
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
 * **Full screen used to be the one thing it stood down for, and is not any
 * more.** `FullScreen` mounted a player of its own until 2026-09-23, so
 * expanding cost a reload: a black rectangle, a refetch of the IFrame API and
 * a second of buffering, measured at 1.0 to 1.5 seconds on build 276 — paid on
 * a turn of the wrist, which is the most ordinary thing anybody does at a
 * film. It is a third *place* now, the same as the other two: the box changes
 * and the player does not move. `FullScreen` is the scrim alone, and this
 * component draws it, because a scrim over the picture cannot be drawn by
 * anything the picture outranks. See planning/WATCH-RESPONSIVENESS.md.
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
  /**
   * Whether somebody is at the film, which is what decides the portrait lock.
   *
   * **It is not `fullScreen` and it is not the dock.** It is the watch card
   * with a film on it that this device can expand — the same set of terms
   * `ChannelView` guards full screen with, reported from there because this
   * component knows nothing about tabs, settings screens or transcripts. The
   * lock is the whole application's, and so has to be decided somewhere that
   * outlives the channel screen; that is here.
   *
   * Reading `slot !== null` instead was the near miss. A hole is left by the
   * *Watch* tab and by nothing else, which is the right condition, but it is
   * a layout measurement — it is null for a frame before `onLayout` lands and
   * it went null once for a bug — and a lock that flickers rotates a phone.
   */
  atTheFilm: boolean;
  setAtTheFilm: (there: boolean) => void;
  /** What the player last said about being refused, for whoever must react. */
  refused: boolean;
  /**
   * What the expanded picture's scrim may offer, published by the screen.
   *
   * **Three booleans rather than the row itself**, and the shape is forced.
   * The scrim is drawn here, above the player; the answers are `ChannelView`'s,
   * which is below. A React element cannot be handed upwards — and an element
   * is a new object every render, so anything that stored one would re-render
   * this component on every render of that one, for ever. Plain values compare
   * equal and stop.
   *
   * Null while nothing is saying, which is every screen that is not a channel.
   */
  setControls: (controls: Controls | null) => void;
  /**
   * The way out of full screen, registered once by the screen that owns it.
   *
   * A callback rather than a flag because the flag it clears is
   * `ChannelView`'s: what put the picture up was a press held there, and
   * lowering this component's own `fullScreen` would be undone by that
   * screen's next reconciliation. Kept in a ref, so registering it does not
   * re-render anything.
   */
  setExit: (exit: () => void) => void;
};

/** What the scrim is allowed to offer, which only the channel screen knows. */
export type Controls = {
  mayControl: boolean;
  mayPlay: boolean;
  /**
   * Whether a way out is drawn at all.
   *
   * False on a handheld that has been turned, where the state *is* the window
   * and a press could not move it — a button that visibly does nothing is
   * worse than no button. See `ChannelView`'s derivation.
   */
  mayExit: boolean;
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
  const [atTheFilm, setAtTheFilm] = useState(false);
  const [refused, setRefused] = useState(false);
  const [controls, setControlsState] = useState<Controls | null>(null);
  /** The screen's own way out, which does not belong in state. See `setExit`. */
  const exit = useRef<(() => void) | null>(null);
  /*
    Which way up the phone may be, which is decided here because this is the
    only place that knows the answer for the whole application. The rule is
    about *every* screen — a phone is upright on Home and on a transcript as
    much as on the roster — and the exception is the film, whose two flags
    this component holds precisely because the picture outlives the screen
    that asked for it. See orientation.ts; on a tablet and in a browser it
    does nothing.

    Both flags rather than `atTheFilm` alone, though the terms make the second
    imply the first: the expanded picture is this component's own state and
    the other is a report from a screen, so a phone with the film on the glass
    is never left locked by a report that has not arrived yet.
  */
  usePortraitUnlessAtTheFilm(atTheFilm || fullScreen);
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
  /*
    Field by field, the same comparison `dock` makes and for the same reason:
    the caller publishes on every change of any of them, and an object that
    is equal in every field must not count as a change or this component
    re-renders the whole application underneath it once a tick.
  */
  const setControls = useCallback((next: Controls | null) => {
    setControlsState((was) => {
      if (!next) return was === null ? was : null;
      return was &&
        was.mayControl === next.mayControl &&
        was.mayPlay === next.mayPlay &&
        was.mayExit === next.mayExit
        ? was
        : next;
    });
  }, []);
  const setExit = useCallback((fn: () => void) => {
    exit.current = fn;
  }, []);

  const api = useMemo<PictureApi>(
    () => ({
      dock,
      undock,
      fullScreen,
      setFullScreen,
      atTheFilm,
      setAtTheFilm,
      refused,
      setControls,
      setExit,
    }),
    [dock, undock, fullScreen, atTheFilm, refused, setControls, setExit]
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
   * The layer's own size, which is what a corner is measured against.
   *
   * The floating picture rests against one of four corners of the application
   * rather than of a body, so the box it is clamped inside is this layer —
   * the whole window less the safe areas — and nothing else on screen.
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
    channelId && channel && watch && party && inRoom(channel, me) ? (
      <WatchDock
        /*
          **No second device ever reaches `floating`**, and the rule is kept
          where the role is rather than here. A television is a screen showing
          one film; shrunk into a corner with the channel list back beside it,
          it is the thing that screen was cleaned up to stop being. So leaving
          it gives the screen role up — `ChannelView`, the layout effect beside
          the two that clear it for a party ending and for leaving the room —
          and `channelId` is null here a moment later. Kept there because this
          component cannot tell the two meanings of a null `slot` apart: a
          screen that has gone away, and one whose `onLayout` has not landed
          yet. The second is every arrival, and a rule written here would stop
          the film on the frame it started.
        */
        /*
          **Full screen is a place now, which is the 2026-09-23 change.** It
          used to be the one state this component stood down for, `FullScreen`
          mounting a player of its own — so expanding cost a reload, measured
          at 1.0 to 1.5 seconds of black on build 276, on the most ordinary
          gesture anybody makes at a film. The player stays where it is and
          the box changes; see `Dock.Place`.
        */
        place={fullScreen ? 'full' : slot ? 'docked' : 'floating'}
        /*
          **A paused film has no corner.** The floating rectangle is for a film
          that is still running while somebody is somewhere else in the
          application — that is the whole of what it is for, and it is why it
          followed them off the *Watch* tab in the first place. Paused, it is a
          still frame parked over the notepad, and there is nothing in it to
          miss: the transport is on the tab it came from, and the tap that goes
          back there is the tab bar.

          Only the floating half. Docked, a paused film is the card with the
          transport under it, which is where somebody goes to press play; a
          hole left for a picture that then refused to appear would be a black
          gap in the screen.

          **Not unmounted**, which is `Dock`'s standing rule — a `WebView` that
          goes away reloads, and pausing is the most ordinary thing anybody
          does to a film. It keeps its page and stops being painted, and comes
          straight back if somebody else presses play while this device is on
          another tab, this being a reading of the channel rather than of what
          was pressed here.
        */
        hidden={watch.status !== 'playing'}
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
          onFilm={(durationMs, title) =>
            app.act(channelId, { type: 'WATCH_READY', durationMs, title })
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
        {/*
          **The scrim, over the picture and drawn here for that reason.**

          Everything on it belongs to the channel screen — what may be pressed,
          and what leaving means — but it has to be painted above a player that
          is this component's child, and nothing below this point in the tree
          can be. So the screen publishes the three answers and registers its
          way out, and the row itself is the same component the card draws.

          `watchAt` is computed here rather than published, being a number that
          changes twice a second: the application already re-renders on that
          tick, and a value that arrived through state would be a render of
          everything underneath this for every one of them.
        */}
        {fullScreen && channelId && watch && party ? (
          <FullScreen
            chrome={
              <WatchTransport
                watch={watch}
                party={party}
                watchAt={watchPositionMs(watch, app.serverNow())}
                mayControl={controls?.mayControl ?? false}
                mayPlay={controls?.mayPlay ?? false}
                // The scrim carries the transport and the way out and nothing
                // else; the name is for a page somebody is reading.
                withTitle={false}
                act={(action) => app.act(channelId, action)}
              />
            }
            onExit={
              controls?.mayExit ? () => exit.current?.() : null
            }
          />
        ) : null}
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
