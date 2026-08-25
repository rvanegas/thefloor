import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordingView } from '../../../core/protocol';
import { exportTranscript } from '../api/download';
import { api } from '../api/http';
import { useApp } from '../state/AppProvider';
import { Button, Card, Empty, Field, Screen, SectionLabel } from './components';
import { colors, formatDuration, radius, spacing, type } from './theme';

/**
 * One recording's transcript: what was said, who said it, and when.
 *
 * Rendered instead of the channel rather than over it, the way the profile and
 * the settings screens are — the audio connection lives above this, so opening
 * a transcript does not hang anybody up.
 *
 * **Searching is private and jumping is public**, which is the one thing here
 * that has to be said out loud. Typing in the field below filters this screen
 * and nobody else's. Tapping a line sends a seek, and a seek moves shared
 * playback for everybody in the room — so the jump is offered only while this
 * recording is the loaded track and only to whoever may drive it.
 */
export function TranscriptView({
  recording,
  onBack,
  onSeek,
  manageable,
}: {
  recording: RecordingView;
  onBack: () => void;
  /**
   * Moves shared playback to a position in this recording, or nothing when
   * that is not on offer — this recording is not what is loaded, or the floor
   * is somebody else's.
   */
  onSeek?: (positionMs: number) => void;
  /**
   * Whether deleting the transcript is yours to do. The same rule as renaming
   * and deleting the recording, since removing a shared thing is the same size
   * of act as making one.
   */
  manageable: boolean;
}) {
  const app = useApp();
  const [lines, setLines] = React.useState<Line[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const state = recording.transcript?.state;

  React.useEffect(() => {
    let live = true;
    if (!app.token || state !== 'ready') return;
    api
      .transcript(app.token, recording.id)
      .then((body) => {
        if (live) setLines(body.lines);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
    // Refetched when the state moves to ready, which is how a screen left open
    // while the provider was working fills itself in.
  }, [app.token, recording.id, state]);

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !lines) return lines ?? [];
    return lines.filter((line) => line.text.toLowerCase().includes(needle));
  }, [lines, query]);

  return (
    <Screen>
      <View style={styles.header}>
        <Button label="Back" onPress={onBack} />
      </View>
      <SectionLabel>Transcript</SectionLabel>
      <Text style={type.muted} numberOfLines={2}>
        {recording.name}
      </Text>

      {state === 'pending' ? (
        <Empty>
          Being transcribed. This takes a few minutes; you can leave this
          screen.
        </Empty>
      ) : null}

      {state === 'failed' ? (
        <Empty>
          {recording.transcript?.failure
            ? `Transcribing failed — ${recording.transcript.failure}`
            : 'Transcribing failed.'}
        </Empty>
      ) : null}

      {error ? <Empty>{error}</Empty> : null}

      {state === 'ready' && lines === null && !error ? (
        <Empty>Loading…</Empty>
      ) : null}

      {state === 'ready' && lines !== null ? (
        <>
          {/*
            Said before the list rather than beside every line, and only when
            somebody is actually missing from it: a transcript is ready when
            *any* speaker produced text, and a screen that showed the ones who
            did without mentioning the ones who did not would read as the whole
            conversation.
          */}
          {recording.transcript?.missing ? (
            <Text style={type.muted}>
              {recording.transcript.missing === 1
                ? 'One person could not be transcribed and is missing from this.'
                : `${recording.transcript.missing} people could not be transcribed and are missing from this.`}
            </Text>
          ) : null}

          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Find a word"
            autoCapitalize="none"
          />
          {/*
            The whole of the private/public distinction, in one sentence, where
            somebody is about to act on it.
          */}
          <Text style={type.muted}>
            {onSeek
              ? 'Searching is yours alone. Tapping a line moves playback for everybody.'
              : 'Searching is yours alone. Play this recording to jump to a line.'}
          </Text>

          {matches.length === 0 ? (
            <Empty>
              {query.trim() ? 'Nothing matches.' : 'Nothing was transcribed.'}
            </Empty>
          ) : (
            <View style={styles.lines}>
              {matches.map((line, n) => (
                <TranscriptLine
                  key={`${line.startMs}-${line.identity}-${n}`}
                  line={line}
                  onSeek={onSeek}
                />
              ))}
            </View>
          )}
        </>
      ) : null}

      <View style={styles.actions}>
        {state === 'ready' ? (
          <Button
            label={busy ? 'Preparing…' : 'Export'}
            disabled={busy}
            onPress={() => {
              Alert.alert('Export transcript', 'Which format?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Text', onPress: () => download('txt') },
                { text: 'Subtitles', onPress: () => download('vtt') },
                { text: 'Data', onPress: () => download('json') },
              ]);
            }}
          />
        ) : null}
        {state && state !== 'none' && recording.transcript?.mayRequest !== false ? (
          <Button
            label="Delete transcript"
            disabled={!manageable || busy}
            onPress={() => {
              Alert.alert(
                'Delete this transcript?',
                // Says the cost out loud. Nothing is refunded, and the app
                // should not let somebody find that out by asking again.
                'The recording is kept. Transcribing it again costs the same as the first time.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      if (!app.token) return;
                      setBusy(true);
                      try {
                        await api.deleteTranscript(app.token, recording.id);
                        onBack();
                      } catch (e) {
                        Alert.alert(
                          'Could not delete',
                          e instanceof Error ? e.message : String(e)
                        );
                      } finally {
                        setBusy(false);
                      }
                    },
                  },
                ]
              );
            }}
          />
        ) : null}
        {manageable ? null : (
          <Text style={type.muted}>
            Step in to delete this. It leaves everybody's screen at once.
          </Text>
        )}
      </View>
    </Screen>
  );

  async function download(format: 'txt' | 'vtt' | 'json') {
    if (!app.token) return;
    setBusy(true);
    try {
      await exportTranscript(
        app.token,
        recording.id,
        recording.name,
        recording.endedAt,
        format
      );
    } catch (e) {
      Alert.alert(
        'Could not export',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setBusy(false);
    }
  }
}

interface Line {
  identity: string;
  displayName: string | null;
  speaker: string | null;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

function TranscriptLine({
  line,
  onSeek,
}: {
  line: Line;
  onSeek?: (positionMs: number) => void;
}) {
  const body = (
    <Card style={styles.line}>
      <View style={styles.lineHead}>
        <Text style={styles.speaker} numberOfLines={1}>
          {line.displayName ?? 'Someone'}
        </Text>
        <Text style={type.muted}>{formatDuration(line.startMs)}</Text>
      </View>
      <Text style={type.body}>{line.text}</Text>
    </Card>
  );

  if (!onSeek) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Jump to ${formatDuration(line.startMs)}, ${
        line.displayName ?? 'someone'
      }: ${line.text}`}
      onPress={() => onSeek(line.startMs)}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row' },
  lines: { gap: spacing(1) },
  line: { gap: spacing(0.5) },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) },
  speaker: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  actions: { gap: spacing(1) },
  pressed: { opacity: 0.6, borderRadius: radius.md },
});
