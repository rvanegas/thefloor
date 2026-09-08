import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../api/config';
import { useApp } from '../state/AppProvider';
import { forgetInstall } from '../state/storage';
import {
  Button,
  Card,
  IconButton,
  Screen,
  SectionLabel,
} from './components';
import { CloseIcon } from './icons';
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
 * **One scope, since 2026-09-05.** The scheme, the tap and the control cards
 * all belong to the person and follow them onto the next phone. There used to
 * be a second scope here — *Headphones → Keep the connection steady* was the
 * phone's rather than the person's, because what it traded was a property of
 * the headset in your ears — and the card admitted so in as many words. It went
 * when the playout fix made its choice unreachable; see `channelHasAudio` in
 * core/micNeeded.ts. If a phone-scoped setting is ever added back, say so on
 * the card again: a screen where some settings sync and others do not is only
 * honest if it admits which is which.
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
  const [forgetting, setForgetting] = useState(false);
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
   * Clears everything this device has stored, and ends the session with it.
   *
   * **Signing out first, and it is not merely tidiness**: the sign-out request
   * carries this phone's push address so the server drops the row, and it
   * needs the token that the next line is about to delete. Doing it the other
   * way round leaves the server holding an address for an install that has
   * forgotten it has one.
   *
   * The sign-out is also what puts the app back on the auth screen, so there
   * is nothing to navigate afterwards. Failures are swallowed on purpose —
   * a server that cannot be reached must not stop this device forgetting
   * itself, which is the whole of what was asked for.
   */
  const forget = async () => {
    setForgetting(true);
    try {
      await app.signOut();
    } catch {
      // Offline, or a session the server has already revoked. Neither is a
      // reason to keep the keychain.
    }
    await forgetInstall();
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
        {/* "Close" rather than "Home", which is what it said while this screen
            was reachable from one place, and rather than "Back", which is what
            it said while a phone was the only shape this app had.

            The way off a settings screen names the act rather than the
            destination, so none of them has to be kept in step with where it
            was opened from — and *Back* names a destination by implication.
            On a phone it means "reveal what is underneath"; beside a list
            there is nothing underneath, since the list is next to this rather
            than behind it, and all the control can do is empty the pane.
            *Close* is true in both, which is what lets the handler be the same
            one word in both layouts with no `split` anywhere in it. Every
            attempt to make the wording pane-dependent puts that conditional
            back. See planning/decisions/DECISIONS.md.

            **It is a cross rather than the word, since 2026-09-02**, and every
            argument above survives that intact: the word is still there as the
            `accessibilityLabel`, which is what a screen reader reads and what
            the tests press by, so what changed is what is drawn and not what
            this control is called. An arrow would have undone it — that is a
            destination again, and there is no destination in a split. See
            `IconButton` and `CloseIcon`. */}
        <IconButton
          label="Close"
          icon={(color) => <CloseIcon color={color} />}
          onPress={onBack}
        />
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
      {/*
        Both of them in one card rather than two, since 2026-08-31. They are
        the same question asked twice — how much of a channel screen you want
        — and two cards under one label read as two subjects rather than one
        with two dials. The hairline between them is what a card gives up when
        it stops being one setting: enough of a seam that the second heading is
        obviously a new question, and not so much that the two stop belonging
        together. The tap is above the rule for the reason the section comment
        gives; the cards are about the same screen once you are looking at it.
      */}
      <Card style={styles.stack}>
        <Text style={type.heading}>Tap a channel to look, not step in</Text>
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
              variant={app.tapToLook === value ? 'primary' : 'default'}
              onPress={() => app.setTapToLook(value)}
            />
          ))}
        </View>
        <Text style={type.muted}>
          Off, which is where everybody starts: tapping a channel walks you
          into it and everyone there can hear you. On, a tap only opens the
          channel — you can see who is around and read what has been shared,
          and step in when you mean to.
        </Text>

        <View style={styles.divider} />

        {/*
          Named by what it stops drawing rather than by a word like "compact",
          and the second paragraph names what goes with the cards. Named for
          the departure, like the tap above it and Labs below, so that Off is
          the untouched answer on every setting here — see
          DEFAULT_ACCOUNT_SETTINGS in core/settings.ts. What goes is a way
          of doing something a second time and nothing else: the floor keeps
          its card, minus the button, so the countdown and the sentence saying
          why a claim is refused stay on the screen either way. A setting that
          quietly stopped a screen explaining itself would be discovered at
          exactly the moment the explanation was wanted.
        */}
        <Text style={type.heading}>Hide the repeated channel controls</Text>
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
              variant={app.hideControlCards === value ? 'primary' : 'default'}
              onPress={() => app.setHideControlCards(value)}
            />
          ))}
        </View>
        <Text style={type.muted}>
          A channel keeps the floor, your microphone and the way out under your
          thumb at all times. Off, which is where everybody starts, each of
          them also has a card further down the screen. On, the bar is the
          whole of them and the screen below is who is in the room and what the
          room is carrying.
        </Text>
        <Text style={type.muted}>
          The floor is the exception: its card stays either way, with the
          countdown and the reason a claim is refused, and only the button on
          it goes. Two more things stay whichever way this is set — that a
          silenced microphone is still being recorded, and that you are in this
          channel on another device.
        </Text>
      </Card>

      {/*
        Under the two settings about how channels behave and above appearance,
        which is where it belongs by subject rather than by importance: it is
        the third thing on this screen that changes the app, and the two above
        it are the ones somebody actually came here for. Not at the bottom
        beside the account, which is where a screen puts what it is slightly
        ashamed of — this is opt-in and unfinished, not dangerous, and the card
        says which.
      */}
      <SectionLabel>Labs</SectionLabel>
      <Card style={styles.stack}>
        <Text style={type.heading}>Show experimental features</Text>
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
              variant={app.labs === value ? 'primary' : 'default'}
              onPress={() => app.setLabs(value)}
            />
          ))}
        </View>
        {/*
          Named rather than described, because the whole point of the switch is
          that somebody can tell afterwards what appeared. "Experimental
          features" alone is a setting whose effect nobody can find.
        */}
        <Text style={type.muted}>
          Off, which is where everybody starts. On, two unfinished things
          appear: transcripts of your recordings, and watching a video together
          in a channel. They can change or go away.
        </Text>
        <Text style={type.muted}>
          It follows your account rather than this phone, and it is only about
          you — turning it on shows these to you, not to anybody else in your
          channels.
        </Text>
      </Card>

      {/*
        **Only with Labs on**, and it is the one thing under that switch which
        is not a feature: it is here for testing what a new arrival sees, which
        is otherwise unreachable on iOS. Deleting the app does not clear the
        keychain, so a reinstall comes back signed in, with its palette, and
        remembering having been asked about notifications — and short of
        erasing the whole phone there is nothing outside the app that can
        clear that. See `state/storage.ts`.

        It cannot do the half that matters most on its own: the notification
        permission belongs to the system. So the alert says the order —
        forget, then delete, then install — because doing it the other way
        round is the mistake that wastes an afternoon.
      */}
      {app.labs ? (
        <Card style={styles.stack}>
          <Text style={type.heading}>Forget this phone</Text>
          <Button
            label={forgetting ? 'Forgetting…' : 'Forget this phone'}
            disabled={forgetting}
            onPress={() =>
              Alert.alert(
                'Forget this phone?',
                'This device forgets everything it has stored — the session, your appearance and tap settings, and that it has been asked about notifications. Your account, channels and recordings are untouched.\n\nDelete the app afterwards and install it again for a genuinely new install: the notification permission is the system’s and only deleting the app clears it.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Forget',
                    style: 'destructive',
                    onPress: () => void forget(),
                  },
                ]
              )
            }
          />
          <Text style={type.muted}>
            For seeing what somebody arriving new sees. Signing out does not do
            this, and neither does deleting the app.
          </Text>
        </Card>
      ) : null}

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
  /*
   * The seam between two settings sharing a card. A hairline rather than a
   * gap, because a gap inside a card reads as loose spacing and a rule reads
   * as a boundary; the margin is what keeps it from crowding either heading.
   */
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginVertical: spacing(1),
  },
  error: { color: colors.danger, fontSize: 13 },
});
