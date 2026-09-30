import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useText } from '../i18n';
import { spacing } from '../ui/theme';

/**
 * What a playing film says across its top edge while the app is *offline*.
 *
 * **The wall, shrunk to a strip because the film is the one thing still
 * working.** Offline means the socket to this server, not the network, and the
 * film is fed by YouTube rather than by us — so on a device showing it, the
 * picture carries on over the wall `App.tsx` draws underneath. Before
 * 2026-09-30 the wall replaced the application, the channel screen's unmount
 * gave the screen role up, and a fifteen-second Wi-Fi drop took the film off
 * an iPad for good.
 *
 * **It says what the wall says and nothing it cannot keep.** Not *the film
 * carries on* unconditionally: when the internet itself is gone YouTube stalls
 * too, once its buffer runs out. What is true either way is that nothing else
 * responds until the connection is back, which is the wall's whole sentence.
 *
 * The full-screen scrim's colour, for the same reason — black over a film at
 * the weight every player uses — and it answers no touch: there is nothing to
 * press, and a strip that swallowed a tap would be a dead control across the
 * picture.
 */
export function OfflineStrip(): React.ReactElement {
  const t = useText().offline;
  return (
    <View style={styles.strip} pointerEvents="none" accessibilityRole="alert">
      <ActivityIndicator color="#fff" size="small" />
      <View style={styles.words}>
        <Text style={styles.title}>{t.notConnected()}</Text>
        <Text style={styles.line}>{t.filmCarriesOn()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  words: { flex: 1, gap: spacing(0.25) },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' },
  line: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
});
