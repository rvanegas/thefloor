import React, { useEffect, useState } from 'react';
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
import { MAX_CHANNEL_PARTICIPANTS } from '../../../core/constants';
import { exportRecording } from '../api/download';
import { useApp } from '../state/AppProvider';
import { Button, Card, Empty, Field, SectionLabel } from './components';
import { colors, formatDuration, radius, spacing, type } from './theme';

/**
 * Signed in, not in a channel. Ordered by priority: live invites, channels you
 * left and can still re-enter, contacts, adding a contact, then past
 * recordings. Everything here is a server snapshot — nothing is computed
 * locally.
 */
export function HomeView({
  onEnterChannel,
  onOpenSettings,
  liveChannel = null,
  onReturnToChannel = () => {},
}: {
  onEnterChannel: (channelId: string) => void;
  onOpenSettings: () => void;
  /**
   * The channel you are present in right now, if you walked back here without
   * stepping out. Null when you are not in one.
   */
  liveChannel?: {
    channelId: string;
    title: string;
    present: number;
    /** Muted by your own choice — not the floor, which is a different thing. */
    muted: boolean;
  } | null;
  onReturnToChannel?: (channelId: string) => void;
}) {
  const app = useApp();
  const dismissed = app.dismissedInvites;

  const home = app.home;
  const invites = (home?.invites ?? []).filter(
    (i) => !dismissed.includes(i.channelId)
  );
  const live = home?.rejoinable ?? [];
  const contacts = home?.contacts ?? [];
  const recordings = home?.recordings ?? [];

  /**
   * A live channel *containing* each contact, if there is one. The server
   * keeps one live channel per set of people, so a 1:1 tap on someone already
   * in a channel with you would rejoin it rather than make a second — and the
   * contact row must not offer to start what has already begun.
   *
   * `shown` is whether that channel already has its own affordance above, as a
   * banner or a rejoin row. When it does, the contact row says so and offers
   * nothing; when it does not — a dismissed invite — the row is the only way
   * back, and offers to join rather than to start.
   */
  const channelWith = new Map<string, { channelId: string; shown: boolean }>();
  for (const invite of home?.invites ?? []) {
    channelWith.set(invite.from.id, {
      channelId: invite.channelId,
      shown: !dismissed.includes(invite.channelId),
    });
  }
  for (const channel of live) {
    for (const other of channel.others) {
      channelWith.set(other.id, { channelId: channel.channelId, shown: true });
    }
  }

  /**
   * Multi-select for starting a channel with several contacts at once. Off by
   * default: a plain tap still starts a 1:1 immediately, and this mode only
   * changes what the rows offer, not what they are.
   */
  /**
   * Whether the connection has had its chance. True as soon as it opens, or
   * after a couple of seconds if it has not — so a device that genuinely
   * cannot reach the server still finds out.
   */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (app.status === 'open') {
      setSettled(true);
      return;
    }
    const timer = setTimeout(() => setSettled(true), 2_500);
    return () => clearTimeout(timer);
  }, [app.status]);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const toggleSelected = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };
  const startWithSelected = async () => {
    try {
      const id = await app.startChannel(selected);
      stopSelecting();
      app.act(id, { type: 'ENTER' });
      onEnterChannel(id);
    } catch (e) {
      Alert.alert(
        'Could not start channel',
        e instanceof Error ? e.message : String(e)
      );
    }
  };

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
        {/*
          One way off this screen that is not a channel. Signing out moved in
          there with it: it is about the account rather than about the list,
          and it sat beside a dozen taps that are not remotely destructive.
        */}
        <Button label="Settings" variant="ghost" onPress={onOpenSettings} />
      </View>

      {/*
        You can now be in a conversation while looking at this screen, which
        means the app has to say so. An open microphone behind a screen giving
        no sign of it is the one way this could be worse than having to step
        out first.
      */}
      {liveChannel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${liveChannel.title}, ${
            liveChannel.muted ? 'your microphone is muted' : 'you are here'
          }. Tap to return.`}
          onPress={() => onReturnToChannel(liveChannel.channelId)}
          style={styles.liveBar}
        >
          <View style={styles.rowMain}>
            {/*
              A dot, and nothing else. That you are in here is not a sentence
              worth spending on a screen that is mostly a list of names — but
              it is worth a mark, and the mark can carry a second fact for
              free: filled means your microphone is open, hollow and grey
              means you muted yourself.

              Nothing to a screen reader, though, which is why the whole bar
              carries a label saying it in words.
            */}
            <View style={styles.liveTitleRow}>
              <View
                style={[styles.liveDot, liveChannel.muted && styles.liveDotMuted]}
              />
              <Text style={styles.liveTitle} numberOfLines={1}>
                {liveChannel.title}
              </Text>
            </View>
            <Text style={styles.liveSub}>
              {liveChannel.present === 1
                ? 'Nobody else is here yet'
                : `${liveChannel.present} present`}{' '}
              · tap to go back
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/*
        Not shown while the first connection is still being made. The socket
        opens a moment after this screen does, so saying "not connected" then
        is true, useless, and alarming in that order — a warning that resolves
        itself before it can be read teaches people to ignore warnings.

        Once we have been connected, or once long enough has passed that
        failing to connect is real news, it says so immediately.
      */}
      {app.status !== 'open' && settled ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            {app.status === 'connecting'
              ? 'Reconnecting…'
              : 'Not connected — invites and channels will not update.'}
          </Text>
        </View>
      ) : null}

      {invites.map((invite) => (
        <InviteBanner
          key={invite.channelId}
          invite={invite}
          onJoin={() => {
            app.act(invite.channelId, { type: 'ENTER' });
            onEnterChannel(invite.channelId);
          }}
          onDismiss={() => app.dismissInvite(invite.channelId)}
        />
      ))}

      {live.length > 0 ? (
        <>
          <SectionLabel>Your channels</SectionLabel>
          <View style={styles.list}>
            {live.map((channel) => (
              <ChannelRow
                key={channel.channelId}
                channel={channel}
                onStepIn={() => {
                  app.act(channel.channelId, { type: 'ENTER' });
                  onEnterChannel(channel.channelId);
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
              existing={channelWith.get(entry.account.id)}
              selecting={selecting}
              selected={selected.includes(entry.account.id)}
              // Room for the initiator plus what is already picked.
              selectable={
                selected.includes(entry.account.id) ||
                selected.length < MAX_CHANNEL_PARTICIPANTS - 1
              }
              onToggleSelect={() => toggleSelected(entry.account.id)}
              onStartChannel={async () => {
                try {
                  const id = await app.startChannel([entry.account.id]);
                  app.act(id, { type: 'ENTER' });
                  onEnterChannel(id);
                } catch (e) {
                  Alert.alert(
                    'Could not start channel',
                    e instanceof Error ? e.message : String(e)
                  );
                }
              }}
              onJoinExisting={(channelId) => {
                app.act(channelId, { type: 'ENTER' });
                onEnterChannel(channelId);
              }}
            />
          ))}
        </View>
      )}

      {selecting ? (
        <View style={styles.selectBar}>
          <Button
            label={
              selected.length === 0
                ? 'Pick people above'
                : `Start with ${selected.length}`
            }
            variant="primary"
            disabled={selected.length === 0}
            onPress={startWithSelected}
          />
          <Button label="Cancel" variant="ghost" onPress={stopSelecting} />
        </View>
      ) : contacts.filter((c) => c.status === 'accepted').length >= 2 ? (
        <Button
          label="Start a channel with several people"
          variant="ghost"
          onPress={() => setSelecting(true)}
        />
      ) : null}

      <SectionLabel>Add contact</SectionLabel>
      <AddContact />

      <SectionLabel>Past recordings</SectionLabel>
      {recordings.length === 0 ? (
        <Empty>Recordings you make in a channel will appear here.</Empty>
      ) : (
        <View style={styles.list}>
          {recordings.map((r) => (
            <Card key={r.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={type.body} numberOfLines={1}>
                  {r.others.map((other) => other.displayName).join(', ') ||
                    'Unknown'}
                </Text>
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
            recording.others.map((other) => other.displayName).join(', ') ||
              'channel'
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
 * channel ends. Several contacts can be inviting at once, so these stack.
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
        <Text style={styles.bannerSub}>is waiting in a channel — tap to join</Text>
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

function ChannelRow({
  channel,
  onStepIn,
}: {
  channel: RejoinableView;
  /** Presence, not membership — you never stopped belonging to it. */
  onStepIn: () => void;
}) {
  return (
    <Card style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={type.body} numberOfLines={1}>
          {channel.name ??
            (channel.others.length > 0
              ? channel.others.map((other) => other.displayName).join(', ')
              : 'Just you')}
        </Text>
        <Text style={type.muted}>
          {/*
            An empty channel used to be sixty seconds from destruction, and
            saying so was a reason to hurry back. Channels are permanent now:
            nobody being in one is a resting state, not a countdown, and the
            old line was the app promising something that could not happen.
          */}
          {channel.presentCount > 0
            ? `${channel.presentCount} present`
            : 'Nobody here right now'}
        </Text>
      </View>
      <Button label="Step in" variant="primary" onPress={onStepIn} />
    </Card>
  );
}

function ContactRow({
  entry,
  existing,
  selecting,
  selected,
  selectable,
  onToggleSelect,
  onStartChannel,
  onJoinExisting,
}: {
  entry: ContactView;
  /** A live channel containing this contact, if one has already begun. */
  existing?: { channelId: string; shown: boolean };
  /** Whether the list is in multi-select mode. */
  selecting: boolean;
  selected: boolean;
  /** False once the cap leaves no room for another pick. */
  selectable: boolean;
  onToggleSelect: () => void;
  onStartChannel: () => void;
  onJoinExisting: (channelId: string) => void;
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
            : existing?.shown && !selecting
              ? 'Channel already open'
              : ''}
        </Text>
      </View>

      {status === 'accepted' && selecting ? (
        <Button
          label={selected ? 'Picked ✓' : 'Pick'}
          variant={selected ? 'primary' : 'ghost'}
          disabled={!selectable}
          onPress={onToggleSelect}
        />
      ) : status === 'accepted' ? (
        existing?.shown ? null : existing ? (
          <Button
            label="Join channel"
            onPress={() => onJoinExisting(existing.channelId)}
          />
        ) : (
          <Button label="Start channel" onPress={onStartChannel} />
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
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.floorDim,
    borderColor: colors.floor,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(1.75),
    marginBottom: spacing(1),
  },
  liveTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  liveTitle: { flexShrink: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  liveSub: { fontSize: 13, color: colors.textMuted },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.floor,
  },
  /**
   * Hollow and grey rather than a second bright colour. Muting yourself is not
   * an alarm and it is not the floor silencing you — which has its own colour
   * — so it reads as absence of transmission rather than as a warning.
   */
  liveDotMuted: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.textFaint,
  },
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
  selectBar: { flexDirection: 'row', gap: spacing(1), marginTop: spacing(1) },
});
