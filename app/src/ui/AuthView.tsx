import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { API_URL, describeMissingConfig } from '../api/config';
import { copyText } from '../clipboard';
import { useText } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Button, Card, Checkbox, Field, Screen } from './components';
import { currentLink, inEmbeddedBrowser } from './embedded';
import { colors, spacing, type } from './theme';

/**
 * Signed-out state. Identity is an email address plus a one-time code — no
 * password. A display name is offered alongside the code: it names a new
 * account, and renames an existing one, so signing out and back in is how a
 * name gets corrected. Left blank, the current name stands — and a new account
 * is named out of its address rather than after it, along with a username
 * derived from that name. See `core/derivedNames.ts`; both are suggestions,
 * replaced by typing here or on the Contact screen.
 */
export function AuthView() {
  const { requestCode, verify, lastError, clearError, signedInHere } = useApp();
  const t = useText().auth;
  const [step, setStep] = useState<'identify' | 'verify'>('identify');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  /**
   * Permission to send mail that is not a sign-in code. Starts clear, is only
   * ever sent as a grant, and is asked for only on an install that has never
   * been signed in: see the checkbox below, and `api.verify`. Floor Settings
   * is where it is answered afterwards, in both directions.
   */
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const missingConfig = describeMissingConfig();

  async function sendCode() {
    if (!identifier.trim()) {
      setError(t.enterEmail());
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
      setError(t.enterCode());
      return;
    }
    setBusy(true);
    setError(null);
    clearError();
    try {
      await verify(
        identifier.trim(),
        code.trim(),
        displayName.trim() || undefined,
        marketingEmail
      );
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

        {step === 'identify' ? (
          <>
            <Field
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={t.emailPlaceholder()}
              keyboardType="email-address"
              autoFocus
              onSubmit={sendCode}
              submitLabel="send"
            />
            <Button
              label={busy ? t.sending() : t.sendCode()}
              variant="primary"
              disabled={busy}
              onPress={sendCode}
            />
          </>
        ) : (
          <>
            <Text style={[type.muted, styles.sentTo]}>
              {t.emailedCodeTo(identifier.trim())}
            </Text>
            <Field
              value={code}
              onChangeText={setCode}
              placeholder={t.codePlaceholder()}
              keyboardType="number-pad"
              autoFocus
              onSubmit={submitCode}
              submitLabel="go"
            />
            <Field
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t.displayNamePlaceholder()}
              autoCapitalize="words"
              onSubmit={submitCode}
              submitLabel="go"
            />
            {/*
              **Offered to somebody signing up, and to nobody else.** A person
              coming back has answered this once and has it on Floor Settings,
              where it can also be turned off; asking them again at the door
              would be asking a question whose answer we already hold.

              `signedInHere` is a guess and is the only signal there is:
              nothing here can know whether this address has an account,
              because `/auth/request-code` answers identically either way so
              that sign-in cannot be used to ask which addresses exist — and by
              the time the server could say, the code has been spent. What the
              app can know is the address that last signed in on this install,
              and whether the one being typed is it. **So the question it
              answers is about the person and not merely about the handset**: a
              phone that has held somebody else's account offers the box to the
              next person to sign up on it, which a bare "somebody has signed
              in here" flag did not. What it still cannot see is a second
              device, which has no record and asks again — harmless, this being
              a grant and never a withdrawal. See `LAST_IDENTIFIER_KEY` in
              state/AppProvider.tsx, which carries what keeping that address
              costs.

              **It is on this step rather than the first, and inline rather
              than a step of its own.** This is the step that creates the
              account, and a box ticked beside an address that then fails to
              verify is a permission granted by nobody. A screen of its own
              after the code would be a screen between somebody and the app
              they just signed in to, which is a worse trade than the question
              is worth.

              Clear by default, and nothing pre-ticks it: an opt-in that
              arrives ticked is not one.
            */}
            {signedInHere(identifier) ? null : (
              <Checkbox
                label={t.marketingConsent()}
                checked={marketingEmail}
                onChange={setMarketingEmail}
              />
            )}
            <Button
              label={busy ? t.checking() : t.signIn()}
              variant="primary"
              disabled={busy}
              onPress={submitCode}
            />
            <Button
              label={t.useDifferentAddress()}
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
