import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { describeLevel, NOTIFICATION_LEVELS } from '../../../core/notifications';
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
 * The levels are read from `describeLevel` rather than written out here, on
 * this repository's standing rule about a second copy of the same words: the
 * settings screen shows those sentences, and a promise here that had drifted
 * from them would be a promise about a screen that no longer exists.
 */
export function NotificationsView({ onDone }: { onDone: () => void }) {
  const { notifications } = useApp();
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
        <Text style={type.title}>Being reachable</Text>

        <Card style={styles.card}>
          <Text style={type.body}>
            The Floor is people talking, not messages waiting. Somebody walks
            into a channel, or pings you from one, and the whole of it happens
            while they are there.
          </Text>
          <Text style={type.muted}>
            Without notifications this phone can only be reached while you
            happen to be looking at it. Everyone else sees you as somebody who
            never answers.
          </Text>
        </Card>

        <SectionLabel>What we will send</SectionLabel>
        <Card style={styles.card}>
          <Text style={type.body}>
            Only a person. Somebody invited you, somebody pinged you, or
            somebody walked into a channel you belong to. That is all three
            kinds there are.
          </Text>
          <Text style={type.muted}>
            Nothing to bring you back, nothing about what you have missed, and
            nothing the app decided to send on its own behalf. There is no
            version of this that is good for us and bad for you.
          </Text>
        </Card>

        <SectionLabel>How loud, per channel</SectionLabel>
        <Card style={styles.card}>
          <Text style={type.muted}>
            Each channel is set on its own, in its settings, whenever you like.
            New ones start at Pings only.
          </Text>
          {NOTIFICATION_LEVELS.map((level) => {
            const { label, detail } = describeLevel(level);
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
            label={asking ? 'Asking…' : 'Turn on notifications'}
            variant="primary"
            onPress={allow}
          />
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={type.muted}>
                You have already answered this once, and iOS only asks the
                once. Turning it on now happens in Settings, under
                Notifications.
              </Text>
            </Card>
            <Button
              label="Open Settings"
              variant="primary"
              onPress={() => {
                void Linking.openSettings();
                onDone();
              }}
            />
          </>
        )}
        <Button label="Not now" variant="ghost" onPress={onDone} />
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
