import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SupportView as SupportSnapshot } from '../../../core/protocol';
import { useText } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Button, Card, IconButton, Screen } from './components';
import { CloseIcon } from './icons';
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
export function SupportView({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const t = useText().support;
  const shared = useText().shared;
  const money = useText().money;
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
        <Text style={type.heading}>{t.title()}</Text>
        {/* "Close", not "Back": beside a list there is nothing underneath this
            to go back to. See HomeSettingsView. */}
        <IconButton
          label={shared.close()}
          icon={(color) => <CloseIcon color={color} />}
          onPress={onBack}
        />
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : (
        <>
          <Card style={styles.stack}>
            <Text style={type.muted}>{t.whatItCosts()}</Text>
            <Text style={type.muted}>{t.unlocksNothing()}</Text>
          </Card>

          {support?.mine ? (
            <Card style={styles.stack}>
              <Text style={type.muted}>
                {t.thankYou(describeGiving(support.mine, money))}
              </Text>
            </Card>
          ) : null}

          {support?.url ? (
            <>
              <Button
                label={t.chipIn()}
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
                {t.useThisAddress(support.identifier)}
              </Text>
            </>
          ) : (
            <Text style={type.muted}>{t.noWayToGive()}</Text>
          )}

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
