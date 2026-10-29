import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ReadAloudControls } from '../audio/readAloud';
import { useText } from '../i18n';
import { Button } from './components';
import { colors, measure, spacing, type } from './theme';

/**
 * *Restart* and *Stop*, while Claude's reply is being read aloud — and nothing
 * at any other time.
 *
 * **Over every screen, as the voice is**: `useClaudeReadAloud` sits above the
 * route table so that somebody who walked back to Home still hears the reply,
 * and a control that lived only on the *Record* would leave that person a
 * voice they could not stop. So `App.tsx` draws this above the panes.
 *
 * **At the top rather than the foot**, because it comes and goes on its own
 * and takes its height out of what is under it: at the foot it would lift the
 * channel's footer — Mute, Claim and the rest — under a thumb already on its
 * way there. A header's buttons are the lesser thing to move.
 *
 * **Built as a pinned bar** (STYLE.md § *The pinned header*): a full-bleed
 * edge with a hairline under it, the row inside capped at `measure`. Two
 * `default` buttons, neither `primary`: stopping and restarting are both
 * alternatives to listening on, and no commitment.
 */
export function ReadingBar({ controls }: { controls: ReadAloudControls }) {
  const t = useText().readingBar;
  if (!controls.reading) return null;
  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        <Text style={[type.muted, styles.what]} numberOfLines={2}>
          {t.reading()}
        </Text>
        <Button label={t.restart()} onPress={controls.restart} />
        <Button label={t.stop()} onPress={controls.stop} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: spacing(1),
  },
  inner: {
    ...measure,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingHorizontal: spacing(2),
  },
  what: { flex: 1 },
});
