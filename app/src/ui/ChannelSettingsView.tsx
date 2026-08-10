import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
} from '../../../core/constants';
import type { ChannelState } from '../../../core/types';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, SectionLabel } from './components';
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
  const [name, setName] = useState(channel.name ?? '');
  const [description, setDescription] = useState(channel.description ?? '');

  const saveName = () => {
    app.act(channel.id, { type: 'SET_NAME', name });
    onBack();
  };

  const saveDescription = () => {
    app.act(channel.id, { type: 'SET_DESCRIPTION', description });
    onBack();
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
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
      <SectionLabel>Leaving</SectionLabel>
      <Card style={styles.stack}>
        <Button
          label="Leave channel"
          sublabel={
            lastMember
              ? 'You are the last member — this deletes the channel'
              : 'Removes it from your home screen'
          }
          variant={lastMember ? 'danger' : 'default'}
          onPress={() =>
            Alert.alert(
              lastMember ? 'Delete this channel?' : 'Leave this channel?',
              lastMember
                ? 'You are its last member, so leaving deletes it. Its recordings are kept.'
                : 'It disappears from your home screen and you will need a fresh invitation to come back. Everyone else keeps it.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: lastMember ? 'Delete' : 'Leave',
                  style: 'destructive',
                  onPress: () => {
                    app.act(channel.id, { type: 'LEAVE_CHANNEL' });
                    onLeft();
                  },
                },
              ]
            )
          }
        />
        <Text style={type.muted}>
          Stepping out is on the channel screen and is probably what you want:
          it keeps your place here.
        </Text>
      </Card>
    </ScrollView>
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
