import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  DELETED_RETENTION_MS,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
} from '../../../core/constants';
import type { ChannelState } from '../../../core/types';
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
  // What deleting would take with it. Read from the snapshot the channel
  // screen is already showing, so the number in the warning is the number of
  // rows the person can see above it.
  const recordingCount =
    app.channelView?.channel.id === channel.id
      ? (app.channelView.recordings?.length ?? 0)
      : 0;
  const [name, setName] = useState(channel.name ?? '');
  const [description, setDescription] = useState(channel.description ?? '');

  const saveName = () => {
    app.act(channel.id, { type: 'SET_NAME', name });
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

  const saveDescription = () => {
    app.act(channel.id, { type: 'SET_DESCRIPTION', description });
    onBack();
  };

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.heading}>Channel settings</Text>
        <Button label="Done" variant="ghost" onPress={onBack} />
      </View>

      <SectionLabel>Channel name</SectionLabel>
      <Card style={styles.stack}>
        <Field
          value={name}
          onChangeText={(v) => setName(v.slice(0, MAX_CHANNEL_NAME_LENGTH))}
          placeholder="What is this channel about?"
          autoCapitalize="words"
          onSubmit={saveName}
        />
        <Button label="Save name" variant="primary" onPress={saveName} />
        <Text style={type.muted}>
          Everyone in the channel sees this name, and anyone in it can change
          it. Leave it empty to go back to listing who is here.
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
        />

        {/*
          A preview, because the input shows markup and the header will not.
          Without it the only way to find out what `[a](b)` becomes is to save
          and go back, and the only way to fix a typo is to do that twice.
        */}
        {description.trim() ? (
          <View style={styles.preview}>
            <Text style={type.label}>Preview</Text>
            <InlineMarkdown text={description} style={styles.previewText} />
          </View>
        ) : null}

        <Button
          label="Save description"
          variant="primary"
          onPress={saveDescription}
        />
        <Text style={type.muted}>
          Shown under the channel name to everyone in it. **Bold**, *italic*,
          `code`, ~~strikethrough~~ and [links](https://example.com) work.
          Links open in your browser.
        </Text>
        <Text style={styles.count}>
          {description.length} / {MAX_CHANNEL_DESCRIPTION_LENGTH}
        </Text>
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
function countOf(n: number): string {
  return n === 1 ? 'its one recording' : `its ${n} recordings`;
}

/** Said in the warning, so it cannot disagree with what the server does. */
const RETENTION_DAYS = Math.round(DELETED_RETENTION_MS / (24 * 60 * 60 * 1000));
