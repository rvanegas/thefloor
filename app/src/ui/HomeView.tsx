import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
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
import { describeChannel } from '../../../core/naming';
import { useOfflineNotice } from './useOfflineNotice';
import { exportRecording } from '../api/download';
import { useApp } from '../state/AppProvider';
import { Button, Card, Empty, Field, Screen, SectionLabel } from './components';
import { agoOrNull } from './relativeTime';
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
  onOpenProfile = () => {},
  onOpenSupport = () => {},
  liveChannel = null,
  onReturnToChannel = () => {},
}: {
  onEnterChannel: (channelId: string) => void;
  onOpenSettings: () => void;
  /**
   * Reads somebody's profile. A contact row is now a way to *find out who
   * somebody is* rather than only a button to start something with them —
   * which is what makes a profile reachable at all, it having previously
   * needed you to already be in a channel with the person.
   */
  onOpenProfile?: (accountId: string, displayName: string) => void;
  /** Opens the screen that explains donating, and carries the link out. */
  onOpenSupport?: () => void;
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

  /**
   * Whether there is anywhere to donate at all, which decides only whether the
   * way in is shown. The explanation and the link itself are on the screen
   * behind it.
   *
   * Asked here rather than carried on the Home snapshot, which is pushed to
   * every client on every change and would be answering this question
   * constantly for a row that never moves. Failure is silence: an older server,
   * or one with no link configured, leaves Home exactly as it was rather than
   * reporting an error about something nobody asked for.
   */
  const [canSupport, setCanSupport] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!app.token) return;
      try {
        const view = await app.loadSupport();
        if (!cancelled) setCanSupport(!!view.url);
      } catch {
        // Nothing to say, and nowhere useful to say it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.token]);

  const home = app.home;
  const invites = (home?.invites ?? []).filter(
    (i) => !dismissed.includes(i.channelId)
  );
  // Every channel you belong to is listed, minus the one the banner is already
  // showing — the two are alternative presentations of the same row, not a
  // list and an exception to it. The server no longer withholds the channel it
  // thinks you are in, because it can be wrong about that and used to hide the
  // channel entirely when it was; whether you are *live* somewhere is settled
  // here, where the app knows what it is actually connected to.
  const rejoinable = orderChannels(home?.rejoinable ?? []);
  const live = rejoinable.filter(
    (channel) => channel.channelId !== liveChannel?.channelId
  );
  const contacts = home?.contacts ?? [];
  // Recordings are not on this screen at all: they live on the channel they
  // were made in, which names them and takes them when it goes. The server
  // still sends `home.recordings` for build 20, which renders it — see
  // planning/BACKLOG.md for when that field goes too.

  /**
   * The channel that tapping a contact would reopen, if there is one — which
   * is the *unnamed* channel holding exactly the two of you, and nothing else.
   *
   * Both halves of that are load-bearing, and this used to have neither. It
   * matched any channel the contact appeared in, so a named three-person
   * channel made a contact read "Channel already open" when tapping them would
   * have opened something else entirely: Erta showed as open because she was
   * in Product Meeting with two other people.
   *
   * The rule it must mirror is the server's. One unnamed channel per set of
   * people, so a 1:1 tap on somebody you have an unnamed channel with reopens
   * that one rather than making a second — and nothing else answers for it. A
   * named channel does not, because a name is exactly what makes a second
   * channel with the same people sensible. A wider channel does not either: it
   * is a different set of people.
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
  // Every channel you belong to, *including* the one you are standing in — not
  // `live`, which has that one filtered out because the banner is showing it
  // instead of a row. A banner is an affordance like any other, so the contact
  // you are talking to right now is exactly the one who must not be offered a
  // fresh start; reading the filtered list offered it, which is the one case
  // where the offer is plainly absurd.
  for (const channel of rejoinable) {
    if (channel.name !== null) continue;
    if (channel.others.length !== 1) continue;
    channelWith.set(channel.others[0].id, {
      channelId: channel.channelId,
      shown: true,
    });
  }

  const showOffline = useOfflineNotice(app.status);

  /**
   * Opens a channel and walks into it, with nobody else in it yet.
   *
   * This replaced a multi-select mode over the contact list — tap to arm it,
   * pick people, confirm — which was a form to fill in before anything could
   * happen, and had to be understood before the first channel. Now the button
   * does the thing and the invitations are made from inside, where the roster
   * is already on screen and adding somebody is one tap whether it is the
   * first or the third.
   *
   * The empty case is idempotent on the server, one unnamed channel per set of
   * people meaning one channel per person for the set of just themselves. So
   * this is safe to tap twice and does not litter Home with empty rows.
   */
  const startAlone = async () => {
    try {
      const id = await app.startChannel([]);
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
    <Screen contentStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={type.title}>The Floor</Text>
          <Text style={type.muted}>
            {app.me ? `Signed in as ${app.me.displayName}` : 'Signed in'}
            {/* Same delay as the banner below, so a foreground does not flash
                this either. Quieter, but a status line that blinks on every
                return is still noise. */}
            {showOffline ? ` · ${describeStatus(app.status)}` : ''}
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
              free: filled means you are available to talk, hollow and grey
              means you muted yourself.

              Availability rather than "the microphone is open", which stopped
              being the same thing when the microphone began closing while you
              are alone. That closing is invisible to everyone else — it opens
              by itself the moment somebody arrives — so it leaves you no less
              reachable, and one bit should spend itself on intent.

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

      {/* Held back for a moment; see useOfflineNotice. */}
      {showOffline ? (
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

      {/*
        Below the invites, above everything else. Somebody being asked into a
        channel should answer that before opening one of their own, and
        everything under it is a list rather than a thing to do.

        It says "Start a channel" and nothing more. What it used to say —
        "Start a channel with several people" — was describing a mode rather
        than an outcome, and it only appeared once you had two contacts, so the
        one affordance that opens an empty channel was hidden from exactly the
        people who had nowhere to talk yet.
      */}
      <Button label="Start a channel" variant="primary" onPress={startAlone} />

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
              onOpenProfile={() =>
                onOpenProfile(entry.account.id, entry.account.displayName)
              }
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

      <SectionLabel>Add contact</SectionLabel>
      <AddContact />

      {/*
        Last on the screen, and one line rather than three.

        Everything above it is what somebody opened the app to do. A request
        for money that sat above the channels would be reading the room wrong,
        and the argument for it — what the server costs, that it unlocks
        nothing, which address to pay with — is longer than belongs on a screen
        somebody is passing through. That lives one tap away, where it has been
        chosen rather than imposed.
      */}
      {canSupport ? (
        <>
          <SectionLabel>Support</SectionLabel>
          <Card>
            <Button
              label="Chip in"
              variant="ghost"
              onPress={onOpenSupport}
            />
          </Card>
        </>
      ) : null}

    </Screen>
  );
}

/**
 * Named channels first, then the ones only being described; most recently
 * used first within each.
 *
 * A name is a thing somebody chose to write, so the channels that have one are
 * the ones being kept deliberately, and burying them among the rest costs the
 * naming its point. Sorting by recency alone would do exactly that.
 *
 * Recency is `lastActiveAt` rather than `createdAt`: channels are permanent
 * now, so creation order has nothing to do with what anybody is using.
 */
function orderChannels(channels: RejoinableView[]): RejoinableView[] {
  const byRecency = (a: RejoinableView, b: RejoinableView) =>
    b.lastActiveAt - a.lastActiveAt;
  return [
    ...channels.filter((c) => c.name).sort(byRecency),
    ...channels.filter((c) => !c.name).sort(byRecency),
  ];
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
  const title =
    channel.name ??
    describeChannel(channel.others.map((other) => other.displayName));
  return (
    // The whole row, rather than a button on the end of it. There is only one
    // thing to do with a channel you are not in, so a target the size of the
    // row is the honest shape for it — and it matches the live bar above,
    // which has always worked this way.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. Step in.`}
      onPress={onStepIn}
      style={({ pressed }) => pressed && styles.rowPressed}
    >
      <Card style={styles.row}>
      <View style={styles.rowMain}>
        {/*
          A named channel is asserted; an unnamed one is only described, and
          the muted italic says so. Without it the two sit in one list looking
          alike, and a description written from your side alone reads as a
          name every member would recognise — which it is not. See
          core/naming.ts.
        */}
        <Text
          style={channel.name ? type.body : styles.described}
          numberOfLines={1}
        >
          {title}
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
      </Card>
    </Pressable>
  );
}

function ContactRow({
  entry,
  existing,
  onStartChannel,
  onJoinExisting,
  onOpenProfile,
}: {
  entry: ContactView;
  /** A live channel containing this contact, if one has already begun. */
  existing?: { channelId: string; shown: boolean };
  onStartChannel: () => void;
  onJoinExisting: (channelId: string) => void;
  onOpenProfile: () => void;
}) {
  const app = useApp();
  const { account, status } = entry;
  /**
   * An outgoing request is a row for an address, not a person — `displayName`
   * holds the address and there is no account behind it yet, so there is no
   * profile to open.
   */
  const hasProfile = status === 'accepted' || status === 'incoming';

  /**
   * When they last had the app open, which is what makes this row a judgement
   * about whether to try them rather than just a button.
   *
   * Three states, and the empty one is deliberate: a server that predates the
   * field sends nothing, and somebody who has not connected since it was added
   * has nothing recorded. Saying "last seen: unknown" about both would be
   * noise on every row of an old snapshot, so an unknown says nothing at all.
   */
  const lastSeen =
    entry.lastSeenAt == null
      ? ''
      : (agoOrNull(app.serverNow() - entry.lastSeenAt) ?? 'In the app now');

  /**
   * What this row's second line says, which is up to two separate facts.
   *
   * They are joined rather than ranked, and that is the whole of what was
   * wrong here first time: the idle time was written as the last branch of a
   * ternary, so "Channel already open" claimed the line and the time never
   * appeared for anybody you had a 1:1 channel with — which is everybody you
   * talk to, and therefore everybody the timer is for.
   */
  const secondLine = [
    status !== 'accepted'
      ? 'Pending'
      : existing?.shown
        ? 'Channel already open'
        : '',
    lastSeen,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole={hasProfile ? 'button' : undefined}
      accessibilityLabel={
        hasProfile ? `${account.displayName}. Open profile.` : undefined
      }
      disabled={!hasProfile}
      onPress={onOpenProfile}
      style={({ pressed }) => pressed && hasProfile && styles.rowPressed}
    >
      <Card style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={type.body}>{account.displayName}</Text>
        <Text style={type.muted}>{secondLine}</Text>
      </View>

      {status === 'accepted' ? (
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
    </Pressable>
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
  /** Feedback on a row whose whole surface is the target. */
  rowPressed: { opacity: 0.7 },
  /**
   * A channel nobody has named: described rather than called something.
   *
   * Italic alone. Dimming it as well said "less important" on top of "not a
   * name", and these are not less important — most channels have no name, and
   * they were the greyest thing on the screen.
   */
  described: { ...type.body, fontStyle: 'italic' },
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
