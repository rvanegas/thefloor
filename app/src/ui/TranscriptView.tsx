import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordingView } from '../../../core/protocol';
import {
  intoBlocks,
  multiVoiceStems,
  type VoiceDeclarations,
  type VoiceEntry,
} from '../../../core/transcript';
import { exportTranscript } from '../api/download';
import { api } from '../api/http';
import { useApp } from '../state/AppProvider';
import { Button, Card, Empty, Field, Screen, SectionLabel } from './components';
import { colors, formatDuration, measure, radius, spacing, type } from './theme';

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
  const [voices, setVoices] = React.useState<VoiceEntry[]>([]);
  const [naming, setNaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const state = recording.transcript?.state;

  /**
   * The transcript as the server names it now.
   *
   * A function rather than only an effect because declaring the voices changes
   * every line's name at once, and the honest way to show that is to ask again
   * — the naming rules live on the server precisely so that this screen, an
   * export and a search result cannot drift apart.
   */
  const load = React.useCallback(async () => {
    if (!app.token) return;
    const body = await api.transcript(app.token, recording.id);
    setLines(body.lines);
    setVoices(body.voices ?? []);
  }, [app.token, recording.id]);

  React.useEffect(() => {
    let live = true;
    if (!app.token || state !== 'ready') return;
    load().catch((e: unknown) => {
      if (live) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      live = false;
    };
    // Refetched when the state moves to ready, which is how a screen left open
    // while the provider was working fills itself in.
  }, [app.token, load, state]);

  /**
   * Whether this viewer may say who the voices were.
   *
   * The same pair of rules as deleting the transcript, because it is the same
   * kind of act: `mayRemove` is the server saying who may shape a thing only
   * they can make again — whoever asked for this one — and `manageable` is
   * about changing something shared. Everybody else reads the result; naming
   * is not a private annotation.
   *
   * Not `mayRequest`, which since transcription opened up answers a different
   * question: whether this viewer could start a *new* one, which somebody who
   * has spent their free use cannot, while still being the person who made
   * the transcript on screen.
   */
  const mayName = manageable && recording.transcript?.mayRemove !== false;

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !lines) return lines ?? [];
    return lines.filter((line) => line.text.toLowerCase().includes(needle));
  }, [lines, query]);

  /**
   * Runs of one voice, as entries — but only when the whole transcript is on
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
   * Whether any stem came back with more than one voice, which is when the
   * letters beside the names need explaining. Nearly always false: a stem is
   * one microphone, and the exception is played media or somebody bleeding in.
   */
  const manyVoices = React.useMemo(
    () => (lines ? multiVoiceStems(lines).size > 0 : false),
    [lines]
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
    header that scrolls away put the moment somebody decides to export it a
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
          <Text style={type.heading}>Transcript</Text>
          <Text style={type.muted} numberOfLines={2}>
            {recording.name}
          </Text>
        </View>
        <Button label="Back" variant="ghost" onPress={onBack} />
      </View>

      {!naming && (state === 'ready' || deletable) ? (
        // Stacked rather than laid across: the labels are sentences, not
        // icons, and three of them will not sit on one line on a small
        // handset — wrapping them left a ragged two-and-one arrangement
        // whose second row read as a different group. One under another is
        // what the rest of the app does with a column of actions, and it
        // gives each the full width its label was written for.
        <View style={styles.headerActions}>
          {state === 'ready' && !naming && mayName && voices.length > 1 ? (
            <Button
              label="Name the voices"
              variant="ghost"
              // Only when there is a choice to make. One voice in the whole
              // transcript is a conversation nobody needs to relabel, and a
              // button that opens a screen with a single row on it is a
              // button that teaches people to ignore it.
              onPress={() => setNaming(true)}
            />
          ) : null}
          {state === 'ready' && !naming ? (
            <Button
              label={busy ? 'Preparing…' : 'Export'}
              variant="ghost"
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
          {deletable && !naming ? (
            <Button
              label="Delete transcript"
              variant="ghost"
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
        </View>
      ) : null}

      {/*
        Said only where there is a greyed-out Delete to explain. It used to
        be said whenever the viewer could not manage the recording, including
        on transcripts that offer no deleting at all, where it answered a
        question nobody had asked.
      */}
      {deletable && !naming && !manageable ? (
        <Text style={type.muted}>
          Step in to delete this. It leaves everybody's screen at once.
        </Text>
      ) : null}
      </View>
    </View>
  );

  return (
    <Screen header={header} contentStyle={styles.container}>
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

      {state === 'ready' && lines !== null && naming ? (
        <VoicesEditor
          voices={voices}
          busy={busy}
          onCancel={() => setNaming(false)}
          onSave={async (declarations) => {
            if (!app.token) return;
            setBusy(true);
            try {
              await api.declareVoices(app.token, recording.id, declarations);
              await load();
              setNaming(false);
            } catch (e) {
              Alert.alert(
                'Could not save',
                e instanceof Error ? e.message : String(e)
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {state === 'ready' && lines !== null && !naming ? (
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

          {/*
            Said only when there is something to explain. A letter beside a
            name means the service heard two voices in audio this app had
            taken for one — played media, usually, or somebody else audible on
            a member's handset. It is not an identification and must not read
            as one.
          */}
          {manyVoices ? (
            <Text style={type.muted}>
              A letter beside a name means more than one voice was heard on
              that microphone. Who the others were is not known.
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

/**
 * Saying who the voices in a transcript actually were.
 *
 * The provider labels each stem's voices independently, and what it produces
 * is a starting point rather than an answer: two labels on one person's
 * microphone is usually a failure to attribute a "Yeah.", and two labels on
 * played media is an interview whose speakers it cannot name. This is where
 * somebody who was there says which it was.
 *
 * Three things can be said about a voice, and they are the same three thing
 * the transcript needs:
 *
 *   - **A name.** What to call it instead of `Played audio (B)`.
 *   - **The same name as another voice**, which is how two are collapsed into
 *     one — the runs the spurious label split rejoin by themselves, because
 *     entries are grouped by name.
 *   - **Removed**, for a voice that was never a person.
 *
 * **Nothing here edits the transcript.** Every one of these is a view laid
 * over lines that are not touched, so it can be said differently a minute
 * later, or cleared entirely, and no audio is sent anywhere and nothing is
 * spent. That is why this screen can afford a Clear all button, and why the
 * one thing it never offers is a confirmation dialogue.
 */
function VoicesEditor({
  voices,
  busy,
  onSave,
  onCancel,
}: {
  voices: VoiceEntry[];
  busy: boolean;
  onSave: (declarations: VoiceDeclarations) => void;
  onCancel: () => void;
}) {
  /**
   * The draft, keyed the way the wire is.
   *
   * Held here and sent whole on Save rather than saved per field: the useful
   * edit is "these two are the same person", which is two fields that only
   * mean something together, and a screen that saved each one as it was typed
   * would regroup the transcript underneath somebody halfway through saying
   * it.
   */
  const [draft, setDraft] = React.useState<Record<string, { name: string; removed: boolean }>>(
    () =>
      Object.fromEntries(
        voices.map((voice) => [
          voice.key,
          { name: voice.declaration.name ?? '', removed: !!voice.declaration.removed },
        ])
      )
  );

  const set = (key: string, change: Partial<{ name: string; removed: boolean }>) =>
    setDraft((was) => ({ ...was, [key]: { ...was[key], ...change } }));

  return (
    <>
      <SectionLabel>Voices</SectionLabel>
      <Text style={type.muted}>
        The service heard these voices. It labels each microphone on its own,
        so the letters are its guess — name them, give two the same name to
        make them one, or remove one that was never a person. The transcript
        itself is not changed and this can be redone at any time.
      </Text>

      {/*
        Above the rows, for the reason the transcript's own actions are above
        its lines: a voice list is as long as the conversation had voices, and
        Save at the foot of it is a scroll away from the moment somebody has
        decided. The order is the same one the screen reads in — what this is,
        what you may do to it, then the thing itself.
      */}
      <View style={styles.actions}>
        <Button
          label={busy ? 'Saving…' : 'Save'}
          variant="primary"
          disabled={busy}
          onPress={() =>
            onSave(
              Object.fromEntries(
                Object.entries(draft).map(([key, value]) => [
                  key,
                  {
                    ...(value.name.trim() ? { name: value.name.trim() } : {}),
                    ...(value.removed ? { removed: true } : {}),
                  },
                ])
              )
            )
          }
        />
        <Button
          label="Clear all"
          disabled={busy}
          // Empties the draft rather than saving one: undoing an edit and
          // committing it are two different intentions, and the Save button
          // beside it is for the second one.
          onPress={() =>
            setDraft(
              Object.fromEntries(
                voices.map((voice) => [voice.key, { name: '', removed: false }])
              )
            )
          }
        />
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
      </View>

      <View style={styles.lines}>
        {voices.map((voice) => (
          <VoiceRow
            key={voice.key}
            voice={voice}
            draft={draft[voice.key] ?? { name: '', removed: false }}
            onChange={(change) => set(voice.key, change)}
          />
        ))}
      </View>
    </>
  );
}

/** One voice, with what it is called, what it said, and how much of it. */
function VoiceRow({
  voice,
  draft,
  onChange,
}: {
  voice: VoiceEntry;
  draft: { name: string; removed: boolean };
  onChange: (change: Partial<{ name: string; removed: boolean }>) => void;
}) {
  return (
    <Card style={styles.line}>
      <View style={styles.lineHead}>
        <Text style={styles.speaker} numberOfLines={1}>
          {voice.defaultName ?? 'Someone'}
        </Text>
        <Text style={type.muted}>
          {voice.lines === 1 ? '1 line' : `${voice.lines} lines`}
        </Text>
      </View>
      {/*
        What it first said, which is how somebody tells one voice from another.
        A letter is not recognisable and a line count is not either; a sentence
        is, immediately.
      */}
      <Text style={type.muted} numberOfLines={2}>
        {voice.sample}
      </Text>
      <Field
        value={draft.name}
        onChangeText={(name) => onChange({ name })}
        // The default is the placeholder, so leaving it blank plainly means
        // "as it was" and there is no separate control for going back.
        placeholder={voice.defaultName ?? 'Name this voice'}
        autoCapitalize="words"
        editable={!draft.removed}
      />
      <Button
        label={draft.removed ? 'Removed — bring back' : 'Remove from transcript'}
        variant={draft.removed ? 'default' : 'ghost'}
        onPress={() => onChange({ removed: !draft.removed })}
      />
    </Card>
  );
}

/**
 * One voice's uninterrupted run, as one card.
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
  const [head] = lines;
  const name = head.displayName ?? 'Someone';

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
  const body = <Text style={type.body}>{line.text}</Text>;
  if (!onSeek) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Jump to ${formatDuration(line.startMs)}, ${name}: ${line.text}`}
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
  actions: { gap: spacing(1) },
  pressed: { opacity: 0.6, borderRadius: radius.md },
});
