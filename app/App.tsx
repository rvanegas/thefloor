import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useSessionAudio } from './src/audio/useSessionAudio';
import { AppProvider, useApp } from './src/state/AppProvider';
import { AuthView } from './src/ui/AuthView';
import { HomeView } from './src/ui/HomeView';
import { ProfileView } from './src/ui/ProfileView';
import { ChannelView } from './src/ui/ChannelView';
import { colors } from './src/ui/theme';

/**
 * Four screens: Auth when signed out, Channel when you are looking at one,
 * your Profile when you open it, Home otherwise.
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
  const [profileOpen, setProfileOpen] = useState(false);

  const view = app.channelView;
  const me = app.me?.id ?? '';
  const live =
    view && view.channel.status === 'active' && view.channel.present.includes(me)
      ? view.channel
      : null;

  const audio = useSessionAudio(
    live ? live.id : null,
    token,
    !!live?.selfMuted[me]
  );

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

  // Reached from Home rather than from a channel: a profile is about you, not
  // about whichever conversation you happen to be in.
  if (profileOpen) return <ProfileView onBack={() => setProfileOpen(false)} />;

  return (
    <HomeView
      onEnterChannel={setChannelId}
      onOpenProfile={() => setProfileOpen(true)}
      // What Home needs to show that a conversation is still going without you
      // looking at it. An open microphone behind a screen that gives no sign of
      // it is the one thing this change could plausibly make worse.
      liveChannel={
        live
          ? {
              channelId: live.id,
              title: titleOf(live.name, view!.participants, me),
              present: live.present.length,
            }
          : null
      }
      onReturnToChannel={setChannelId}
    />
  );
}

/**
 * What to call a channel on screen: its name if it has one, otherwise the
 * roster — the other person, or a head count.
 *
 * The same fallback the channel's own header uses, so a channel does not
 * answer to one thing in one place and another somewhere else.
 */
function titleOf(
  name: string | null,
  participants: Array<{ id: string; displayName: string }>,
  me: string
): string {
  if (name) return name;
  const others = participants.filter((p) => p.id !== me);
  return others.length === 1
    ? others[0].displayName
    : `${others.length + 1} people`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
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
