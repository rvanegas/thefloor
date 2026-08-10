import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/state/AppProvider';
import { AuthView } from './src/ui/AuthView';
import { HomeView } from './src/ui/HomeView';
import { ProfileView } from './src/ui/ProfileView';
import { ChannelView } from './src/ui/ChannelView';
import { colors } from './src/ui/theme';

/**
 * Four views: Auth when signed out, Channel when in one, your Profile when you
 * open it, Home otherwise.
 *
 * Channels outlive presence, so leaving the Channel screen returns to Home
 * without ending anything — the channel keeps running on the server until its
 * last member leaves it.
 */
function Root() {
  const { ready, token } = useApp();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

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
      <ChannelView channelId={channelId} onExit={() => setChannelId(null)} />
    );
  }

  // Reached from Home rather than from a channel: a profile is about you, not
  // about whichever conversation you happen to be in.
  if (profileOpen) return <ProfileView onBack={() => setProfileOpen(false)} />;

  return (
    <HomeView
      onEnterChannel={setChannelId}
      onOpenProfile={() => setProfileOpen(true)}
    />
  );
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
