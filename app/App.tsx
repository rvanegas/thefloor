import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useSessionAudio } from './src/audio/useSessionAudio';
import { useKnockNudge } from './src/audio/useKnockNudge';
import { useSilencedNudge } from './src/audio/useSilencedNudge';
import { AppProvider, useApp } from './src/state/AppProvider';
import { recordEvent } from './src/audio/diagnostics';
import { liveChannelView } from './src/state/live';
import { AuthView } from './src/ui/AuthView';
import { HomeView } from './src/ui/HomeView';
import { HomeSettingsView } from './src/ui/HomeSettingsView';
import { ContactsView } from './src/ui/ContactsView';
import { SupportView } from './src/ui/SupportView';
import { LeaderboardView } from './src/ui/LeaderboardView';
import { ChannelView } from './src/ui/ChannelView';
import { UpdateRequiredView } from './src/ui/UpdateRequiredView';
import {
  anyMicrophoneOpen,
  channelHasAudio,
  microphoneNeeded,
} from '../core/micNeeded';
import { describeChannel } from '../core/naming';
import { colors } from './src/ui/theme';

/**
 * Auth when signed out, Channel when you are looking at one, Settings or
 * Support or the contact list when you open them, Home otherwise.
 *
 * A profile is not among them, and has not been since the contact list became
 * a screen. `ContactsView` and `ChannelView` each open the profiles they are
 * about and own the state for it — routing that through here would put this
 * component in the business of knowing which screen a profile was opened from
 * so it could decide where closing one goes back to.
 *
 * **Presence is not a screen.** The audio connection is held here rather than
 * inside the channel screen, so walking back to Home leaves you in the
 * conversation — you can look up who else is around, or read a contact's
 * profile, without hanging up. The reducer has always treated presence and
 * navigation as different things; until this moved, the app was the only place
 * that conflated them, and a back button would silently have ended the call.
 *
 * What the connection follows is the channel you are *present in*, which the
 * server reports, rather than the channel whose screen happens to be mounted.
 */
function Root() {
  const app = useApp();
  const { ready, token } = app;
  const [channelId, setChannelId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The screen explaining what donating is for, reached from Home. */
  const [supportOpen, setSupportOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  /**
   * The contact list, reached from Home. It owns its own settings screen and
   * its own profile screen, the way ChannelView does — the three of them are
   * one scope, and routing them through here would put this component in the
   * business of knowing which profile was opened from where.
   */
  const [contactsOpen, setContactsOpen] = useState(false);

  const me = app.me?.id ?? '';
  // Where this person is standing, across every snapshot held rather than read
  // off whichever one arrived last — which is what used to hang the audio up
  // when a channel nobody was looking at changed. See state/live.ts.
  const view = liveChannelView(app.channelViews, me);
  // Nothing is live once this build is expired, whatever the last snapshot to
  // arrive said. The provider has already hung the socket up; this is the
  // audio, which follows the channel rather than the socket and would
  // otherwise keep a microphone open behind a screen that says to update.
  //
  // Nor once another of this account's devices has stepped into a channel.
  // The snapshot may well still say this person is present — they are, on the
  // phone in their hand — and one account has one voice, so the microphone
  // here has to close whatever the roster says. See AppProvider.displaced.
  const live = view && !app.expired && !app.displaced ? view.channel : null;

  // Or asked for and not yet confirmed. The rule in `microphoneNeeded` is
  // right — a recording is something listening, so it opens the microphone —
  // but it reads server state, which arrives a round trip after the tap. That
  // round trip is when capture starts against nobody publishing, and a short
  // run ended having recorded nothing at all. See AppProvider.recordingAsked.
  const micNeeded =
    !!live && (microphoneNeeded(live, me) || app.recordingAsked === live.id);

  // What the *session* is configured from, where `micNeeded` decides only
  // whether we publish.
  //
  // **The one place the two audio-session rules are chosen between, and the
  // only place either is called.** Off — the default, and what has shipped
  // since 2026-08-18 — asks whether anybody present is capturing, so a room
  // that goes quiet hands the Bluetooth route back to full quality. On holds
  // the hands-free link for as long as this app has any audio at all, so the
  // link does not move under the first word somebody says. core/micNeeded.ts
  // carries the whole argument and says why this is a setting rather than a
  // decision.
  //
  // Same round-trip caveat as `micNeeded` above, and the same answer either
  // way: a recording asked for and not yet confirmed is audio here too.
  const hasAudio =
    !!live &&
    ((app.steadyHeadset ? channelHasAudio(live, me) : anyMicrophoneOpen(live)) ||
      app.recordingAsked === live.id);

  const audio = useSessionAudio(
    // Keyed on the audio rather than on the channel, which are no longer the
    // same thing: a conversation that moves takes its room with it, and this
    // hook tearing down and rebuilding on the new channel id would turn pure
    // bookkeeping into a dropped call for everybody in it.
    live ? live.mediaRoom : null,
    live ? live.id : null,
    token,
    !!live?.selfMuted[me],
    micNeeded,
    hasAudio
  );

  /**
   * Told without words that you are talking to nobody.
   *
   * Here rather than in `ChannelView` for the same reason the audio is: it
   * follows presence, and the person who most needs it is the one not looking
   * at the channel screen. See `useSilencedNudge`.
   */
  useSilencedNudge(live, me, audio.speaking);

  /**
   * Told that somebody is at the door, which is a question waiting on an
   * answer from whoever is in the room. Here rather than on the channel screen
   * for the reason above it.
   */
  useKnockNudge(live);

  /**
   * Which screen you are on, in the audio log.
   *
   * Instrumentation only, and it is here because the log could not see the one
   * move TASKS § *Stepping Back In* is about: leaving the channel screen for
   * Home and coming back is not an `AppState` change, not a route change and
   * not a session write, so the whole reproduction happened between two log
   * lines with nothing in between. Presence is deliberately not navigation —
   * the audio hook lives above this switch precisely so that walking to Home
   * does not hang up — which is exactly what makes a navigation marker worth
   * stamping next to the engine's transitions rather than assumed from them.
   *
   * `recordEvent` is called by every build for every account and costs a
   * string in a forty-element ring; only an account with the `debug` column
   * can read it back.
   */
  useEffect(() => {
    recordEvent(channelId ? 'screen channel' : 'screen home');
  }, [channelId]);

  /**
   * Which audio-session rule is in force, in the audio log.
   *
   * Instrumentation only, and next to the marker above for the same reason:
   * the log is the one instrument that shows *ordering*, and flipping this
   * setting mid-channel is a session write with no other cause. Without a line
   * for it the log shows a configuration changing while nothing in the channel
   * changed, which is the shape of every bug this subsystem has had — so the
   * instrument would be manufacturing a false alarm out of somebody's thumb.
   *
   * **Fires on mount as well as on change**, which is deliberate and is the
   * more important half: HF-ONLY-WALK.md § *What you need* asks for every case
   * to be run twice under the two rules, and two logs that do not say which
   * rule produced them cannot be compared at all. The setting is persisted per
   * phone, so the mount line is often the only one there will be.
   *
   * `App.tsx` rather than `AppProvider`, with the other instrumentation, and
   * for the reason `core/micNeeded.ts` gives: this is the one place either
   * rule is chosen between, and a marker written anywhere else would be
   * claiming something it does not see.
   */
  useEffect(() => {
    recordEvent(`steady headset ${app.steadyHeadset ? 'on' : 'off'}`);
  }, [app.steadyHeadset]);

  /**
   * Follow a conversation that has changed channels.
   *
   * Only when this screen is on the channel it left — a move you are not
   * looking at is Home's business, and it shows the destination as a row like
   * any other. The socket has already switched what it watches, so the
   * snapshot for the new channel is on its way or already here.
   */
  const { movedChannel } = app;
  useEffect(() => {
    if (!movedChannel) return;
    setChannelId((current) =>
      current === movedChannel.from ? movedChannel.to : current
    );
  }, [movedChannel]);

  /**
   * A tap on a notification, once there is somewhere to land.
   *
   * Deferred until signed in and ready rather than acted on where it arrives:
   * a tap that launched the app is read while the stored token is still being
   * restored, and navigating then would drop the person into an empty channel
   * screen — or, signed out, behind the sign-in form.
   *
   * The channel is watched as well as shown, because arriving this way skips
   * every path that would otherwise have subscribed to it.
   */
  const { pendingChannelId, clearPendingChannel, watchChannel } = app;
  useEffect(() => {
    if (!pendingChannelId || !ready || !token) return;
    watchChannel(pendingChannelId);
    setChannelId(pendingChannelId);
    // Every screen stacked over Home closes: a tap on a notification means go
    // to that conversation, and coming back to a settings screen you had left
    // open would be a surprise.
    setSettingsOpen(false);
    setSupportOpen(false);
    setContactsOpen(false);
    clearPendingChannel();
  }, [pendingChannelId, ready, token, watchChannel, clearPendingChannel]);

  /**
   * Signing out closes every screen stacked over Home.
   *
   * **This component does not unmount when the session ends.** A null `token`
   * changes what `Root` renders, not whether it exists, so without this each of
   * these outlives the account that opened it. Signing out is only reachable
   * from the settings screen, which made the settings case certain rather than
   * occasional: sign out, sign in, and you were looking at Settings again,
   * holding the previous session's `settingsOpen`.
   *
   * `channelId` is the one worth closing on its own account. Signing out inside
   * a channel and back in as somebody else left this rendering `ChannelView`
   * for a channel the new account may not be a member of — the server refuses
   * the snapshot, so it is a confused screen rather than a leak, but it is the
   * same staleness and it has no business surviving.
   *
   * Keyed on the token being gone rather than on it changing, because a
   * sign-in always passes through null within a session, while a token
   * refreshed for the same account should disturb nothing.
   */
  useEffect(() => {
    if (token) return;
    setChannelId(null);
    setSettingsOpen(false);
    setSupportOpen(false);
    setContactsOpen(false);
  }, [token]);

  /**
   * Below the server's floor, and therefore not an app any more.
   *
   * Ahead of `ready` and of the token, because both of those are about a
   * session this build should not be starting: the restore that `ready` waits
   * for ends in a request whose answer this build may no longer read
   * correctly. The hooks above still run — they must, unconditionally — but
   * every one of them is inert with no socket and no live channel.
   */
  if (app.expired) return <UpdateRequiredView />;

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  if (!token) return <AuthView />;

  if (channelId) {
    return (
      <ChannelView
        channelId={channelId}
        audio={audio}
        // Off this screen without leaving the channel. Deliberately not
        // `leaveChannelView`: that unwatches, and the snapshot it drops is
        // what tells this component you are still present.
        onHome={() => setChannelId(null)}
        onExit={() => setChannelId(null)}
      />
    );
  }

  // Reached from Home rather than from a channel, because what is in here is
  // about you rather than about whichever conversation you happen to be in.
  if (settingsOpen) {
    return <HomeSettingsView onBack={() => setSettingsOpen(false)} />;
  }

  // Reached from Home and from nowhere else, and offered only to an account
  // that has been granted it by hand. `app.leaderboard` comes from `hello`, so
  // revoking the column closes the way in at the next connection.
  if (leaderboardOpen) {
    return <LeaderboardView onBack={() => setLeaderboardOpen(false)} />;
  }

  if (supportOpen) {
    return <SupportView onBack={() => setSupportOpen(false)} />;
  }

  if (contactsOpen) {
    return (
      <ContactsView
        onHome={() => setContactsOpen(false)}
        // A profile opened from the contact list lists the channels the two of
        // you share, and tapping one goes there. The list closes behind it:
        // the channel screen's way out is a button that says Home, and leaving
        // this open under it would make that button land somewhere else. Same
        // rule the notification tap follows above.
        onEnterChannel={(id) => {
          setContactsOpen(false);
          setChannelId(id);
        }}
      />
    );
  }

  return (
    <HomeView
      onEnterChannel={setChannelId}
      onOpenContacts={() => setContactsOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenSupport={() => setSupportOpen(true)}
      onOpenLeaderboard={
        app.leaderboard ? () => setLeaderboardOpen(true) : undefined
      }
      // What Home needs to show that a conversation is still going without you
      // looking at it. An open microphone behind a screen that gives no sign of
      // it is the one thing this change could plausibly make worse.
      liveChannel={
        live
          ? {
              channelId: live.id,
              title: titleOf(live.name, view!.participants, me),
              present: live.present.length,
              muted: !!live.selfMuted[me],
            }
          : null
      }
      onReturnToChannel={setChannelId}
    />
  );
}

/**
 * What to call a channel on screen: its name if it has one, otherwise the
 * roster.
 *
 * Shares `describeChannel` with every other surface, which it did not when it
 * was written out longhand here — this was a fourth copy of the fallback, and
 * it still said "3 people" after the others had stopped.
 */
function titleOf(
  name: string | null,
  participants: Array<{ id: string; displayName: string }>,
  me: string
): string {
  if (name) return name;
  return describeChannel(
    participants.filter((p) => p.id !== me).map((p) => p.displayName)
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        <AppProvider>
          <Root />
        </AppProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
