import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useText } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen } from './components';
import { spacing, type } from './theme';

/**
 * The prompt to turn notifications on: a title, one sentence, and the button.
 *
 * **It was a full page until 2026-10-17** — three cards arguing for the
 * permission, a list of the per-channel levels, and an offer for the
 * getting-started channel — shown before iOS's one dialog was spent. The
 * dialog is now raised straight after sign-in with no preamble (see
 * `state/useNotificationAsk.ts`), so what is left here is reached from Home's
 * banner by somebody who has already answered, and what they need is the way
 * back rather than the argument.
 *
 * **The button is not the same button in the two cases.** With the dialog
 * unspent it produces the dialog. After a refusal there is no dialog to
 * produce, so the only honest offer is the Settings app, with the steps.
 */
export function NotificationsView({ onDone }: { onDone: () => void }) {
  const { notifications, emailNotifications } = useApp();
  const t = useText().notifications;
  const [asking, setAsking] = useState(false);

  const allow = () => {
    if (asking) return;
    setAsking(true);
    void notifications.allow().then(() => {
      setAsking(false);
      // Closed either way: refusing is an answer.
      onDone();
    });
  };

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.stack}>
        <Text style={type.title}>{t.title()}</Text>
        <Card style={styles.card}>
          <Text style={type.body}>{t.why()}</Text>
          {notifications.canPrompt ? null : (
            <Text style={type.muted}>{t.steps()}</Text>
          )}
          {emailNotifications ? (
            <Text style={type.muted}>{t.byEmail()}</Text>
          ) : null}
        </Card>
        {notifications.canPrompt ? (
          <Button
            label={asking ? t.asking() : t.turnOn()}
            variant="primary"
            onPress={allow}
          />
        ) : (
          <Button
            label={t.openSettings()}
            variant="primary"
            onPress={() => {
              void Linking.openSettings();
              onDone();
            }}
          />
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
});
