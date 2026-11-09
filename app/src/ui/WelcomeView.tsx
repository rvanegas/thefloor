import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useText } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Button, Checkbox, Field, Screen } from './components';
import { colors, spacing, type } from './theme';

/**
 * A new account's first screen, since sign-in moved to dianoia-auth
 * (2026-11-09): the name it goes by here, and permission to send mail that is
 * not a sign-in code. dianoia-auth's page asks only who somebody is, being
 * every application's; these two are The Floor's own.
 *
 * **Shown once, to an account the sign-in just made**, and never to somebody
 * coming back, who has a name and has answered the question on Floor
 * Settings, where it can be changed both ways. The name is a suggestion the
 * server derived from the address, kept if left as it is.
 *
 * The box starts clear, and nothing pre-ticks it: an opt-in that arrives
 * ticked is not one. Continuing without it is a no that can become a yes on
 * Floor Settings.
 */
export function WelcomeView() {
  const { me, finishWelcome } = useApp();
  const t = useText().welcome;
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    setBusy(true);
    setError(null);
    try {
      await finishWelcome(displayName.trim() || undefined, marketingEmail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.heading}>
        <Text style={type.title}>{t.title()}</Text>
        <Text style={[type.muted, styles.lead]}>{t.lead()}</Text>
      </View>
      <Field
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={t.namePlaceholder()}
        autoCapitalize="words"
        autoFocus
        onSubmit={done}
        submitLabel="go"
      />
      <Checkbox label={t.marketingConsent()} checked={marketingEmail} onChange={setMarketingEmail} />
      <Button label={busy ? t.saving() : t.continue()} variant="primary" disabled={busy} onPress={done} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing(3), gap: spacing(1.5) },
  heading: { marginBottom: spacing(2) },
  lead: { marginTop: spacing(1), lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing(0.5) },
});
