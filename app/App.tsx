import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/state/AppProvider';
import { AuthView } from './src/ui/AuthView';
import { HomeView } from './src/ui/HomeView';
import { SessionView } from './src/ui/SessionView';
import { colors } from './src/ui/theme';

/**
 * Three views: Auth when signed out, Session when in one, Home otherwise.
 * Sessions outlive presence, so leaving the Session screen returns to Home
 * without ending anything — the session keeps running on the server until it
 * ends or times out.
 */
function Root() {
  const { ready, token } = useApp();
  const [sessionId, setSessionId] = useState<string | null>(null);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  if (!token) return <AuthView />;

  return sessionId ? (
    <SessionView sessionId={sessionId} onExit={() => setSessionId(null)} />
  ) : (
    <HomeView onEnterSession={setSessionId} />
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
