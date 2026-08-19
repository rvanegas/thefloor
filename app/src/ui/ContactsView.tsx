import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ContactView as Contact } from '../../../core/protocol';
import { useApp } from '../state/AppProvider';
import { describeAvailability } from './availability';
import { Button, Card, Empty, Field, Screen, SectionLabel } from './components';
import { ContactsSettingsView } from './ContactsSettingsView';
import { ProfileView } from './ProfileView';
import { colors, spacing, type } from './theme';

/**
 * The people you know, and whether they are about.
 *
 * Home used to carry this, and lost it when it became a list of channels —
 * which was right for Home and wrong for the fact: a channel's idleness says
 * when anybody was last in a room, and says nothing at all about whether its
 * other member is holding a phone right now. Those are different questions and
 * only one of them was still being answered.
 *
 * It is a screen rather than a section because of what a contact row is for.
 * There is no channel to step into from here — the channel list is Home's job,
 * and a contact row that offered one would be the overlap that took the old
 * list apart. What a row does is open the person: their bio, where they are,
 * and the one destructive thing you can do about them.
 *
 * Requests stay on Home. They are not contacts yet, they are the one thing on
 * that screen that cannot be a channel, and answering one is a thing to do
 * rather than somebody to look up.
 */
export function ContactsView({ onHome }: { onHome: () => void }) {
  const app = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(
    null
  );
  const now = app.serverNow();

  const contacts = (app.home?.contacts ?? []).filter(
    (entry) => entry.status === 'accepted'
  );

  // Above the settings case rather than below it, so closing a profile returns
  // to whatever was underneath — Settings when Settings opened it, this list
  // otherwise — without either of them having to know.
  if (profile) {
    return (
      <ProfileView
        accountId={profile.id}
        fallbackName={profile.name}
        onBack={() => setProfile(null)}
        // Removing a contact from their own profile takes the row this screen
        // was opened from with it, so there is nothing to go back to.
        onRemoved={() => setProfile(null)}
      />
    );
  }

  if (settingsOpen) {
    return (
      <ContactsSettingsView
        onBack={() => setSettingsOpen(false)}
        onOpenProfile={() =>
          app.me && setProfile({ id: app.me.id, name: app.me.displayName })
        }
      />
    );
  }

  return (
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={type.title}>Contacts</Text>
        {/* The pair every screen in the app carries: the way back, and the
            settings for this scope. Home and a channel both read this way. */}
        <View style={styles.headerActions}>
          <Button label="Home" variant="ghost" onPress={onHome} />
          <Button
            label="Settings"
            variant="ghost"
            onPress={() => setSettingsOpen(true)}
          />
        </View>
      </View>

      <AddContact />

      {contacts.length > 0 ? <SectionLabel>Contacts</SectionLabel> : null}
      {contacts.length === 0 ? (
        <Empty>
          Nobody yet. Add somebody by the address they signed up with, and they
          decide.
        </Empty>
      ) : (
        <View style={styles.list}>
          {contacts.map((entry) => (
            <ContactRow
              key={entry.account.id}
              entry={entry}
              now={now}
              onPress={() =>
                setProfile({
                  id: entry.account.id,
                  name: entry.account.displayName,
                })
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function ContactRow({
  entry,
  now,
  onPress,
}: {
  entry: Contact;
  now: number;
  onPress: () => void;
}) {
  const availability = describeAvailability(entry, now);
  return (
    // The whole row, as on Home: there is one thing to do with a contact from
    // here, so a target the size of the row is the honest shape for it.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.account.displayName}.${
        availability ? ` ${availability}.` : ''
      } Open their profile.`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.rowPressed}
    >
      <Card style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={type.body} numberOfLines={1}>
            {entry.account.displayName}
          </Text>
          {/*
            Nothing rather than a hedge when it is not known — a server that
            predates the fields, or somebody who has not connected since they
            existed. "Unknown" would be reporting on the rule rather than on the
            person. See describeAvailability.
          */}
          {availability ? (
            <Text style={type.muted}>{availability}</Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * Asking somebody to be a contact, folded away until it is wanted.
 *
 * It was a permanent field at the foot of Home. At the top of a list of people
 * it would be the first thing on the screen every time, and adding a contact is
 * something you do occasionally where reading the list is what you came for —
 * so it is a line until tapped. The field only exists while it is open, which
 * is also what keeps the keyboard off a screen nobody is typing into.
 */
function AddContact() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const { accepted } = await app.requestContact(query.trim());
      setMessage({
        ok: true,
        text: accepted
          ? 'They had already asked — you are now contacts.'
          : 'Request sent — awaiting their acceptance.',
      });
      setQuery('');
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Card style={styles.addClosed}>
        <Button
          label="Add contact"
          variant="ghost"
          onPress={() => setOpen(true)}
        />
      </Card>
    );
  }

  return (
    <Card style={styles.addContact}>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search by email address"
        keyboardType="email-address"
        autoFocus
        onSubmit={query.trim() && !busy ? send : undefined}
        submitLabel="send"
      />
      <View style={styles.addActions}>
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => {
            setOpen(false);
            setQuery('');
            // The outcome of the last request goes with the form that produced
            // it — a confirmation left behind would be describing something
            // nobody can see any more.
            setMessage(null);
          }}
        />
        <Button
          label={busy ? 'Sending…' : 'Send request'}
          onPress={send}
          disabled={!query.trim() || busy}
        />
      </View>
      {message ? (
        <Text
          style={[
            styles.message,
            { color: message.ok ? colors.success : colors.danger },
          ]}
        >
          {message.text}
        </Text>
      ) : null}
    </Card>
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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  list: { gap: spacing(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  rowMain: { flex: 1, gap: 2 },
  rowPressed: { opacity: 0.7 },
  addClosed: { marginBottom: spacing(1.5) },
  addContact: { gap: spacing(1), marginBottom: spacing(1.5) },
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(0.5),
  },
  message: { fontSize: 13 },
});
