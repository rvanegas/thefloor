import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../api/config';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen, SectionLabel } from './components';
import { colors, spacing, type } from './theme';
import type { ColorSchemePreference } from './appearance';

/**
 * The app and the account: how it looks, what it stores, and the two ways out.
 *
 * **Your name and your bio are not here.** They were, and they moved to
 * ContactsSettingsView, behind the contact list — that is the scope they
 * belong to, a name being how a contact finds you and a bio being what a
 * contact reads. What is left is the scope Home actually owns, and it no
 * longer writes anything: appearance takes effect on the tap, signing out and
 * deleting take effect on the confirmation, and there is nothing on this
 * screen to lose by leaving it. The awaited save, the baseline ref and the
 * "Saving…" label went with the fields that needed them.
 *
 * One of the three settings screens, one per scope, each reached from the
 * screen whose scope it is: this one from Home, ContactsSettingsView from the
 * contact list, ChannelSettingsView from a channel.
 */
export function HomeSettingsView({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Settings</Text>
        {/* "Back" rather than "Home", which is what it said while this screen
            was reachable from one place. It is not: the way off a settings
            screen names the act rather than the destination, so the three of
            them read alike and none of them has to be kept in step with where
            it was opened from. */}
        <Button label="Back" variant="ghost" onPress={onBack} />
      </View>

      {/*
        Appearance first, then what somebody reads before deciding either of
        the things under it, then the account itself. The screen reads outwards:
        the phone, the policy, and then the account underneath both.
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
  stack: { gap: spacing(1) },
  choices: { flexDirection: 'row', gap: spacing(1) },
  choice: { flex: 1 },
  error: { color: colors.danger, fontSize: 13 },
});
