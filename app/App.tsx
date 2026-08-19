import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useSessionAudio } from './src/audio/useSessionAudio';
import { AppProvider, useApp } from './src/state/AppProvider';
import { liveChannelView } from './src/state/live';
import { AuthView } from './src/ui/AuthView';
import { HomeView } from './src/ui/HomeView';
import { HomeSettingsView } from './src/ui/HomeSettingsView';
import { SupportView } from './src/ui/SupportView';
import { ChannelView } from './src/ui/ChannelView';
import { ProfileView } from './src/ui/ProfileView';
import { UpdateRequiredView } from './src/ui/UpdateRequiredView';
import { anyMicrophoneOpen, microphoneNeeded } from '../core/micNeeded';
import { describeChannel } from '../core/naming';
import { colors } from './src/ui/theme';

/**
 * Auth when signed out, Channel when you are looking at one, Settings or
 * Support or a profile when you open them, Home otherwise.
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
  /** Somebody's profile, opened from a channel roster. */
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(
    null
  );

  const me = app.me?.id ?? '';
  // Where this person is standing, across every snapshot held rather than read
  // off whichever one arrived last — which is what used to hang the audio up
  // when a channel nobody was looking at changed. See state/live.ts.
  const view = liveChannelView(app.channelViews, me);
  // Nothing is live once this build is expired, whatever the last snapshot to
  // arrive said. The provider has already hung the socket up; this is the
  // audio, which follows the channel rather than the socket and would
  // otherwise keep a microphone open behind a screen that says to update.
  const live = view && !app.expired ? view.channel : null;

  // Or asked for and not yet confirmed. The rule in `microphoneNeeded` is
  // right — a recording is something listening, so it opens the microphone —
  // but it reads server state, which arrives a round trip after the tap. That
  // round trip is when capture starts against nobody publishing, and a short
  // run ended having recorded nothing at all. See AppProvider.recordingAsked.
  const micNeeded =
    !!live && (microphoneNeeded(live, me) || app.recordingAsked === live.id);

  // What the *session* is configured from, where `micNeeded` decides only
  // whether we publish. The two differ in exactly one case — self-muted while
  // somebody else is still talking — and keeping the session a call across it
  // is what stops a Bluetooth route being lost to a profile handover nobody
  // needed. Same round-trip caveat as above, and the same answer: a recording
  // asked for and not yet confirmed already opens a microphone here.
  const anyMicOpen =
    !!live && (anyMicrophoneOpen(live) || app.recordingAsked === live.id);

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
    anyMicOpen
  );

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
    setProfile(null);
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

  // The settings screen opens this, on you, which is the only way to read your
  // own profile as a contact reads it. It sits **above** the settings case
  // rather than below: closing it returns to whatever was underneath, which is
  // Settings when Settings opened it and Home otherwise, without either of them
  // having to know.
  //
  // The channel roster opens it too, from inside ChannelView. Home does not —
  // the contact rows that used to are gone, Home being a list of channels now,
  // and the Contacts View will bring that back; see planning/TASKS.md.
  if (profile) {
    return (
      <ProfileView
        accountId={profile.id}
        fallbackName={profile.name}
        onBack={() => setProfile(null)}
        onEnterChannel={(id) => {
          setProfile(null);
          // Leaving for a channel is leaving the settings screen too, whatever
          // it was doing underneath — walking back out of a conversation to a
          // settings form nobody remembers opening is the surprise this avoids.
          setSettingsOpen(false);
          setChannelId(id);
        }}
      />
    );
  }

  // Reached from Home rather than from a channel, because what is in here is
  // about you rather than about whichever conversation you happen to be in.
  if (settingsOpen) {
    return (
      <HomeSettingsView
        onBack={() => setSettingsOpen(false)}
        onOpenProfile={
          app.me
            ? () => setProfile({ id: app.me!.id, name: app.me!.displayName })
            : undefined
        }
      />
    );
  }

  if (supportOpen) {
    return <SupportView onBack={() => setSupportOpen(false)} />;
  }

  return (
    <HomeView
      onEnterChannel={setChannelId}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenSupport={() => setSupportOpen(true)}
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
