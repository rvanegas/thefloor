import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { API_URL, describeMissingConfig } from '../api/config';
import { copyText } from '../clipboard';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, Screen } from './components';
import { currentLink, inEmbeddedBrowser } from './embedded';
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

        {/*
          Shown only inside an app's own browser — Telegram's, Instagram's, any
          of them. On iOS those hand a page a microphone that produces silence,
          and nothing anywhere reports it; see core/embedded.ts.

          **At the door, and only here.** The cure is to open this somewhere
          else, and doing that after signing in costs the session — an in-app
          browser has its own storage jar, so another browser is another code
          in the post. The guest page says the same thing in the same place for
          the same reason, and shares the rule but not the words: it can offer
          listening while the microphone is broken, and this screen has nothing
          to offer anybody who has not signed in yet.
        */}
        {inEmbeddedBrowser() ? <EmbeddedNotice /> : null}

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

/**
 * The advice, which is the whole of what this page can do about it.
 *
 * Worded as the guest page words it, deliberately: this is one failure with
 * one cure, and two descriptions of it would be two things to keep true. What
 * is dropped is that page's opening offer to listen anyway, which is not
 * available before somebody has signed in.
 *
 * The copy button is the fallback for the half of this advice that is a guess.
 * Every host app puts the control somewhere different and some bury it, so
 * naming *Open in Safari* is a hint rather than an instruction — a link on the
 * clipboard works whether or not the menu was found.
 */
function EmbeddedNotice() {
  const [copied, setCopied] = useState(false);

  return (
    <Card style={styles.embedded}>
      <Text style={type.body}>
        <Text style={styles.embeddedLead}>
          You are in an app&rsquo;s built-in browser.
        </Text>{' '}
        On iOS these browsers often hand a page a microphone that produces
        silence — everyone hears nothing and nothing says so.
      </Text>
      <Text style={[type.muted, styles.embeddedNote]}>
        Open this link in Safari or Chrome instead: the menu at the top or
        bottom of this window has <Text style={styles.embeddedEm}>Open in
        Safari</Text> or <Text style={styles.embeddedEm}>Open in browser</Text>.
        If you cannot find it, copy the link and paste it into a browser
        yourself.
      </Text>
      <Button
        label={copied ? 'Link copied' : 'Copy the link'}
        variant="ghost"
        onPress={() => {
          // The result is ignored on purpose. `copyText` answers whether it
          // worked and there is nothing useful to do with a `false` here —
          // the person is already being told to find a menu, and a second
          // failure notice on top of that is noise. See app/src/clipboard.ts.
          void copyText(currentLink());
          setCopied(true);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  embedded: { gap: spacing(1), marginBottom: spacing(1) },
  embeddedLead: { fontWeight: '600' },
  embeddedNote: { lineHeight: 20 },
  embeddedEm: { fontStyle: 'italic' },
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
