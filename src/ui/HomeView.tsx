import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { backend } from '../mock/backend';
import type { Account, ContactEntry, LiveInvite } from '../mock/types';
import { useBackendState } from '../state/useBackend';
import { Button, Card, Empty, Field, SectionLabel } from './components';
import { colors, formatDuration, radius, spacing, type } from './theme';

/**
 * Signed in, not in a session. Ordered by priority: live invites, sessions you
 * left and can still re-enter, contacts, adding a contact, then past
 * recordings.
 */
export function HomeView({
  me,
  onEnterSession,
  onSignOut,
}: {
  me: Account;
  onEnterSession: (sessionId: string) => void;
  onSignOut: () => void;
}) {
  useBackendState();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const invites = backend
    .invitesFor(me.id)
    .filter((i) => !dismissed.includes(i.sessionId));
  const live = backend.liveSessionsFor(me.id);
  const contacts = backend.contactsFor(me.id);
  const recordings = backend.recordingsFor(me.id);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={type.title}>The Floor</Text>
          <Text style={type.muted}>Signed in as {me.displayName}</Text>
        </View>
        <Button label="Sign out" variant="ghost" onPress={onSignOut} />
      </View>

      {invites.map((invite) => (
        <InviteBanner
          key={invite.sessionId}
          invite={invite}
          onJoin={() => {
            backend.dispatch(invite.sessionId, { type: 'ENTER', userId: me.id });
            onEnterSession(invite.sessionId);
          }}
          onDismiss={() => setDismissed((d) => [...d, invite.sessionId])}
        />
      ))}

      {live.length > 0 ? (
        <>
          <SectionLabel>Live sessions</SectionLabel>
          <View style={styles.list}>
            {live.map((session) => (
              <Card key={session.sessionId} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={type.body}>{session.other.displayName}</Text>
                  <Text style={type.muted}>
                    {session.otherPresent
                      ? 'Still there — you left'
                      : 'Empty — ends within a minute'}
                  </Text>
                </View>
                <Button
                  label="Rejoin"
                  variant="primary"
                  onPress={() => {
                    backend.dispatch(session.sessionId, {
                      type: 'ENTER',
                      userId: me.id,
                    });
                    onEnterSession(session.sessionId);
                  }}
                />
              </Card>
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel>Contacts</SectionLabel>
      {contacts.length === 0 ? (
        <Empty>No contacts yet. Add one below.</Empty>
      ) : (
        <View style={styles.list}>
          {contacts.map((entry) => (
            <ContactRow
              key={entry.account.id}
              me={me}
              entry={entry}
              onStartSession={() =>
                onEnterSession(backend.startSession(me.id, entry.account.id))
              }
            />
          ))}
        </View>
      )}

      <SectionLabel>Add contact</SectionLabel>
      <AddContact me={me} />

      <SectionLabel>Past recordings</SectionLabel>
      {recordings.length === 0 ? (
        <Empty>Recordings you make in a session will appear here.</Empty>
      ) : (
        <View style={styles.list}>
          {recordings.map((r) => {
            const otherId = r.participants.find((p) => p !== me.id);
            const other = otherId ? backend.getAccount(otherId) : undefined;
            return (
              <Card key={r.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={type.body}>{other?.displayName ?? 'Unknown'}</Text>
                  <Text style={type.muted}>
                    {new Date(r.startedAt).toLocaleString()} ·{' '}
                    {formatDuration(r.durationMs)}
                  </Text>
                </View>
                <Button
                  label="Export"
                  onPress={() => {
                    const key = backend.exportRecording(r.id, me.id);
                    Alert.alert(
                      'Export recording',
                      key
                        ? `Demo build — no file is written. The stored object is:\n\n${key}`
                        : 'This recording is not available to you.'
                    );
                  }}
                />
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * Live invites are in-app only and persist until acted on or the underlying
 * session ends. Several contacts can be inviting at once, so these stack.
 */
function InviteBanner({
  invite,
  onJoin,
  onDismiss,
}: {
  invite: LiveInvite;
  onJoin: () => void;
  onDismiss: () => void;
}) {
  return (
    <Pressable onPress={onJoin} style={styles.banner}>
      <View style={styles.rowMain}>
        <Text style={styles.bannerTitle}>{invite.from.displayName}</Text>
        <Text style={styles.bannerSub}>is waiting in a session — tap to join</Text>
      </View>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityLabel="Dismiss invite"
      >
        <Text style={styles.bannerDismiss}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

function ContactRow({
  me,
  entry,
  onStartSession,
}: {
  me: Account;
  entry: ContactEntry;
  onStartSession: () => void;
}) {
  const { account, status } = entry;
  return (
    <Card style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={type.body}>{account.displayName}</Text>
        <Text style={type.muted}>
          {status === 'accepted' ? account.identifier : 'Pending'}
        </Text>
      </View>

      {status === 'accepted' ? (
        <Button label="Start session" onPress={onStartSession} />
      ) : status === 'incoming' ? (
        <View style={styles.rowActions}>
          <Button
            label="Accept"
            variant="primary"
            onPress={() => backend.acceptContactRequest(me.id, account.id)}
          />
          <Button
            label="Decline"
            variant="ghost"
            onPress={() => backend.declineContactRequest(me.id, account.id)}
          />
        </View>
      ) : (
        <Text style={styles.pendingTag}>Sent</Text>
      )}
    </Card>
  );
}

function AddContact({ me }: { me: Account }) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  function send() {
    const result = backend.sendContactRequest(me.id, query);
    if (result.ok) {
      setMessage({ ok: true, text: 'Request sent — awaiting their acceptance.' });
      setQuery('');
    } else {
      setMessage({ ok: false, text: result.error });
    }
  }

  return (
    <View style={styles.addContact}>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search by phone number or email"
      />
      <Button label="Send request" onPress={send} disabled={!query.trim()} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Without an explicit flex, a ScrollView keeps its full content height
  // (RN defaults to flexShrink: 0), overflows its parent, and never scrolls.
  scroll: { flex: 1 },
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing(1),
  },
  list: { gap: spacing(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1.5),
  },
  rowMain: { flex: 1, gap: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing(0.5) },
  pendingTag: { ...type.muted, color: colors.textFaint },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.floorDim,
    borderColor: colors.floor,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(2),
    marginBottom: spacing(1),
  },
  bannerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  bannerSub: { fontSize: 13, color: colors.textMuted },
  bannerDismiss: { color: colors.textMuted, fontSize: 16, paddingHorizontal: 4 },
  addContact: { gap: spacing(1) },
  message: { fontSize: 13 },
});
