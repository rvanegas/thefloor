import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import {
  DELETED_RETENTION_MS,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
} from '../../../core/constants';
import { canEditChannel, hasTheRoom } from '../../../core/channel';
import {
  DEFAULT_NOTIFICATION_LEVEL,
  describeLevel,
  NOTIFICATION_LEVELS,
  type NotificationLevel,
} from '../../../core/notifications';
import type { ChannelState } from '../../../core/types';
import { showRoutePicker } from '../audio/routePicker';
import { type GuestLinkSummary } from '../api/http';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, Screen, SectionLabel } from './components';
import { InlineMarkdown } from './markdown';
import { colors, spacing, type } from './theme';

/**
 * Channel settings, reached from the Channel view. Holds what is about the
 * channel rather than about the conversation: its name, which replaces the
 * roster-derived header ("3 people"), and its description, which sits under
 * that header.
 */
export function ChannelSettingsView({
  channel,
  onBack,
  onLeft,
}: {
  channel: ChannelState;
  onBack: () => void;
  /** Called once membership is given up, to get off this channel's screens. */
  onLeft: () => void;
}) {
  const app = useApp();
  // Alone, the same tap destroys the channel rather than merely removing you
  // from it. Nothing else on screen would say so.
  const lastMember = channel.participants.length === 1;
  /**
   * Whether the name and description are yours to change — `hasTheRoom`, so
   * either you are in the channel or nobody is. What it protects against is a
   * member who is somewhere else renaming the place mid-conversation.
   *
   * The fields are disabled rather than hidden, and `persist` is guarded too:
   * a field that cannot be typed into cannot produce a change to write, but
   * the two facts are a screen apart and the reducer refuses this silently, so
   * the belt is cheap and the braces are what stops a stale `saved` ref
   * recording an edit that never landed.
   *
   * Leaving and deleting are deliberately not covered. Giving up your own
   * membership is yours whatever anybody else is doing, and deleting is
   * already the last member's alone — which nobody can be while somebody else
   * is present.
   */
  const mayEdit = canEditChannel(channel, app.me?.id ?? '');
  // What deleting would take with it. Read from the snapshot the channel
  // screen is already showing, so the number in the warning is the number of
  // rows the person can see above it.
  const recordingCount = app.channelViews[channel.id]?.recordings?.length ?? 0;
  const [name, setName] = useState(channel.name ?? '');
  const [description, setDescription] = useState(channel.description ?? '');

  /**
   * What the channel already has, so leaving a field alone dispatches nothing.
   */
  const saved = useRef({
    name: channel.name ?? '',
    description: channel.description ?? '',
  });

  /**
   * Writes whichever of the two has actually changed.
   *
   * There were two Save buttons here and each of them closed the screen, so
   * naming a channel took you out of the settings you were halfway through —
   * and the way back, sitting above both and reading "Done" then, discarded
   * everything without a word. Saving
   * as you leave a field means the only button left is the one that means what
   * it says.
   *
   * An empty name is a real value here, unlike a display name: it is how a
   * channel goes back to being listed by who is in it.
   */
  const persist = () => {
    if (!mayEdit) return;
    if (name !== saved.current.name) {
      app.act(channel.id, { type: 'SET_NAME', name });
      saved.current.name = name;
    }
    if (description !== saved.current.description) {
      app.act(channel.id, { type: 'SET_DESCRIPTION', description });
      saved.current.description = description;
    }
  };

  /**
   * Synchronous, and so the button has no "Saving…" state where
   * `HomeSettingsView`'s does. That is not an oversight and not a difference in
   * taste: a profile is an awaited HTTP call that can report a failure and
   * refuse to close, and `app.act` is a fire-and-forget dispatch down the
   * socket with nothing to await.
   *
   * What it costs is that a write which never lands is not reported either —
   * `socket.send` drops a queued action past ten seconds, and a *refused* one
   * comes back as a snapshot with no error. `persist` above has already
   * recorded it as saved by then. Known, and BACKLOG.md's known defects has the
   * full account under "A channel action that never lands"; do not add an
   * in-flight state here to make the two screens match, because there is no
   * flight to be in until `channel.action` is acknowledged.
   */
  const done = () => {
    persist();
    onBack();
  };

  /**
   * Leaving, for anyone but the last member. It now costs the recordings too —
   * they belong to the channel, and giving up the channel gives up reaching
   * them — so the confirmation says so rather than leaving it to be discovered
   * by their absence.
   */
  const confirmLeave = () =>
    Alert.alert(
      'Leave this channel?',
      `It disappears from your home screen and you will need a fresh invitation to come back. Everyone else keeps it${
        recordingCount === 0
          ? '.'
          : `, and ${countOf(recordingCount)} with it — you will not be able to reach ${
              recordingCount === 1 ? 'it' : 'them'
            } again.`
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            app.act(channel.id, { type: 'LEAVE_CHANNEL' });
            onLeft();
          },
        },
      ]
    );

  /**
   * Deleting, which only the last member can do and which is the end of the
   * channel and everything recorded in it.
   *
   * **Two taps, and the second one is not next to the first.** A single
   * destructive confirm is the pattern everywhere else in this app, and it is
   * not enough here: what goes is unrecoverable, it is the only copy anybody
   * has, and the tap that starts it sits where "leave" sat in every previous
   * build. The second dialog exists to cost a moment and to say the number out
   * loud — a person who is about to lose four recordings should have read the
   * word "four" before it happens.
   */
  const confirmDelete = () =>
    Alert.alert(
      'Delete this channel?',
      recordingCount === 0
        ? 'You are its last member, so this is the end of it. It cannot be undone.'
        : `You are its last member, so this deletes the channel and ${countOf(
            recordingCount
          )} made in it. Export anything you want to keep first — this cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              recordingCount === 0
                ? 'Delete for good?'
                : `Delete ${countOf(recordingCount)} for good?`,
              `Everything goes, permanently, after ${RETENTION_DAYS} days. There is no undo in the app.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    app.act(channel.id, { type: 'DELETE_CHANNEL' });
                    onLeft();
                  },
                },
              ]
            ),
        },
      ]
    );

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Channel settings</Text>
        {/* "Back" rather than "Channel". Naming the destination reads well
            until there are three settings screens and each names a different
            place — then the one word every one of them shares is the act, and
            the reader stops having to check which screen they are on to know
            what the button does. */}
        <Button label="Back" variant="ghost" onPress={done} />
      </View>

      <SectionLabel>Channel name</SectionLabel>
      <Card style={styles.stack}>
        <Field
          value={name}
          onChangeText={(v) => setName(v.slice(0, MAX_CHANNEL_NAME_LENGTH))}
          placeholder="What is this channel about?"
          autoCapitalize="words"
          editable={mayEdit}
          onSubmit={persist}
          onBlur={persist}
        />
        <Text style={type.muted}>
          {mayEdit
            ? 'Everyone in the channel sees this name, and anyone in the room can change it. Leave it empty to go back to listing who is here.'
            : 'Step in to rename this channel. Somebody is in there, and the name is what they are calling the place they are in.'}
        </Text>
      </Card>

      <SectionLabel>Description</SectionLabel>
      <Card style={styles.stack}>
        <Field
          value={description}
          onChangeText={(v) =>
            setDescription(v.slice(0, MAX_CHANNEL_DESCRIPTION_LENGTH))
          }
          placeholder="Links, a reading list, what this is for…"
          autoCapitalize="sentences"
          multiline
          editable={mayEdit}
          onBlur={persist}
        />

        {/*
          A preview, because the input shows markup and the header will not.
          Without it the only way to find out what `[a](b)` becomes is to go
          back and look, and the only way to fix a typo is to do that twice.
        */}
        {description.trim() ? (
          <View style={styles.preview}>
            <Text style={type.label}>Preview</Text>
            <InlineMarkdown text={description} style={styles.previewText} />
          </View>
        ) : null}

        <Text style={type.muted}>
          Shown under the channel name to everyone in it. **Bold**, *italic*,
          `code`, ~~strikethrough~~ and [links](https://example.com) work.
          Links open in your browser.
        </Text>
        {mayEdit ? null : (
          <Text style={type.muted}>Step in to change this.</Text>
        )}
        <Text style={styles.count}>
          {description.length} / {MAX_CHANNEL_DESCRIPTION_LENGTH}
        </Text>
      </Card>

      {/*
        The system's own output picker, not a control of ours: iOS knows what is
        connected and we do not — nothing in the audio stack tells JavaScript
        what outputs exist.

        Here rather than on the channel screen because it is not part of holding
        a conversation. The default should be right by itself — the loudspeaker
        rather than the earpiece, yielding to headphones — and this is for the
        times it is not, so that being in the wrong ear is fixable by the person
        it is happening to instead of by a release. If it goes untouched, that
        is evidence the default works and it should come out again.
      */}
      {Platform.OS === 'ios' ? (
        <>
          <SectionLabel>Audio output</SectionLabel>
          <Card style={styles.stack}>
            <Button
              label="Choose where sound comes out"
              sublabel="Speaker, earpiece, headphones or anything paired"
              onPress={() => {
                void showRoutePicker();
              }}
            />
          </Card>
        </>
      ) : null}

      {/*
        Whose phone this channel may ring, and how loudly. One person's own
        answer about one channel — nobody else on the roster is told, and
        nothing about the conversation changes.

        Here rather than on the channel screen for the reason the audio picker
        is: it is about the channel and not about the conversation going on
        inside it. And per channel rather than in Settings because that is the
        scope at which the question has an answer — the same amount of traffic
        is welcome from the conversation somebody is waiting on and unwelcome
        from the one they joined for completeness.
      */}
      <SectionLabel>Notifications</SectionLabel>
      <Card style={styles.stack}>
        <NotificationLevelPicker channelId={channel.id} />
      </Card>

      {/*
        Every door onto this channel that has ever been opened, and the state
        of each. Here rather than on the channel screen for the reason the
        audio picker is: it is about the channel rather than about the
        conversation, and it is read when somebody has a reason to wonder who
        can get in.
      */}
      <SectionLabel>Guest links</SectionLabel>
      <Card style={styles.stack}>
        {/*
          Revocable on the same terms as everything else here, and for the
          sharper version of the reason: shutting a door while a conversation
          is going on is a decision about who is in that conversation.
          Reading the list is not — it is how somebody works out who can get
          in — so the rows are shown either way.
        */}
        <GuestLinks
          channelId={channel.id}
          mayRevoke={hasTheRoom(channel, app.me?.id ?? '')}
        />
      </Card>

      {/*
        Last, and plain. The confirmation carries the weight — colouring the
        button itself would put the loudest thing on the screen on the rarest
        action. The exception is being the last member, where the tap really
        does destroy something, and the colour is then telling the truth.
      */}
      <SectionLabel>{lastMember ? 'Deleting' : 'Leaving'}</SectionLabel>
      <Card style={styles.stack}>
        <Button
          label={lastMember ? 'Delete channel' : 'Leave channel'}
          sublabel={
            lastMember
              ? recordingCount === 0
                ? 'You are its last member — this destroys it for good'
                : `This destroys it and ${countOf(recordingCount)}, for good`
              : recordingCount === 0
                ? 'Removes it from your home screen'
                : `Removes it from your home screen, ${countOf(
                    recordingCount
                  )} included`
          }
          variant={lastMember ? 'danger' : 'default'}
          onPress={() => (lastMember ? confirmDelete() : confirmLeave())}
        />
        <Text style={type.muted}>
          Stepping out is on the channel screen and is probably what you want:
          it keeps your place here.
        </Text>
      </Card>
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
  stack: { gap: spacing(1) },
  warning: { ...type.muted, color: colors.danger },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  linkText: { flex: 1, gap: spacing(0.25) },
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
});

/** "a recording" / "3 recordings" — the count read as a phrase. */
/**
 * How loudly this channel may interrupt the person reading the screen.
 *
 * Three buttons rather than a slider or a switch, because the middle value is
 * a real choice and not a midpoint: "pings make a sound, nothing else does" is
 * what most people want and is not something anybody arrives at by dragging.
 * Each carries the sentence describing what it does, since the labels alone
 * cannot say whether "Quiet" still delivers anything — and somebody choosing
 * it is asking to be left alone about this channel, not to stop being told.
 *
 * The current value comes from the channel snapshot, which is per connection
 * and already carries this viewer's own setting. It is held in local state
 * once tapped so the screen answers immediately; the next snapshot carries the
 * same value back out of the database, so the optimistic answer and the
 * authoritative one converge rather than fight. A refusal puts it back, which
 * matters because the one thing worse than a setting that does not take is a
 * screen claiming it did.
 */
function NotificationLevelPicker({ channelId }: { channelId: string }) {
  const app = useApp();
  const stored =
    app.channelViews[channelId]?.notificationLevel ?? DEFAULT_NOTIFICATION_LEVEL;
  const [level, setLevel] = useState<NotificationLevel>(stored);
  const [error, setError] = useState<string | null>(null);

  // The snapshot is the authority, so a change made on another device — or the
  // first snapshot to arrive after this screen opened — wins over what is on
  // screen.
  useEffect(() => {
    setLevel(stored);
  }, [stored]);

  const choose = (next: NotificationLevel) => {
    const previous = level;
    setLevel(next);
    setError(null);
    app.setNotificationLevel(channelId, next).then(
      (saved) => setLevel(saved),
      (failure: unknown) => {
        setLevel(previous);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not change that just now.'
        );
      }
    );
  };

  return (
    <>
      {NOTIFICATION_LEVELS.map((option) => {
        const { label, detail } = describeLevel(option);
        return (
          <Button
            key={option}
            label={label}
            sublabel={detail}
            variant={option === level ? 'primary' : 'default'}
            onPress={() => choose(option)}
          />
        );
      })}
      {error ? <Text style={styles.warning}>{error}</Text> : null}
    </>
  );
}

/**
 * The links this channel has, live and dead.
 *
 * Loaded when the screen opens rather than held in app state: nothing else
 * reads it, no rule turns on it, and a cached list would be wrong the moment
 * anybody minted or revoked one from another device. The same reasoning as
 * Settings and donations.
 *
 * Revoked links stay in the list, which is the point of keeping the rows: a
 * link that quietly vanished would leave somebody wondering whether they had
 * imagined making it. The two ways one dies read differently on purpose —
 * somebody revoked it, or the channel emptied and the rule did.
 */
function GuestLinks({
  channelId,
  mayRevoke,
}: {
  channelId: string;
  /** `hasTheRoom`, which the server asks again in `revokeGuestLink`. */
  mayRevoke: boolean;
}) {
  const app = useApp();
  const [links, setLinks] = useState<GuestLinkSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    app
      .guestLinks(channelId)
      .then(setLinks)
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error ? failure.message : 'Could not read the links.'
        )
      );
  }, [app, channelId]);

  useEffect(load, [load]);

  if (error) return <Text style={styles.warning}>{error}</Text>;
  if (!links) return <Text style={type.muted}>Reading…</Text>;
  if (links.length === 0) {
    return (
      <Text style={type.muted}>
        No guest links yet. The channel screen makes one and hands it to the
        share sheet.
      </Text>
    );
  }

  return (
    <>
      {links.map((link) => (
        <View key={link.token} style={styles.linkRow}>
          <View style={styles.linkText}>
            <Text style={type.body} numberOfLines={1}>
              {link.url.replace(/^https?:\/\//, '')}
            </Text>
            <Text style={type.muted}>
              {link.revokedAt === null
                ? 'Open — anybody with it can knock'
                : link.revokedBy === null
                  ? 'Closed when the channel emptied'
                  : 'Revoked'}
            </Text>
          </View>
          {link.revokedAt === null ? (
            <Button
              label="Revoke"
              variant="ghost"
              disabled={!mayRevoke}
              onPress={() => {
                void app
                  .revokeGuestLink(channelId, link.token)
                  .then(load)
                  .catch(() => setError('That did not work.'));
              }}
            />
          ) : null}
        </View>
      ))}
      <Text style={type.muted}>
        {mayRevoke
          ? 'Revoking stops new people knocking. Anybody already in the channel stays until they leave or somebody removes them.'
          : 'Step in to revoke a link. Shutting a door onto a conversation is for whoever is in it.'}
      </Text>
    </>
  );
}

function countOf(n: number): string {
  return n === 1 ? 'its one recording' : `its ${n} recordings`;
}

/** Said in the warning, so it cannot disagree with what the server does. */
const RETENTION_DAYS = Math.round(DELETED_RETENTION_MS / (24 * 60 * 60 * 1000));
