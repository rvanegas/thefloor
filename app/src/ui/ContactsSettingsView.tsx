import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '../../../core/constants';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, Screen, SectionLabel } from './components';
import { InlineMarkdown } from './markdown';
import { colors, spacing, type } from './theme';

/**
 * Who other people see when they see you: the name and the bio.
 *
 * These lived on the Home settings screen, which is where everything about the
 * account had accumulated. They belong here instead, behind the contact list,
 * because that is the scope they are about — a name is how a contact finds you
 * and a bio is what a contact reads, and neither has anything to do with the
 * appearance setting or with deleting the account. The third settings screen,
 * on the pattern of the other two: one per scope, reached from the screen whose
 * scope it is.
 *
 * There is no Save button, for the reason HomeSettingsView gave when these
 * fields were there: one button meaning "keep my work" beside a nearer, more
 * obvious one meaning "throw it away" is a choice nobody should be asked to
 * make. Both fields write on blur, and leaving writes anything still pending.
 */
export function ContactsSettingsView({
  onBack,
  onOpenProfile,
}: {
  onBack: () => void;
  /**
   * Opens your own profile, which is the only screen that shows what a contact
   * sees. Optional so a caller with nowhere to put it leaves the button out,
   * the same way ProfileView omits sections it was given no action for.
   */
  onOpenProfile?: () => void;
}) {
  const app = useApp();
  const [displayName, setDisplayName] = useState(app.me?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * What the server already has, so that leaving a field alone writes nothing.
   *
   * A ref rather than state: it is never rendered, and it has to be readable by
   * a blur handler that fired before a re-render would have delivered it.
   */
  const saved = useRef({ displayName: '', bio: '' });

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
        saved.current = {
          displayName: profile.account.displayName,
          bio: profile.bio ?? '',
        };
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

  /**
   * Writes whatever has actually changed.
   *
   * Rethrows so the way out can decline to close on a failure. A screen that
   * closed anyway would be a silent discard wearing a different hat.
   */
  const persist = async () => {
    const name = displayName.trim();
    const text = bio.trim();
    // A blank name is refused rather than written: it is how everybody else
    // finds you, and the server ignores an empty one anyway. Saying so under
    // the field is what stands in for a disabled button.
    const nameChanged = name !== '' && name !== saved.current.displayName;
    const bioChanged = text !== saved.current.bio;
    if (!nameChanged && !bioChanged) return;

    const changes: { displayName?: string; bio?: string } = {};
    if (nameChanged) changes.displayName = name;
    if (bioChanged) changes.bio = text;

    setSaving(true);
    setError(null);
    try {
      await app.saveProfile(changes);
      saved.current = {
        displayName: changes.displayName ?? saved.current.displayName,
        bio: changes.bio ?? saved.current.bio,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  /** Keeps the work, then leaves — and stays put if it could not be kept. */
  const done = async () => {
    try {
      await persist();
      onBack();
    } catch {
      // The error is on screen, and the edit is still in the field.
    }
  };

  const named = displayName.trim() !== '';

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Contact settings</Text>
        {/* "Saving…" is here for the same reason it was on the Home settings
            screen while these fields lived there: this write is an awaited HTTP
            call that can fail and hold the screen open. */}
        <Button
          label={saving ? 'Saving…' : 'Back'}
          variant="ghost"
          disabled={saving}
          onPress={() => void done()}
        />
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
              onBlur={() => void persist().catch(() => {})}
            />
            {!named ? (
              <Text style={styles.error}>
                A name cannot be empty — it is how everyone else finds you, so
                this one is kept until you type another.
              </Text>
            ) : null}
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
              onBlur={() => void persist().catch(() => {})}
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

            {/*
              The preview above shows the bio rendered; this shows the screen it
              lands on. They are different questions — one is "did the markup
              come out right", the other is "what does somebody who taps my name
              actually get", and the second is the one nobody could answer
              without another account to look from.

              It saves first, because opening the profile mid-edit would show
              the version still on the server. It opens even when the save
              fails: a button that silently does nothing is worse than a screen
              with the error already under the field.
            */}
            {onOpenProfile ? (
              <Button
                label="See your profile"
                onPress={() => {
                  void persist()
                    .catch(() => {})
                    .then(onOpenProfile);
                }}
              />
            ) : null}
          </Card>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(1),
  },
  loading: { marginTop: spacing(4) },
  stack: { gap: spacing(1) },
  preview: { gap: spacing(0.5) },
  previewText: { color: colors.text },
  count: { ...type.muted, textAlign: 'right' },
  error: { color: colors.danger, fontSize: 13 },
});
