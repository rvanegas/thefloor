import React from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  HomeView as HomeViewData,
  InviteView,
  RejoinableView,
} from '../../../core/protocol';
import { WAITING_WINDOW_MS } from '../../../core/constants';
import { describeChannel } from '../../../core/naming';
import { useText, type Strings } from '../i18n';
import { describeQuiet, sentence } from './availability';
import { useOfflineNotice } from './useOfflineNotice';
import { useApp } from '../state/AppProvider';
import { leaveSeat, leaveSeatChannel } from './handover';
import { Card, Empty, SectionLabel } from './components';
import { colors, radius, spacing, type } from './theme';

/**
 * The channels, as the body of the Channels tab — one of the two lists the
 * tier holds. Three sections of them, and nothing else: the ones somebody is
 * in, the ones you have been asked into, and the rest.
 *
 * **A body rather than a screen, since 2026-09-01.** It was `HomeView`, and it
 * was the root of the app: a header with the title and two buttons, a live
 * bar, this list, and Chip in at the foot of it. Everything but the list has
 * moved up to the tier that now holds both indexes — see `HomeView`, which is
 * that tier — because none of it was ever about channels. What is left renders
 * into somebody else's scroll and owns no header, which is what lets the same
 * frame hold this or the contacts without either knowing about the other.
 *
 * **There is no contact list in here, and that is its shape.** There
 * used to be one, and it was the only way to open a one-to-one channel with
 * somebody, so the two lists overlapped and argued: a contact row had to work
 * out whether a channel with that person already existed, say so, and offer to
 * join it rather than start a second — sixty lines of comment about a question
 * that need never have been asked. Every accepted contact now *has* an unnamed
 * one-to-one channel, made when the pair accept and guaranteed by the server,
 * so a contact appears here as the thing you would talk to them in.
 *
 * The contacts themselves are the other tab, `ContactsView`, one tap away on
 * the switch above this — where a row opens the person rather than offering a
 * channel, which is what kept the two lists from arguing again. Availability
 * went with them: "In the app now", "last seen 3 hours ago", which a channel's
 * idleness cannot stand in for, a room nobody has been in for a week saying
 * nothing about whether its other member is holding a phone.
 *
 * **Contact requests are not here either, since 2026-09-05**, and that is the
 * last thing to leave. They were drawn here for as long as this was the only
 * screen there was, and stayed after the split for no better reason: they are
 * not channels, and a list of channels that also carried them was answering a
 * question it had not been asked. The tab is a claim now rather than a
 * default, so where a request belongs is where the person it would make you
 * would go — `ContactsView`, which is also where you send one from, so asking
 * and being asked are finally in one place.
 *
 * Everything here is a server snapshot. Nothing is computed locally except
 * which section a channel belongs in, which is a display question.
 */
export function ChannelsView({
  onEnterChannel,
  liveChannelId = null,
  nearbyChannelIds = [],
}: {
  onEnterChannel: (channelId: string) => void;
  /**
   * The channel the tier's live bar is already showing, which this list leaves
   * out. The two are alternative presentations of one row rather than a list
   * and an exception to it, and the bar is a tier above this — so the id is
   * passed down rather than worked out again here.
   */
  liveChannelId?: string | null;
  /**
   * The channels the tier's *nearby* bars are already showing, left out on
   * exactly the live channel's reasoning: a bar and a row are two renderings
   * of one channel, so one of them appears.
   *
   * Ids rather than a flag on the card, though every card knows whether it is
   * a nearby one — because whether a bar was drawn for it is the tier's
   * answer, not this list's. The tier suppresses the bars while there is a
   * live channel, and a card dropped from here on its own judgement would then
   * be a channel showing nowhere at all.
   */
  nearbyChannelIds?: readonly string[];
}) {
  const app = useApp();

  const home = app.home;
  const now = app.serverNow();
  /**
   * Why the last attempt to take up a seat did nothing.
   *
   * One line rather than one per card, unlike the Invite tab's refusals:
   * there is at most one invitation being answered at a time here, because
   * answering one replaces the document.
   */
  const [seatTrouble, setSeatTrouble] = React.useState<string | null>(null);
  const t = useText().channels;
  const words: CardWords = { channels: t, naming: useText().naming };

  /**
   * Declining, which is what the ✕ on an invitation does.
   *
   * It used to hide the row and nothing more — `dismissedInvites`, a list in
   * the provider that no storage ever saw — so the invitation came back on the
   * next launch, and on every other device it had never gone from. A control
   * whose effect is undone by closing the app is one people press twice and
   * then stop believing.
   *
   * So it leaves the channel, which is the action that already means *no*:
   * `LEAVE_CHANNEL` gives up membership, and `invitesFor` only ever offered
   * the channel because the reader was still a participant who had never been
   * in it. The server tells every device at once and the row is gone for good.
   *
   * **Gone for good is why it asks first.** The settings screen's Leave asks,
   * and this is the same action taken by somebody who has less idea what is in
   * the channel — they have never been in it. Nothing is said about
   * recordings, unlike that confirmation: this reader has made none and cannot
   * see the ones that are there.
   */
  const declineInvite = (card: Card) =>
    Alert.alert(
      t.declineTitle(),
      t.declineBody(card.from ?? null),
      [
        { text: t.cancel(), style: 'cancel' },
        {
          text: t.decline(),
          style: 'destructive',
          onPress: () => app.act(card.channelId, { type: 'LEAVE_CHANNEL' }),
        },
      ]
    );

  // One list from two sources, minus the channel the banner is already
  // showing — the two are alternative presentations of the same row, not a
  // list and an exception to it. The server no longer withholds the channel it
  // thinks you are in, because it can be wrong about that and used to hide the
  // channel entirely when it was; whether you are *live* somewhere is settled
  // here, where the app knows what it is actually connected to.
  const cards = [
    ...(home?.invites ?? []).map((invite) => inviteCard(invite, words)),
    /*
      **Every seat is drawn now, on every platform.** This filtered them out
      on anything but the web, on the judgement that a card which opens
      nothing is worse than no card — true, and it stopped being the
      situation on 2026-09-22 when the app learned to sit in one. The comment
      that stood here named exactly what was missing, a screen and an audio
      session; both exist, so the line that was waiting on them goes rather
      than being softened. See `SeatView`.
    */
    ...(home?.rejoinable ?? []).map((channel) => memberCard(channel, words)),
  ].filter(
    (card) =>
      card.channelId !== liveChannelId &&
      !nearbyChannelIds.includes(card.channelId)
  );

  /**
   * The three sections, as a priority ladder: each channel appears once, in
   * the first one it qualifies for.
   *
   * So an invitation with somebody in it is *live* rather than invited, which
   * is the case worth getting right — it is the most urgent thing on the
   * screen, and burying it under channels nobody is in to keep the categories
   * tidy would be sorting by taxonomy rather than by what to do next.
   *
   * **The heading it gives up is the row's own job to replace**, and this
   * comment claimed it already did — "its card still says who asked you in" —
   * while the live branch of `line` said `Dana is waiting` and no such thing.
   * It does now; see `ChannelCard`.
   */
  const live = cards.filter(isLive).sort(byIdleness);
  const invited = cards
    .filter((card) => !isLive(card) && card.kind === 'invite')
    .sort(byIdleness);
  // **`'seat'` belongs here as much as `'member'` does, and its absence was a
  // bug.** This read `kind === 'member'`, so a seat whose room went quiet
  // qualified for no section at all and was drawn nowhere — it appeared only
  // while `isLive` put it under *Live*, and vanished the moment the last
  // person stepped out of a room the seat was still good for. What this list
  // means is somewhere you can go back to, which is exactly what a seat is.
  const rest = cards
    .filter(
      (card) => !isLive(card) && (card.kind === 'member' || card.kind === 'seat')
    )
    .sort(byIdleness);

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
   * this is safe to tap twice and does not litter the list with empty rows.
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
        t.couldNotStartChannel(),
        e instanceof Error ? e.message : String(e)
      );
    }
  };

  /**
   * What a tap on a channel does, which is one of two things.
   *
   * By default it is arriving: ENTER, and the others can hear you the moment
   * the screen opens. With "Tap a channel to look" on it is only looking —
   * the channel screen opens, offering Step In where it would offer Step Out,
   * and nothing about presence has changed. The screen subscribes to the
   * channel itself, so a snapshot arrives either way; watching has never been
   * being there. See ChannelView.
   */
  const openChannel = (channelId: string) => {
    // **No `ENTER`.** Opening a channel and standing in it are two acts, and
    // this is only the first: the channel screen's footer is where the second
    // one lives. See decisions/2026-09-21-a-tap-only-ever-looks.md.
    onEnterChannel(channelId);
  };

  /**
   * A seat, which is not this app's screen to open.
   *
   * The guest page is a separate document served by the same origin, so this
   * is a navigation rather than a route change — and it only ever happens in a
   * browser, seats existing nowhere else.
   */
  /**
   * Answering an invitation to a seat, which is the walk the app cannot draw
   * and the browser can.
   *
   * **Two steps and one of them is a round trip**, which is what makes this
   * different from `openSeat` below: a seat got by knocking is already in
   * this tab's storage, where an invitation is a row on the server that
   * nobody has answered. So the acceptance is made against the account's own
   * session, the credential that comes back is left where the guest page
   * looks for it, and only then does the tab walk.
   *
   * Nothing is drawn while it is out. The call is one request against a row
   * that already exists, and a spinner on a card that is about to be replaced
   * by a different document reads as the page having stalled.
   */
  const takeUpSeat = async (channelId: string) => {
    try {
      const { guestId, secret } = await app.enterSeat(channelId);
      /*
        **The app opens its own screen; the browser still walks.**

        Two documents, one origin: the guest page is served separately, so on
        the web this is a navigation rather than a route change and the seat's
        credential has to be left where that page looks for it. The app has
        neither problem — the seat's snapshot arrives on the socket it is
        already holding, and the screen for it is a case in this one's own
        router. See `SeatView`, and `ServerMessage.seat` for why no credential
        travels.

        **Which is why the app ignores the secret it was just handed.** It is
        minted for the page, by a server that cannot tell which of the two
        asked; an app that kept it would be holding a guest credential it has
        no use for, beside a session that is strictly better.

        `onEnterChannel` and not a route of its own: which screen a channel
        opens is the server's answer rather than this list's, and asking here
        would be a second place that could get it wrong. See App.tsx.
      */
      if (Platform.OS !== 'web') {
        onEnterChannel(channelId);
        return;
      }
      // No secret means a server too old to mint one on the way in. The seat
      // is taken up either way — refusing to walk would strand somebody in
      // the app with an invitation the server has already spent.
      if (secret) leaveSeat({ channelId, guestId, secret });
      else leaveSeatChannel(channelId);
      globalThis.location?.assign('/g/seat');
    } catch (error) {
      // The three the server can answer with — a room that emptied, one that
      // filled, and an invitation already spent — and each is about *now*
      // rather than about the offer. So the card stays and says what
      // happened, which is what the next tap needs to know.
      setSeatTrouble(
        error instanceof Error ? error.message : t.thatDidNotWork()
      );
    }
  };

  const openSeat = (channelId: string) => {
    // A seat already held, and in the app that is the same act as taking one
    // up: `enterSeat` is idempotent for a seat this account is already
    // sitting in, and it is what puts the room back into this device's
    // standing after a step-out. The browser's two paths differ because one
    // of them has a credential in storage already; neither half of that is
    // true here.
    if (Platform.OS !== 'web') {
      void takeUpSeat(channelId);
      return;
    }
    // **Which channel travels in `sessionStorage`, not in the path.** No
    // address in this application carries an id, and the seat page is on this
    // origin and this tab, which is what makes the walk possible at all — the
    // same property its own seat has always relied on. Left rather than handed
    // over, so a reload of `/g/seat` still knows which seat it is about. See
    // `ui/handover.ts` and `server/web/guest.ts`.
    leaveSeatChannel(channelId);
    globalThis.location?.assign('/g/seat');
  };

  return (
    <>
      {/*
        The offline notice stays in the scroll rather than joining the tier's
        pinned top. It is held back for a moment before it appears at all, it
        goes away by itself, and pinning it would give the most transient thing
        on the screen the one position that never moves.

        **In this body rather than in the tier, which is a choice.** What it
        says is about the connection, which is as true of the contacts as of
        the channels — but what it says in *words* is about invites and
        channels, and the tier has no sentence of its own to put there. Moving
        it up is a copy question nobody has asked; it stays where it was said.
      */}
      {/* Held back for a moment; see useOfflineNotice. */}
      {showOffline ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            {app.status === 'connecting' ? t.reconnecting() : t.notConnected()}
          </Text>
        </View>
      ) : null}

      {/*
        The list, and above all of it the way to make another channel.

        It says "Start a channel" and nothing more. What it used to say —
        "Start a channel with several people" — was describing a mode rather
        than an outcome, and it only appeared once you had two contacts, so the
        one affordance that opens an empty channel was hidden from exactly the
        people who had nowhere to talk yet. That is still the rule: the row is
        drawn whether or not there is a channel under it, because it is the way
        out of an empty screen — which is why it sits outside the guard on the
        label rather than inside the list.

        It is the first thing in the scroll rather than the foot of the list,
        since 2026-09-02, and the reason is the tab beside this one: *Add
        contact* sits in exactly that place on Contacts, and the two lists' one
        affordance for making something new should be in the same position as
        well as the same shape. It was the last row for a while, on the
        argument that somebody who has read the whole list without finding what
        they want is already looking at the bottom of it. That reads well for a
        long list and badly for a short one, where the thing you came to do is
        below everything you did not, and it put the two tabs' matching rows at
        opposite ends of the screen.

        **Above every section label, not merely above *Your channels*.** It
        spent a few hours between the live tier and the rest, which put it
        under a heading — and a row under LIVE reads as something live, since
        that is what a section label is for. The action at the top of a list
        has no label of its own on either tab, and it can only stay that way by
        being above the first one, whichever section happens to be first.

        What it is not, either way, is a filled black button above the list —
        which is what it was before both, and made the loudest thing on the
        screen a thing to do rather than the conversations already open. The
        card with the accented mark is the shape that keeps it available
        without shouting.
      */}
      <StartChannelRow onPress={startAlone} />

      {live.length > 0 ? (
        <>
          <SectionLabel>{t.live()}</SectionLabel>
          <View style={styles.list}>
            {live.map((card) => (
              <ChannelCard
                key={card.channelId}
                card={card}
                now={now}
                onPress={() =>
                  card.kind === 'seat'
                    ? openSeat(card.channelId)
                    : card.guest
                      ? void takeUpSeat(card.channelId)
                      : openChannel(card.channelId)
                }
                onDecline={
                  // **Not offered on an invitation to a seat**, and it is the
                  // action that does not exist rather than one withheld:
                  // declining is `LEAVE_CHANNEL`, which gives up a membership
                  // this person does not have, and the revocation route
                  // beside it is a member's. A seat expires on its own — six
                  // hours, or the moment the room empties — so the offer that
                  // is ignored goes quiet by itself, which a membership
                  // invitation never does.
                  card.kind === 'invite' && !card.guest
                    ? () => declineInvite(card)
                    : undefined
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {invited.length > 0 ? (
        <>
          <SectionLabel>{t.invitations()}</SectionLabel>
          {seatTrouble ? (
            <Text style={styles.seatTrouble}>{seatTrouble}</Text>
          ) : null}
          <View style={styles.list}>
            {invited.map((card) => (
              <ChannelCard
                key={card.channelId}
                card={card}
                now={now}
                onPress={() =>
                  card.kind === 'seat'
                    ? openSeat(card.channelId)
                    : card.guest
                      ? void takeUpSeat(card.channelId)
                      : openChannel(card.channelId)
                }
                onDecline={
                  card.guest ? undefined : () => declineInvite(card)
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {/*
        Before the first snapshot there are no channels *and* no evidence that
        there are none. Saying so beats drawing an empty screen, which reads as
        an account with nothing in it — and this is a cold launch, so it is the
        first thing anybody sees.
      */}
      {!home ? <Empty>{t.loading()}</Empty> : null}
      {rest.length > 0 ? (
        <>
          <SectionLabel>{t.yourChannels()}</SectionLabel>
          <View style={styles.list}>
            {rest.map((card) => (
              <ChannelCard
                key={card.channelId}
                card={card}
                now={now}
                onPress={() =>
                  card.kind === 'seat'
                    ? openSeat(card.channelId)
                    : card.guest
                      ? void takeUpSeat(card.channelId)
                      : openChannel(card.channelId)
                }
              />
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

/**
 * A channel as this list needs it, from either of the two lists the server
 * sends. Flattened deliberately: which section a channel goes in and how idle
 * it is are the same questions for an invitation and for a channel you belong
 * to, and answering them twice is how the two drift apart.
 */
type Card = {
  channelId: string;
  /**
   * `'seat'` is a channel you are a *guest* of, in a browser. A place you can
   * go back to is what this list means, so it belongs among the rest — but it
   * opens the guest page rather than the channel screen, which a
   * non-participant cannot see, and it is drawn from the seat rather than from
   * a membership nobody has. See `RejoinableView.seat`.
   */
  kind: 'invite' | 'member' | 'seat';
  /**
   * Whether an invitation offers a **seat** rather than a membership.
   *
   * Only ever set on an `'invite'`. It is not a fourth `kind` because it does
   * not change what the row *is* — something you are being asked into, drawn
   * among the others, declined the same way — only what is being offered, and
   * that is a sentence rather than a shape.
   */
  guest?: boolean;
  title: string;
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
  /**
   * Whether the reader is nearby in it — `RejoinableView.nearby`, straight
   * through. Read by `nearbyChannels` rather than by the row: a nearby channel
   * is drawn as a bar in the tier above and is not in this list at all.
   */
  nearby: boolean;
  /**
   * How many people **other than the reader** are nearby in it —
   * `RejoinableView.nearbyCount`, straight through. Nought from a server that
   * predates the field, which files the channel exactly where every build
   * filed it before. Read by `isLive`: a room somebody is standing beside is
   * one step in from being a conversation. See planning/SHIMS.md.
   */
  nearbyCount: number;
  /** Who asked you in, for an invitation. */
  from?: string;
};

/**
 * The two words a card can need before anything has rendered it.
 *
 * **Passed in rather than read from a hook**, because these builders are not
 * components: `nearbyChannels` is exported and called from `App.tsx` to decide
 * which bar to draw, and a hook in here would make that a thing only a
 * component could ask. Same arrangement as `availability.ts`.
 */
export interface CardWords {
  channels: Strings['channels'];
  naming: Strings['naming'];
}

function inviteCard(invite: InviteView, words: CardWords): Card {
  // Named where it has a name, described by its roster where it has not —
  // exactly as a channel row does, since the reader is choosing between them
  // and they should speak the same way. An older server sends neither, and
  // then the sender's name is the only thing there is to call it.
  const described = invite.others?.length
    ? describeChannel(
        invite.others.map((other) => other.displayName),
        words.naming
      )
    : null;
  return {
    channelId: invite.channelId,
    kind: 'invite',
    title: invite.name ?? described ?? invite.from.displayName,
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
    // Nearby in a channel you have never entered, which a declaration leaves
    // you in: it is an arrival for the roster's purposes and still not an
    // entry, so the invitation stands and this bit rides on it.
    nearby: invite.nearby ?? false,
    nearbyCount: invite.nearbyCount ?? 0,
    from: invite.from.displayName,
    // Absent from an older server, which means a membership: that is what
    // every invitation was before guest invitations existed. See
    // `InviteView.guest`.
    guest: invite.guest === true,
  };
}

/**
 * A title with its cohort number on the end, for the reader who was sent one.
 *
 * Absent and null both mean *draw nothing*: an ordinary channel has no number,
 * a server predating the field sends no key, and a member of a cohort is
 * deliberately not told which one they are in. See `RejoinableView.cohort`.
 */
function withCohortNumber(title: string, cohort: number | null | undefined): string {
  return cohort == null ? title : `${title} ${cohort}`;
}

function memberCard(channel: RejoinableView, words: CardWords): Card {
  // A seat carries the resolved name and the present count and nothing else —
  // the roster is names-only to a guest and the history is not theirs to read
  // — so the card is built from what is there rather than from what is
  // missing. No idleness line: the numbers that would draw one are the seat's
  // own, and reading them as the room's would be a claim about the channel
  // that the guest is not entitled to make.
  if (channel.seat) {
    return {
      channelId: channel.channelId,
      kind: 'seat',
      title: channel.name ?? words.channels.aChannel(),
      presentCount: channel.presentCount,
      lastPresenceAt: undefined,
      lastPresenceByOthers: undefined,
      steppedInAt: undefined,
      everUsed: true,
      // A guest is never on that rung; the way back to a seat is the door,
      // and who is standing beside the room is not theirs to read either.
      nearby: false,
      nearbyCount: 0,
    };
  }
  return {
    channelId: channel.channelId,
    kind: 'member',
    // **The number is appended for one reader and nobody else**, and the
    // client does not decide which: the server sends `cohort` to a *cohort
    // host* and omits the key for everybody else, so this draws whatever it is
    // given. Every cohort is called the same thing now — see
    // `COHORT_CHANNEL_NAME` — which for a host is several identical rows, this
    // being the only screen that sees more than one at a time.
    //
    // Appended to the resolved title rather than replacing it, so a cohort
    // somebody has renamed from Channel Settings keeps the name they gave it
    // and still tells the host which one it is.
    title: withCohortNumber(
      channel.name ??
        describeChannel(channel.others.map((other) => other.displayName)),
      channel.cohort
    ),
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
    // Absent from a server that predates the field, and read as *not nearby*:
    // no bar is drawn, which is exactly what every build did before there was
    // one to draw.
    nearby: channel.nearby ?? false,
    nearbyCount: channel.nearbyCount ?? 0,
  };
}

/**
 * One channel the reader is nearby in, as the tier's pinned bar needs it.
 *
 * Deliberately the same three facts the live bar carries, since the two bars
 * are one shape in two states — and deliberately not a `Card`, which is this
 * list's private shape and carries six things a bar has no line for.
 */
export type NearbyChannel = {
  channelId: string;
  title: string;
  /** How many people are in it, which is what makes it worth going back to. */
  presentCount: number;
};

/**
 * Every channel the reader is nearby in, in the order this list would have put
 * them in.
 *
 * **Exported, and built out of the card machinery above rather than beside
 * it.** What a channel is *called* is a decided question — a name if somebody
 * wrote one, a description of the roster if not — and answering it twice is
 * how the bar and the row come to disagree about the same channel. The tier
 * draws these; it does not name them.
 *
 * `byIdleness` for the reason the sections use it: whoever else was here most
 * recently, first. Several bars is an ordinary state, nearby not being
 * exclusive, so their order has to be somebody's decision rather than the
 * order the server happened to build its list in.
 */
export function nearbyChannels(
  home: HomeViewData | null,
  words: CardWords
): NearbyChannel[] {
  if (!home) return [];
  return [
    ...(home.invites ?? []).map((invite) => inviteCard(invite, words)),
    ...(home.rejoinable ?? []).map((channel) => memberCard(channel, words)),
  ]
    .filter((card) => card.nearby)
    .sort(byIdleness)
    .map((card) => ({
      channelId: card.channelId,
      title: card.title,
      // Undefined only from a server that predates the count on an
      // invitation, and read as nought here rather than as *occupied* the way
      // the section ladder reads it. The ladder is deciding where to file a
      // row; this is a sentence, and "2 present" invented from an absent
      // number would be the bar telling somebody there is a conversation
      // waiting for them when nobody knows whether there is.
      presentCount: card.presentCount ?? 0,
    }));
}

/**
 * Whether a channel goes in the top section: somebody is in it, **or somebody
 * is standing beside it**.
 *
 * The second half is new on 2026-09-12, and it is the point of
 * `RejoinableView.nearbyCount`. *Nobody present* used to mean *nothing
 * happening*, and a channel two people were within reach of sorted down among
 * the rooms nobody had opened in a week — when it is in fact the most
 * answerable thing on the screen, one step in from being a conversation with
 * people who have already said they can be reached. Ordinary idleness is the
 * wrong measure for it: nothing has happened there yet, which is exactly what
 * a step in would fix.
 *
 * `undefined` is a server too old to send the count, and is read as occupied
 * for `presentCount` — the old text asserted somebody was waiting — and as
 * nought for the nearby half, which files such a channel where every build
 * filed it.
 */
const isLive = (card: Card) =>
  card.presentCount === undefined ||
  card.presentCount > 0 ||
  card.nearbyCount > 0;

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


/**
 * One card for both kinds of channel.
 *
 * They were two components, and the differences between them had grown into
 * differences of kind: an invitation was a banner above the list with its own
 * shape, so the same channel looked like two unrelated things depending on
 * whether you had answered it. What actually differs is one line of text, a
 * decline control, and whether the accent is on — and an invitation nobody is
 * waiting in is not urgent, so it loses the accent and keeps the shape.
 */
function ChannelCard({
  card,
  now,
  onPress,
  onDecline,
}: {
  card: Card;
  now: number;
  /** Presence, not membership — you never stopped belonging to it. */
  onPress: () => void;
  /** Invitations only; leaves the channel, after asking. */
  onDecline?: () => void;
  /*
   * `stepsIn` was here, saying whether this tap would arrive or only look. A
   * tap only ever looks now, so there is nothing for the row to choose between
   * and no preference to pass down. See
   * decisions/2026-09-21-a-tap-only-ever-looks.md.
   */
}) {
  const live = isLive(card);
  // Null only for an invitation from a server that predates the stamp, which
  // is a line that goes away rather than a line that says nothing.
  const t = useText().channels;
  const quiet = describeQuiet(card, now, useText().availability);
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
   *
   * **`WAITING_WINDOW_MS`, and not `PRESENCE_LIFETIME_MS`, since 2026-08-27.**
   * The mark was five minutes wide because it was reading the *push*'s window
   * — how long "somebody is here now" stays worth delivering — and the two
   * only ever looked like one number. What the mark reports is a visit, and
   * the length a visit stays worth mentioning is the length the app already
   * commits to elsewhere: `WAITING_WINDOW_MS` is how long somebody's roster
   * card goes on saying they are nearby rather than that they stepped out. So
   * the mark now fades when the reader stops reading as nearby to everybody
   * else, which is one claim with two audiences instead of two clocks.
   *
   * The two clocks are not the same instant, and the difference runs the safe
   * way. `steppedInAt` is when the reader *arrived*, where the roster's
   * `nearby` measures from the last thing heard from them — so on a long visit
   * this expires first and can never outlive the state it is aligned with.
   */
  const steppedIn =
    !live && card.steppedInAt != null && now - card.steppedInAt < WAITING_WINDOW_MS;
  /**
   * An invitation outlives the moment it was sent. What it must not do is go
   * on claiming that moment is still happening — the banner used to say
   * somebody "is waiting in a channel" whatever the truth of it, so an
   * invitation to a room they had left summoned you to nobody.
   *
   * **Both halves, on both branches, since 2026-09-15.** The live branch used
   * to read only `Dana is waiting`, which is a name and a state and never the
   * word *invitation* — and it is the branch that has least else to say it
   * with, because an invitation somebody is in is filed under *Live* rather
   * than under *Invitations* and loses that heading on the way up. So the row
   * said who was there and not that you had been asked, which is
   * indistinguishable from a channel you already belong to that somebody has
   * walked into. `asked you in` is the clause that carries the fact and it is
   * now on both; what varies is the status after the dot, which is the same
   * grammar the rest of this list uses — `· 2 present`, `· an hour ago`,
   * `· waiting`.
   */
  // **The two offers say different words, because they are different
  // offers.** A membership is permanent and spends one of the channel's six
  // places; a seat lasts while the room does and carries none of a member's
  // standing. A card that said *asked you in* for both would be describing
  // only one of them, and the reader is deciding whether to tap.
  const asked = card.guest
    ? t.askedYouInAsGuest(card.from ?? '')
    : t.askedYouIn(card.from ?? '');
  const line =
    card.kind === 'invite'
      ? live
        ? // "tap to join" only when a tap joins. With stepping in made
          // deliberate, the same tap opens the channel and joins nothing, and
          // promising otherwise would be the one place in this list where
          // the setting is not honoured.
          // No "tap to join": the tap opens the channel and joins nothing,
          // and promising otherwise would be the one place in this list that
          // said a tap does something it has not done since 2026-09-21.
          t.waiting(asked)
        : t.askedAnd(asked, quiet)
      : card.kind === 'seat'
        ? // Said plainly, because a row that looked like the others would be
          // promising the channel screen and opening a different page.
          t.youAreAGuestHere(live ? (card.presentCount ?? 0) : null)
        : live
          ? // **Present first, nearby only when there is nobody**, since
            // 2026-09-12. The two are not added together and are not said
            // together: *present* is a conversation you can walk into and
            // *nearby* is one that has not started, so a row reading "1
            // present · 2 nearby" would put the weaker claim beside the
            // stronger one and make the reader do the arithmetic. A room with
            // anybody in it says what every build has said about it; a room
            // with nobody in it and people beside it says the only true thing
            // there is to say, which is what earns it this section at all.
            card.presentCount !== undefined && card.presentCount > 0
            ? t.present(card.presentCount)
            : t.nearby(card.nearbyCount ?? 0)
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
      // A seat opens the guest page, where the way in is the door rather than
      // a step. Everything else opens a channel screen and nothing else:
      // *Join* and *Step in* were the other two answers here, and both
      // described a tap that arrived in the room.
      accessibilityLabel={t.rowLabel(
        card.title,
        line || null,
        steppedIn,
        card.kind === 'seat'
      )}
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
            One style, named or not. The italic that used to mark a derived
            title is gone since 2026-09-13: it was carrying an argument about
            provenance — that a description written from your side is not a
            name every member would recognise, see core/naming.ts — that a
            slant cannot actually make, and in a list of rows it read as
            emphasis on exactly the channels that had least to say for
            themselves. The distinction survives where it is stated in words
            rather than drawn: the settings field, whose placeholder is the
            derived title in placeholder grey, so what is yours to type and
            what is merely standing in for it are told apart by which one is
            editable.
          */}
          <Text style={type.body} numberOfLines={1}>
            {card.title}
          </Text>
          {line ? <Text style={type.muted}>{line}</Text> : null}
        </View>
        {/*
          `↗` again. `‥`, U+2025 TWO DOT LEADER, held this spot for a day on
          the argument that a footprint beats a departure — two dots being two
          steps, in and out. It read better written down than drawn: two periods
          of ink at the edge of a row are too small to register as anything, and
          beside the rest of this list the arrow is simply the one that can be
          seen. The label kept the two dots' phrasing, which never depended on
          them.

          Not a control, and it has to not *look* like one: this sits at the row
          edge where the decline button lives, and an arrow is the glyph most
          likely to be read as something you could press. No `Pressable`, no
          hit slop, and `type.muted` rather than the accent — the live bar is
          the one thing above this meant to shout, and this is a memory aid.

          It cannot collide with the ✕ beside it. Stepping in is what sets
          `steppedInAt`, and stepping in is also what stops a channel being an
          invitation, so a row can carry a mark or a decline and never both.
        */}
        {steppedIn ? (
          <Text style={styles.steppedIn} accessibilityElementsHidden>
            ↗
          </Text>
        ) : null}
        {onDecline ? (
          <Pressable
            onPress={onDecline}
            hitSlop={12}
            accessibilityLabel={t.declineInvite()}
          >
            <Text style={styles.decline}>✕</Text>
          </Pressable>
        ) : null}
      </Card>
    </Pressable>
  );
}

/**
 * The row above the channel list: a mark and a label, in the shape of a
 * channel rather than of a button. Contacts' `AddContact` closed is the same
 * row in the same place, deliberately.
 *
 * The accent is on the mark alone. A whole row in the floor colour would be
 * competing with the live bar, which is the one thing above this that
 * should be able to shout — and this is not urgent, it is merely available.
 *
 * `accessibilityLabel` is given explicitly so a screen reader says the action
 * and not the plus sign, which is decoration and does not read as a word.
 */
function StartChannelRow({ onPress }: { onPress: () => void }) {
  const t = useText().channels;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.startAChannel()}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.rowPressed}
    >
      <Card style={styles.startRow}>
        <View style={styles.startMark}>
          <Text style={styles.startMarkGlyph}>+</Text>
        </View>
        <Text style={styles.startLabel}>{t.startAChannel()}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  // Under the heading rather than on a card, which is where the card it is
  // about used to be: the offer stands, and this says what came of the last
  // attempt on it.
  seatTrouble: { color: colors.silenced, fontSize: 13 },
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
    // The gap under it that a card in the list below would otherwise fall
    // straight into. Contacts' `addRow` carries the same number, this being
    // the same row in the same position.
    marginBottom: spacing(1.5),
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
  /**
   * An invitation somebody is waiting in, which is worth marking and is not
   * the floor.
   *
   * **It wore `floorDim` + `floor` until 2026-09-15, which was the live bar's
   * four lines exactly** — same fill, same border, same width — so Home drew
   * two cards in identical paint, eight rows apart, for two different facts:
   * *you are standing in this room*, and *you were asked into a room somebody
   * else is standing in*. Violet is the floor and nothing else (STYLE.md rule
   * 1), and the room you are in is the one thing on this screen entitled to
   * shout; a card that merely wants answering was borrowing the volume.
   *
   * So the fill goes and the border changes hue. **`waiting` is the token
   * whose meaning this already is** — *something is waiting for you*, spent on
   * the Home dab, and written to not mean error precisely because a request to
   * answer is good news arriving slightly inconveniently. That is this row. No
   * eighteenth token: rose on the edge, the card's own `surface` behind it,
   * and the live bar left as the only tinted block above.
   *
   * The border alone is also why this is quieter than what it replaced, which
   * is the point rather than a cost. What makes the row urgent is that it is
   * under *Live* at the top of the list; the paint only has to say which kind
   * of thing it is.
   */
  invite: {
    borderColor: colors.waiting,
    borderWidth: 1,
  },
  /**
   * And one nobody is waiting in, which is still worth answering and is not
   * worth shouting. It keeps its shape and loses the urgency, which is
   * reserved for a room with somebody in it.
   */
  inviteQuiet: { borderColor: colors.border, borderWidth: 1 },
  decline: { color: colors.textMuted, fontSize: 16, paddingHorizontal: 4 },
  // Muted and a size down from the decline glyph beside it, which is a control
  // where this is a note to yourself. Same horizontal padding so the two sit in
  // the same column on rows that have one or the other.
  steppedIn: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 },
});
