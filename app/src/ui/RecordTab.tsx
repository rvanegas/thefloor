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
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  recordingRefusal,
} from '../../../core/channel';
import type { LiveLine, RecordingView, RoomView } from '../../../core/protocol';
import { intoBlocks } from '../../../core/transcript';
import type { ChannelState } from '../../../core/types';
import { shareRoom } from '../api/download';
import { api } from '../api/http';
import { subscribeLiveLines } from '../live/lines';
import { useApp } from '../state/AppProvider';
import { shareText } from '../share';
import { useText, type Strings } from '../i18n';
import { Button, Empty, useScrollPosition } from './components';
import { ShareIcon } from './icons';
import { colors, formatDuration, measure, radius, spacing, type } from './theme';

/**
 * The Record tab: what was kept of a channel, as a log, one room at a time.
 *
 * **A log, not cards, since 2026-10-09.** Lines run oldest at the top and
 * newest at the foot, each speaker's run of them under their name and the time
 * it began, in plain text the way a chat reads — consecutive lines from one
 * speaker are one entry, by `intoBlocks`, the grouping a recording's own
 * transcript uses. A recording is a single muted line where it began, the
 * record dot and its name, which opens to the actions its card had.
 *
 * **Laid out in rooms.** A room is a sitting — first step in to last step out,
 * written by the server as it happens (`server/src/rooms.ts`) — and each one
 * that kept something, a recording or a line of transcript, starts with a rule
 * bearing its date and its hours. A sitting that kept nothing is not drawn.
 * **A recording that fell in no sitting is its own room** — the server lists
 * it as a `standIn`, spanning the run, recorded and not transcribed — so the
 * recordings made before rooms existed open the log, each under its own rule.
 * Lines of live transcript from before then are left out rather than
 * gathered under a heading that would be a guess.
 *
 * **Each room's rule is a `RoomLine`** — its date, its hours and its share —
 * and it scrolls with the log, so two rooms on screen at once have the line
 * between them where one ended and the next began. **It is hoisted only once
 * it has scrolled off the top**, since 2026-10-09: the room whose rule is
 * above the viewport is reported up through `onHoist`, and the screen draws
 * the same line pinned over the top of the scroll until the next room's rule
 * arrives and pushes it off — `hoistShift` is how far, set on every scroll
 * without rendering anything. Before anything is measured (and in a test
 * renderer, where nothing is) nothing is hoisted, and every rule is inline.
 *
 * **Fetched when shown, and kept current by the socket.** The transcript comes
 * a page at a time, newest first; lines written while the tab is open arrive
 * as `transcript.line` and are folded in by id. A line outside every room held
 * means a room opened since they were fetched, so they are fetched again, as
 * they are whenever the set of recordings changes.
 */
export function RecordTab({
  channelId,
  name,
  live,
  transcribing,
  paused = false,
  recordings,
  renderRecording,
  onHoist,
  hoistShift,
}: {
  channelId: string;
  /** What a shared file is called after, with the room's start. */
  name: string;
  /** Whether this channel has a live transcript to show, now or from before. */
  live: boolean;
  /** Whether the room is being transcribed now, which is what the note says. */
  transcribing: boolean;
  /** Whether it is on and held by the Pause above. */
  paused?: boolean;
  /** This channel's recordings, in any order. */
  recordings: readonly RecordingView[];
  /** One recording as a line of the log. */
  renderRecording: (recording: RecordingView) => React.ReactNode;
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
  }, [app.token, channelId, recordingKey, roomsAsked]);

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
      if (known && !known.some((room) => holds(room, line.startAt))) askRooms();
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
  // recording is never drawn above a stretch of talk not loaded yet.
  const from = live && more && held.length ? held[0].startAt : -Infinity;
  const sittings = React.useMemo(
    () =>
      intoRooms(
        rooms ?? [],
        held,
        recordings.filter((r) => r.startedAt >= from)
      ),
    [rooms, held, recordings, from]
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
      onLayout={() => {
        position?.contentTopOf(root, (top) => {
          rootTop.current = top;
          settle();
        });
      }}
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
            settle();
          }}
        >
          {/* Where one sitting ends and the next begins — the line the
              pinned copy takes over once it has scrolled off the top. */}
          <View
            onLayout={(event) => {
              lineHeight.current = event.nativeEvent.layout.height;
            }}
          >
            <RoomLine channelId={channelId} name={name} room={room} />
          </View>
          {items.map((item) =>
            item.kind === 'recording' ? (
              <React.Fragment key={item.recording.id}>
                {renderRecording(item.recording)}
              </React.Fragment>
            ) : (
              intoBlocks(
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
              ))
            )
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * A room's line: its date and hours, and its share. Drawn inline at the head
 * of each room in the log, and again pinned over the top of the scroll by
 * `HoistedRoom` once that one has scrolled off — **the same component in both
 * places**, so the hand-over from one to the other has no seam to see.
 *
 * **The share asks which**, since 2026-10-09: a room may have kept its audio,
 * its text, or both, and the press offers both with whichever it lacks greyed
 * out — the native action sheet on iOS, which can grey an option; elsewhere
 * `Alert`, which cannot, and so offers only what there is. A room that kept
 * neither (one still open, before its first line or finished recording) greys
 * the icon itself. **It stays drawn either way**: a control that comes and
 * goes as you scroll is one that is not where the thumb went (STYLE.md, rule
 * six).
 */
export function RoomLine({
  channelId,
  name,
  room,
}: {
  channelId: string;
  /** What the shared file is called after, with the room's start. */
  name: string;
  room: RoomView;
}) {
  const t = useText().channel;
  const app = useApp();
  const [busy, setBusy] = React.useState(false);
  const audio = room.recordingIds.length > 0;
  const text = room.transcribed;
  const available = (audio || text) && !busy;

  const share = async (what: 'audio' | 'text') => {
    if (!app.token || busy) return;
    setBusy(true);
    try {
      if (what === 'audio') {
        await shareRoom(app.token, channelId, room.id, name, room.openedAt);
      } else {
        const handed = await shareText(await roomText(app.token, channelId, room, t));
        if (handed === 'copied') Alert.alert(t.roomTextCopied());
        if (handed === 'failed') Alert.alert(t.couldNotShareRoom());
      }
    } catch (e) {
      Alert.alert(t.couldNotShareRoom(), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel} numberOfLines={1} accessibilityRole="header">
        {t.liveDay(room.openedAt)} · {t.roomSpan(room.openedAt, room.closedAt)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? t.preparingRoom() : t.shareRoom()}
        accessibilityState={{ disabled: !available, busy }}
        disabled={!available}
        hitSlop={spacing(1)}
        onPress={() => chooseWhatToShare(t, { audio, text }, (what) => void share(what))}
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        <ShareIcon color={available ? colors.text : colors.textFaint} />
      </Pressable>
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
  channelId,
  name,
  room,
  shift,
}: {
  channelId: string;
  name: string;
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
        <RoomLine channelId={channelId} name={name} room={room} />
      </View>
    </Animated.View>
  );
}

/**
 * Which of a room's two to share, with what it lacks shown and refused.
 * Exported for the test, which drives both paths.
 */
export function chooseWhatToShare(
  t: Strings['channel'],
  has: { audio: boolean; text: boolean },
  then: (what: 'audio' | 'text') => void
): void {
  if (Platform.OS === 'ios') {
    const disabledButtonIndices: number[] = [];
    if (!has.audio) disabledButtonIndices.push(0);
    if (!has.text) disabledButtonIndices.push(1);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t.shareRoomTitle(),
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
  Alert.alert(t.shareRoomTitle(), undefined, [
    { text: t.cancel(), style: 'cancel' },
    ...(has.audio ? [{ text: t.audio(), onPress: () => then('audio') }] : []),
    ...(has.text ? [{ text: t.keepText(), onPress: () => then('text') }] : []),
  ]);
}

/**
 * A room's live transcript as plain text, the way the log draws it: its date
 * and hours, then each speaker's run under their name and the time it began.
 *
 * **Assembled here from the pages the log already reads**, walking back from
 * the room's end until a page reaches before its start, rather than from a
 * route of its own — so sharing text needs nothing the server does not
 * already serve, and reads only what the member could scroll to.
 */
export async function roomText(
  token: string,
  channelId: string,
  room: RoomView,
  t: Strings['channel']
): Promise<string> {
  let lines: LiveLine[] = [];
  let before = room.closedAt === null ? undefined : room.closedAt + 1;
  for (;;) {
    const page = await api.liveTranscript(token, channelId, before);
    lines = merge(page.lines.filter((line) => holds(room, line.startAt)), lines);
    if (!page.more || page.lines.length === 0 || page.lines[0].startAt < room.openedAt) break;
    before = page.lines[0].startAt;
  }
  return formatRoomText(room, lines, t);
}

/** The text `roomText` shares, from lines already in hand. */
export function formatRoomText(
  room: RoomView,
  lines: readonly LiveLine[],
  t: Strings['channel']
): string {
  const head = `${t.liveDay(room.openedAt)} · ${t.roomSpan(room.openedAt, room.closedAt)}`;
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
 * What this channel keeps of what is said: its audio, its text, or neither,
 * and a Pause that holds whichever is running. Pinned under the channel's
 * header on the *Record* tab, since 2026-10-09, where the Record and Pause
 * buttons were and in place of the *Live transcript* setting on *Channel
 * Settings*.
 *
 * **Two switches, radio style** — either may be on, never both, and both may
 * be off. Turning one on turns the other off in the same press, which is what
 * `keep-the-transcript-and-let-the-audio-go` asks for: the channel keeps the
 * conversation as audio or as text, and a person chooses which. **Only on
 * this side**: the server would still hold both, as *Record automatically*
 * can bring about by starting a recording under the text.
 *
 * **Audio is the recording's own rules**: on is `START_RECORDING`, off is
 * `STOP_RECORDING`, and the switch is refused exactly where the button it
 * replaces was. **Text is the account's**, `mayTranscribeLive`, since the
 * house pays for it; everybody else sees its state and cannot move it — and
 * cannot turn the audio on while it holds, since that would mean turning it
 * off. A switch says what is *chosen*, so a held run leaves it on.
 *
 * **Pause holds whichever is chosen, and Resume restarts only what it held.**
 * Audio's is `PAUSE_RECORDING`, which keeps the run one recording — the server
 * captures it in segments and joins them, recorded time only, so what was
 * said either side of a pause is one file with no gap, in the room it began
 * in. Text's is `PAUSE_LIVE_TRANSCRIPTION`: nothing goes to the provider while
 * it holds, and the lines either side are one stretch of the same room. Both
 * on the recording's Pause rules. **The button is always drawn**, refused
 * while there is nothing to hold, so it never moves under the thumb.
 *
 * Under the row, as under the buttons it replaces: why Record is refused
 * when nothing else on the screen says, and a capture that stopped for a
 * reason nobody asked for.
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

  const setText = (on: boolean) => {
    if (!app.token) return;
    api
      .setLiveTranscription(app.token, channelId, on)
      .catch((e: unknown) =>
        Alert.alert(t.keepText(), e instanceof Error ? e.message : String(e))
      );
  };
  const switchAudio = (on: boolean) => {
    if (!on) {
      app.act(channelId, { type: 'STOP_RECORDING' });
      return;
    }
    if (textOn) setText(false);
    app.act(channelId, { type: 'START_RECORDING' });
  };
  const switchText = (on: boolean) => {
    if (on && audioOn) app.act(channelId, { type: 'STOP_RECORDING' });
    setText(on);
  };

  // Resume while anything chosen is held, Pause otherwise; each sends only
  // what this person may do to what is actually in that state.
  const resuming = audioHeld || textHeld;
  const holds: Array<
    | { type: 'PAUSE_RECORDING' }
    | { type: 'RESUME_RECORDING' }
    | { type: 'PAUSE_LIVE_TRANSCRIPTION' }
    | { type: 'RESUME_LIVE_TRANSCRIPTION' }
  > = resuming
    ? [
        ...(audioHeld && canResumeRecording(channel, me)
          ? [{ type: 'RESUME_RECORDING' as const }]
          : []),
        ...(textHeld && canResumeLiveTranscription(channel, me)
          ? [{ type: 'RESUME_LIVE_TRANSCRIPTION' as const }]
          : []),
      ]
    : [
        ...(canPauseRecording(channel, me) ? [{ type: 'PAUSE_RECORDING' as const }] : []),
        ...(canPauseLiveTranscription(channel, me)
          ? [{ type: 'PAUSE_LIVE_TRANSCRIPTION' as const }]
          : []),
      ];

  const audioRefused = audioOn
    ? !mayStop
    : !canStartRecording(channel, me) || (textOn && !mayTranscribeLive);
  const textRefused = !mayTranscribeLive || (!textOn && audioOn && !mayStop);
  const refusal = recordingRefusal(channel, me);

  return (
    <View style={styles.bar}>
      <View style={[styles.barInner, styles.keep]}>
        <View style={styles.switches}>
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
            onChange={switchText}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={resuming ? t.resume() : t.pause()}
            accessibilityState={{ disabled: holds.length === 0 }}
            disabled={holds.length === 0}
            onPress={() => holds.forEach((action) => app.act(channelId, action))}
            style={({ pressed }) => [styles.hold, pressed && styles.pressed]}
          >
            <Text style={[styles.holdLabel, holds.length === 0 && styles.switchLabelRefused]}>
              {resuming ? t.resume() : t.pause()}
            </Text>
          </Pressable>
        </View>
        {refusal !== null && !audioOn ? (
          <Text style={type.muted}>
            {refusal === 'owner'
              ? t.recordRefusedOwner()
              : refusal === 'film'
                ? t.recordRefusedFilm()
                : t.recordRefusedSilent()}
          </Text>
        ) : textOn && !mayTranscribeLive && !audioOn ? (
          <Text style={type.muted}>{t.recordRefusedText()}</Text>
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

/** One of the pair: its word, and the switch beside it. */
function KeepSwitch({
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
        // The recording dot's red, for both: to somebody deciding whether to
        // speak, what they say being kept is one meaning, as audio or as
        // text — the header's pill says so already.
        trackColor={{ false: colors.disabled, true: colors.recording }}
        ios_backgroundColor={colors.disabled}
      />
    </View>
  );
}

/** Two sets of lines as one, by id, in the order they were said. */
export function merge(a: readonly LiveLine[], b: readonly LiveLine[]): LiveLine[] {
  const byId = new Map<string, LiveLine>();
  for (const line of [...a, ...b]) byId.set(line.id, line);
  return [...byId.values()].sort((x, y) => x.startAt - y.startAt || x.id.localeCompare(y.id));
}

/** Whether a moment falls inside a room, which may still be open. */
function holds(room: RoomView, at: number): boolean {
  return at >= room.openedAt && (room.closedAt === null || at <= room.closedAt);
}

/** What a room holds: stretches of talk, and the recordings between them. */
type RoomItem =
  | { kind: 'lines'; lines: LiveLine[] }
  | { kind: 'recording'; recording: RecordingView };

/**
 * Lines and recordings in the order they happened, under the room they
 * happened in; anything in no room is left out. A recording belongs to the
 * room the server named it in, or to an open one it began inside since. A
 * recording that began at the same moment as a line comes first, being where
 * that stretch of the record starts.
 */
export function intoRooms(
  rooms: readonly RoomView[],
  lines: readonly LiveLine[],
  recordings: readonly RecordingView[]
): Array<{ room: RoomView; items: RoomItem[] }> {
  return rooms
    .map((room) => {
      const ids = new Set(room.recordingIds);
      const events = [
        ...recordings
          .filter((r) => ids.has(r.id) || (room.closedAt === null && holds(room, r.startedAt)))
          .map((recording) => ({ at: recording.startedAt, recording })),
        // Only into a room that was transcribed, or is open and may yet be:
        // a recording's stand-in is not, so talk written down before rooms
        // existed does not attach itself to whichever old recording it
        // happens to overlap.
        ...(room.transcribed || room.closedAt === null ? lines : [])
          .filter((l) => holds(room, l.startAt))
          .map((line) => ({ at: line.startAt, line })),
      ].sort((x, y) => x.at - y.at || ('recording' in x ? -1 : 0) - ('recording' in y ? -1 : 0));

      const items: RoomItem[] = [];
      for (const event of events) {
        if ('recording' in event) {
          items.push({ kind: 'recording', recording: event.recording });
          continue;
        }
        const last = items[items.length - 1];
        if (last?.kind === 'lines') last.lines.push(event.line);
        else items.push({ kind: 'lines', lines: [event.line] });
      }
      return { room, items };
    })
    .filter(({ items }) => items.length > 0);
}

const styles = StyleSheet.create({
  body: { gap: spacing(1) },
  room: { gap: spacing(1.5) },
  entry: { gap: spacing(0.25) },
  entryHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing(1) },
  speaker: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  // A room's line, inline and hoisted alike: the date and hours, and the
  // share at the end. The hairline under it is what made it a rule.
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
  switchLabelRefused: { color: colors.textFaint },
  // Pause, as thin as the switches beside it and on no card: a hairline
  // pill the height of a switch, its word at the switches' size.
  hold: {
    height: 31,
    justifyContent: 'center',
    paddingHorizontal: spacing(1.5),
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  holdLabel: { color: colors.text, fontSize: 15 },
  warning: { color: colors.silenced, fontSize: 13 },
  pressed: { opacity: 0.6 },
});
