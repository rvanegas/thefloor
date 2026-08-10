import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  ContactView,
  InviteView,
  RecordingView,
  RejoinableView,
} from '../../../core/protocol';
import { exportRecording } from '../api/download';
import { useApp } from '../state/AppProvider';
import { Button, Card, Empty, Field, SectionLabel } from './components';
import { colors, formatDuration, radius, spacing, type } from './theme';

/**
 * Signed in, not in a session. Ordered by priority: live invites, sessions you
 * left and can still re-enter, contacts, adding a contact, then past
 * recordings. Everything here is a server snapshot — nothing is computed
 * locally.
 */
export function HomeView({
  onEnterSession,
}: {
  onEnterSession: (sessionId: string) => void;
}) {
  const app = useApp();
  const dismissed = app.dismissedInvites;

  const home = app.home;
  const invites = (home?.invites ?? []).filter(
    (i) => !dismissed.includes(i.sessionId)
  );
  const live = home?.rejoinable ?? [];
  const contacts = home?.contacts ?? [];
  const recordings = home?.recordings ?? [];

  /**
   * The one live session with each contact, if there is one. A pair has at most
   * one — the server returns the existing session rather than making a second —
   * so a contact row must not offer to start what has already begun.
   *
   * `shown` is whether that session already has its own affordance above, as a
   * banner or a rejoin row. When it does, the contact row says so and offers
   * nothing; when it does not — a dismissed invite — the row is the only way
   * back, and offers to join rather than to start.
   */
  const sessionWith = new Map<string, { sessionId: string; shown: boolean }>();
  for (const invite of home?.invites ?? []) {
    sessionWith.set(invite.from.id, {
      sessionId: invite.sessionId,
      shown: !dismissed.includes(invite.sessionId),
    });
  }
  for (const session of live) {
    sessionWith.set(session.other.id, {
      sessionId: session.sessionId,
      shown: true,
    });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={type.title}>The Floor</Text>
          <Text style={type.muted}>
            {app.me ? `Signed in as ${app.me.displayName}` : 'Signed in'}
            {app.status !== 'open' ? ` · ${describeStatus(app.status)}` : ''}
          </Text>
        </View>
        <Button label="Sign out" variant="ghost" onPress={() => app.signOut()} />
      </View>

      {app.status !== 'open' ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            {app.status === 'connecting'
              ? 'Reconnecting…'
              : 'Not connected — invites and sessions will not update.'}
          </Text>
        </View>
      ) : null}

      {invites.map((invite) => (
        <InviteBanner
          key={invite.sessionId}
          invite={invite}
          onJoin={() => {
            app.act(invite.sessionId, { type: 'ENTER' });
            onEnterSession(invite.sessionId);
          }}
          onDismiss={() => app.dismissInvite(invite.sessionId)}
        />
      ))}

      {live.length > 0 ? (
        <>
          <SectionLabel>Live sessions</SectionLabel>
          <View style={styles.list}>
            {live.map((session) => (
              <RejoinRow
                key={session.sessionId}
                session={session}
                onRejoin={() => {
                  app.act(session.sessionId, { type: 'ENTER' });
                  onEnterSession(session.sessionId);
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel>Contacts</SectionLabel>
      {!home ? (
        <Empty>Loading…</Empty>
      ) : contacts.length === 0 ? (
        <Empty>No contacts yet. Add one below.</Empty>
      ) : (
        <View style={styles.list}>
          {contacts.map((entry) => (
            <ContactRow
              // An outgoing request carries no account id — deliberately, so
              // that one sent to an address without an account is
              // indistinguishable from one sent to a user. Its identity is the
              // address, which is what `displayName` holds for these rows and
              // is unique: there cannot be two requests to the same address.
              key={entry.account.id || `sent:${entry.account.displayName}`}
              entry={entry}
              existing={sessionWith.get(entry.account.id)}
              onStartSession={async () => {
                try {
                  const id = await app.startSession(entry.account.id);
                  app.act(id, { type: 'ENTER' });
                  onEnterSession(id);
                } catch (e) {
                  Alert.alert(
                    'Could not start session',
                    e instanceof Error ? e.message : String(e)
                  );
                }
              }}
              onJoinExisting={(sessionId) => {
                app.act(sessionId, { type: 'ENTER' });
                onEnterSession(sessionId);
              }}
            />
          ))}
        </View>
      )}

      <SectionLabel>Add contact</SectionLabel>
      <AddContact />

      <SectionLabel>Past recordings</SectionLabel>
      {recordings.length === 0 ? (
        <Empty>Recordings you make in a session will appear here.</Empty>
      ) : (
        <View style={styles.list}>
          {recordings.map((r) => (
            <Card key={r.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={type.body}>{r.other?.displayName ?? 'Unknown'}</Text>
                <Text style={type.muted}>
                  {new Date(r.startedAt).toLocaleString()} ·{' '}
                  {formatDuration(r.durationMs)}
                </Text>
              </View>
              <ExportButton recording={r} />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * Its own component so each row keeps its own progress state — the mix is
 * encoded on demand, so this is a wait of seconds rather than an instant
 * download, and a shared flag would show every row as busy.
 */
function ExportButton({ recording }: { recording: RecordingView }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      label={busy ? 'Preparing…' : 'Export'}
      disabled={busy}
      onPress={async () => {
        if (!app.token) return;
        setBusy(true);
        try {
          await exportRecording(
            app.token,
            recording.id,
            recording.other?.displayName ?? 'session'
          );
        } catch (e) {
          Alert.alert(
            'Could not export',
            e instanceof Error ? e.message : String(e)
          );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function describeStatus(status: string): string {
  return status === 'connecting' ? 'reconnecting' : 'offline';
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
  invite: InviteView;
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

function RejoinRow({
  session,
  onRejoin,
}: {
  session: RejoinableView;
  onRejoin: () => void;
}) {
  return (
    <Card style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={type.body}>{session.other.displayName}</Text>
        <Text style={type.muted}>
          {session.otherPresent
            ? 'Still there — you left'
            : 'Empty — ends within a minute'}
        </Text>
      </View>
      <Button label="Rejoin" variant="primary" onPress={onRejoin} />
    </Card>
  );
}

function ContactRow({
  entry,
  existing,
  onStartSession,
  onJoinExisting,
}: {
  entry: ContactView;
  /** The live session with this contact, if one has already begun. */
  existing?: { sessionId: string; shown: boolean };
  onStartSession: () => void;
  onJoinExisting: (sessionId: string) => void;
}) {
  const app = useApp();
  const { account, status } = entry;
  return (
    <Card style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={type.body}>{account.displayName}</Text>
        <Text style={type.muted}>
          {status !== 'accepted'
            ? 'Pending'
            : existing?.shown
              ? 'Session already open'
              : ''}
        </Text>
      </View>

      {status === 'accepted' ? (
        existing?.shown ? null : existing ? (
          <Button
            label="Join session"
            onPress={() => onJoinExisting(existing.sessionId)}
          />
        ) : (
          <Button label="Start session" onPress={onStartSession} />
        )
      ) : status === 'incoming' ? (
        <View style={styles.rowActions}>
          <Button
            label="Accept"
            variant="primary"
            onPress={() => app.acceptContact(account.id)}
          />
          <Button
            label="Decline"
            variant="ghost"
            onPress={() => app.declineContact(account.id)}
          />
        </View>
      ) : (
        <View style={styles.rowActions}>
          <Text style={styles.pendingTag}>Sent</Text>
          {/*
            Identified by the address, which is what displayName holds for
            outgoing rows — these have no account id to cancel by, on purpose.
          */}
          <Button
            label="Withdraw"
            variant="ghost"
            onPress={() =>
              app.withdrawContact(account.displayName).catch((e) => {
                Alert.alert(
                  'Could not withdraw',
                  e instanceof Error ? e.message : String(e)
                );
              })
            }
          />
        </View>
      )}
    </Card>
  );
}

function AddContact() {
  const app = useApp();
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

  return (
    <View style={styles.addContact}>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search by email address"
        keyboardType="email-address"
        onSubmit={query.trim() && !busy ? send : undefined}
        submitLabel="send"
      />
      <Button
        label={busy ? 'Sending…' : 'Send request'}
        onPress={send}
        disabled={!query.trim() || busy}
      />
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
  scroll: { flex: 1 },
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing(1),
  },
  headerMain: { flex: 1 },
  offline: {
    backgroundColor: colors.surface,
    borderColor: colors.silenced,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(1.25),
    marginBottom: spacing(1),
  },
  offlineText: { color: colors.silenced, fontSize: 13 },
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
