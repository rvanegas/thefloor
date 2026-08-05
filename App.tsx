import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Account } from './src/mock/types';
import { AuthView } from './src/ui/AuthView';
import { HomeView } from './src/ui/HomeView';
import { SessionView } from './src/ui/SessionView';
import { colors } from './src/ui/theme';

/**
 * Three views, switched directly: Auth when signed out, Session when in one,
 * Home otherwise. Sessions outlive presence, so leaving only returns to Home —
 * the session itself keeps running until it ends or times out.
 */
export default function App() {
  const [me, setMe] = useState<Account | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {!me ? (
          <AuthView onSignedIn={setMe} />
        ) : sessionId ? (
          <SessionView
            me={me}
            sessionId={sessionId}
            onExit={() => setSessionId(null)}
          />
        ) : (
          <HomeView
            me={me}
            onEnterSession={setSessionId}
            onSignOut={() => {
              setSessionId(null);
              setMe(null);
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
