import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveLine, RecordingView } from '../../../core/protocol';
import { intoBlocks } from '../../../core/transcript';
import { api } from '../api/http';
import { subscribeLiveLines } from '../live/lines';
import { useApp } from '../state/AppProvider';
import { useText } from '../i18n';
import { Button, Card, Empty } from './components';
import { colors, spacing, type } from './theme';

/**
 * The Conversation tab's history: what was said in a channel, as one
 * continuous thing, with its recordings standing in it.
 *
 * **One long conversation rather than a list of them**, which is the shape
 * `planning/task/the-channel-is-one-long-conversation.md` asks for: oldest at
 * the top, newest at the bottom, a divider where the day changes, and lines
 * arriving at the foot as people talk. Consecutive lines from one speaker are
 * one entry, by `intoBlocks` — the same grouping the recording's transcript
 * uses, so the two read alike.
 *
 * **A recording is a segment of it, since 2026-10-09**, drawn at the moment it
 * began by whatever `renderRecording` gives back — the recording row, whose
 * Share is how a segment is downloaded. A pause ends a run, so a conversation
 * recorded in stretches is several segments, each where it happened. Lines
 * from one speaker that straddle a segment are two entries, one each side,
 * since the segment is where the record changed.
 *
 * **A channel may keep either form, both or neither.** Without a live
 * transcript (`live` false) nothing is fetched and the history is the
 * recordings alone, oldest first.
 *
 * **Fetched when shown, and kept current by the socket.** The transcript comes
 * a page at a time from the server, newest page first; the lines written while
 * the tab is open arrive as `transcript.line` and are folded in by id, so a
 * line that came both ways is drawn once. While earlier pages remain unread,
 * recordings older than the oldest line held wait for them, so a segment is
 * never drawn above a stretch of talk that has not been loaded yet.
 *
 * Following the newest line is the `Screen`'s job — see `followEnd` — and
 * only while the reader is already at the bottom.
 */
export function Conversation({
  channelId,
  live,
  transcribing,
  recordings,
  renderRecording,
}: {
  channelId: string;
  /** Whether this channel has a live transcript to show, now or from before. */
  live: boolean;
  /** Whether the room is being transcribed now, which is what the note says. */
  transcribing: boolean;
  /** This channel's recordings, in any order. */
  recordings: readonly RecordingView[];
  /** One recording as a segment of the history. */
  renderRecording: (recording: RecordingView) => React.ReactNode;
}) {
  const t = useText().channel;
  const app = useApp();
  const [lines, setLines] = React.useState<LiveLine[] | null>(null);
  const [more, setMore] = React.useState(false);
  const [loadingEarlier, setLoadingEarlier] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!live) return;
    let current = true;
    const token = app.token;
    if (!token) return;
    // Subscribed before the fetch, so a line written while the first page is
    // in flight is held rather than lost; `merge` drops it if the page has it.
    const unsubscribe = subscribeLiveLines(channelId, (line) => {
      if (current) setLines((held) => merge(held ?? [], [line]));
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
  // Until the oldest page is in, the history starts at the oldest line held.
  const from = live && more && held.length ? held[0].startAt : -Infinity;
  const segments = React.useMemo(
    () => recordings.filter((r) => r.startedAt >= from),
    [recordings, from]
  );
  const days = React.useMemo(
    () => byDay(held, segments, t.liveDay),
    [held, segments, t]
  );
  const loading = live && lines === null && !error;

  return (
    <View style={styles.body}>
      {live ? (
        <Text style={type.muted}>
          {transcribing ? t.liveTranscriptNote() : t.liveTranscriptOff()}
        </Text>
      ) : null}

      {error ? <Empty>{error}</Empty> : null}
      {loading ? <Empty>{t.liveLoading()}</Empty> : null}
      {!loading && days.length === 0 ? (
        <Empty>{live ? t.liveNothingYet() : t.nothingRecordedYet()}</Empty>
      ) : null}

      {more ? (
        <Button
          label={loadingEarlier ? t.liveLoading() : t.liveEarlier()}
          disabled={loadingEarlier}
          onPress={earlier}
        />
      ) : null}

      {days.map((day) => (
        <View key={day.key} style={styles.day}>
          {/* A rule with the day on it — where the conversation was
              interrupted, which is the necklace's clasp rather than a
              heading over a new document. */}
          <View style={styles.divider} accessibilityRole="header">
            <View style={styles.rule} />
            <Text style={type.muted}>{day.label}</Text>
            <View style={styles.rule} />
          </View>
          {day.items.map((item) =>
            item.kind === 'recording' ? (
              <React.Fragment key={item.recording.id}>
                {renderRecording(item.recording)}
              </React.Fragment>
            ) : (
              intoBlocks(
                item.lines.map((line) => ({ ...line, startMs: line.startAt, endMs: line.endAt }))
              ).map((block) => (
                <Card key={block.lines[0].id} style={styles.entry}>
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
                </Card>
              ))
            )
          )}
        </View>
      ))}
    </View>
  );
}

/** Two sets of lines as one, by id, in the order they were said. */
export function merge(a: readonly LiveLine[], b: readonly LiveLine[]): LiveLine[] {
  const byId = new Map<string, LiveLine>();
  for (const line of [...a, ...b]) byId.set(line.id, line);
  return [...byId.values()].sort((x, y) => x.startAt - y.startAt || x.id.localeCompare(y.id));
}

/** What a day holds: stretches of talk, and the recordings between them. */
type DayItem =
  | { kind: 'lines'; lines: LiveLine[] }
  | { kind: 'recording'; recording: RecordingView };

/**
 * Lines and recordings in the order they happened, under the day they
 * happened on. A recording that began at the same moment as a line comes
 * first, being where that stretch of the record starts.
 */
export function byDay(
  lines: readonly LiveLine[],
  recordings: readonly RecordingView[],
  label: (at: number) => string
): Array<{ key: string; label: string; items: DayItem[] }> {
  const events = [
    ...recordings.map((recording) => ({ at: recording.startedAt, recording })),
    ...lines.map((line) => ({ at: line.startAt, line })),
  ].sort((x, y) => x.at - y.at || ('recording' in x ? -1 : 0) - ('recording' in y ? -1 : 0));

  const days: Array<{ key: string; label: string; items: DayItem[] }> = [];
  for (const event of events) {
    const name = label(event.at);
    let day = days[days.length - 1];
    if (!day || day.label !== name) {
      const key = name + ('recording' in event ? event.recording.id : event.line.id);
      day = { key, label: name, items: [] };
      days.push(day);
    }
    if ('recording' in event) {
      day.items.push({ kind: 'recording', recording: event.recording });
      continue;
    }
    const last = day.items[day.items.length - 1];
    if (last?.kind === 'lines') last.lines.push(event.line);
    else day.items.push({ kind: 'lines', lines: [event.line] });
  }
  return days;
}

const styles = StyleSheet.create({
  body: { gap: spacing(1) },
  day: { gap: spacing(1) },
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
  entry: { gap: spacing(0.5) },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) },
  speaker: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
});
