import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '../../../core/constants';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, Screen, SectionLabel } from './components';
import { InlineMarkdown } from './markdown';
import { colors, spacing, type } from './theme';
import type { ColorSchemePreference } from './appearance';

/**
 * Everything about you rather than about a conversation: the name people see,
 * what you say about yourself, and the way out.
 *
 * The counterpart to ChannelSettingsView, and named to match — one settings
 * screen reached from Home, one reached from a channel, each holding what its
 * own scope owns.
 */
export function HomeSettingsView({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const [displayName, setDisplayName] = useState(app.me?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The bio is not in the `hello` snapshot — it would ride on every roster for
  // the sake of one screen — so it is fetched when that screen opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!app.token || !app.me) return;
      try {
        const profile = await app.loadProfile(app.me.id);
        if (cancelled) return;
        setDisplayName(profile.account.displayName);
        setBio(profile.bio ?? '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.me?.id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await app.saveProfile({ displayName, bio });
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const named = displayName.trim() !== '';

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Settings</Text>
        <Button label="Done" variant="ghost" onPress={onBack} />
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : (
        <>
          <SectionLabel>Name</SectionLabel>
          <Card style={styles.stack}>
            <Field
              value={displayName}
              onChangeText={(v) =>
                setDisplayName(v.slice(0, MAX_DISPLAY_NAME_LENGTH))
              }
              placeholder="What people should call you"
              autoCapitalize="words"
            />
            <Text style={type.muted}>
              Shown wherever you appear — the roster of a channel, a contact
              list, an invitation.
            </Text>
          </Card>

          {/*
            Above "About you" and below the name: this is about the phone
            rather than about you, but it is the setting somebody opens this
            screen to change on a whim, and burying it under a bio nobody
            edits twice would be the wrong order.
          */}
          <SectionLabel>Appearance</SectionLabel>
          <Card style={styles.stack}>
            <View style={styles.choices}>
              {(
                [
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                  ['system', 'System'],
                ] as Array<[ColorSchemePreference, string]>
              ).map(([value, label]) => (
                <Button
                  key={value}
                  label={label}
                  style={styles.choice}
                  variant={app.appearance === value ? 'primary' : 'default'}
                  onPress={() => app.setAppearance(value)}
                />
              ))}
            </View>
            <Text style={type.muted}>
              System follows the phone, and changes with it — including on a
              schedule, if you have one set.
            </Text>
          </Card>

          <SectionLabel>About you</SectionLabel>
          <Card style={styles.stack}>
            <Field
              value={bio}
              onChangeText={(v) => setBio(v.slice(0, MAX_BIO_LENGTH))}
              placeholder="Anything you would like people to know…"
              autoCapitalize="sentences"
              multiline
            />

            {/* Same reasoning as a channel's description: the field shows
                markup and nowhere else will, so without a preview the only way
                to find out what it becomes is to save and come back. */}
            {bio.trim() ? (
              <View style={styles.preview}>
                <Text style={type.label}>Preview</Text>
                <InlineMarkdown text={bio} style={styles.previewText} />
              </View>
            ) : null}

            <Text style={type.muted}>
              **Bold**, *italic*, `code`, ~~strikethrough~~ and
              [links](https://example.com) work. Links open in your browser.
            </Text>
            <Text style={styles.count}>
              {bio.length} / {MAX_BIO_LENGTH}
            </Text>
          </Card>

          <SectionLabel>Account</SectionLabel>
          <Card style={styles.stack}>
            <Button
              label="Sign out"
              onPress={() =>
                Alert.alert(
                  'Sign out?',
                  'You will need a fresh code by email to sign back in. Your channels and recordings are kept.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign out',
                      style: 'destructive',
                      onPress: () => void app.signOut(),
                    },
                  ]
                )
              }
            />
            <Text style={type.muted}>
              Signing in elsewhere signs you out here, so this is only for the
              device in your hand.
            </Text>
          </Card>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button
              label={saving ? 'Saving…' : 'Save'}
              variant="primary"
              disabled={saving || !named}
              onPress={save}
            />
            {!named ? (
              <Text style={styles.error}>
                A name cannot be empty — it is how everyone else finds you.
              </Text>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2), paddingBottom: spacing(4) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loading: { marginTop: spacing(4) },
  stack: { gap: spacing(1) },
  choices: { flexDirection: 'row', gap: spacing(1) },
  choice: { flex: 1 },
  preview: {
    gap: spacing(0.5),
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing(1.25),
  },
  previewText: { ...type.muted, lineHeight: 20 },
  count: {
    ...type.muted,
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  actions: { gap: spacing(1), marginTop: spacing(2) },
  error: { color: colors.danger, fontSize: 13 },
});
