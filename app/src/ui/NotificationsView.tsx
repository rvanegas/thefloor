import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { NOTIFICATION_LEVELS } from '../../../core/notifications';
import { useText } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen, SectionLabel } from './components';
import { colors, spacing, type } from './theme';

/**
 * Why notifications, said before the system asks and never instead of it.
 *
 * **This screen exists because iOS grants one dialog per install.** That
 * dialog is two words and a bundle name; it cannot say what would be lost by
 * refusing, and it is the only chance there is. So the app says it first, in
 * its own words, and the dialog follows from a button here — which is the
 * whole of the change made on 2026-09-08. See `state/notificationAsk.ts` for
 * when this is put in front of somebody.
 *
 * **Three things, in this order, because they answer the three reasons people
 * refuse.** That it matters — this application is other people trying to
 * reach you, and a phone that cannot be reached is somebody quietly absent.
 * That it will not be abused — every notification is a person, and the app
 * sends nothing on its own behalf, which is a promise the code can actually
 * keep: there are three kinds and all three are somebody doing something.
 * That it is not all-or-nothing — the levels are per channel, the middle one
 * is the default, and the quiet one is genuinely quiet.
 *
 * The levels are read from the catalogue's `notificationLevel` group rather
 * than written out here, on this repository's standing rule about a second
 * copy of the same words: the settings screen shows those sentences, and a
 * promise here that had drifted from them would be a promise about a screen
 * that no longer exists.
 */
export function NotificationsView({ onDone }: { onDone: () => void }) {
  const { notifications } = useApp();
  const t = useText().notifications;
  const levels = useText().notificationLevel;
  const [asking, setAsking] = useState(false);

  /**
   * Marks the day the moment this is on screen, however it got here — the
   * banner, or the app putting it up unbidden. See `noteShown`: being shown
   * this is the imposition the daily limit is about, and closing it without
   * answering must not leave the app free to show it again tonight.
   */
  useEffect(() => {
    notifications.noteShown();
    // Once per appearance of the screen. `noteShown` is stable, and re-running
    // it on a re-render would only rewrite today's date with today's date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * **The button is not the same button in the two cases**, and the difference
   * is not cosmetic. With the dialog unspent it produces the dialog. After a
   * refusal there is no dialog to produce — iOS keeps the answer for good — so
   * the only honest offer is the Settings app, and saying "Allow" there and
   * having nothing happen is exactly how an app teaches somebody its buttons
   * are decorative.
   */
  const allow = () => {
    if (asking) return;
    setAsking(true);
    void notifications.allow().then((granted) => {
      setAsking(false);
      // Closed either way. Refusing is an answer, and a screen that stayed put
      // after it would be arguing with somebody who has just said no.
      onDone();
      return granted;
    });
  };

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.stack}>
        <Text style={type.title}>{t.title()}</Text>

        {/*
          First, and only for the one reader it is true of: somebody who
          arrived with nobody here. For them this permission is not a promise
          about conversations they already have — it is the thing that fetches
          them a room, since a *getting-started channel* is given to people who
          can be told it went live. See `HomeView.cohortEligible`.

          Above the general argument rather than below it, because for this
          reader it *is* the argument; the three cards under it then say what
          will be sent and how loud, which are still the right next questions.
        */}
        {notifications.cohortEligible ? (
          <Card style={styles.card}>
            <Text style={type.body}>{t.cohortOffer()}</Text>
            <Text style={type.muted}>{t.cohortOnce()}</Text>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text style={type.body}>{t.peopleNotMessages()}</Text>
          <Text style={type.muted}>{t.otherwiseUnreachable()}</Text>
        </Card>

        <SectionLabel>{t.whatWeWillSend()}</SectionLabel>
        <Card style={styles.card}>
          <Text style={type.body}>{t.onlyAPerson()}</Text>
          <Text style={type.muted}>{t.nothingOnOurBehalf()}</Text>
        </Card>

        <SectionLabel>{t.howLoudPerChannel()}</SectionLabel>
        <Card style={styles.card}>
          <Text style={type.muted}>{t.setPerChannel()}</Text>
          {NOTIFICATION_LEVELS.map((level) => {
            const { label, detail } = levels[level]();
            return (
              <View key={level} style={styles.level}>
                <Text style={styles.levelLabel}>{label}</Text>
                <Text style={type.muted}>{detail}</Text>
              </View>
            );
          })}
        </Card>

        {notifications.canPrompt ? (
          <Button
            label={asking ? t.asking() : t.turnOn()}
            variant="primary"
            onPress={allow}
          />
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={type.muted}>{t.alreadyAnswered()}</Text>
            </Card>
            <Button
              label={t.openSettings()}
              variant="primary"
              onPress={() => {
                void Linking.openSettings();
                onDone();
              }}
            />
          </>
        )}
        <Button label={t.notNow()} onPress={onDone} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
  stack: { gap: spacing(1.5) },
  card: { gap: spacing(1) },
  /** A level and what it does, as one block, so the three read as a list. */
  level: { gap: 2 },
  levelLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
});
