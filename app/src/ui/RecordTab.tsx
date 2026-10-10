import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveLine, RecordingView, RoomView } from '../../../core/protocol';
import { intoBlocks } from '../../../core/transcript';
import { shareRoom } from '../api/download';
import { api } from '../api/http';
import { subscribeLiveLines } from '../live/lines';
import { useApp } from '../state/AppProvider';
import { useText } from '../i18n';
import { Button, Empty, useScrollPosition } from './components';
import { ShareIcon } from './icons';
import { colors, measure, spacing, type } from './theme';

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
 * bearing its date and its hours. A sitting that kept nothing is not drawn,
 * and nothing from before rooms existed is: lines and recordings that fall in
 * no room are left out rather than gathered under a heading that would be a
 * guess.
 *
 * **The room at the top of the scroll is reported up**, through
 * `onRoomAtTop`, for the pinned `RoomBar` — whose date is always visible and
 * changes as the next room's rule scrolls under it, and whose share icon sends
 * that room's audio whole. Before anything is measured (and in a test
 * renderer, where nothing is) that is the newest room, which is where the tab
 * opens.
 *
 * **Fetched when shown, and kept current by the socket.** The transcript comes
 * a page at a time, newest first; lines written while the tab is open arrive
 * as `transcript.line` and are folded in by id. A line outside every room held
 * means a room opened since they were fetched, so they are fetched again, as
 * they are whenever the set of recordings changes.
 */
export function RecordTab({
  channelId,
  live,
  transcribing,
  recordings,
  renderRecording,
  onRoomAtTop,
}: {
  channelId: string;
  /** Whether this channel has a live transcript to show, now or from before. */
  live: boolean;
  /** Whether the room is being transcribed now, which is what the note says. */
  transcribing: boolean;
  /** This channel's recordings, in any order. */
  recordings: readonly RecordingView[];
  /** One recording as a line of the log. */
  renderRecording: (recording: RecordingView) => React.ReactNode;
  /** The room at the top of the scroll, for the pinned bar. */
  onRoomAtTop?: (room: RoomView | null) => void;
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
  const earlierMatters =
    more && held.length > 0 && !!rooms?.length && held[0].startAt > rooms[0].openedAt;
  const loading = (rooms === null || (live && lines === null)) && !error;

  // --- Which room is at the top ---------------------------------------------
  const position = useScrollPosition();
  const root = React.useRef<View>(null);
  const rootTop = React.useRef<number | null>(null);
  const tops = React.useRef(new Map<string, number>());
  const reported = React.useRef<RoomView | null | undefined>(undefined);
  const shown = React.useRef(sittings);
  shown.current = sittings;
  const report = React.useRef(onRoomAtTop);
  report.current = onRoomAtTop;

  const settle = React.useCallback(() => {
    const list = shown.current;
    let at: RoomView | null = list.length ? list[list.length - 1].room : null;
    if (list.length && position && rootTop.current !== null) {
      const offset = position.offset() + 1;
      at = list[0].room;
      for (const { room } of list) {
        const y = tops.current.get(room.id);
        if (y !== undefined && rootTop.current + y <= offset) at = room;
      }
    }
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
          {transcribing ? t.liveTranscriptNote() : t.liveTranscriptOff()}
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
          {/* Where one sitting ends and the next begins — the rule the
              pinned bar takes over once it has scrolled under it. */}
          <View style={styles.divider} accessibilityRole="header">
            <View style={styles.rule} />
            <Text style={type.muted}>
              {t.liveDay(room.openedAt)} · {t.roomSpan(room.openedAt, room.closedAt)}
            </Text>
            <View style={styles.rule} />
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
 * The pinned bar over the log: the date and hours of the room at the top of
 * the scroll, and the one control that is always there, sharing that room's
 * audio.
 *
 * **The icon stays when there is nothing to share.** A room that was only
 * transcribed has no audio, and the icon is drawn faint and says so when
 * pressed rather than vanishing — a control that comes and goes as you scroll
 * is one that is not where the thumb went (STYLE.md, rule six).
 */
export function RoomBar({
  channelId,
  name,
  room,
}: {
  channelId: string;
  /** What the shared file is called after, with the room's start. */
  name: string;
  room: RoomView | null;
}) {
  const t = useText().channel;
  const app = useApp();
  const [busy, setBusy] = React.useState(false);
  if (!room) return null;
  const audio = room.recordingIds.length > 0;

  const share = async () => {
    if (!audio) {
      Alert.alert(t.roomNoAudioTitle(), t.roomNoAudio());
      return;
    }
    if (!app.token || busy) return;
    setBusy(true);
    try {
      await shareRoom(app.token, channelId, room.id, name, room.openedAt);
    } catch (e) {
      Alert.alert(t.couldNotShareRoom(), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.bar}>
      <View style={styles.barInner}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {t.liveDay(room.openedAt)} · {t.roomSpan(room.openedAt, room.closedAt)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? t.preparingRoom() : t.shareRoom()}
          accessibilityState={{ disabled: !audio, busy }}
          hitSlop={spacing(1)}
          onPress={share}
          style={({ pressed }) => (pressed ? styles.pressed : undefined)}
        >
          <ShareIcon color={audio && !busy ? colors.text : colors.textFaint} />
        </Pressable>
      </View>
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
        ...lines.filter((l) => holds(room, l.startAt)).map((line) => ({ at: line.startAt, line })),
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(0.5),
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  entry: { gap: spacing(0.25) },
  entryHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing(1) },
  speaker: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  barLabel: { ...type.muted, flex: 1 },
  pressed: { opacity: 0.6 },
});
