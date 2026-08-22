import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SupportView as SupportSnapshot } from '../../../core/protocol';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen } from './components';
import { describeGiving } from './money';
import { colors, spacing, type } from './theme';

/**
 * Everything about giving money toward keeping this running, on its own screen.
 *
 * It exists because the explanation belongs somewhere with room for it. As a
 * card on another screen this was three paragraphs competing with whatever that
 * screen was actually for, and the honest version — what the money pays for,
 * that it unlocks nothing, which address to use — is longer than a card should
 * be. Home carries a single line and a way in; the reasoning lives here, where
 * somebody has already chosen to read it.
 *
 * Fetched on open rather than held in app state: nothing else reads it, and a
 * total cached anywhere would be stale the moment somebody gave.
 */
export function SupportView({
  onBack,
  onOpenLeaderboard,
}: {
  onBack: () => void;
  /**
   * Absent unless this account has been granted the invitation standings, in
   * which case there is no button and nothing here mentions them. It hangs off
   * this screen because Support is the one place already about the project
   * rather than about a conversation — and because a screen nobody can reach
   * needs somewhere unobtrusive to be reached from.
   */
  onOpenLeaderboard?: () => void;
}) {
  const app = useApp();
  const [support, setSupport] = useState<SupportSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await app.loadSupport();
        if (!cancelled) setSupport(view);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.token]);

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Support</Text>
        <Button label="Done" variant="ghost" onPress={onBack} />
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : (
        <>
          <Card style={styles.stack}>
            <Text style={type.muted}>
              The Floor runs on a server that costs money every month — the box
              it lives on, the audio that carries a conversation, and the
              storage your recordings sit in.
            </Text>
            <Text style={type.muted}>
              Giving is entirely optional and unlocks nothing. Every part of the
              app works the same whether you do or not, and nobody is told who
              has and who has not.
            </Text>
          </Card>

          {support?.mine ? (
            <Card style={styles.stack}>
              <Text style={type.muted}>
                You have given {describeGiving(support.mine)}. Thank you —
                genuinely.
              </Text>
            </Card>
          ) : null}

          {support?.url ? (
            <>
              <Button
                label="Chip in"
                variant="primary"
                onPress={() => void Linking.openURL(support.url!)}
              />
              {/*
                The address is the whole of how a donation finds its way back
                to an account: the payment page has nowhere to carry who you
                are, so this is the difference between a recorded gift and an
                anonymous one. Saying it plainly is cheaper than any amount of
                machinery on our side.
              */}
              <Text style={type.muted}>
                Opens in your browser. Use {support.identifier} there and it
                will show up here; pay with anything else and it arrives
                without a name on it.
              </Text>
            </>
          ) : (
            <Text style={type.muted}>
              There is no way to give from here at the moment.
            </Text>
          )}

          {onOpenLeaderboard ? (
            <Button
              label="Invitations"
              onPress={onOpenLeaderboard}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2), paddingBottom: spacing(4), gap: spacing(1) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loading: { marginTop: spacing(4) },
  stack: { gap: spacing(1) },
  error: { color: colors.danger, fontSize: 13 },
});
