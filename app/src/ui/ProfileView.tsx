import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '../../../core/constants';
import type { ProfileView as Profile } from '../../../core/protocol';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, SectionLabel } from './components';
import { InlineMarkdown } from './markdown';
import { colors, spacing, type } from './theme';

/**
 * Your own profile: the name everyone else sees you by, and a description of
 * yourself in the same Markdown a channel's description uses.
 *
 * Editable only for yourself — `ProfilePreview` below is how somebody else's
 * is read. The two are separate components rather than one with a flag,
 * because an editor that is sometimes read-only accumulates conditionals in
 * every field it holds.
 */
export function ProfileView({ onBack }: { onBack: () => void }) {
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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Your profile</Text>
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
    </ScrollView>
  );
}

/**
 * Somebody else's profile, read-only.
 *
 * Fetched rather than passed in, because the server decides who may see one —
 * a contact, or somebody in a channel with you — and a 404 is the honest
 * answer for both "no such person" and "not yours to read".
 */
export function ProfilePreview({
  accountId,
  fallbackName,
}: {
  accountId: string;
  fallbackName: string;
}) {
  const app = useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await app.loadProfile(accountId);
        if (!cancelled) setProfile(found);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return (
    <Card style={styles.stack}>
      <Text style={type.heading}>
        {profile?.account.displayName ?? fallbackName}
      </Text>
      {profile?.bio ? (
        <InlineMarkdown text={profile.bio} style={styles.previewText} />
      ) : (
        <Text style={type.muted}>
          {missing ? 'No profile to show.' : 'They have not written one yet.'}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: spacing(2), paddingBottom: spacing(4) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loading: { marginTop: spacing(4) },
  stack: { gap: spacing(1) },
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
