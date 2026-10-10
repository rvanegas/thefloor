import React from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  canPauseLiveTranscription,
  canPauseRecording,
  canResumeLiveTranscription,
  canSetLiveTranscription,
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  recordingRefusal,
} from '../../../core/channel';
import type {
  LiveLine,
  RecordingView,
  RoomView,
  SegmentView,
} from '../../../core/protocol';
import { intoBlocks } from '../../../core/transcript';
import type { ChannelState } from '../../../core/types';
import { shareRecording } from '../api/download';
import { api } from '../api/http';
import { subscribeLiveLines } from '../live/lines';
import { useApp } from '../state/AppProvider';
import { shareText } from '../share';
import { useText, type Strings } from '../i18n';
import { Button, Empty, useScrollPosition } from './components';
import { RecordingsIcon, ShareIcon } from './icons';
import { colors, formatDuration, measure, radius, spacing, type } from './theme';

/**
 * What a segment's line says and carries, for a recording drawn as one: its
 * hours and what it kept, and its share.
 */
export interface SegmentHead {
  label: string;
  trailing: React.ReactNode;
}

/**
 * The Record tab: what was kept of a channel, as a log of segments, in rooms.
 *
 * **A log, not cards, since 2026-10-09.** Lines run oldest at the top and
 * newest at the foot, each speaker's run of them under their name and the time
 * it began, in plain text the way a chat reads — consecutive lines from one
 * speaker are one entry, by `intoBlocks`.
 *
 * **The record is a sequence of segments, since 2026-10-10**: a stretch kept
 * one way throughout — as audio, as text, or as both — and a new one at every
 * change of what is kept, Pause and Resume included, so that where both are
 * kept they cover exactly the same span. Each is one muted line — the record
 * dot where it has audio and a ring where it has none, its hours, and what it
 * kept — with its share at the end, and its text under it. A segment with
 * audio is its recording's line, and opens to the actions that recording's
 * card had. Its text is the live transcript written inside it, or, for one
 * kept as audio alone, that recording's batch transcript once there is one,
 * on the clock at the recording's start plus each line's offset — exact, a
 * recording being one unbroken run.
 *
 * **Laid out in rooms.** A room is a sitting — first step in to last step out,
 * written by the server as it happens (`server/src/rooms.ts`) — holding one
 * segment or more, under a rule bearing its date and its hours. A sitting that
 * kept nothing is not drawn. **A recording that fell in no sitting is its own
 * room** — the server lists it as a `standIn` — so the recordings made before
 * rooms existed open the log, each under its own rule.
 *
 * **Each room's rule is a `RoomLine`** — its date and its hours — and it
 * scrolls with the log. **It is hoisted only once it has scrolled off the
 * top**, since 2026-10-09: the room whose rule is above the viewport is
 * reported up through `onHoist`, and the screen draws the same line pinned
 * over the top of the scroll until the next room's rule arrives and pushes it
 * off — `hoistShift` is how far, set on every scroll without rendering
 * anything. Before anything is measured (and in a test renderer, where nothing
 * is) nothing is hoisted, and every rule is inline.
 *
 * **Fetched when shown, and kept current by the socket.** The transcript comes
 * a page at a time, newest first; lines written while the tab is open arrive
 * as `transcript.line` and are folded in by id. A line outside every segment
 * held means one began since they were fetched, so they are fetched again, as
 * they are whenever the recordings or what is being kept change.
 */
export function RecordTab({
  channelId,
  name,
  live,
  transcribing,
  paused = false,
  recordings,
  keptKey = '',
  renderRecording,
  onHoist,
  hoistShift,
}: {
  channelId: string;
  /** What a shared file is called after. */
  name: string;
  /** Whether this channel has a live transcript to show, now or from before. */
  live: boolean;
  /** Whether the room is being transcribed now, which is what the note says. */
  transcribing: boolean;
  /** Whether it is on and held by the Pause above. */
  paused?: boolean;
  /** This channel's recordings, in any order. */
  recordings: readonly RecordingView[];
  /**
   * What is being kept now, as any string that changes when it does — every
   * such change begins a segment, so the rooms are fetched again.
   */
  keptKey?: string;
  /** One recording as a segment's line of the log. */
  renderRecording: (recording: RecordingView, head: SegmentHead) => React.ReactNode;
  /** The room whose rule has scrolled off the top, or null; see above. */
  onHoist?: (room: RoomView | null) => void;
  /** How far the next room's rule has pushed the hoisted one up, ≤ 0. */
  hoistShift?: Animated.Value;
}) {
  const t = useText().channel;
  const app = useApp();
  const [rooms, setRooms] = React.useState<RoomView[] | null>(null);
  const [lines, setLines] = React.useState<LiveLine[] | null>(null);
  const [more, setMore] = React.useState(false);
  const [loadingEarlier, setLoadingEarlier] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** Each recording's batch transcript as lines of the log, by recording id. */
  const [batch, setBatch] = React.useState<ReadonlyMap<string, LiveLine[]>>(new Map());
  /** Bumped to fetch the rooms again; see the note on the socket above. */
  const [roomsAsked, askRooms] = React.useReducer((n: number) => n + 1, 0);
  const roomsHeld = React.useRef<RoomView[] | null>(null);
  roomsHeld.current = rooms;

  const recordingKey = recordings.map((r) => r.id).join(',');
  React.useEffect(() => {
    const token = app.token;
    if (!token) return;
    let current = true;
    api
      .rooms(token, channelId)
      .then((page) => {
        if (current) setRooms(page.rooms);
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      current = false;
    };
  }, [app.token, channelId, recordingKey, keptKey, roomsAsked]);

  React.useEffect(() => {
    if (!live) return;
    let current = true;
    const token = app.token;
    if (!token) return;
    // Subscribed before the fetch, so a line written while the first page is
    // in flight is held rather than lost; `merge` drops it if the page has it.
    const unsubscribe = subscribeLiveLines(channelId, (line) => {
      if (!current) return;
      setLines((held) => merge(held ?? [], [line]));
      const known = roomsHeld.current;
      if (
        known &&
        !known.some((room) => room.segments.some((segment) => covers(segment, line.startAt)))
      ) {
        askRooms();
      }
    });
    api
      .liveTranscript(token, channelId)
      .then((page) => {
        if (!current) return;
        setLines((held) => merge(page.lines, held ?? []));
        setMore(page.more);
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [app.token, channelId, live]);

  // A transcript is fetched once it is ready, and again only if it is made
  // anew — deleted and asked for again — which moves its state on the way.
  const ready = recordings.filter((r) => r.transcript?.state === 'ready');
  const readyKey = ready.map((r) => r.id).join(',');
  const readyHeld = React.useRef(ready);
  readyHeld.current = ready;
  React.useEffect(() => {
    const token = app.token;
    if (!token) return;
    let current = true;
    const wanted = readyHeld.current;
    setBatch((held) => new Map([...held].filter(([id]) => wanted.some((r) => r.id === id))));
    for (const recording of wanted) {
      batchLines(token, recording)
        .then((found) => {
          if (current) setBatch((held) => new Map(held).set(recording.id, found));
        })
        .catch((e: unknown) => {
          if (current) setError(e instanceof Error ? e.message : String(e));
        });
    }
    return () => {
      current = false;
    };
  }, [app.token, readyKey]);

  const earlier = async () => {
    if (!app.token || !lines?.length) return;
    setLoadingEarlier(true);
    try {
      const page = await api.liveTranscript(app.token, channelId, lines[0].startAt);
      setLines((held) => merge(page.lines, held ?? []));
      setMore(page.more);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEarlier(false);
    }
  };

  const held = live ? (lines ?? []) : [];
  // Until the oldest page is in, the log starts at the oldest line held, so a
  // segment is never drawn with a stretch of its talk not loaded yet.
  const from = live && more && held.length ? held[0].startAt : -Infinity;
  const sittings = React.useMemo(
    () => intoRooms(rooms ?? [], held, recordings, batch, from),
    [rooms, held, recordings, batch, from]
  );
  // Earlier pages are worth asking for only while they could still land in a
  // room: anything older than the first one is not drawn.
  const firstSitting = rooms?.find((room) => !room.standIn);
  const earlierMatters =
    more && held.length > 0 && !!firstSitting && held[0].startAt > firstSitting.openedAt;
  const loading = (rooms === null || (live && lines === null)) && !error;

  // --- Which room's rule is hoisted ------------------------------------------
  const position = useScrollPosition();
  const root = React.useRef<View>(null);
  const rootTop = React.useRef<number | null>(null);
  const tops = React.useRef(new Map<string, number>());
  /** A rule's height, which is the hoisted line's: they are one component. */
  const lineHeight = React.useRef(0);
  const reported = React.useRef<RoomView | null | undefined>(undefined);
  const shown = React.useRef(sittings);
  shown.current = sittings;
  const report = React.useRef(onHoist);
  report.current = onHoist;
  const shift = React.useRef(hoistShift);
  shift.current = hoistShift;

  const settle = React.useCallback(() => {
    const list = shown.current;
    let at: RoomView | null = null;
    let push = 0;
    const base = rootTop.current;
    if (position && base !== null) {
      const offset = position.offset();
      // A rule exactly at the top is still in the log; one a hair above it
      // has started to go, and the pinned copy, drawn identically in the same
      // place, takes over without a visible seam.
      for (let i = 0; i < list.length; i++) {
        const y = tops.current.get(list[i].room.id);
        if (y === undefined || base + y >= offset) break;
        at = list[i].room;
        const next = i + 1 < list.length ? tops.current.get(list[i + 1].room.id) : undefined;
        push = next === undefined ? 0 : Math.min(0, base + next - offset - lineHeight.current);
      }
    }
    shift.current?.setValue(push);
    if (reported.current !== at) {
      reported.current = at;
      report.current?.(at);
    }
  }, [position]);

  /** Where the log starts in the content, read afresh whenever it may have
   * moved: what sits above it — a note — changes height without the log's own
   * frame changing, and a stale top hoists the wrong room. */
  const measure = React.useCallback(() => {
    position?.contentTopOf(root, (top) => {
      rootTop.current = top;
      settle();
    });
  }, [position, settle]);

  React.useEffect(() => (position ? position.subscribe(settle) : undefined), [position, settle]);
  React.useEffect(settle, [sittings, settle]);
  React.useEffect(
    () => () => {
      report.current?.(null);
    },
    []
  );

  return (
    <View
      ref={root}
      collapsable={false}
      style={styles.body}
      onLayout={measure}
    >
      {live ? (
        <Text style={type.muted}>
          {paused
            ? t.liveTranscriptHeld()
            : transcribing
              ? t.liveTranscriptNote()
              : t.liveTranscriptOff()}
        </Text>
      ) : null}

      {error ? <Empty>{error}</Empty> : null}
      {loading ? <Empty>{t.liveLoading()}</Empty> : null}
      {!loading && !error && sittings.length === 0 ? (
        <Empty>{t.roomsNothingYet()}</Empty>
      ) : null}

      {earlierMatters ? (
        <Button
          label={loadingEarlier ? t.liveLoading() : t.liveEarlier()}
          disabled={loadingEarlier}
          onPress={earlier}
        />
      ) : null}

      {sittings.map(({ room, items }) => (
        <View
          key={room.id}
          style={styles.room}
          onLayout={(event) => {
            tops.current.set(room.id, event.nativeEvent.layout.y);
            measure();
          }}
        >
          {/* Where one sitting ends and the next begins — the line the
              pinned copy takes over once it has scrolled off the top. */}
          <View
            onLayout={(event) => {
              lineHeight.current = event.nativeEvent.layout.height;
            }}
          >
            <RoomLine room={room} />
          </View>
          {items.map((item) => (
            <View key={item.segment.id} style={styles.segment}>
              <SegmentLine
                channelId={channelId}
                name={name}
                item={item}
                renderRecording={renderRecording}
              />
              {intoBlocks(
                item.lines.map((line) => ({ ...line, startMs: line.startAt, endMs: line.endAt }))
              ).map((block) => (
                <View key={block.lines[0].id} style={styles.entry}>
                  <View style={styles.entryHead}>
                    <Text style={styles.speaker} numberOfLines={1}>
                      {block.displayName}
                    </Text>
                    <Text style={type.muted}>{t.liveTime(block.startMs)}</Text>
                  </View>
                  {block.lines.map((line) => (
                    <Text key={line.id} style={type.body}>
                      {line.text}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * A room's line: its date and its hours. Drawn inline at the head of each
 * room in the log, and again pinned over the top of the scroll by
 * `HoistedRoom` once that one has scrolled off — **the same component in both
 * places**, so the hand-over from one to the other has no seam to see.
 *
 * **No share since 2026-10-10.** What is shared is a segment, each from its
 * own line, a room holding as many as it changed what it kept.
 */
export function RoomLine({ room }: { room: RoomView }) {
  const t = useText().channel;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel} numberOfLines={1} accessibilityRole="header">
        {t.liveDay(room.openedAt)} · {t.roomSpan(room.openedAt, room.closedAt)}
      </Text>
    </View>
  );
}

/**
 * The hoisted copy of a `RoomLine`, for `Screen`'s `overlay`: pinned over the
 * top edge of the scroll while its room's own line is above it, and pushed up
 * by `shift` as the next room's line arrives under it — a sticky header.
 *
 * **Over the scroll rather than above it**, which is the exception to the
 * rule `Screen.header` keeps. A row that came and went above the scroll would
 * take its height out of the viewport each time, moving the log down by
 * exactly enough to bring the inline line back and dismiss itself — so it
 * covers instead, and what it covers is the line it stands for.
 */
export function HoistedRoom({
  room,
  shift,
}: {
  room: RoomView | null;
  shift: Animated.Value;
}) {
  if (!room) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.hoisted, { transform: [{ translateY: shift }] }]}
    >
      <View style={styles.hoistedInner}>
        <RoomLine room={room} />
      </View>
    </Animated.View>
  );
}

/**
 * A segment's line: the record dot where it kept audio and a ring where it
 * kept none, its hours, what it kept, and its share. A segment with a
 * recording is drawn by `renderRecording`, so its line opens to that
 * recording's actions; the rest is this.
 *
 * **The share asks which**: the segment's audio, or its text, with whichever
 * it lacks greyed — the native action sheet on iOS, which can grey an option;
 * elsewhere `Alert`, which cannot, and so offers only what there is. Its
 * title names the segment by its hours rather than by a noun, there being no
 * word for it a person needs. **It stays drawn either way**: a control that
 * comes and goes as you scroll is one that is not where the thumb went
 * (STYLE.md, rule six).
 */
export function SegmentLine({
  channelId,
  name,
  item,
  renderRecording,
}: {
  channelId: string;
  name: string;
  item: SegmentItem;
  renderRecording?: (recording: RecordingView, head: SegmentHead) => React.ReactNode;
}) {
  const t = useText().channel;
  const app = useApp();
  const [busy, setBusy] = React.useState(false);
  const { segment, recording } = item;
  const audio = !!recording && !recording.mixing;
  const text = item.lines.length > 0;
  const available = (audio || text) && !busy;
  const span = t.roomSpan(segment.startedAt, segment.endedAt);
  const kept =
    segment.recordingId !== null && (segment.text || recording?.transcript?.state === 'ready')
      ? t.keptBoth()
      : segment.recordingId !== null
        ? t.audio()
        : t.keepText();
  const label = `${span} · ${kept}`;

  const share = async (what: 'audio' | 'text') => {
    if (!app.token || busy) return;
    setBusy(true);
    try {
      if (what === 'audio' && recording) {
        await shareRecording(app.token, recording.id, name, recording.endedAt);
      } else {
        const handed = await shareText(
          await segmentText(app.token, channelId, item, t)
        );
        if (handed === 'copied') Alert.alert(t.roomTextCopied());
        if (handed === 'failed') Alert.alert(t.couldNotShareKept());
      }
    } catch (e) {
      Alert.alert(t.couldNotShareKept(), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const trailing = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? t.preparingKept() : t.shareSpan(span)}
      accessibilityState={{ disabled: !available, busy }}
      disabled={!available}
      hitSlop={spacing(1)}
      onPress={() => chooseWhatToShare(t, span, { audio, text }, (what) => void share(what))}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <ShareIcon color={available ? colors.text : colors.textFaint} />
    </Pressable>
  );

  if (recording && renderRecording) {
    return <>{renderRecording(recording, { label, trailing })}</>;
  }
  return (
    <View style={styles.segmentLine}>
      {segment.recordingId !== null ? (
        <RecordingsIcon color={colors.textMuted} size={14} />
      ) : (
        <View style={styles.ring} />
      )}
      <Text style={[type.muted, styles.segmentLabel]} numberOfLines={1}>
        {label}
      </Text>
      {trailing}
    </View>
  );
}

/**
 * Which of a segment's two to share, with what it lacks shown and refused,
 * under its hours. Exported for the test, which drives both paths.
 */
export function chooseWhatToShare(
  t: Strings['channel'],
  span: string,
  has: { audio: boolean; text: boolean },
  then: (what: 'audio' | 'text') => void
): void {
  if (Platform.OS === 'ios') {
    const disabledButtonIndices: number[] = [];
    if (!has.audio) disabledButtonIndices.push(0);
    if (!has.text) disabledButtonIndices.push(1);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t.shareSpan(span),
        options: [t.audio(), t.keepText(), t.cancel()],
        cancelButtonIndex: 2,
        disabledButtonIndices,
      },
      (index) => {
        if (index === 0 && has.audio) then('audio');
        if (index === 1 && has.text) then('text');
      }
    );
    return;
  }
  Alert.alert(t.shareSpan(span), undefined, [
    { text: t.cancel(), style: 'cancel' },
    ...(has.audio ? [{ text: t.audio(), onPress: () => then('audio') }] : []),
    ...(has.text ? [{ text: t.keepText(), onPress: () => then('text') }] : []),
  ]);
}

/**
 * A segment's text as plain text, the way the log draws it: its date and
 * hours, then each speaker's run under their name and the time it began.
 *
 * **Its batch transcript as held, or its live lines read afresh**, walking
 * back from the segment's end until a page reaches before its start, rather
 * than from a route of its own — so sharing text needs nothing the server
 * does not already serve, and is whole even where the log has not paged that
 * far back yet.
 */
export async function segmentText(
  token: string,
  channelId: string,
  item: SegmentItem,
  t: Strings['channel']
): Promise<string> {
  const { segment } = item;
  if (!segment.text) return formatSegmentText(segment, item.lines, t);
  let lines: LiveLine[] = [];
  let before = segment.endedAt === null ? undefined : segment.endedAt + 1;
  for (;;) {
    const page = await api.liveTranscript(token, channelId, before);
    lines = merge(page.lines.filter((line) => covers(segment, line.startAt)), lines);
    if (!page.more || page.lines.length === 0 || page.lines[0].startAt < segment.startedAt) break;
    before = page.lines[0].startAt;
  }
  return formatSegmentText(segment, lines, t);
}

/** The text `segmentText` shares, from lines already in hand. */
export function formatSegmentText(
  segment: SegmentView,
  lines: readonly LiveLine[],
  t: Strings['channel']
): string {
  const head = `${t.liveDay(segment.startedAt)} · ${t.roomSpan(segment.startedAt, segment.endedAt)}`;
  const blocks = intoBlocks(
    lines.map((line) => ({ ...line, startMs: line.startAt, endMs: line.endAt }))
  ).map(
    (block) =>
      `${block.displayName} · ${t.liveTime(block.startMs)}\n` +
      block.lines.map((line) => line.text).join('\n')
  );
  return [head, ...blocks].join('\n\n');
}

/**
 * What this channel keeps of what is said — its audio, its text, both or
 * neither — and a Pause that holds whatever is running. Pinned under the
 * channel's header on the *Record* tab, since 2026-10-09, where the Record and
 * Pause buttons were and in place of the *Live transcript* setting on *Channel
 * Settings*.
 *
 * **Two independent switches, since 2026-10-10.** Each moves only its own
 * form, so either, both or neither may be on. They were radio style for a
 * day, on a reading of `keep-the-transcript-and-let-the-audio-go` that the
 * task does not make: it asks that text be enough, and that keeping the audio
 * be something somebody chooses — which is adding it, not swapping to it.
 *
 * **Audio is the recording's own rules**: on is `START_RECORDING`, off is
 * `STOP_RECORDING`, and the switch is refused exactly where the button it
 * replaces was. **Text is the account's and the room's**: `mayTranscribeLive`,
 * since the house pays for it, and `canSetLiveTranscription`, since what is
 * kept is decided by somebody present who holds the controls — in a
 * community, its owner. Everybody else sees its state and cannot move it. A
 * switch says what is *chosen*, so a held run leaves it on.
 *
 * **Start turns on both in one press, since 2026-10-10.** While nothing is
 * chosen, Pause's button reads Start and switches on as much of the pair as
 * this person may — Audio on the recording's rules, Text if the account pays
 * for it. The button is the transport and stands first, left of the
 * switches, so they read as modifiers on it; they are for choosing one form
 * alone, and the ordinary day is Start, Pause, Resume, and both off.
 *
 * **Pause is one hold over the pair.** Pause holds everything running; while
 * anything chosen is held it reads Resume, and Resume restarts everything
 * held — so a form switched on during a hold runs, the button still offers
 * Resume, and one press brings the pair back level. **A pause is a clean
 * break, since 2026-10-10**: it ends the recording and the stretch of text,
 * and Resume begins a new segment of each — one action either way, which core
 * applies to both, so they end and begin together. Both on the recording's
 * Pause rules. **The button is always drawn**, refused while there is nothing
 * it may start or hold, so it never moves under the thumb.
 *
 * **So is every switch.** Text switched while the audio records ends that
 * recording and begins another, so a segment is kept one way throughout; and
 * Start, where it includes the text, is one request that begins both.
 *
 * Under the row, as under the buttons it replaces: why Audio is refused when
 * nothing else on the screen says, and a capture that stopped for a reason
 * nobody asked for.
 */
export function KeepSwitches({
  channelId,
  channel,
  me,
  mayTranscribeLive,
}: {
  channelId: string;
  channel: ChannelState;
  me: string;
  mayTranscribeLive: boolean;
}) {
  const t = useText().channel;
  const app = useApp();
  const audioOn = channel.recording.status !== 'idle';
  const audioHeld = channel.recording.status === 'paused';
  const textOn = !!channel.liveTranscription;
  const textHeld = textOn && !!channel.liveTranscriptionPaused;
  const mayStop = canStopRecording(channel, me);

  const setText = (on: boolean, withAudio = false) => {
    if (!app.token) return;
    api
      .setLiveTranscription(app.token, channelId, on, withAudio)
      .catch((e: unknown) =>
        Alert.alert(t.keepText(), e instanceof Error ? e.message : String(e))
      );
  };
  const switchAudio = (on: boolean) =>
    app.act(channelId, { type: on ? 'START_RECORDING' : 'STOP_RECORDING' });

  // Resume while anything chosen is held, Pause otherwise. **One action
  // either way, since 2026-10-10**: core holds or restarts everything this
  // person may with whichever of the pair is sent, so that both end, and
  // begin again, at one instant — each a clean break, a new segment. The one
  // sent is whichever this person may move, so the guard is the one asked.
  const resuming = audioHeld || textHeld;
  const starting = !audioOn && !textOn;
  const mayStartAudio = canStartRecording(channel, me);
  // The account pays for it and the room decides it, as Audio is decided.
  const mayStartText = mayTranscribeLive && canSetLiveTranscription(channel, me, true);
  const hold:
    | { type: 'PAUSE_RECORDING' }
    | { type: 'RESUME_RECORDING' }
    | { type: 'PAUSE_LIVE_TRANSCRIPTION' }
    | { type: 'RESUME_LIVE_TRANSCRIPTION' }
    | null = resuming
    ? audioHeld && canResumeRecording(channel, me)
      ? { type: 'RESUME_RECORDING' }
      : textHeld && canResumeLiveTranscription(channel, me)
        ? { type: 'RESUME_LIVE_TRANSCRIPTION' }
        : null
    : canPauseRecording(channel, me)
      ? { type: 'PAUSE_RECORDING' }
      : canPauseLiveTranscription(channel, me)
        ? { type: 'PAUSE_LIVE_TRANSCRIPTION' }
        : null;

  // Start in one request where it includes the text — the route begins the
  // audio in the same step — so the segment kept both ways begins at once.
  const start = !starting
    ? null
    : mayStartText
      ? () => setText(true, mayStartAudio)
      : mayStartAudio
        ? () => switchAudio(true)
        : null;
  const press = starting
    ? () => start?.()
    : () => {
        if (hold) app.act(channelId, hold);
      };
  const refusedPress = starting ? start === null : hold === null;
  const word = starting ? t.start() : resuming ? t.resume() : t.pause();

  const audioRefused = audioOn ? !mayStop : !mayStartAudio;
  const textRefused = !mayTranscribeLive || !canSetLiveTranscription(channel, me, !textOn);
  const refusal = recordingRefusal(channel, me);

  return (
    <View style={styles.bar}>
      <View style={[styles.barInner, styles.keep]}>
        <View style={styles.switches}>
          {/* First, so the switches read as what it keeps rather than as
              controls of their own: Start, then what. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={word}
            accessibilityState={{ disabled: refusedPress }}
            disabled={refusedPress}
            onPress={press}
            style={({ pressed }) => [styles.hold, pressed && styles.pressed]}
          >
            <Text style={[styles.holdLabel, refusedPress && styles.switchLabelRefused]}>
              {word}
            </Text>
          </Pressable>
          <KeepSwitch
            label={t.audio()}
            on={audioOn}
            refused={audioRefused}
            onChange={switchAudio}
          />
          <KeepSwitch
            label={t.keepText()}
            on={textOn}
            refused={textRefused}
            onChange={setText}
          />
        </View>
        {refusal !== null && !audioOn ? (
          <Text style={type.muted}>
            {refusal === 'owner'
              ? t.recordRefusedOwner()
              : refusal === 'film'
                ? t.recordRefusedFilm()
                : t.recordRefusedSilent()}
          </Text>
        ) : null}
        {channel.recording.failure ? (
          // Capture stopping for a reason nobody asked for must not read like
          // a recording somebody chose to end. Whoever was speaking on the
          // strength of the indicator needs to know it was not kept.
          <Text style={styles.warning}>Recording failed — {channel.recording.failure}</Text>
        ) : null}
        {/* The same about the run before this one, which the log can only
            show as a short recording. */}
        {channel.recording.status === 'idle' && channel.lastRecording?.failure ? (
          <Text style={styles.warning}>
            Ended early — {formatDuration(channel.lastRecording.durationMs)} captured.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One of the pair: its word, and the switch beside it. Exported for *Channel
 * Settings*' *Record automatically*, whose Audio and Text are the same pair
 * one step removed — what every sitting starts with — and are drawn alike.
 */
export function KeepSwitch({
  label,
  on,
  refused,
  onChange,
}: {
  label: string;
  on: boolean;
  refused: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.switchLabel, refused && styles.switchLabelRefused]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={on}
        disabled={refused}
        onValueChange={onChange}
        // Grey either way: the header's pill is what says, in the recording's
        // red, that what is said is being kept. The switch says only what was
        // chosen, and colour on it repeated the pill.
        trackColor={{ false: colors.disabled, true: colors.textMuted }}
        ios_backgroundColor={colors.disabled}
        style={styles.switch}
      />
    </View>
  );
}

/**
 * A recording's batch transcript as lines of the log: on the clock at the
 * recording's start plus each line's offset, which is exact, a recording
 * being one unbroken run since 2026-10-10. Ids are the recording's, so they
 * cannot meet a live line's.
 */
export async function batchLines(token: string, recording: RecordingView): Promise<LiveLine[]> {
  const body = await api.transcript(token, recording.id);
  return body.lines.map((line, i) => ({
    id: `${recording.id}:${i}`,
    identity: line.identity,
    displayName: line.displayName ?? '',
    startAt: recording.startedAt + line.startMs,
    endAt: recording.startedAt + line.endMs,
    text: line.text,
    confidence: line.confidence,
  }));
}

/** Two sets of lines as one, by id, in the order they were said. */
export function merge(a: readonly LiveLine[], b: readonly LiveLine[]): LiveLine[] {
  const byId = new Map<string, LiveLine>();
  for (const line of [...a, ...b]) byId.set(line.id, line);
  return [...byId.values()].sort((x, y) => x.startAt - y.startAt || x.id.localeCompare(y.id));
}

/** Whether a moment falls inside a segment, which may still be running. */
function covers(segment: SegmentView, at: number): boolean {
  return at >= segment.startedAt && (segment.endedAt === null || at <= segment.endedAt);
}

/** One segment as the log draws it: its recording, if any, and its text. */
export interface SegmentItem {
  segment: SegmentView;
  /** Its audio, once the recording is filed and while it is not deleted. */
  recording: RecordingView | null;
  lines: LiveLine[];
}

/**
 * Each room's segments as the log draws them, oldest first; a room with none
 * left to draw is left out. A segment's text is the live lines inside it when
 * it was kept as text live, and otherwise its recording's batch transcript.
 * One whose recording is gone — deleted, or never filed because it captured
 * nothing — and that kept no text is left out; one still running whose
 * recording is not filed yet is drawn without it. A segment that ended before
 * `from`, the oldest live line loaded, waits for the earlier pages, so that
 * nothing is drawn above talk not loaded yet.
 */
export function intoRooms(
  rooms: readonly RoomView[],
  lines: readonly LiveLine[],
  recordings: readonly RecordingView[],
  batch: ReadonlyMap<string, readonly LiveLine[]> = new Map(),
  from = -Infinity
): Array<{ room: RoomView; items: SegmentItem[] }> {
  const byId = new Map(recordings.map((r) => [r.id, r]));
  return rooms
    .map((room) => {
      const items: SegmentItem[] = [];
      for (const segment of room.segments ?? []) {
        if (segment.endedAt !== null && segment.endedAt < from) continue;
        const recording = segment.recordingId ? (byId.get(segment.recordingId) ?? null) : null;
        if (!recording && !segment.text && segment.endedAt !== null) continue;
        const said = segment.text
          ? lines.filter((line) => covers(segment, line.startAt))
          : recording
            ? [...(batch.get(recording.id) ?? [])]
            : [];
        items.push({ segment, recording, lines: said });
      }
      return { room, items };
    })
    .filter(({ items }) => items.length > 0);
}

/** How much of the platform's switch the *Record* tab draws, Pause included. */
const SWITCH_SCALE = 0.8;

const styles = StyleSheet.create({
  body: { gap: spacing(1) },
  room: { gap: spacing(1.5) },
  segment: { gap: spacing(1) },
  // A segment's line where no recording draws it: the marker, the label, the
  // share at the end — the same row `RecordingRow`'s inline line is.
  segmentLine: { flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) },
  segmentLabel: { flex: 1 },
  // A ring the record dot's size: kept, and not as audio.
  ring: {
    width: 10,
    height: 10,
    marginHorizontal: 2,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
  },
  entry: { gap: spacing(0.25) },
  entryHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing(1) },
  speaker: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  // A room's line, inline and hoisted alike: the date and hours. The
  // hairline under it is what made it a rule.
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineLabel: { ...type.muted, flex: 1 },
  // Over the top of the scroll, on the page's own colour so the log passes
  // under it, and on the measure with the padding the log has — so it lands
  // exactly on the line it stands for.
  hoisted: { position: 'absolute', top: 0, left: 0, right: 0 },
  hoistedInner: {
    ...measure,
    paddingHorizontal: spacing(2),
    backgroundColor: colors.bg,
  },
  // A pinned bar, built as STYLE.md § *The pinned header* says: the edge full
  // bleed, the contents on the measure and lined up with the log below.
  bar: {
    paddingVertical: spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  barInner: {
    ...measure,
    paddingHorizontal: spacing(2),
  },
  keep: { gap: spacing(0.5) },
  switches: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  switchLabel: { color: colors.text, fontSize: 15 },
  // The platform's switch has one size, 51 by 31 on iOS, so it is drawn
  // smaller by scaling, and the margins take back the room the scale leaves,
  // since a transform does not shrink the box it is laid out in.
  switch: {
    transform: [{ scale: SWITCH_SCALE }],
    marginHorizontal: (-51 * (1 - SWITCH_SCALE)) / 2,
    marginVertical: (-31 * (1 - SWITCH_SCALE)) / 2,
  },
  switchLabelRefused: { color: colors.textFaint },
  // Pause, as thin as the switches beside it and on no card: a hairline
  // pill the height of a switch, its word at the switches' size.
  // Wide enough for its longest word, Spanish *Reanudar*: it stands first,
  // so a pill that grew from Start to Resume would push both switches along.
  hold: {
    height: Math.round(31 * SWITCH_SCALE),
    minWidth: 92,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing(1.5),
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  holdLabel: { color: colors.text, fontSize: 15 },
  warning: { color: colors.silenced, fontSize: 13 },
  pressed: { opacity: 0.6 },
});
