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
  canAskClaude,
  canPauseKeeping,
  canPlay,
  canSetDiarize,
  canSetKeep,
  canStopKeeping,
  isDiarized,
  isPresent,
  keepForPlay,
  keepOf,
  keepingOf,
  recordingRefusal,
} from '../../../core/channel';
import type {
  LiveLine,
  RecordingView,
  RoomView,
  SegmentView,
} from '../../../core/protocol';
import { intoBlocks, lettered, type TranscriptBlock } from '../../../core/transcript';
import type { ChannelState, Keep, ReplyLength } from '../../../core/types';
import { shareRecording, shareTextFile } from '../api/download';
import { api } from '../api/http';
import { copyText } from '../clipboard';
import { subscribeLiveLines } from '../live/lines';
import { useApp } from '../state/AppProvider';
import { useText, type Strings } from '../i18n';
import { Button, Empty, IconButton, useScrollPosition } from './components';
import { ClipboardIcon, PauseIcon, RecordingsIcon, ShareIcon, StopIcon } from './icons';
import { isSafeUrl, openUrl } from './links';
import { colors, formatDuration, measure, spacing, type } from './theme';

/**
 * What a segment's line says and carries, for a recording drawn as one: its
 * hours and what it kept, and its share — and whether the segment is open,
 * which pressing the line changes.
 */
export interface SegmentHead {
  label: string;
  trailing: React.ReactNode;
  open: boolean;
  onToggle: () => void;
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
 * **Each segment's line is its header, and opens and closes it**, since
 * 2026-10-18: closed, a segment is its line alone, so a log of closed ones is
 * a list of headers. Open, it is its lines and — for one with audio — first
 * the actions its recording's card had, so opening one is the single press it
 * always was. **Closed until asked, except the one still being kept**, which
 * starts open so that talk arriving is seen arriving.
 *
 * **A paste is a segment of its own, since 2026-10-15** — an instant, which
 * breaks nothing. One made while a segment was being kept is drawn inside it,
 * among its lines at the moment it was made, the segment carrying on around
 * it; one made while nothing was is its own item in the room. Either way it is
 * an entry like a speaker's, under its author's name and time, marked by the
 * clipboard, with a *Copy* of the whole of it. It cannot be deleted.
 *
 * **Laid out in rooms.** A room is a sitting — first step in to last step out,
 * written by the server as it happens (`server/src/rooms.ts`) — holding one
 * segment or more, under a rule bearing its date and its hours. A sitting that
 * kept nothing is not drawn. **A recording that fell in no sitting is its own
 * room** — the server lists it as a `standIn` — so the recordings made before
 * rooms existed open the log, each under its own rule.
 *
 * **Each room's rule is a `RoomLine`** — its date and its hours — and it
 * scrolls with the log. **It is held at the top once it would scroll off
 * it**, since 2026-10-09, until the next room's rule arrives and pushes it
 * off: a sticky header. **Held, not handed over**, since 2026-10-17 — the
 * line is translated down by however far the scroll has passed it, on the
 * native driver, so it never leaves the screen. Until then a pinned copy was
 * drawn over the scroll from JS once the inline one had gone, a frame or more
 * after it had, and the line blinked out and back. Before anything is
 * measured (and in a test renderer, where nothing is) nothing is held, and
 * every rule scrolls.
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

  // --- Where each room's rule is held ----------------------------------------
  const position = useScrollPosition();
  const root = React.useRef<View>(null);
  /** Where the log starts in the content; null until measured. */
  const [rootTop, setRootTop] = React.useState<number | null>(null);
  /** Each room's top within the log, and its height. */
  const [frames, setFrames] = React.useState<
    ReadonlyMap<string, { y: number; height: number }>
  >(new Map());
  /** A rule's height, the same for every room. */
  const [lineHeight, setLineHeight] = React.useState(0);

  /** Where the log starts in the content, read afresh whenever it may have
   * moved: what sits above it — a note — changes height without the log's own
   * frame changing, and a stale top holds the wrong room. */
  const measure = React.useCallback(() => {
    position?.contentTopOf(root, (top) => setRootTop((was) => (was === top ? was : top)));
  }, [position]);

  const frameOf = (id: string, y: number, height: number) =>
    setFrames((held) => {
      const was = held.get(id);
      if (was && was.y === y && was.height === height) return held;
      return new Map(held).set(id, { y, height });
    });

  /**
   * How far down a room's rule is moved to stay at the top: none until the
   * scroll reaches it, then as far as the scroll has gone past it, up to where
   * its bottom meets the next room's rule — which then pushes it up and off
   * with the scroll, being no longer moved any further. An interpolation of
   * the native offset, so it moves in the same frame as the content.
   */
  const holdOf = (index: number): Animated.AnimatedInterpolation<number> | 0 => {
    const frame = frames.get(sittings[index].room.id);
    if (!position || rootTop === null || !frame || lineHeight === 0) return 0;
    const next = index + 1 < sittings.length ? frames.get(sittings[index + 1].room.id) : undefined;
    const start = rootTop + frame.y;
    const travel = (next ? next.y - frame.y : frame.height) - lineHeight;
    if (travel <= 0) return 0;
    return position.y.interpolate({
      inputRange: [start, start + travel],
      outputRange: [0, travel],
      extrapolate: 'clamp',
    });
  };

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

      {sittings.map(({ room, items }, index) => (
        <View
          key={room.id}
          style={styles.room}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            frameOf(room.id, y, height);
            measure();
          }}
        >
          {/* Where one sitting ends and the next begins — held at the top
              while its room passes under it. Over the room's own lines, so
              they pass beneath it rather than through it. */}
          <Animated.View
            style={[styles.held, { transform: [{ translateY: holdOf(index) }] }]}
            onLayout={(event) => {
              const next = event.nativeEvent.layout.height;
              setLineHeight((was) => (was === next ? was : next));
            }}
          >
            <RoomLine room={room} />
          </Animated.View>
          {items.map((item) => (
            <Segment
              key={item.segment.id}
              channelId={channelId}
              name={name}
              item={item}
              renderRecording={renderRecording}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * One segment: its line, and under it, while open, what it kept. See the note
 * on `RecordTab` for which are open.
 */
function Segment({
  channelId,
  name,
  item,
  renderRecording,
}: {
  channelId: string;
  name: string;
  item: SegmentItem;
  renderRecording: (recording: RecordingView, head: SegmentHead) => React.ReactNode;
}) {
  const t = useText().channel;
  const [open, setOpen] = React.useState(item.segment.endedAt === null);
  // A paste standing alone has no line to press, and is all it has to show.
  const shown = open || !!item.segment.paste;
  return (
    <View style={styles.segment}>
      <SegmentLine
        channelId={channelId}
        name={name}
        item={item}
        renderRecording={renderRecording}
        open={open}
        onToggle={() => setOpen((was) => !was)}
      />
      {shown
        ? entriesOf(item).map((entry) =>
            entry.kind === 'paste' ? (
              <PasteEntry key={entry.segment.id} segment={entry.segment} />
            ) : (
              <View key={entry.block.lines[0].id} style={styles.entry}>
                <View style={styles.entryHead}>
                  <Text style={styles.speaker} numberOfLines={1}>
                    {entry.block.displayName}
                  </Text>
                  <Text style={type.muted}>{t.liveTime(entry.block.startMs)}</Text>
                </View>
                {entry.block.lines.map((line) => (
                  <Text key={line.id} style={type.body}>
                    {line.text}
                  </Text>
                ))}
              </View>
            )
          )
        : null}
    </View>
  );
}

/**
 * A room's line: its date and its hours, at the head of each room in the log
 * and held at the top while the room passes under it.
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
 * A segment's line: the record dot where it kept audio and a ring where it
 * kept none, its hours, what it kept, and its share, in `type.heading`: the
 * segment's header, which opens and closes it. A segment with a recording is
 * drawn by `renderRecording`, so opening it opens that recording's actions
 * too; the rest is this.
 *
 * **The share asks which**: the segment's audio, or its text, with whichever
 * it lacks greyed — the native action sheet on iOS, which can grey an option;
 * in a browser two buttons opened under the line by the glyph and closed by
 * it again, since the web's `Alert` is a chain of `confirm`s asking *Audio?*
 * and then *Text?*; on Android `Alert`, which offers only what there is. Its
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
  open = false,
  onToggle = () => {},
}: {
  channelId: string;
  name: string;
  item: SegmentItem;
  renderRecording?: (recording: RecordingView, head: SegmentHead) => React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const t = useText().channel;
  const app = useApp();
  const [busy, setBusy] = React.useState(false);
  const [choosing, setChoosing] = React.useState(false);
  const { segment, recording } = item;
  // A paste is an instant, said by its own entry's name and time; there are
  // no hours to give it and nothing to share but what Copy already takes.
  if (segment.paste) return null;
  const audio = !!recording && !recording.mixing;
  // Pastes count: they are text, and are shared with the lines around them.
  const text = item.lines.length > 0 || item.pastes.length > 0;
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
        // Stamped as its audio is, so the two files sort and pair together;
        // a text kept alone has only the segment's own end to go by.
        const handed = await shareTextFile(
          await segmentText(app.token, channelId, item, t),
          name,
          recording?.endedAt ?? segment.endedAt ?? Date.now()
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
      onPress={() =>
        Platform.OS === 'web'
          ? setChoosing(!choosing)
          : chooseWhatToShare(t, span, { audio, text }, (what) => void share(what))
      }
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <ShareIcon color={available ? colors.text : colors.textFaint} />
    </Pressable>
  );

  const choice = choosing ? (
    <View style={styles.shareChoice}>
      {(['audio', 'text'] as const).map((what) => (
        <Button
          key={what}
          label={what === 'audio' ? t.audio() : t.keepText()}
          disabled={what === 'audio' ? !audio : !text}
          onPress={() => {
            setChoosing(false);
            void share(what);
          }}
        />
      ))}
    </View>
  ) : null;

  if (recording && renderRecording) {
    return (
      <>
        {renderRecording(recording, { label, trailing, open, onToggle })}
        {choice}
      </>
    );
  }
  return (
    <>
      <View style={styles.segmentLine}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={({ pressed }) => [styles.segmentPress, pressed ? styles.pressed : undefined]}
        >
          {segment.recordingId !== null ? (
            <RecordingsIcon color={colors.textMuted} size={SEGMENT_MARK} />
          ) : (
            <View style={styles.ring} />
          )}
          <Text style={[type.heading, styles.segmentLabel]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
        {trailing}
      </View>
      {choice}
    </>
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
  if (!segment.text) return formatSegmentText(segment, item.lines, t, item.pastes);
  let lines: LiveLine[] = [];
  let before = segment.endedAt === null ? undefined : segment.endedAt + 1;
  for (;;) {
    const page = await api.liveTranscript(token, channelId, before);
    lines = merge(page.lines.filter((line) => covers(segment, line.startAt)), lines);
    if (!page.more || page.lines.length === 0 || page.lines[0].startAt < segment.startedAt) break;
    before = page.lines[0].startAt;
  }
  return formatSegmentText(segment, lines, t, item.pastes);
}

/**
 * The text `segmentText` shares, from lines already in hand, with the pastes
 * made inside it where they were made.
 */
export function formatSegmentText(
  segment: SegmentView,
  lines: readonly LiveLine[],
  t: Strings['channel'],
  pastes: readonly SegmentView[] = []
): string {
  const head = `${t.liveDay(segment.startedAt)} · ${t.roomSpan(segment.startedAt, segment.endedAt)}`;
  const entries = entriesOf({ segment, recording: null, lines: [...lines], pastes: [...pastes] }).map(
    (entry) =>
      entry.kind === 'paste'
        ? `${t.pastedBy(entry.segment.paste?.displayName ?? '')} · ${t.liveTime(entry.segment.startedAt)}\n` +
          (entry.segment.paste?.text ?? '')
        : `${entry.block.displayName} · ${t.liveTime(entry.block.startMs)}\n` +
          entry.block.lines.map((line) => line.text).join('\n')
  );
  return [head, ...entries].join('\n\n');
}

/**
 * The *Record* tab's transport and its two switches, pinned under the
 * channel's header: Play (Resume while held), Pause and Stop as icons, then
 * *Audio* and *Text*. Since 2026-10-11, when Rodrigo restored the transport.
 *
 * **The switches select; the transport runs.** A switch says what Play keeps
 * — `ChannelState.keep`, set at each sitting's start from *Record
 * automatically* — and changes what is running only while something is: both
 * off stops, and any other change stops and restarts, a new segment. While
 * stopped or paused it changes only what Play or Resume will begin, so
 * switching one on while stopped starts nothing. Both go through
 * `PUT /channels/:id/keep`, which asks who pays for a text it begins.
 *
 * **Play begins all of what is selected or none of it** (`canPlay`), so what
 * runs is what the switches show — **with nothing selected it selects both
 * first**, since 2026-10-17 (`keepForPlay`). Refused with Audio selected, or
 * nothing, while the audio cannot begin — a film loaded, every microphone shut —
 * and with Text selected, or nothing, for somebody with no minutes left. The sentence
 * under the row says which. A text it begins is the presser's to pay for.
 *
 * **Pause holds both and Stop ends both**, on the recording's Pause rules. A
 * pause is a clean break: Resume begins a new segment. **Every button is
 * always drawn**, refused while it has nothing to do, so nothing moves under
 * the thumb — except Play and Pause, which are one place, the way every
 * transport has them.
 *
 * Under the row, while you are here: **Several voices on my microphone**,
 * since 2026-10-16 — your own track told apart into voices by the
 * transcriber, this sitting only (`ChannelState.diarize`). A third switch on
 * the row would not fit a 375-point phone, and it belongs with the two it
 * qualifies rather than with the people, being about what is kept of what
 * your microphone hears. Not drawn while you are away, when you have no
 * microphone in the room for it to be about.
 *
 * Under that: why Play is refused when nothing else on the screen says,
 * and a capture that stopped for a reason nobody asked for.
 */
export function KeepSwitches({
  channelId,
  channel,
  me,
  mayTranscribeLive,
  trailing,
  note,
  claude,
}: {
  channelId: string;
  channel: ChannelState;
  me: string;
  mayTranscribeLive: boolean;
  /**
   * At the right end of the row, after *Text*: the paste glyph since
   * 2026-10-16, which adds an entry to the log rather than changing what is
   * kept, and so stands apart from the switches rather than among them.
   */
  trailing?: React.ReactNode;
  /** A line under the row about `trailing` — why the last paste did nothing. */
  note?: React.ReactNode;
  /**
   * *Ask Claude*, on a line of its own under the row, since 2026-10-22 —
   * `AskClaude`, absent where the server cannot ask Claude.
   */
  claude?: React.ReactNode;
}) {
  const t = useText().channel;
  const app = useApp();
  const keep = keepOf(channel);
  const plays = keepForPlay(channel);
  const keeping = keepingOf(channel);

  const setKeep = (next: Keep) => {
    if (!app.token) return;
    api
      .setKeep(app.token, channelId, next)
      .catch((e: unknown) =>
        Alert.alert(t.keepText(), e instanceof Error ? e.message : String(e))
      );
  };
  const play = () => {
    if (!app.token) return;
    api
      .playKeeping(app.token, channelId)
      .catch((e: unknown) =>
        Alert.alert(t.start(), e instanceof Error ? e.message : String(e))
      );
  };

  // A text Play would begin is the presser's to pay for; one held resumes on
  // whoever was paying.
  const textWanting = plays.text && !channel.liveTranscription && !mayTranscribeLive;
  const mayPlay = keeping !== 'running' && canPlay(channel, me) && !textWanting;
  const mayPause = canPauseKeeping(channel, me);
  const mayStop = canStopKeeping(channel, me);
  const refusal = recordingRefusal(channel, me);

  // A switch the person may not move: not theirs to change, or Text turned
  // on mid-run by somebody with nothing to pay for it.
  const textBegins = keeping === 'running' && !keep.text;
  const audioRefused = !canSetKeep(channel, me, { ...keep, audio: !keep.audio });
  const textRefused =
    !canSetKeep(channel, me, { ...keep, text: !keep.text }) || (textBegins && !mayTranscribeLive);

  return (
    <View style={styles.bar}>
      <View style={[styles.barInner, styles.keep]}>
        <View style={styles.switches}>
          {/* Play and Stop as one pair, with no gap between them: a transport
              is read as one control, and the room it frees is what puts the
              paste glyph on this line on a 375-point phone. */}
          <View style={styles.transport}>
          {keeping === 'running' ? (
            <IconButton
              label={t.pause()}
              icon={(color) => <PauseIcon color={color} />}
              style={styles.rowIcon}
              disabled={!mayPause}
              onPress={() => app.act(channelId, { type: 'PAUSE_RECORDING' })}
            />
          ) : (
            <IconButton
              label={keeping === 'paused' ? t.resume() : t.start()}
              icon={(color) => <RecordingsIcon color={color} />}
              style={styles.rowIcon}
              disabled={!mayPlay}
              onPress={play}
            />
          )}
          <IconButton
            label={t.stop()}
            icon={(color) => <StopIcon color={color} />}
            style={styles.rowIcon}
            disabled={!mayStop}
            onPress={() => app.act(channelId, { type: 'STOP_KEEPING' })}
          />
          </View>
          <KeepSwitch
            label={t.audio()}
            on={keep.audio}
            refused={audioRefused}
            onChange={(audio) => setKeep({ ...keep, audio })}
          />
          <KeepSwitch
            label={t.keepText()}
            on={keep.text}
            refused={textRefused}
            onChange={(text) => setKeep({ ...keep, text })}
          />
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
        {isPresent(channel, me) ? (
          <KeepSwitch
            label={t.severalVoices()}
            on={isDiarized(channel, me)}
            refused={!canSetDiarize(channel, me)}
            onChange={(on) => app.act(channelId, { type: 'SET_DIARIZE', on })}
          />
        ) : null}
        {claude}
        {note}
        {keeping !== 'running' && plays.audio && refusal !== null ? (
          <Text style={type.muted}>
            {refusal === 'owner'
              ? t.recordRefusedOwner()
              : t.recordRefusedSilent()}
          </Text>
        ) : keeping !== 'running' && textWanting && isPresent(channel, me) ? (
          <Text style={type.muted}>{t.playRefusedText()}</Text>
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
 * **Claude's *Ask Claude*, a line under the *Record* bar**, since 2026-10-22:
 * the words *Ask Claude*, then three buttons, *Brief*, *Medium* and
 * *Extended*, as each switch is its word then its switch — and on a line of
 * its own, as *Several voices* is, because a third glyph does not fit the row
 * on a 375-point phone. For one day it was a card on *People* in a person's
 * shape, which read as a person; it is a control about the *Record*, so it is
 * with the *Record*'s controls, and the reply lands in the log under it. It
 * was one button, *Respond*, until the same day.
 *
 * Every button does the same thing, and differs only in the length asked
 * for — 50, 150 or 450 words, the server's `REPLY_WORD_LIMITS`. Pressing one
 * reads the channel's whole *Record* and posts one turn from Claude into it,
 * as a paste. **The busy state is the channel's**: while anybody's press is
 * out, `channel.claude` makes every screen's words say *Responding…*, all
 * three buttons greyed by the same `canAskClaude` that refuses a second press
 * at the server, with who asked as a muted line under it. This screen's own
 * pending state covers only the instant before the snapshot arrives.
 *
 * Grey while you are away, like the switches, with no sentence: being away is
 * said by the footer. A failure's sentence is the muted line until the next
 * press — the bar's line for its refusals, as the paste's are.
 */
export function AskClaude({
  channel,
  me,
  nameOf,
  onAsk,
}: {
  channel: ChannelState;
  me: string;
  nameOf: (id: string) => string;
  onAsk: (length: ReplyLength) => Promise<void>;
}) {
  const t = useText().channel;
  const [pressing, setPressing] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  // `?? null` for a server that predates the field.
  const asked = channel.claude ?? null;
  const busy = pressing || asked !== null;
  const refused = !canAskClaude(channel, me);

  const ask = async (length: ReplyLength) => {
    setPressing(true);
    setFailure(null);
    try {
      await onAsk(length);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setPressing(false);
    }
  };

  const line = asked
    ? asked.askedBy === me
      ? t.claudeAskedByYou()
      : t.claudeAsked(nameOf(asked.askedBy))
    : failure;

  // The grade beside the words, on *Pro* or *Max*; *Standard* says nothing.
  const grade = channel.responseModel ?? 'standard';
  const gradeSuffix =
    grade === 'pro' ? t.claudeProSuffix() : grade === 'max' ? t.claudeMaxSuffix() : '';

  const lengths: Array<[ReplyLength, string]> = [
    ['brief', t.replyBrief()],
    ['medium', t.replyMedium()],
    ['extended', t.replyExtended()],
  ];

  return (
    <>
      <View style={styles.switchRow}>
        <Text
          style={[
            styles.switchLabel,
            styles.askLabel,
            refused && !busy && styles.switchLabelRefused,
          ]}
        >
          {/* One string, so it is one run of text to a screen reader. No
              *· Pro* while busy, which would not fit beside the buttons and
              says nothing a press in flight can change. */}
          {busy ? t.responding() : `${t.askClaude()}${gradeSuffix}`}
        </Text>
        {lengths.map(([length, label]) => (
          <Button
            key={length}
            label={label}
            style={styles.length}
            disabled={busy || refused}
            onPress={() => {
              void ask(length);
            }}
          />
        ))}
      </View>
      {line ? <Text style={type.muted}>{line}</Text> : null}
    </>
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
  /**
   * The pastes made while it was being kept, oldest first, drawn among its
   * lines. Empty for a paste that is an item of its own, which is `segment`.
   */
  pastes: SegmentView[];
}

/** What is drawn under a segment's line: a speaker's run, or a paste. */
export type Entry =
  | { kind: 'said'; block: TranscriptBlock<LiveLine & { startMs: number; endMs: number }> }
  | { kind: 'paste'; segment: SegmentView };

/**
 * A segment's entries in the order they happened: its lines in speakers' runs,
 * cut wherever a paste was made, with the paste between — so that a paste in
 * the middle of somebody talking reads as made there, which it was. A paste
 * that is an item of its own is its only entry.
 *
 * **A separated voice's letter goes on its name here**, across the whole
 * segment, by `lettered`: a live line carries it beside a name the server
 * froze without it. A batch line's is in its name already.
 */
export function entriesOf(item: SegmentItem): Entry[] {
  if (item.segment.paste) return [{ kind: 'paste', segment: item.segment }];
  const lines = lettered(item.lines);
  const entries: Entry[] = [];
  const said = (lines: readonly LiveLine[]) => {
    for (const block of intoBlocks(
      lines.map((line) => ({ ...line, startMs: line.startAt, endMs: line.endAt }))
    )) {
      entries.push({ kind: 'said', block });
    }
  };
  let from = 0;
  for (const paste of item.pastes) {
    let until = from;
    while (until < lines.length && lines[until].startAt <= paste.startedAt) until++;
    said(lines.slice(from, until));
    entries.push({ kind: 'paste', segment: paste });
    from = until;
  }
  said(lines.slice(from));
  return entries;
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
 *
 * **A paste goes inside the segment it was made in**, the first drawn one
 * whose span holds it, and is otherwise an item of its own at its moment —
 * including inside a segment that is not drawn, whose paste is no less kept.
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
      const pastes: SegmentView[] = [];
      for (const segment of room.segments ?? []) {
        if (segment.endedAt !== null && segment.endedAt < from) continue;
        if (segment.paste) {
          pastes.push(segment);
          continue;
        }
        const recording = segment.recordingId ? (byId.get(segment.recordingId) ?? null) : null;
        if (!recording && !segment.text && segment.endedAt !== null) continue;
        const said = segment.text
          ? lines.filter((line) => covers(segment, line.startAt))
          : recording
            ? [...(batch.get(recording.id) ?? [])]
            : [];
        items.push({ segment, recording, lines: said, pastes: [] });
      }
      for (const paste of pastes) {
        const home = items.find((item) => covers(item.segment, paste.startedAt));
        if (home) home.pastes.push(paste);
        else items.push({ segment: paste, recording: null, lines: [], pastes: [] });
      }
      items.sort((a, b) => a.segment.startedAt - b.segment.startedAt);
      return { room, items };
    })
    .filter(({ items }) => items.length > 0);
}

/**
 * One paste in the log: the clipboard glyph, its author's name and the time,
 * then *Copy* — and *Open* when the whole of it is one link, on the allowlist
 * a description's links are held to — at the end of that line, and the text
 * under it. **Words at the end of the line rather than buttons under it**, as
 * a segment's share is a glyph at the end of its: this tab is a log with
 * nothing around its entries (STYLE.md), and a button row under every paste
 * would be the loudest thing in it. Finding a link *inside* longer text is deliberately not attempted:
 * it would mean guessing which of several somebody meant.
 *
 * **Drawn whole**, unlike the one line the *Clipboard* tab gave the newest
 * paste: in a log it is an entry like any other, and a transcript does not
 * truncate what somebody said. `MAX_CLIP_LENGTH` is what bounds it.
 */
export function PasteEntry({ segment }: { segment: SegmentView }) {
  const t = useText().channel;
  const linkWords = useText().links;
  const [copied, setCopied] = React.useState<'idle' | 'done' | 'failed'>('idle');
  React.useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2_500);
    return () => clearTimeout(timer);
  }, [copied]);
  const paste = segment.paste;
  if (!paste) return null;
  const url = isSafeUrl(paste.text.trim()) ? paste.text.trim() : null;
  const word = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={spacing(1)}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <Text style={styles.pasteAction}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.entry}>
      <View style={styles.entryHead}>
        <View style={styles.pasteMark} accessibilityLabel={t.pastedBy(paste.displayName)}>
          <ClipboardIcon color={colors.textMuted} size={14} />
        </View>
        <Text style={styles.speaker} numberOfLines={1}>
          {paste.displayName}
        </Text>
        <Text style={[type.muted, styles.pasteTime]}>{t.liveTime(segment.startedAt)}</Text>
        {url ? word(t.open(), () => void openUrl(url, linkWords)) : null}
        {word(
          copied === 'done' ? t.copied() : copied === 'failed' ? t.copyFailed() : t.copy(),
          () => {
            void copyText(paste.text).then((ok) => setCopied(ok ? 'done' : 'failed'));
          }
        )}
      </View>
      <Text style={type.body} selectable>
        {paste.text}
      </Text>
    </View>
  );
}

/**
 * The record dot on a segment's header, sized to its 17-point label; the ring
 * where it kept no audio is drawn to match.
 */
const SEGMENT_MARK = 17;

/** How much of the platform's switch the *Record* tab draws, Pause included. */
const SWITCH_SCALE = 0.8;

const styles = StyleSheet.create({
  body: { gap: spacing(1) },
  room: { gap: spacing(1.5) },
  segment: { gap: spacing(1) },
  // A segment's line where no recording draws it: the marker and the label,
  // which are the press, and the share at the end, outside it — the same row
  // `RecordingRow`'s inline line is.
  segmentLine: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  segmentPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.75),
    paddingVertical: spacing(0.5),
  },
  segmentLabel: { flexShrink: 1 },
  shareChoice: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(1),
    paddingBottom: spacing(0.5),
  },
  // A ring the record dot's size: kept, and not as audio.
  ring: {
    width: 12,
    height: 12,
    marginHorizontal: (SEGMENT_MARK - 12) / 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
  },
  entry: { gap: spacing(0.25) },
  // The glyph before the name, so a paste reads as an entry and as not
  // somebody talking; the time takes the room, pushing Copy to the end.
  pasteMark: { alignSelf: 'center' },
  pasteTime: { flex: 1 },
  // A word rather than a button, in the body's colour so it reads as one.
  pasteAction: { color: colors.text, fontSize: 13, fontWeight: '600' },
  entryHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing(1) },
  speaker: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  // A room's line: the date and hours. The hairline under it is what made it
  // a rule.
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineLabel: { ...type.muted, flex: 1 },
  // Over its room's lines and on the page's own colour, so that held at the
  // top the log passes under it.
  held: { zIndex: 1, backgroundColor: colors.bg },
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
  /**
   * Five things on one line since the paste glyph joined it on 2026-10-16 —
   * the transport's two icons, two switches with their words, the glyph —
   * **and they have to fit a 375-point phone, measured from a screenshot,
   * against 343**: the screen less the measure's 16 on each side. Build 367
   * measured 346 needed — each switch takes about 56 in layout, not the 41
   * its scale suggests — and 359, the right edge's coordinate, had been
   * mistaken for the width, so the glyph wrapped onto a line of its own three
   * builds running. Now the row's three icons are 40 wide rather than
   * `IconButton`'s 44 (`rowIcon`, the glyph unchanged), Play and Stop are one
   * pair with no gap, and groups stand 6 apart: about 328, with room for
   * *Texto*. **The wrap stays as the net**, for a narrower phone.
   */
  switches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing(0.75),
    rowGap: spacing(0.5),
  },
  // The row's three icons — Play or Pause, Stop, paste — at 40 rather than
  // 44, which is the room the row was short of. Height stays 44.
  rowIcon: { width: 40 },
  transport: { flexDirection: 'row', alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) },
  // Pushed to the far end of the row, whatever its width.
  trailing: { marginLeft: 'auto' },
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
  /**
   * *Ask Claude*'s three buttons, tightened as the People card's ping is,
   * and 6 a side rather than its 8, since `Button` is sized for a card of its
   * own and this sits in a line of text with three of them. Measured at 15pt:
   * *Ask Claude · Pro* and the three come to 326 of the 343 a 375-point phone
   * has, *Preguntar a Claude* and *Breve Media Extensa* to 327; at 8 a side
   * both were within 6. The ordinary fill: nothing on this bar but the
   * recording's red is entitled to colour.
   */
  length: { paddingVertical: spacing(0.5), paddingHorizontal: spacing(0.75), minHeight: 0 },
  // The words give way before the buttons do: Spanish on a *Pro* or *Max*
  // channel, *Preguntar a Claude · Pro* at 362 and *· Max* at 367, wraps
  // rather than push the last button past the edge. *Ask Claude · Max* is
  // 331, and fits.
  askLabel: { flexShrink: 1 },
  warning: { color: colors.silenced, fontSize: 13 },
  pressed: { opacity: 0.6 },
});
