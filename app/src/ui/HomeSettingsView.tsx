import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '../../../core/constants';
import { API_URL } from '../api/config';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, Screen, SectionLabel } from './components';
import { InlineMarkdown } from './markdown';
import { colors, spacing, type } from './theme';
import type { ColorSchemePreference } from './appearance';

/**
 * Everything about you rather than about a conversation: the name people see,
 * what you say about yourself, and the way out.
 *
 * The counterpart to ChannelSettingsView, and named to match — one settings
 * screen reached from Home, one reached from a channel, each holding what its
 * own scope owns.
 */
export function HomeSettingsView({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const [displayName, setDisplayName] = useState(app.me?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * What the server already has, so that leaving a field alone writes nothing.
   *
   * A ref rather than state: it is never rendered, and it has to be readable by
   * a blur handler that fired before a re-render would have delivered it.
   */
  const saved = useRef({ displayName: '', bio: '' });

  // The bio is not in the `hello` snapshot — it would ride on every roster for
  // the sake of one screen — so it is fetched when that screen opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!app.token || !app.me) return;
      try {
        const profile = await app.loadProfile(app.me.id);
        if (cancelled) return;
        setDisplayName(profile.account.displayName);
        setBio(profile.bio ?? '');
        // The baseline every later comparison is against, so that opening this
        // screen and closing it again writes nothing.
        saved.current = {
          displayName: profile.account.displayName,
          bio: profile.bio ?? '',
        };
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.me?.id]);

  /**
   * Writes whatever has actually changed.
   *
   * This screen has no Save button. Appearance and signing out always took
   * effect the moment they were touched, and the two text fields did not,
   * which made one button on the screen mean "keep my work" and the other —
   * Done, nearer and more obvious — mean "throw it away, silently". Saving on
   * blur removes the choice rather than explaining it.
   *
   * Rethrows so that Done can decline to close on a failure. A screen that
   * closed anyway would be the silent discard again, wearing a different hat.
   */
  const persist = async () => {
    const name = displayName.trim();
    const text = bio.trim();
    // A blank name is refused rather than written: it is how everybody else
    // finds you, and the server ignores an empty one anyway. Saying so under
    // the field is what stands in for a disabled button.
    const nameChanged = name !== '' && name !== saved.current.displayName;
    const bioChanged = text !== saved.current.bio;
    if (!nameChanged && !bioChanged) return;

    const changes: { displayName?: string; bio?: string } = {};
    if (nameChanged) changes.displayName = name;
    if (bioChanged) changes.bio = text;

    setSaving(true);
    setError(null);
    try {
      await app.saveProfile(changes);
      saved.current = {
        displayName: changes.displayName ?? saved.current.displayName,
        bio: changes.bio ?? saved.current.bio,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Opens the privacy policy in the browser.
   *
   * `API_URL` is where this app's server is, and the policy is a page on it, so
   * there is nothing to configure and nothing that can point at a different
   * server's claims than the one holding the data. It is empty only in a
   * development build with no `EXPO_PUBLIC_API_URL`, where the app has no
   * server at all and says so on its first screen — saying it again here is
   * better than opening `/privacy` on nothing.
   */
  const openPrivacy = async () => {
    if (!API_URL) {
      setError('No server configured, so there is no policy to show.');
      return;
    }
    try {
      await Linking.openURL(`${API_URL}/privacy`);
    } catch {
      // A refusal by the OS looks exactly like a dead button otherwise.
      Alert.alert('Could not open the privacy policy', `${API_URL}/privacy`);
    }
  };

  /**
   * Deletes the account, and stays on this screen if it could not be.
   *
   * Nothing follows the call on the success path on purpose: the provider drops
   * the session, and this screen is unmounted along with everything else behind
   * it. `deleting` is cleared only on failure for the same reason — there is no
   * component left to clear it in.
   */
  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await app.deleteAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  /** Keeps the work, then leaves — and stays put if it could not be kept. */
  const done = async () => {
    try {
      await persist();
      onBack();
    } catch {
      // The error is on screen, and the edit is still in the field.
    }
  };

  const named = displayName.trim() !== '';

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Settings</Text>
        <Button
          label={saving ? 'Saving…' : 'Done'}
          variant="ghost"
          disabled={saving}
          onPress={() => void done()}
        />
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : (
        <>
          <SectionLabel>Name</SectionLabel>
          <Card style={styles.stack}>
            <Field
              value={displayName}
              onChangeText={(v) =>
                setDisplayName(v.slice(0, MAX_DISPLAY_NAME_LENGTH))
              }
              placeholder="What people should call you"
              autoCapitalize="words"
              onBlur={() => void persist().catch(() => {})}
            />
            {!named ? (
              <Text style={styles.error}>
                A name cannot be empty — it is how everyone else finds you, so
                this one is kept until you type another.
              </Text>
            ) : null}
            <Text style={type.muted}>
              Shown wherever you appear — the roster of a channel, a contact
              list, an invitation.
            </Text>
          </Card>

          <SectionLabel>About you</SectionLabel>
          <Card style={styles.stack}>
            <Field
              value={bio}
              onChangeText={(v) => setBio(v.slice(0, MAX_BIO_LENGTH))}
              placeholder="Anything you would like people to know…"
              autoCapitalize="sentences"
              multiline
              onBlur={() => void persist().catch(() => {})}
            />

            {/* Same reasoning as a channel's description: the field shows
                markup and nowhere else will, so without a preview the only way
                to find out what it becomes is to save and come back. */}
            {bio.trim() ? (
              <View style={styles.preview}>
                <Text style={type.label}>Preview</Text>
                <InlineMarkdown text={bio} style={styles.previewText} />
              </View>
            ) : null}

            <Text style={type.muted}>
              **Bold**, *italic*, `code`, ~~strikethrough~~ and
              [links](https://example.com) work. Links open in your browser.
            </Text>
            <Text style={styles.count}>
              {bio.length} / {MAX_BIO_LENGTH}
            </Text>
          </Card>

          {/*
            After the two things that are about *you* and before the account
            itself: this is a setting about the phone, and the screen now reads
            outwards — your name, what you say about yourself, how the app
            looks, and then the account underneath all of it.
          */}
          <SectionLabel>Appearance</SectionLabel>
          <Card style={styles.stack}>
            <View style={styles.choices}>
              {(
                [
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                  ['system', 'System'],
                ] as Array<[ColorSchemePreference, string]>
              ).map(([value, label]) => (
                <Button
                  key={value}
                  label={label}
                  style={styles.choice}
                  variant={app.appearance === value ? 'primary' : 'default'}
                  onPress={() => app.setAppearance(value)}
                />
              ))}
            </View>
            <Text style={type.muted}>
              System follows the phone, and changes with it — including on a
              schedule, if you have one set.
            </Text>
          </Card>

          {/*
            Above the account itself, because it is what somebody reads *before*
            deciding either of the things underneath it.

            Guideline 5.1.1(i) asks for the policy to be reachable from inside
            the application and not only from the App Store listing, which is
            reasonable on its own terms: the listing is where you were before
            you signed up, and this is the question you have after.

            The page is served by the server it describes — `GET /privacy` — so
            the link is the API's own address and nothing new has to be
            threaded through the wire to find it.
          */}
          <SectionLabel>Privacy</SectionLabel>
          <Card style={styles.stack}>
            <Button label="Privacy policy" onPress={() => void openPrivacy()} />
            <Text style={type.muted}>
              What is stored, why, and for how long. It opens in your browser.
            </Text>
          </Card>

          <SectionLabel>Account</SectionLabel>
          <Card style={styles.stack}>
            <Button
              label="Sign out"
              onPress={() =>
                Alert.alert(
                  'Sign out?',
                  'You will need a fresh code by email to sign back in. Your channels and recordings are kept.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign out',
                      style: 'destructive',
                      onPress: () => void app.signOut(),
                    },
                  ]
                )
              }
            />
            <Text style={type.muted}>
              Signing in elsewhere signs you out here, so this is only for the
              device in your hand.
            </Text>

            {/*
              Below Sign out, in the same card, because they are the two ways
              out of an account and this is the one there is no way back from.
              Not behind a submenu and not behind a typed confirmation: it has
              to be as easy to find as signing up was, and a flow that makes
              deletion harder to finish than it needs to be is itself a review
              finding.

              What the confirmation says is the work here. "This cannot be
              undone" is true of everything destructive and tells nobody
              anything; what is not obvious is that channels are not yours to
              take with you, and somebody who discovers that afterwards has no
              remedy.
            */}
            <Button
              label={deleting ? 'Deleting…' : 'Delete account'}
              variant="danger"
              disabled={deleting}
              onPress={() =>
                Alert.alert(
                  'Delete your account?',
                  'Your address, your name, what you wrote about yourself and your contacts are removed immediately.\n\nChannels you share with other people carry on without you, and so do the recordings made in them — they belong to the channel. Channels you are the only member of are deleted with everything in them.\n\nThis cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => void remove(),
                    },
                  ]
                )
              }
            />
          </Card>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2), paddingBottom: spacing(4) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loading: { marginTop: spacing(4) },
  stack: { gap: spacing(1) },
  choices: { flexDirection: 'row', gap: spacing(1) },
  choice: { flex: 1 },
  preview: {
    gap: spacing(0.5),
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing(1.25),
  },
  previewText: { ...type.muted, lineHeight: 20 },
  count: {
    ...type.muted,
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  error: { color: colors.danger, fontSize: 13 },
});
