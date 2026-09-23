import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useText } from '../i18n';
import { Card, Screen } from './components';
import { colors, spacing, type } from './theme';

/**
 * What the app is once the socket has been gone past `OFFLINE_AFTER_MS`.
 *
 * **Instead of, rather than over**, on `UpdateRequiredView`'s reasoning and
 * from the same place in `Root`: every other screen in this app is a view onto
 * server state with controls that dispatch to the server, so a banner over a
 * working-looking Home leaves twenty screens reachable and lying. The one that
 * caught this was `ChannelSettingsView`, which is an early `return` inside
 * `ChannelView` and therefore replaced the only screen carrying the old
 * inline notice — during an outage it said nothing at all.
 *
 * **It is also the notice that queued actions were dropped**, which is why the
 * body says so rather than only naming the connection. The two are one event:
 * `goOffline` discards the queue and reports this in the same breath, so there
 * is no moment where the actions are gone and nothing has said it. Generic
 * rather than itemised — naming them needs a human-readable label per action
 * type, which is a table that rots, and the retry that `send`'s return value
 * now enables covers the case anybody actually hits. See planning/decisions/2026-09-16-being-offline-is-one-state.md.
 *
 * **No button, which is the departure from `UpdateRequiredView`.** That wall is
 * terminal and offers the one action that ends it; this one comes down by
 * itself, and the client is already knocking every second. A "Try now" would
 * be the dead button that screen's own comment warns against — "a dead link is
 * worse than a sentence" — so what goes here is evidence that it is trying,
 * not a control that duplicates it.
 */
export function OfflineView({ roster }: { roster: string[] | null }) {
  /**
   * The LiveKit room and this app's websocket are unrelated connections —
   * STATES.md § *Audio Connected* — so the conversation can be fine while
   * everything that manages it is gone. A roster here means it is.
   *
   * It changes what this says and not what it permits, because there is
   * nothing to permit: `SET_SELF_MUTE` is a channel action like any other, so
   * with the socket down the microphone is as unreachable as the settings.
   */
  const inRoom = roster !== null;
  const t = useText().offline;

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.stack}>
        <Text style={type.title}>
          {inRoom ? t.partlyConnected() : t.notConnected()}
        </Text>

        <Card style={styles.stack}>
          {inRoom ? (
            <Text style={type.body}>{t.roomStillAudible()}</Text>
          ) : (
            <Text style={type.body}>{t.cannotReach()}</Text>
          )}
          <Text style={type.muted}>{t.queueDropped()}</Text>
        </Card>

        {roster && roster.length > 0 ? (
          <Card style={styles.stack}>
            <Text style={type.heading}>{t.whoWasInTheRoom()}</Text>
            {roster.map((name, i) => (
              <Text key={`${name}-${i}`} style={type.body}>
                {name}
              </Text>
            ))}
            <Text style={type.muted}>{t.asOfLastUpdate()}</Text>
          </Card>
        ) : null}

        {/* Evidence rather than a control; see the note above about buttons. */}
        <View style={styles.trying}>
          <ActivityIndicator color={colors.textMuted} />
          <Text style={type.muted}>{t.tryingAgain()}</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing(2) },
  stack: { gap: spacing(2) },
  trying: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
});
