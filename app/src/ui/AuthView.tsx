import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { API_URL, describeMissingConfig } from '../api/config';
import { useApp } from '../state/AppProvider';
import { Button, Field, Screen } from './components';
import { colors, spacing, type } from './theme';

/**
 * Signed-out state. Identity is an email address plus a one-time code — no
 * password. A display name is offered alongside the code: it names a new
 * account, and renames an existing one, so signing out and back in is how a
 * name gets corrected. Left blank, the current name stands.
 */
export function AuthView() {
  const { requestCode, verify, lastError, clearError } = useApp();
  const [step, setStep] = useState<'identify' | 'verify'>('identify');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const missingConfig = describeMissingConfig();

  async function sendCode() {
    if (!identifier.trim()) {
      setError('Enter your email address.');
      return;
    }
    setBusy(true);
    setError(null);
    // Acting on the sign-out notice is what retires it.
    clearError();
    try {
      await requestCode(identifier.trim());
      setStep('verify');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!code.trim()) {
      setError('Enter the code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    clearError();
    try {
      await verify(identifier.trim(), code.trim(), displayName.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (missingConfig) {
    return (
      <View style={styles.configError}>
        <Text style={type.heading}>Not configured</Text>
        <Text style={styles.configText}>{missingConfig}</Text>
      </View>
    );
  }

  return (
    <Screen contentStyle={styles.container}>
        <View style={styles.brand}>
          <Text style={type.title}>The Floor</Text>
          <Text style={[type.muted, styles.tagline]}>
            Audio channels where either party can claim uninterrupted time.
          </Text>
        </View>

        {step === 'identify' ? (
          <>
            <Field
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Email address"
              keyboardType="email-address"
              autoFocus
              onSubmit={sendCode}
              submitLabel="send"
            />
            <Button
              label={busy ? 'Sending…' : 'Send code'}
              variant="primary"
              disabled={busy}
              onPress={sendCode}
            />
          </>
        ) : (
          <>
            <Text style={[type.muted, styles.sentTo]}>
              We emailed a six-digit code to {identifier.trim()}
            </Text>
            <Field
              value={code}
              onChangeText={setCode}
              placeholder="Six-digit code"
              keyboardType="number-pad"
              autoFocus
              onSubmit={submitCode}
              submitLabel="go"
            />
            <Field
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name (blank keeps your current one)"
              autoCapitalize="words"
              onSubmit={submitCode}
              submitLabel="go"
            />
            <Button
              label={busy ? 'Checking…' : 'Sign in'}
              variant="primary"
              disabled={busy}
              onPress={submitCode}
            />
            <Button
              label="Use a different address"
              variant="ghost"
              onPress={() => {
                setStep('identify');
                setCode('');
                setError(null);
              }}
            />
          </>
        )}

        {/*
          Whatever this attempt just went wrong with wins; the sign-out notice
          is what got the user here and stays until they act on it. Before
          this, `lastError` was set in several places and rendered in none, so
          being told why you were signed out was impossible.
        */}
        {error ?? lastError ? (
          <Text style={styles.error}>{error ?? lastError}</Text>
        ) : null}

        <Text style={styles.hint}>Server: {API_URL}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(1.5),
  },
  brand: { marginBottom: spacing(2) },
  tagline: { marginTop: spacing(1), lineHeight: 20 },
  sentTo: { marginBottom: spacing(0.5) },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing(0.5) },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing(4),
  },
  configError: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(1.5),
  },
  configText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
