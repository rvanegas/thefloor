import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LeaderboardEntry } from '../../../core/protocol';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen } from './components';
import { colors, radius, spacing, type } from './theme';

/**
 * Who has brought the most people here.
 *
 * **The only screen in this application that shows you people who have not
 * agreed to be shown to you.** Everywhere else a name reaches you because you
 * and they both said yes; here it reaches you because somebody set a column on
 * your account by hand. That is why there is no way to ask for it, no setting
 * that turns it on, and nothing anywhere that mentions it exists — the button
 * that leads here is absent unless `hello` said otherwise, and the route
 * refuses anyway.
 *
 * Read on open and held nowhere, like Support: nothing else wants it and a
 * cached ranking is wrong the moment anybody signs up.
 */
export function LeaderboardView({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await app.loadLeaderboard();
        if (!cancelled) setEntries(rows);
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
        <Text style={type.heading}>Invitations</Text>
        {/* "Close", not "Back": beside a list there is nothing underneath this
            to go back to. See HomeSettingsView. */}
        <Button label="Close" variant="ghost" onPress={onBack} />
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : entries && entries.length > 0 ? (
        <>
          <Card style={styles.stack}>
            {entries.map((entry, index) => (
              <View key={entry.account.id} style={styles.row}>
                <Text style={styles.rank}>{`${index + 1}`}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {entry.account.displayName}
                </Text>
                <Text style={styles.count}>{`${entry.invited}`}</Text>
              </View>
            ))}
          </Card>
          {/*
            What the number means, said once and here rather than as a
            per-row hint. Somebody reading a ranking will otherwise assume it
            counts invitations sent, which is a different and much larger
            number.
          */}
          <Text style={type.muted}>
            Everybody who signed up from that person’s invitation, plus
            everybody those people went on to invite, all the way down.
          </Text>
        </>
      ) : (
        <Text style={type.muted}>
          Nobody has brought anybody here yet.
        </Text>
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
    gap: spacing(1),
    marginBottom: spacing(1),
  },
  loading: { marginTop: spacing(3) },
  stack: { gap: spacing(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(1.5),
  },
  /**
   * Position rather than standing, so equal counts still get separate numbers.
   * Shared ranks would be inventing a competition nobody entered.
   */
  rank: { ...type.muted, minWidth: spacing(3) },
  name: { ...type.body, flex: 1 },
  count: { ...type.body, fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, fontSize: 13 },
});
