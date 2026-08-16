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
import { describeChannel } from '../core/naming';
import { microphoneNeeded } from './src/audio/micNeeded';
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
  /** Somebody's profile, opened from a contact row. */
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(
    null
  );

  const me = app.me?.id ?? '';
  // Where this person is standing, across every snapshot held rather than read
  // off whichever one arrived last — which is what used to hang the audio up
  // when a channel nobody was looking at changed. See state/live.ts.
  const view = liveChannelView(app.channelViews, me);
  const live = view ? view.channel : null;

  const micNeeded = !!live && microphoneNeeded(live, me);

  const audio = useSessionAudio(
    // Keyed on the audio rather than on the channel, which are no longer the
    // same thing: a conversation that moves takes its room with it, and this
    // hook tearing down and rebuilding on the new channel id would turn pure
    // bookkeeping into a dropped call for everybody in it.
    live ? live.mediaRoom : null,
    live ? live.id : null,
    token,
    !!live?.selfMuted[me],
    micNeeded
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

  if (supportOpen) {
    return <SupportView onBack={() => setSupportOpen(false)} />;
  }

  if (profile) {
    return (
      <ProfileView
        accountId={profile.id}
        fallbackName={profile.name}
        onBack={() => setProfile(null)}
        onEnterChannel={(id) => {
          setProfile(null);
          setChannelId(id);
        }}
      />
    );
  }

  return (
    <HomeView
      onEnterChannel={setChannelId}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenProfile={(id, name) => setProfile({ id, name })}
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
