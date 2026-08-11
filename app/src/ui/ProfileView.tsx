import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ProfileView as Profile } from '../../../core/protocol';
import { describeChannel } from '../../../core/naming';
import { useApp } from '../state/AppProvider';
import { Button, Card, Screen, SectionLabel } from './components';
import { InlineMarkdown } from './markdown';
import { colors, radius, spacing, type } from './theme';

/**
 * Somebody else's profile.
 *
 * Fetched rather than passed in, because the server decides who may see one —
 * a contact, or somebody in a channel with you — and a 404 is the honest
 * answer to both "no such person" and "not yours to read", deliberately, so
 * that account ids cannot be walked to find out which exist.
 *
 * Read-only, and a separate component from the settings screen that edits your
 * own. An editor that is sometimes read-only grows a conditional in every
 * field it holds.
 */
export function ProfileView({
  accountId,
  fallbackName,
  onBack,
  onEnterChannel,
}: {
  accountId: string;
  /**
   * What to show while the profile is in flight, and if it never arrives.
   *
   * The caller already knows this person's name — it is in the roster they
   * tapped — so there is no reason to show a spinner where a name belongs, or
   * to leave the screen anonymous when the fetch is refused.
   */
  fallbackName: string;
  onBack: () => void;
  /**
   * Opens a channel the two of you share. Omitted where entering one would be
   * wrong — from inside a channel, which is the other way this screen is
   * reached — and the section is then left out rather than shown dead.
   */
  onEnterChannel?: (channelId: string) => void;
}) {
  const app = useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'refused'>('loading');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Their standing with you, if any. Absent from the list means a stranger —
  // which, on a profile reached from a channel roster, is the whole point.
  const contact = (app.home?.contacts ?? []).find(
    (entry) => entry.account.id === accountId
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await app.loadProfile(accountId);
        if (cancelled) return;
        setProfile(found);
        setState('ready');
      } catch {
        // Refused and absent are the same answer by design, so this cannot
        // distinguish them either — and should not try to.
        if (!cancelled) setState('refused');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  /**
   * Channels the two of you are both in. Drawn from Home's own list rather
   * than fetched, because that list already *is* "channels you belong to and
   * are not currently in" — the exact set for which "step in" is the right
   * verb. One you are presently inside is therefore absent, correctly: you
   * are already there.
   */
  const shared = (app.home?.rejoinable ?? []).filter((channel) =>
    channel.others.some((other) => other.id === accountId)
  );

  const ask = async () => {
    setAsking(true);
    setAskError(null);
    try {
      await app.connectWith(accountId);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading} numberOfLines={1}>
          {profile?.account.displayName ?? fallbackName}
        </Text>
        <Button label="Done" variant="ghost" onPress={onBack} />
      </View>

      <Card style={styles.stack}>
        {state === 'loading' ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : profile?.bio ? (
          <InlineMarkdown text={profile.bio} style={styles.bio} />
        ) : (
          <Text style={type.muted}>
            {state === 'refused'
              ? 'There is no profile here to show you.'
              : 'They have not written anything about themselves yet.'}
          </Text>
        )}
      </Card>

      {/*
        Meeting somebody in a channel an acquaintance opened is exactly when
        you want to keep them, and until now there was no way to: you had their
        name and their id, and adding a contact needed an address they had not
        given you.

        Being in a channel together is permission to ask, not consent to be
        anybody's contact — so this sends a request like any other, and they
        decide.
      */}
      {onEnterChannel && shared.length > 0 ? (
        <>
          <SectionLabel>Channels with them</SectionLabel>
          <View style={styles.stack}>
            {shared.map((channel) => (
              <Pressable
                key={channel.channelId}
                accessibilityRole="button"
                accessibilityLabel={`${
                  channel.name ??
                  describeChannel(channel.others.map((o) => o.displayName))
                }. Step in.`}
                onPress={() => {
                  app.act(channel.channelId, { type: 'ENTER' });
                  onEnterChannel(channel.channelId);
                }}
                style={({ pressed }) => [
                  styles.channel,
                  pressed && styles.channelPressed,
                ]}
              >
                <Text
                  style={channel.name ? type.body : styles.channelDescribed}
                  numberOfLines={1}
                >
                  {channel.name ??
                    describeChannel(channel.others.map((o) => o.displayName))}
                </Text>
                <Text style={type.muted}>
                  {channel.presentCount > 0
                    ? `${channel.presentCount} present`
                    : 'Nobody here right now'}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel>Contact</SectionLabel>
      <Card style={styles.stack}>
        {contact?.status === 'accepted' ? (
          <Text style={type.muted}>Already one of your contacts.</Text>
        ) : contact?.status === 'outgoing' ? (
          <Text style={type.muted}>
            Request sent — waiting for them to accept.
          </Text>
        ) : contact?.status === 'incoming' ? (
          <>
            <Button
              label={asking ? 'Accepting…' : 'Accept their request'}
              variant="primary"
              disabled={asking}
              onPress={() => void ask()}
            />
            <Text style={type.muted}>They asked you first.</Text>
          </>
        ) : (
          <>
            <Button
              label={asking ? 'Asking…' : 'Add contact'}
              disabled={asking || state === 'refused'}
              onPress={() => void ask()}
            />
            <Text style={type.muted}>
              They will see a request on their home screen and decide.
            </Text>
          </>
        )}
        {askError ? <Text style={styles.error}>{askError}</Text> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
    marginBottom: spacing(1),
  },
  stack: { gap: spacing(1) },
  channel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(1.5),
    gap: 2,
  },
  channelPressed: { backgroundColor: colors.surfaceRaised },
  /** Italic when nobody has named it; see core/naming.ts. */
  channelDescribed: { ...type.body, fontStyle: 'italic' },
  bio: { ...type.muted, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13 },
});
