import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_CHANNEL_NAME_LENGTH } from '../../../core/constants';
import type { ChannelState } from '../../../core/types';
import { useApp } from '../state/AppProvider';
import { Button, Card, Field, SectionLabel } from './components';
import { spacing, type } from './theme';

/**
 * Channel settings, reached from the Channel view. Holds what is about the
 * channel rather than about the conversation — today only its name, which
 * replaces the roster-derived header ("3 people") everywhere it is shown.
 */
export function ChannelSettingsView({
  channel,
  onBack,
}: {
  channel: ChannelState;
  onBack: () => void;
}) {
  const app = useApp();
  const [name, setName] = useState(channel.name ?? '');

  const save = () => {
    app.act(channel.id, { type: 'SET_NAME', name });
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
          onSubmit={save}
        />
        <Button label="Save" variant="primary" onPress={save} />
        <Text style={type.muted}>
          Everyone in the channel sees this name, and anyone in it can change
          it. Leave it empty to go back to listing who is here.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: spacing(2) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stack: { gap: spacing(1) },
});
