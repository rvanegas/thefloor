import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordingView } from '../../../core/protocol';
import { intoBlocks } from '../../../core/transcript';
import { shareTranscript } from '../api/download';
import { api } from '../api/http';
import { useApp } from '../state/AppProvider';
import { Button, Card, Empty, Field, IconButton, Screen } from './components';
import { CloseIcon } from './icons';
import { colors, formatDuration, measure, radius, spacing, type } from './theme';
import { useText } from '../i18n';

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
  const t = useText().transcript;
  const shared = useText().shared;
  const app = useApp();
  const [lines, setLines] = React.useState<Line[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const state = recording.transcript?.state;

  /**
   * The transcript as the server names it — every line after its speaker's
   * display name, which lives on the server so that this screen, a shared copy
   * and a search result cannot drift apart.
   */
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

  /**
   * Runs of one speaker, as entries — but only when the whole transcript is on
   * screen. A search result is a set of lines that matched, and grouping those
   * would put two paragraphs minutes apart under one heading as though they
   * had been said together. Filtered, each match stands alone.
   */
  const searching = query.trim() !== '';
  const entries = React.useMemo(
    () => (searching ? matches.map((line) => [line]) : intoBlocks(matches).map((b) => b.lines)),
    [matches, searching]
  );

  /**
   * Whether deleting is on offer at all, which is not the same as whether this
   * viewer may do it: the button is shown and disabled rather than hidden, so
   * that the sentence explaining why has something to point at.
   */
  const deletable =
    !!state && state !== 'none' && recording.transcript?.mayRemove !== false;

  /*
    Pinned rather than scrolled: this is the header slot, so it stays where it
    is while the transcript moves under it. Everything you can do to this
    transcript is up here, above what it says, rather than below it — a
    transcript is as long as the conversation was, and both a footer and a
    header that scrolls away put the moment somebody decides to share it a
    scroll from the control that does it. The screen reads top-down: what this
    is, what you may do to it, then the words, and the first two stay put.
  */
  const header = (
    <View style={styles.header}>
      {/* The measure on the contents, the rule on the header — an edge that
          stops short of the window is not an edge. See `headerInner`. */}
      <View style={styles.headerInner}>
      <View style={styles.headerTop}>
        <View style={styles.headerMain}>
          <Text style={type.heading}>{t.title()}</Text>
          <Text style={type.muted} numberOfLines={2}>
            {recording.name}
          </Text>
        </View>
        {/* "Close", not "Back". See HomeSettingsView. */}
        <IconButton
          label={shared.close()}
          icon={(color) => <CloseIcon color={color} />}
          onPress={onBack}
        />
      </View>

      {state === 'ready' || deletable ? (
        // Stacked rather than laid across: the labels are sentences, not
        // icons, and two of them will not sit on one line on a small
        // handset — wrapping them left a ragged two-and-one arrangement
        // whose second row read as a different group. One under another is
        // what the rest of the app does with a column of actions, and it
        // gives each the full width its label was written for.
        <View style={styles.headerActions}>
          {state === 'ready' ? (
            <Button
              label={busy ? t.preparing() : t.share()}
              disabled={busy}
              onPress={() => {
                Alert.alert(t.shareTranscript(), t.whichFormat(), [
                  { text: t.cancel(), style: 'cancel' },
                  { text: t.text(), onPress: () => download('txt') },
                  { text: t.subtitles(), onPress: () => download('vtt') },
                  { text: t.data(), onPress: () => download('json') },
                ]);
              }}
            />
          ) : null}
          {deletable ? (
            <Button
              label={t.deleteTranscript()}
              disabled={!manageable || busy}
              onPress={() => {
                Alert.alert(
                  t.deleteThisTranscript(),
                  // Says the cost out loud. Nothing is refunded, and the app
                  // should not let somebody find that out by asking again.
                  t.deleteCost(),
                  [
                    { text: t.cancel(), style: 'cancel' },
                    {
                      text: t.deleteConfirm(),
                      style: 'destructive',
                      onPress: async () => {
                        if (!app.token) return;
                        setBusy(true);
                        try {
                          await api.deleteTranscript(app.token, recording.id);
                          onBack();
                        } catch (e) {
                          Alert.alert(
                            t.couldNotDelete(),
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
        </View>
      ) : null}

      {/*
        Said only where there is a greyed-out Delete to explain. It used to
        be said whenever the viewer could not manage the recording, including
        on transcripts that offer no deleting at all, where it answered a
        question nobody had asked.
      */}
      {deletable && !manageable ? (
        <Text style={type.muted}>{t.stepInToDelete()}</Text>
      ) : null}
      </View>
    </View>
  );

  return (
    <Screen header={header} contentStyle={styles.container}>
      {state === 'pending' ? (
        <Empty>{t.beingTranscribed()}</Empty>
      ) : null}

      {state === 'failed' ? (
        <Empty>
          {recording.transcript?.failure
            ? t.transcribingFailedWith(recording.transcript.failure)
            : t.transcribingFailed()}
        </Empty>
      ) : null}

      {error ? <Empty>{error}</Empty> : null}

      {state === 'ready' && lines === null && !error ? (
        <Empty>{t.loading()}</Empty>
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
              {t.missing(recording.transcript.missing)}
            </Text>
          ) : null}

          <Field
            value={query}
            onChangeText={setQuery}
            placeholder={t.findAWord()}
            autoCapitalize="none"
          />
          {/*
            The whole of the private/public distinction, in one sentence, where
            somebody is about to act on it.
          */}
          <Text style={type.muted}>
            {onSeek ? t.searchSeekable() : t.searchOnly()}
          </Text>

          {matches.length === 0 ? (
            <Empty>
              {query.trim() ? t.nothingMatches() : t.nothingWasTranscribed()}
            </Empty>
          ) : (
            <View style={styles.lines}>
              {entries.map((entry, n) => (
                <TranscriptEntry
                  key={`${entry[0].startMs}-${entry[0].identity}-${n}`}
                  lines={entry}
                  onSeek={onSeek}
                />
              ))}
            </View>
          )}
        </>
      ) : null}

    </Screen>
  );

  async function download(format: 'txt' | 'vtt' | 'json') {
    if (!app.token) return;
    setBusy(true);
    try {
      await shareTranscript(
        app.token,
        recording.id,
        recording.name,
        recording.endedAt,
        format
      );
    } catch (e) {
      Alert.alert(
        t.couldNotShare(),
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
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

/**
 * One speaker's uninterrupted run, as one card.
 *
 * The name is printed once and the utterances beneath it are paragraphs, which
 * is what makes the labels alternate: the next card is always somebody else,
 * so a name on screen is always news. The provider deals in utterances and a
 * card each would turn one person's four sentences into four speakers.
 *
 * **Each paragraph keeps its own tap**, rather than the card seeking to the
 * run's start. That is the precision the grouping would otherwise cost —
 * somebody who reads a sentence three paragraphs down and taps it means that
 * sentence, and a run can be a minute long.
 */
function TranscriptEntry({
  lines,
  onSeek,
}: {
  lines: Line[];
  onSeek?: (positionMs: number) => void;
}) {
  const t = useText().transcript;
  const [head] = lines;
  const name = head.displayName ?? t.someone();

  return (
    <Card style={styles.line}>
      <View style={styles.lineHead}>
        <Text style={styles.speaker} numberOfLines={1}>
          {name}
        </Text>
        <Text style={type.muted}>{formatDuration(head.startMs)}</Text>
      </View>
      {lines.map((line, n) => (
        <Paragraph
          key={`${line.startMs}-${n}`}
          line={line}
          name={name}
          onSeek={onSeek}
        />
      ))}
    </Card>
  );
}

function Paragraph({
  line,
  name,
  onSeek,
}: {
  line: Line;
  name: string;
  onSeek?: (positionMs: number) => void;
}) {
  const t = useText().transcript;
  const body = <Text style={type.body}>{line.text}</Text>;
  if (!onSeek) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.jumpTo(formatDuration(line.startMs), name, line.text)}
      onPress={() => onSeek(line.startMs)}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * The same padded, gapped body every other screen has. This one had none:
   * its lines ran to both edges of the handset while the profile and the
   * settings screens beside it sat inside a margin, which read as a different
   * app rather than a longer one.
   *
   * The horizontal padding is repeated in `header` rather than shared, the
   * two being on opposite sides of the scroll boundary now — the header is
   * the `Screen`'s pinned slot and takes no part in this content.
   */
  container: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(1.5),
    paddingBottom: spacing(4),
    gap: spacing(1),
  },
  header: {
    paddingVertical: spacing(2),
    paddingBottom: spacing(1.5),
    /**
     * The one thing a pinned header needs that a scrolling one does not: an
     * edge. Without it the words slide up to the Delete button and stop, with
     * nothing saying which of the two is the thing that moved.
     */
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: { ...measure, paddingHorizontal: spacing(2), gap: spacing(1) },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  headerMain: { flex: 1, gap: 2 },
  headerActions: { gap: spacing(1) },
  lines: { gap: spacing(1) },
  line: { gap: spacing(0.5) },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) },
  speaker: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  pressed: { opacity: 0.6, borderRadius: radius.md },
});
