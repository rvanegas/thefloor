import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen } from './components';
import { spacing, type } from './theme';

/**
 * What an install below the server's compatibility floor sees instead of the
 * app.
 *
 * **Instead of, rather than over.** Root returns this before it looks at the
 * token, so there is no screen behind it and nothing to dismiss it back to:
 * the point of the floor is that this build's requests are no longer answered
 * the way its screens assume, and a banner over a working-looking Home would
 * leave every one of those screens reachable. Signing in is refused for the
 * same reason — it is the path most likely to have moved underneath an old
 * build, and there is nothing worth signing in for.
 *
 * The button is absent when the server has not been told where updates come
 * from. A dead link is worse than a sentence, and the sentence alone is enough
 * for the one action available to anybody reading this. See
 * BuildOptions.updateUrl on the server.
 */
export function UpdateRequiredView() {
  const { updateUrl } = useApp();

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.stack}>
        <Text style={type.title}>Time to update</Text>
        <Card style={styles.stack}>
          <Text style={type.body}>
            This version of The Floor is too old for the server it talks to, so
            it has stopped rather than showing you something it cannot promise
            is true.
          </Text>
          <Text style={type.muted}>
            Update from the App Store and everything — your channels, your
            contacts, your recordings — will be where you left it.
          </Text>
        </Card>
        {updateUrl ? (
          <Button
            label="Open the App Store"
            variant="primary"
            onPress={() => void Linking.openURL(updateUrl)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing(2) },
  stack: { gap: spacing(2) },
});
