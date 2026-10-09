import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveLine } from '../../../core/protocol';
import { intoBlocks } from '../../../core/transcript';
import { api } from '../api/http';
import { subscribeLiveLines } from '../live/lines';
import { useApp } from '../state/AppProvider';
import { useText } from '../i18n';
import { Button, Card, Empty } from './components';
import { colors, spacing, type } from './theme';

/**
 * The Transcript tab: a channel's live transcript, as one continuous history.
 *
 * **One long conversation rather than a list of them**, which is the shape
 * `planning/task/the-channel-is-one-long-conversation.md` asks for: oldest at
 * the top, newest at the bottom, a divider where the day changes, and lines
 * arriving at the foot as people talk. Consecutive lines from one speaker are
 * one entry, by `intoBlocks` — the same grouping the recording's transcript
 * uses, so the two read alike.
 *
 * **Fetched when shown, and kept current by the socket.** The history comes a
 * page at a time from the server, newest page first; the lines written while
 * the tab is open arrive as `transcript.line` and are folded in by id, so a
 * line that came both ways is drawn once.
 *
 * Following the newest line is the `Screen`'s job — see `followEnd` — and
 * only while the reader is already at the bottom.
 */
export function LiveTranscript({
  channelId,
  transcribing,
}: {
  channelId: string;
  /** Whether the room is being transcribed now, which is what the note says. */
  transcribing: boolean;
}) {
  const t = useText().channel;
  const app = useApp();
  const [lines, setLines] = React.useState<LiveLine[] | null>(null);
  const [more, setMore] = React.useState(false);
  const [loadingEarlier, setLoadingEarlier] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const token = app.token;
    if (!token) return;
    // Subscribed before the fetch, so a line written while the first page is
    // in flight is held rather than lost; `merge` drops it if the page has it.
    const unsubscribe = subscribeLiveLines(channelId, (line) => {
      if (live) setLines((held) => merge(held ?? [], [line]));
    });
    api
      .liveTranscript(token, channelId)
      .then((page) => {
        if (!live) return;
        setLines((held) => merge(page.lines, held ?? []));
        setMore(page.more);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [app.token, channelId]);

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

  const days = React.useMemo(() => byDay(lines ?? [], t.liveDay), [lines, t]);

  return (
    <View style={styles.body}>
      <Text style={type.muted}>
        {transcribing ? t.liveTranscriptNote() : t.liveTranscriptOff()}
      </Text>

      {error ? <Empty>{error}</Empty> : null}
      {lines === null && !error ? <Empty>{t.liveLoading()}</Empty> : null}
      {lines !== null && lines.length === 0 ? <Empty>{t.liveNothingYet()}</Empty> : null}

      {more ? (
        <Button
          label={loadingEarlier ? t.liveLoading() : t.liveEarlier()}
          disabled={loadingEarlier}
          onPress={earlier}
        />
      ) : null}

      {days.map((day) => (
        <View key={day.label + day.lines[0].id} style={styles.day}>
          {/* A rule with the day on it — where the conversation was
              interrupted, which is the necklace's clasp rather than a
              heading over a new document. */}
          <View style={styles.divider} accessibilityRole="header">
            <View style={styles.rule} />
            <Text style={type.muted}>{day.label}</Text>
            <View style={styles.rule} />
          </View>
          {intoBlocks(
            day.lines.map((line) => ({ ...line, startMs: line.startAt, endMs: line.endAt }))
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
          ))}
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

/** Lines grouped under the day they were said on, in order. */
function byDay(
  lines: readonly LiveLine[],
  label: (at: number) => string
): Array<{ label: string; lines: LiveLine[] }> {
  const days: Array<{ label: string; lines: LiveLine[] }> = [];
  for (const line of lines) {
    const name = label(line.startAt);
    const last = days[days.length - 1];
    if (last && last.label === name) last.lines.push(line);
    else days.push({ label: name, lines: [line] });
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
