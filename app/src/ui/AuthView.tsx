import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { API_URL, describeMissingConfig } from '../api/config';
import { copyText } from '../clipboard';
import { useText } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen } from './components';
import { currentLink, inEmbeddedBrowser } from './embedded';
import { colors, spacing, type } from './theme';

/**
 * Signed-out state, since 2026-11-09: one button, which signs in through
 * dianoia-auth (`auth.rvanegas.co`), the sign-in The Floor shares with noesis
 * and the rest. Identity is still an email address plus a one-time code, and
 * no password, but the code is asked on dianoia-auth's page, in the system
 * sheet — and not at all when the person is already signed in there, from
 * noesis or Roxana, in the same browser. A new account's name and marketing
 * consent are asked afterwards, on `WelcomeView`, since dianoia-auth's page
 * asks only who somebody is.
 *
 * Builds up to 421 signed in with this server's own code on this screen; the
 * server keeps answering them (planning/SHIMS.md, gate 422).
 */
export function AuthView() {
  const { signIn, lastError, clearError } = useApp();
  const t = useText().auth;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const missingConfig = describeMissingConfig();

  async function start() {
    setBusy(true);
    setError(null);
    // Acting on the sign-out notice is what retires it.
    clearError();
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (missingConfig) {
    return (
      <View style={styles.configError}>
        <Text style={type.heading}>{t.notConfigured()}</Text>
        <Text style={styles.configText}>{missingConfig}</Text>
      </View>
    );
  }

  return (
    <Screen contentStyle={styles.container}>
        <View style={styles.brand}>
          <Text style={type.title}>{t.brand()}</Text>
          <Text style={[type.muted, styles.tagline]}>{t.tagline()}</Text>
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

        <Button
          label={busy ? t.signingIn() : t.signIn()}
          variant="primary"
          disabled={busy}
          onPress={start}
        />
        <Text style={[type.muted, styles.signInHint]}>{t.signInHint()}</Text>

        {/*
          Whatever this attempt just went wrong with wins; the sign-out notice
          is what got the user here and stays until they act on it.
        */}
        {error ?? lastError ? (
          <Text style={styles.error}>{error ?? lastError}</Text>
        ) : null}

        <Text style={styles.hint}>{t.serverHint(API_URL)}</Text>
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
  const t = useText().auth;
  const advice = t.embeddedAdvice();
  const [copied, setCopied] = useState(false);

  return (
    <Card style={styles.embedded}>
      <Text style={type.body}>
        <Text style={styles.embeddedLead}>{t.embeddedLead()}</Text>
        {t.embeddedWhy()}
      </Text>
      <Text style={[type.muted, styles.embeddedNote]}>
        {advice.before}
        <Text style={styles.embeddedEm}>{advice.firstMenuItem}</Text>
        {advice.between}
        <Text style={styles.embeddedEm}>{advice.secondMenuItem}</Text>
        {advice.after}
      </Text>
      <Button
        label={copied ? t.linkCopied() : t.copyTheLink()}
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
  signInHint: { lineHeight: 20 },
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
