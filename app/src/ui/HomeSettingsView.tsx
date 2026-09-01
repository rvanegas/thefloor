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
 * **Your name is not here.** It was, along with a bio there no longer is, and
 * they went first to a settings screen behind the contact list and then, on
 * 2026-08-29, into your own profile — which is what they always described, and
 * which now shows what is left of them as fields when Edit is tapped. See ProfileView. What is left is the scope
 * Home actually owns, and **nothing here is a form**: every setting takes
 * effect on the tap and signing out and deleting take effect on the
 * confirmation, so there is nothing on this screen to lose by leaving it. The
 * awaited save, the baseline ref and the "Saving…" label went with the fields
 * that needed them, and did not come back when two of these settings moved to
 * the account on 2026-08-31 — that write is sent behind the tap rather than
 * waited on. See `AppProvider`.
 *
 * **Two scopes on one screen, which is the thing to know before editing it.**
 * The scheme, the tap and the control cards belong to the person and follow
 * them onto the next phone; keeping the headset connection steady belongs to
 * this phone, because
 * what it trades is a property of the headset. The Headphones card says so in
 * as many words, since a screen where some settings sync and others do not is
 * only honest if it admits which is which.
 *
 * One of the two settings screens, one per scope, each reached from the screen
 * whose scope it is: this one from Home, ChannelSettingsView from a channel.
 * There was a third, for the contact list; a scope whose whole content is one
 * person's own account turned out to be that person's profile rather than a
 * scope.
 */
export function HomeSettingsView({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const [deleting, setDeleting] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
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

  /**
   * Signs out every other device, and reports how many there were.
   *
   * The count is the whole of what can be said afterwards. Nothing lists
   * sessions — there is no screen of devices to strike a row from — so the
   * only evidence this did anything is the number the server answers with, and
   * an alert is the honest place for it. Zero is worth saying too: somebody
   * who pulled this lever because a phone went missing has learnt that the
   * phone was not signed in.
   */
  const signOutOthers = async () => {
    setSigningOutOthers(true);
    setError(null);
    try {
      const sessions = await app.signOutOthers();
      Alert.alert(
        sessions === 0 ? 'Nothing else was signed in' : 'Other devices signed out',
        sessions === 0
          ? 'This is the only device signed in to your account.'
          : sessions === 1
            ? 'One other device was signed out. It will need a fresh code by email.'
            : `${sessions} other devices were signed out. They will need a fresh code by email.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningOutOthers(false);
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
        Behaviour first, then appearance, then what somebody reads before
        deciding either of the things under it, then the account itself. The
        screen reads outwards: the app, the phone, the policy, and then the
        account underneath all three.

        The tap is at the top because it is the only setting here that changes
        what a tap *does*, and the tap it changes is the one somebody makes
        most often. Everything below this section changes how something looks
        or ends.
      */}
      <SectionLabel>Channels</SectionLabel>
      <Card style={styles.stack}>
        <Text style={type.heading}>Tap a channel to step in</Text>
        <View style={styles.choices}>
          {(
            [
              [true, 'On'],
              [false, 'Off'],
            ] as Array<[boolean, string]>
          ).map(([value, label]) => (
            <Button
              key={label}
              label={label}
              style={styles.choice}
              variant={app.tapToStepIn === value ? 'primary' : 'default'}
              onPress={() => app.setTapToStepIn(value)}
            />
          ))}
        </View>
        <Text style={type.muted}>
          On, tapping a channel walks you into it and everyone there can hear
          you. Off, it only opens the channel — you can see who is around and
          read what has been shared, and step in when you mean to.
        </Text>
      </Card>

      {/*
        Second in the same section, because it is the other thing that changes
        what a channel screen is, and it is below the tap because the tap
        decides whether you arrive at all.

        Named by what it draws rather than by a word like "compact", and the
        second paragraph names what goes with the cards. Somebody turning this
        off is giving up the sentence that says why the floor is refused and
        the countdown on the claim, and a screen that quietly stopped
        explaining itself would be discovered at exactly the moment the
        explanation was wanted. The recording warning is called out as staying
        because it is the one thing here that is not a convenience.
      */}
      <Card style={styles.stack}>
        <Text style={type.heading}>Repeat the channel controls as cards</Text>
        <View style={styles.choices}>
          {(
            [
              [true, 'On'],
              [false, 'Off'],
            ] as Array<[boolean, string]>
          ).map(([value, label]) => (
            <Button
              key={label}
              label={label}
              style={styles.choice}
              variant={app.controlCards === value ? 'primary' : 'default'}
              onPress={() => app.setControlCards(value)}
            />
          ))}
        </View>
        <Text style={type.muted}>
          A channel keeps the floor, your microphone and the way out under your
          thumb at all times. On, each of them also has a card further down the
          screen. Off, the bar is the whole of them and the screen below is who
          is in the room and what the room is carrying.
        </Text>
        <Text style={type.muted}>
          What goes with the cards: the sentence saying why a control is
          refused, and the floor's countdown. Two things stay either way — that
          a silenced microphone is still being recorded, and that you are in
          this channel on another device.
        </Text>
      </Card>

      {/*
        Second because it is the other setting that changes what the app
        *does* rather than how it looks, and it is below the tap because far
        fewer people will have a reason to touch it: it only means anything to
        somebody wearing Bluetooth headphones who has noticed the switch.

        Worded in what is audible rather than in what is true. The mechanism is
        a Bluetooth profile handover between A2DP and the hands-free link, and
        naming either would put a word in front of somebody that tells them
        nothing about which answer they want. What they can hear is that the
        sound changes, and that the first word after it sometimes suffers.
      */}
      <SectionLabel>Headphones</SectionLabel>
      <Card style={styles.stack}>
        <Text style={type.heading}>Keep the connection steady</Text>
        <View style={styles.choices}>
          {(
            [
              [true, 'On'],
              [false, 'Off'],
            ] as Array<[boolean, string]>
          ).map(([value, label]) => (
            <Button
              key={label}
              label={label}
              style={styles.choice}
              variant={app.steadyHeadset === value ? 'primary' : 'default'}
              onPress={() => app.setSteadyHeadset(value)}
            />
          ))}
        </View>
        <Text style={type.muted}>
          Bluetooth headphones sound better when nobody is talking, and have to
          switch when somebody starts. On, they stay on the talking connection
          for as long as you are in a channel — quieter sound throughout, and
          nothing switches under the first word. Off, the sound improves
          whenever the room goes quiet and switches back when it does not.
        </Text>
        {/*
          Said out loud because the other two stopped being true of it on
          2026-08-31. The scheme and the tap follow the account and turn up on
          the next phone; this one does not, since what it trades is a property
          of the headset rather than of the person wearing it. A screen where
          two settings sync and one does not, silently, is a screen that has
          lied to somebody by the time they notice.
        */}
        <Text style={type.muted}>Kept on this phone, not on your account.</Text>
      </Card>

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
          Only this device. Anywhere else you are signed in stays signed in.
        </Text>

        {/*
          Beside Sign out because it is the same act aimed the other way, and
          it is here rather than behind a list of devices because there is no
          such list: a session is a token, and the server knows when each was
          minted and nothing else about the phone that holds it. A row reading
          "iOS, 3 August" is not something anybody can recognise their own lost
          handset in, so the screen offers the decision it can actually be
          asked — everything but this one — instead of a list to pick from.

          It is also the whole of what replaces the old rule. Signing in used
          to sign out everywhere else, which meant a lost phone was revoked by
          the owner signing in again anywhere; several sessions at once cost
          that for free, and this is where it comes back as something done on
          purpose.
        */}
        <Button
          label={signingOutOthers ? 'Signing out…' : 'Sign out other devices'}
          disabled={signingOutOthers}
          onPress={() =>
            Alert.alert(
              'Sign out other devices?',
              'Every other phone, tablet or computer signed in to your account is signed out. This device stays signed in. Your channels and recordings are kept.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign out others',
                  style: 'destructive',
                  onPress: () => void signOutOthers(),
                },
              ]
            )
          }
        />
        <Text style={type.muted}>
          For a phone you have lost. It is the only way to end a session from a
          device you no longer have.
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
