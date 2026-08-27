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
  RejoinableView,
} from '../../../core/protocol';
import { PRESENCE_LIFETIME_MS } from '../../../core/constants';
import { describeChannel } from '../../../core/naming';
import { describeQuiet, sentence } from './availability';
import { useOfflineNotice } from './useOfflineNotice';
import { useApp } from '../state/AppProvider';
import { Button, Card, Empty, Screen, SectionLabel } from './components';
import { colors, radius, spacing, type } from './theme';

/**
 * Signed in, not in a channel. A list of channels in three sections — the ones
 * somebody is in, the ones you have been asked into, and the rest — and then
 * the contact requests that have not turned into either yet.
 *
 * **There is no contact list on this screen, and that is its shape.** There
 * used to be one, and it was the only way to open a one-to-one channel with
 * somebody, so the two lists overlapped and argued: a contact row had to work
 * out whether a channel with that person already existed, say so, and offer to
 * join it rather than start a second — sixty lines of comment about a question
 * that need never have been asked. Every accepted contact now *has* an unnamed
 * one-to-one channel, made when the pair accept and guaranteed by the server,
 * so a contact appears here as the thing you would talk to them in.
 *
 * The contacts themselves are a screen of their own, `ContactsView`, one tap
 * away in the header — where a row opens the person rather than offering a
 * channel, which is what kept the two lists from arguing again. Availability
 * went with them: "In the app now", "last seen 3 hours ago", which a channel's
 * idleness cannot stand in for, a room nobody has been in for a week saying
 * nothing about whether its other member is holding a phone.
 *
 * What stays here is requests. They are not contacts yet, they are the one
 * thing on this screen that cannot be a channel, and answering one is
 * something to do rather than somebody to look up.
 *
 * Everything here is a server snapshot. Nothing is computed locally except
 * which section a channel belongs in, which is a display question.
 */
export function HomeView({
  onEnterChannel,
  onOpenContacts,
  onOpenSettings,
  onOpenSupport = () => {},
  onOpenLeaderboard,
  liveChannel = null,
  onReturnToChannel = () => {},
}: {
  onEnterChannel: (channelId: string) => void;
  /** The contact list, which is a screen of its own. See ContactsView. */
  onOpenContacts: () => void;
  onOpenSettings: () => void;
  /** Opens the screen that explains donating, and carries the link out. */
  onOpenSupport?: () => void;
  /**
   * Opens the invitation standings. Absent unless this account has been
   * granted them, in which case Home says nothing about them at all — the
   * row is the whole of how anybody learns the screen exists.
   */
  onOpenLeaderboard?: () => void;
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
  const now = app.serverNow();

  // One list from two sources, minus the channel the banner is already
  // showing — the two are alternative presentations of the same row, not a
  // list and an exception to it. The server no longer withholds the channel it
  // thinks you are in, because it can be wrong about that and used to hide the
  // channel entirely when it was; whether you are *live* somewhere is settled
  // here, where the app knows what it is actually connected to.
  const cards = [
    ...(home?.invites ?? [])
      .filter((invite) => !dismissed.includes(invite.channelId))
      .map(inviteCard),
    ...(home?.rejoinable ?? []).map(memberCard),
  ].filter((card) => card.channelId !== liveChannel?.channelId);

  /**
   * The three sections, as a priority ladder: each channel appears once, in
   * the first one it qualifies for.
   *
   * So an invitation with somebody in it is *live* rather than invited, which
   * is the case worth getting right — it is the most urgent thing on the
   * screen, and burying it under channels nobody is in to keep the categories
   * tidy would be sorting by taxonomy rather than by what to do next. Its card
   * still says who asked you in.
   */
  const live = cards.filter(isLive).sort(byIdleness);
  const invited = cards
    .filter((card) => !isLive(card) && card.kind === 'invite')
    .sort(byIdleness);
  const rest = cards
    .filter((card) => !isLive(card) && card.kind === 'member')
    .sort(byIdleness);

  // Everything that is not yet a contact, and so is not yet a channel. The
  // accepted ones are in the lists above, as the channels they now come with.
  const requests = (home?.contacts ?? []).filter(
    (entry) => entry.status !== 'accepted'
  );

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
   *
   * It enters whatever "Tap a channel to step in" is set to, and that is not
   * an oversight. The setting is about a list of rooms that already exist,
   * where a tap is as likely to be curiosity as intent; opening a channel of
   * your own is the intent, and a room you have just made that you are not
   * standing in is a strange thing to have produced.
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

  /**
   * What a tap on a channel does, which is one of two things.
   *
   * By default it is arriving: ENTER, and the others can hear you the moment
   * the screen opens. With "Tap a channel to step in" off it is only looking —
   * the channel screen opens, offering Step In where it would offer Step Out,
   * and nothing about presence has changed. The screen subscribes to the
   * channel itself, so a snapshot arrives either way; watching has never been
   * being there. See ChannelView.
   */
  const openChannel = (channelId: string) => {
    if (app.tapToStepIn) app.act(channelId, { type: 'ENTER' });
    onEnterChannel(channelId);
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
          The two ways off this screen that are not a channel. Contacts is a
          screen rather than a section here for the reason the doc comment
          above gives — a contact row and a channel row answer different
          questions, and the last time they shared a list they argued.

          Signing out is in Settings rather than either of these: it is about
          the account rather than about the list, and it sat beside a dozen
          taps that are not remotely destructive.
        */}
        <View style={styles.headerActions}>
          <Button label="Contacts" variant="ghost" onPress={onOpenContacts} />
          <Button label="Settings" variant="ghost" onPress={onOpenSettings} />
        </View>
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

      {live.length > 0 ? (
        <>
          <SectionLabel>Live</SectionLabel>
          <View style={styles.list}>
            {live.map((card) => (
              <ChannelCard
                key={card.channelId}
                card={card}
                now={now}
                onPress={() => openChannel(card.channelId)}
                stepsIn={app.tapToStepIn}
                onDismiss={
                  card.kind === 'invite'
                    ? () => app.dismissInvite(card.channelId)
                    : undefined
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {invited.length > 0 ? (
        <>
          <SectionLabel>Invitations</SectionLabel>
          <View style={styles.list}>
            {invited.map((card) => (
              <ChannelCard
                key={card.channelId}
                card={card}
                now={now}
                onPress={() => openChannel(card.channelId)}
                stepsIn={app.tapToStepIn}
                onDismiss={() => app.dismissInvite(card.channelId)}
              />
            ))}
          </View>
        </>
      ) : null}

      {/*
        The channels, and at the foot of them the way to make another.

        It says "Start a channel" and nothing more. What it used to say —
        "Start a channel with several people" — was describing a mode rather
        than an outcome, and it only appeared once you had two contacts, so the
        one affordance that opens an empty channel was hidden from exactly the
        people who had nowhere to talk yet. That is still the rule: this
        section is drawn whether or not it has any channels in it, because the
        row at its foot is the way out of an empty screen.

        It sat above this list as a filled black button, which made the loudest
        thing on the screen a thing to do rather than the conversations already
        open. As the last row of the list it is in the place somebody is
        already looking when nothing there is the one they want, and it reads
        as one more channel — the one that does not exist yet.
      */}
      {rest.length > 0 ? <SectionLabel>Your channels</SectionLabel> : null}
      {/*
        Before the first snapshot there are no channels *and* no evidence that
        there are none. Saying so beats drawing an empty screen, which reads as
        an account with nothing in it — and this is a cold launch, so it is the
        first thing anybody sees.
      */}
      {!home ? <Empty>Loading…</Empty> : null}
      <View style={[styles.list, rest.length === 0 && styles.listUnlabelled]}>
        {rest.map((card) => (
          <ChannelCard
            key={card.channelId}
            card={card}
            now={now}
            onPress={() => openChannel(card.channelId)}
            stepsIn={app.tapToStepIn}
          />
        ))}
        <StartChannelRow onPress={startAlone} />
      </View>

      {/*
        Requests, which are the one part of the old contact list that cannot be
        a channel: there is nobody to talk to until they are answered. Drawn
        only when there are any, so an account with nothing outstanding sees a
        screen about channels and nothing else.
      */}
      {requests.length > 0 ? (
        <>
          <SectionLabel>Requests</SectionLabel>
          <View style={styles.list}>
            {requests.map((entry) => (
              <RequestRow
                // An outgoing request carries no account id — deliberately, so
                // that one sent to an address without an account is
                // indistinguishable from one sent to a user. Its identity is
                // the address, which is what `displayName` holds for these rows
                // and is unique: there cannot be two requests to one address.
                key={entry.account.id || `sent:${entry.account.displayName}`}
                entry={entry}
              />
            ))}
          </View>
        </>
      ) : null}

      {/*
        Last on the screen, and one line rather than three.

        Everything above it is what somebody opened the app to do. A request
        for money that sat above the channels would be reading the room wrong,
        and the argument for it — what the server costs, that it unlocks
        nothing, which address to pay with — is longer than belongs on a screen
        somebody is passing through. That lives one tap away, where it has been
        chosen rather than imposed.
      */}
      {canSupport || onOpenLeaderboard ? (
        <>
          <SectionLabel>Support</SectionLabel>
          {/* The gap between cards, as every other group of them here gets
              it. Two cards flush against each other read as one card with a
              line through it. */}
          <View style={styles.list}>
            {canSupport ? (
              <Card>
                <Button
                  label="Chip in"
                  variant="ghost"
                  onPress={onOpenSupport}
                />
              </Card>
            ) : null}
            {/*
              Directly under it, and its own card rather than a second button
              in the same one: the two go to unrelated screens, and a card is
              the unit this screen uses for one place to go. It appears for the
              few accounts granted the standings and for nobody else, which is
              why the section survives a server with nowhere to give — the
              label reads as the part of Home that is about the project rather
              than about a conversation, and the standings belong there too.
            */}
            {onOpenLeaderboard ? (
              <Card>
                <Button
                  label="Leaderboard"
                  variant="ghost"
                  onPress={onOpenLeaderboard}
                />
              </Card>
            ) : null}
          </View>
        </>
      ) : null}

    </Screen>
  );
}

/**
 * A channel as this screen needs it, from either of the two lists the server
 * sends. Flattened deliberately: which section a channel goes in and how idle
 * it is are the same questions for an invitation and for a channel you belong
 * to, and answering them twice is how the two drift apart.
 */
type Card = {
  channelId: string;
  kind: 'invite' | 'member';
  title: string;
  /** Whether the title is a name somebody wrote or a description of a roster. */
  named: boolean;
  /**
   * How many people are in it. `undefined` from a server that predates the
   * field on an invitation, and read as occupied — the old text asserted
   * somebody was waiting, so this preserves it rather than inventing an
   * emptiness nothing reported.
   */
  presentCount: number | undefined;
  /**
   * The most recent moment anybody was in it, the reader included. No longer
   * what the row says or what the list is ordered by — kept for two jobs it
   * still does alone: standing in for `lastPresenceByOthers` against a server
   * too old to send it, and ordering the tier of channels nobody but the reader
   * has ever been in, which have no other number.
   */
  lastPresenceAt: number | undefined;
  /**
   * The most recent moment anybody *else* was in it. What the row says and what
   * the list is ordered by. Null is nobody else ever; undefined is a server
   * that predates the field, and `describeQuiet` tells the two apart.
   */
  lastPresenceByOthers: number | null | undefined;
  /**
   * When the reader last stepped in here, or null. Draws the mark, orders
   * nothing — see `RejoinableView.steppedInAt`.
   */
  steppedInAt: number | null | undefined;
  /** False only for a channel nobody has ever been in. */
  everUsed: boolean;
  /** Who asked you in, for an invitation. */
  from?: string;
};

function inviteCard(invite: InviteView): Card {
  // Named where it has a name, described by its roster where it has not —
  // exactly as a channel row does, since the reader is choosing between them
  // and they should speak the same way. An older server sends neither, and
  // then the sender's name is the only thing there is to call it.
  const described = invite.others?.length
    ? describeChannel(invite.others.map((other) => other.displayName))
    : null;
  return {
    channelId: invite.channelId,
    kind: 'invite',
    title: invite.name ?? described ?? invite.from.displayName,
    named: invite.name != null,
    presentCount: invite.presentCount,
    lastPresenceAt: invite.lastPresenceAt,
    // Neither, and neither is an omission. An invitation is a channel the
    // reader has never entered — that is the whole test `invitesFor` applies —
    // so its own stamp is already about other people, and there is no visit of
    // theirs for a mark to remember. `describeQuiet` takes the undefined branch
    // and draws exactly the line it drew before.
    lastPresenceByOthers: undefined,
    steppedInAt: undefined,
    // Somebody has been in it: that is what makes it an invitation rather than
    // the standing channel a pair of contacts share.
    everUsed: true,
    from: invite.from.displayName,
  };
}

function memberCard(channel: RejoinableView): Card {
  return {
    channelId: channel.channelId,
    kind: 'member',
    title:
      channel.name ??
      describeChannel(channel.others.map((other) => other.displayName)),
    named: channel.name != null,
    presentCount: channel.presentCount,
    // `lastActiveAt` is the fallback for a server that predates the better
    // stamp, and is the same answer for every channel nobody is in — which are
    // the only ones an idleness line is drawn for.
    lastPresenceAt: channel.lastPresenceAt ?? channel.lastActiveAt,
    // No `lastActiveAt` fallback here, unlike the line above, and the asymmetry
    // is the point. That one wants any answer about the room; this one wants an
    // answer with the reader taken out, and `lastActiveAt` moves on *anybody's*
    // entry or exit including theirs — so falling back to it would let the
    // solitary morning back in through the side door. Undefined stays
    // undefined, and `describeQuiet` uses the old number under its old meaning.
    lastPresenceByOthers: channel.lastPresenceByOthers,
    steppedInAt: channel.steppedInAt,
    everUsed: channel.everUsed ?? true,
  };
}

const isLive = (card: Card) =>
  card.presentCount === undefined || card.presentCount > 0;

/**
 * Whoever else was here most recently, first — then the rooms only the reader
 * has been in, then the ones nobody has been in at all.
 *
 * **Three tiers, not two**, since 2026-08-26, and the middle one is new because
 * the number this reads is. It used to be `lastPresenceAt`, the last moment
 * anybody at all was here, which counts the reader: presence is exclusive, so
 * stepping into a channel to announce yourself and then stepping into the next
 * left the first sitting at the top of the list, above a room two other people
 * had spent an hour in yesterday. It ordered on visits, and what somebody
 * scanning this list wants is what they missed.
 *
 * The row's own line says the same number, which is the other half of the
 * reason. A list ordered by one fact and annotated with another puts the
 * disagreement in front of the reader and makes both look wrong.
 *
 * That leaves a channel the reader alone has opened with nothing to sort on,
 * which is the middle tier. It cannot stay at the top on the strength of a
 * solitary visit — that is the whole complaint — and it must not drop in among
 * the never-opened either: somebody *went* there, possibly to wait for you, and
 * that is worth more than a channel neither of you has touched. Among its own
 * kind it goes by `lastPresenceAt`, the only number it has.
 *
 * The never-used stay pinned at the bottom, for the reason they always were:
 * their stamp is the moment they were created, which is not a visit, and a
 * contact you have not spoken to yet would otherwise arrive as the freshest
 * thing on the list. Among themselves they go by name, there being nothing else
 * true to order them by.
 *
 * **`steppedInAt` is not read here.** The mark says the reader was here, and
 * sorting on it would put their own echo back at the top — undoing, with the
 * second signal, exactly what the first one was for.
 *
 * Against a server that predates the field every row takes the `lastPresenceAt`
 * fallback, which restores the old order exactly rather than collapsing the
 * whole list into the middle tier and shuffling it by name.
 */
function seenOfOthers(card: Card): number | null {
  if (card.lastPresenceByOthers !== undefined) return card.lastPresenceByOthers;
  return card.lastPresenceAt ?? null;
}

function byIdleness(a: Card, b: Card): number {
  if (a.everUsed !== b.everUsed) return a.everUsed ? -1 : 1;
  if (!a.everUsed) return a.title.localeCompare(b.title);
  const at = seenOfOthers(a);
  const bt = seenOfOthers(b);
  if (at === null || bt === null) {
    if (at !== bt) return at === null ? 1 : -1;
    return (b.lastPresenceAt ?? 0) - (a.lastPresenceAt ?? 0);
  }
  return bt - at;
}


function describeStatus(status: string): string {
  return status === 'connecting' ? 'reconnecting' : 'offline';
}

/**
 * One card for both kinds of channel.
 *
 * They were two components, and the differences between them had grown into
 * differences of kind: an invitation was a banner above the list with its own
 * shape, so the same channel looked like two unrelated things depending on
 * whether you had answered it. What actually differs is one line of text, a
 * dismiss control, and whether the accent is on — and an invitation nobody is
 * waiting in is not urgent, so it loses the accent and keeps the shape.
 */
function ChannelCard({
  card,
  now,
  onPress,
  onDismiss,
  stepsIn,
}: {
  card: Card;
  now: number;
  /** Presence, not membership — you never stopped belonging to it. */
  onPress: () => void;
  /** Invitations only; hides it until the channel is offered again. */
  onDismiss?: () => void;
  /**
   * Whether this tap arrives or only looks — the Home setting, passed down so
   * the row can say which of the two it is about to do. It changes no
   * behaviour here; the row calls back either way.
   */
  stepsIn: boolean;
}) {
  const live = isLive(card);
  // Null only for an invitation from a server that predates the stamp, which
  // is a line that goes away rather than a line that says nothing.
  const quiet = describeQuiet(card, now);
  /**
   * Whether the reader stepped in here recently enough to be worth being
   * reminded of.
   *
   * Drawn only on a row nobody is in, the same rule the interval follows, and
   * for the same reason: a row with people in it is showing its count, and a
   * channel the reader is *still* standing in does not need to be told they
   * arrived. What this is for is the room they have already left, which under a
   * recency measure that leaves them out carries no other trace of the visit.
   *
   * Expired against the phone's own clock rather than the snapshot's, which is
   * why the wire carries a moment instead of a flag: nothing has to happen in
   * the channel for the mark to go.
   */
  const steppedIn =
    !live &&
    card.steppedInAt != null &&
    now - card.steppedInAt < PRESENCE_LIFETIME_MS;
  /**
   * An invitation outlives the moment it was sent. What it must not do is go
   * on claiming that moment is still happening — the banner used to say
   * somebody "is waiting in a channel" whatever the truth of it, so an
   * invitation to a room they had left summoned you to nobody.
   */
  const line =
    card.kind === 'invite'
      ? live
        ? // "tap to join" only when a tap joins. With stepping in made
          // deliberate, the same tap opens the channel and joins nothing, and
          // promising otherwise would be the one place on this screen where
          // the setting is not honoured.
          `${card.from} is waiting${stepsIn ? ' — tap to join' : ''}`
        : `${card.from} asked you in${quiet ? ` · ${quiet}` : ''}`
      : live
        ? `${card.presentCount} present`
        : // An empty channel used to be sixty seconds from destruction, and
          // saying so was a reason to hurry back. Channels are permanent now:
          // nobody being in one is a resting state, not a countdown.
          quiet && sentence(quiet);

  return (
    // The whole row, rather than a button on the end of it. There is only one
    // thing to do with a channel you are not in, so a target the size of the
    // row is the honest shape for it — and it matches the live bar above,
    // which has always worked this way.
    <Pressable
      accessibilityRole="button"
      // The mark is a glyph, and a glyph reads as nothing. This is the only
      // place that cost can be paid, so it is paid here rather than left to a
      // screen reader to guess at an arrow.
      //
      // **"in and out" rather than "in"**, and the extra two words are not
      // padding. The action at the end of this same label is "Step in", so a
      // state called "Stepped in" put the two a syllable apart and read as
      // gibberish — "Stepped in. Step in." Saying the whole of what happened
      // separates them. It outlived the glyph it was written beside and is
      // kept deliberately: the stutter it fixes is a property of the label,
      // not of the mark.
      accessibilityLabel={`${card.title}. ${line ? `${line}. ` : ''}${
        steppedIn ? 'Stepped in and out. ' : ''
      }${!stepsIn ? 'Open.' : card.kind === 'invite' ? 'Join.' : 'Step in.'}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.rowPressed}
    >
      <Card
        style={[
          styles.row,
          card.kind === 'invite' && (live ? styles.invite : styles.inviteQuiet),
        ]}
      >
        <View style={styles.rowMain}>
          {/*
            A named channel is asserted; an unnamed one is only described, and
            the muted italic says so. Without it the two sit in one list looking
            alike, and a description written from your side alone reads as a
            name every member would recognise — which it is not. See
            core/naming.ts.
          */}
          <Text style={card.named ? type.body : styles.described} numberOfLines={1}>
            {card.title}
          </Text>
          {line ? <Text style={type.muted}>{line}</Text> : null}
        </View>
        {/*
          `↗` again. `‥`, U+2025 TWO DOT LEADER, held this spot for a day on
          the argument that a footprint beats a departure — two dots being two
          steps, in and out. It read better written down than drawn: two periods
          of ink at the edge of a row are too small to register as anything, and
          beside the rest of this screen the arrow is simply the one that can be
          seen. The label kept the two dots' phrasing, which never depended on
          them.

          Not a control, and it has to not *look* like one: this sits at the row
          edge where the dismiss button lives, and an arrow is the glyph most
          likely to be read as something you could press. No `Pressable`, no
          hit slop, and `type.muted` rather than the accent — the live bar is
          the one thing on this screen meant to shout, and this is a memory aid.

          It cannot collide with the ✕ beside it. Stepping in is what sets
          `steppedInAt`, and stepping in is also what stops a channel being an
          invitation, so a row can carry a mark or a dismiss and never both.
        */}
        {steppedIn ? (
          <Text style={styles.steppedIn} accessibilityElementsHidden>
            ↗
          </Text>
        ) : null}
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            accessibilityLabel="Dismiss invite"
          >
            <Text style={styles.dismiss}>✕</Text>
          </Pressable>
        ) : null}
      </Card>
    </Pressable>
  );
}

/**
 * The last row of the channel list: a mark and a label, in the shape of a
 * channel rather than of a button.
 *
 * The accent is on the mark alone. A whole row in the floor colour would be
 * competing with the live bar, which is the one thing on this screen that
 * should be able to shout — and this is not urgent, it is merely available.
 *
 * `accessibilityLabel` is given explicitly so a screen reader says the action
 * and not the plus sign, which is decoration and does not read as a word.
 */
function StartChannelRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start a channel"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.rowPressed}
    >
      <Card style={styles.startRow}>
        <View style={styles.startMark}>
          <Text style={styles.startMarkGlyph}>+</Text>
        </View>
        <Text style={styles.startLabel}>Start a channel</Text>
      </Card>
    </Pressable>
  );
}

/**
 * A contact request, incoming or outgoing — the one part of the old contact
 * list that cannot be expressed as a channel, there being nobody to talk to
 * until it is answered.
 *
 * No profile behind it and no availability on it, both deliberately. An
 * outgoing request is an address rather than a person: whether anybody is
 * behind it is exactly what must not be revealed, which is why the server
 * withholds the id and the name.
 */
function RequestRow({ entry }: { entry: ContactView }) {
  const app = useApp();
  const { account, status } = entry;
  return (
    <Card style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={type.body}>{account.displayName}</Text>
        <Text style={type.muted}>
          {status === 'incoming' ? 'Wants to be a contact' : 'Pending'}
        </Text>
      </View>
      {status === 'incoming' ? (
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

const styles = StyleSheet.create({
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing(1),
  },
  headerMain: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
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
  /**
   * The gap a SectionLabel would have left. With no channels there is no
   * heading, and the start row would otherwise sit against whatever is above
   * it — the header, or an invitation.
   */
  listUnlabelled: { marginTop: spacing(2) },
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
  /**
   * Not `row`, which spreads its children apart to put a control on the end.
   * Here the mark and the label are one phrase and belong together on the
   * left, so it packs rather than justifies. A shorter card too: this row has
   * one line where a channel has two.
   */
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(1.5),
  },
  startMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.floorDim,
  },
  startMarkGlyph: {
    color: colors.floor,
    fontSize: 19,
    // Centred by hand: the glyph's own box is taller than its ink, so leaving
    // it to `justifyContent` alone hangs it low in the circle.
    lineHeight: 21,
    fontWeight: '500',
  },
  startLabel: { fontSize: 15, fontWeight: '600', color: colors.floor },
  pendingTag: { ...type.muted, color: colors.textFaint },
  /** An invitation somebody is waiting in, which is worth shouting about. */
  invite: {
    backgroundColor: colors.floorDim,
    borderColor: colors.floor,
    borderWidth: 1,
  },
  /**
   * And one nobody is waiting in, which is still worth answering and is not
   * worth shouting. It keeps its shape and loses the urgency, which is
   * reserved for a room with somebody in it.
   */
  inviteQuiet: { borderColor: colors.border, borderWidth: 1 },
  dismiss: { color: colors.textMuted, fontSize: 16, paddingHorizontal: 4 },
  // Muted and a size down from the dismiss glyph beside it, which is a control
  // where this is a note to yourself. Same horizontal padding so the two sit in
  // the same column on rows that have one or the other.
  steppedIn: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 },
});
