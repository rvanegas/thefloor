import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { HelpQuestion } from '../../../core/protocol';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, IconButton, Screen, SectionLabel } from './components';
import { CloseIcon } from './icons';
import { ago } from './relativeTime';
import { colors, spacing, type } from './theme';

/**
 * Asking The Floor a question, and reading what came back.
 *
 * **It is a question box, not a chat.** You write a question, it is stored, a
 * person reads it and writes an answer into the same place, and the answer
 * appears under the question the next time this screen is opened. There is no
 * reply to the reply and no unread count, because the thing behind this is one
 * person with a script — see `server/src/help.ts`, which says so plainly, and
 * `bin/help`, which is the whole of the other end.
 *
 * **Nothing here promises when.** Every version of this screen that said "we
 * usually reply within a day" would be a promise made by a screen on behalf of
 * somebody who has not been asked, and the first week it was wrong would cost
 * more than the reassurance ever bought. What it says instead is what is true:
 * the question is here, and it has not been answered yet.
 *
 * **The answered ones are the point of keeping the list.** A question that has
 * come back is the answer to something this person wanted to know, in the
 * place they went looking — so it stays, rather than being cleared, and the
 * list slowly becomes their own page of frequently asked questions. It is also
 * the only honest record of what people find confusing, which is what the
 * support page at `/support` ought to be written from.
 *
 * Fetched on open and held nowhere, exactly like `SupportView`: an answer is
 * written by hand at a moment no client can be told about, so the only time
 * this is known to be current is the moment it was read.
 */
export function HelpView({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const [questions, setQuestions] = useState<HelpQuestion[]>([]);
  const [canAsk, setCanAsk] = useState(true);
  const [askBlocked, setAskBlocked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = app.serverNow();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await app.loadHelp();
        if (cancelled) return;
        setQuestions(view.questions);
        setCanAsk(view.canAsk);
        setAskBlocked(view.askBlocked);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.token]);

  /**
   * Sends the question, and puts it at the top of the list itself.
   *
   * The server answers with the row it stored, so what goes into the list is
   * what would come back on the next read — trimmed, with its real id and
   * timestamp — rather than the string the field was holding. Re-reading the
   * whole view would say the same thing at the cost of a round trip and a
   * flicker.
   *
   * Whether another may be asked is not recomputed here. The limit is the
   * server's to state, and this screen holds one fewer thing that could
   * disagree with it: the field is closed as soon as one question is in the
   * air, and reopens when the screen is next opened with a slot free.
   */
  const ask = async () => {
    const text = draft.trim();
    if (!text || asking) return;
    setAsking(true);
    setError(null);
    try {
      const question = await app.askHelp(text);
      setQuestions((current) => [question, ...current]);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Help</Text>
        {/* "Close", not "Back": beside a list there is nothing underneath this
            to go back to. See HomeSettingsView. */}
        <IconButton
          label="Close"
          icon={(color) => <CloseIcon color={color} />}
          onPress={onBack}
        />
      </View>

      <Card style={styles.stack}>
        <Text style={type.muted}>
          Ask anything about The Floor — how something works, or what went
          wrong. A person reads these and writes back, and the answer appears
          here under your question.
        </Text>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder="What would you like to know?"
          autoCapitalize="sentences"
          multiline
          editable={canAsk && !asking}
        />
        <Button
          label={asking ? 'Sending…' : 'Ask'}
          variant="primary"
          onPress={() => void ask()}
          disabled={!canAsk || asking || !draft.trim()}
        />
        {/*
          Under the button rather than in place of it, which is the pattern
          every disabled control in this app follows: the control stays where
          it was and says why it will not work, so nothing appears to have gone
          missing.
        */}
        {!canAsk && askBlocked ? (
          <Text style={type.muted}>{askBlocked}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      {!loaded ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : questions.length > 0 ? (
        <>
          <SectionLabel>Your questions</SectionLabel>
          <View style={styles.list}>
            {questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                // The server's clock rather than the device's, which is the
                // rule everywhere in this app that renders an elapsed time:
                // `askedAt` was stamped there, and subtracting a phone's idea
                // of now from it is how a question asked a moment ago reads as
                // an hour old on a device whose clock has drifted.
                since={now - question.askedAt}
              />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * One question, with its answer or with the fact that it has none.
 *
 * The question is set in the body style and the answer in the muted one, which
 * is the wrong way round from how a support thread usually reads — and is
 * deliberate. The question is the thing this person wrote and is scanning for;
 * the answer is prose to be read once. Reversing them made the list read as a
 * wall of somebody else's writing with the asker's own words lost in it.
 */
function QuestionCard({
  question,
  since,
}: {
  question: HelpQuestion;
  /** How long ago it was asked, by the server's clock. */
  since: number;
}) {
  return (
    <Card style={styles.stack}>
      <Text style={type.body}>{question.text}</Text>
      {question.answer !== null ? (
        <>
          <Text style={styles.answerLabel}>Answer</Text>
          <Text style={type.muted}>{question.answer}</Text>
        </>
      ) : (
        // Said as a state rather than as an apology. "Not answered yet" is
        // information; "sorry for the delay" is a promise about a queue nobody
        // has committed to.
        <Text style={styles.pending}>
          Asked {ago(since)} · not answered yet
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2), paddingBottom: spacing(4), gap: spacing(1) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stack: { gap: spacing(1) },
  list: { gap: spacing(1) },
  loading: { marginTop: spacing(4) },
  answerLabel: { ...type.label, color: colors.textFaint },
  pending: { ...type.muted, color: colors.textFaint },
  error: { color: colors.danger, fontSize: 13 },
});
