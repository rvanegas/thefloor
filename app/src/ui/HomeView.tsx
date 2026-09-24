import React, { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useApp } from "../state/AppProvider";
import { answersWaiting } from "../state/helpSeen";
import { Button, Card, IconButton, Screen, Segmented } from "./components";
import {
  ChannelsIcon,
  ContactsIcon,
  PodcastsIcon,
  SettingsIcon,
  SupportIcon,
} from "./icons";
import { useText } from '../i18n';
import {
  ChannelsView,
  nearbyChannels,
  waitingInvitations,
} from "./ChannelsView";
import type { CardWords } from "./ChannelsView";
import type { ChannelTab } from "./ChannelView";
import { ContactsView, answerableRequests } from "./ContactsView";
import { Introduction } from "./Introduction";
import { PodcastsView } from "./PodcastsView";
import { ProfileView } from "./ProfileView";
import type { List } from "./detail";
import { dismissInstallNotice, installNoticeDismissed } from "./installNotice";
import { colors, measure, radius, spacing, type } from "./theme";

/**
 * What the app opens on: a frame with a pinned top, and inside it one of the
 * two lists of people you can reach — or the Podcasts directory, or the
 * Support tab.
 *
 * **This is a tier, and it is new on 2026-09-01.** Home used to *be* the
 * channel list, and Contacts a screen you opened from a button in its header
 * with a button of its own to get back — two peers navigated as though one
 * contained the other, and neither of them the place the things that are
 * about the *application* belonged. Chip in and Standings sat at the tail of
 * somebody's channels because the tail of somebody's channels was the only
 * place there was.
 *
 * The fault that made it urgent is the live bar. It was in Home's header, so
 * it did not exist while Contacts was showing. On a phone that survives —
 * Contacts covers Home and you were there a moment ago — but above the
 * breakpoint the contact list holds the left pane while something else holds
 * the right, and then you are present in a conversation with nothing anywhere
 * on screen saying so. The fix proposed first was to draw the bar in the
 * contact list too, and it is wrong: a live room is not a contact and has no
 * business in that list. It belongs to whatever contains both lists, which is
 * this. See planning/decisions/DECISIONS.md § *The tier above both lists*.
 *
 * **Three things are pinned and one scrolls.** The title and Settings, the
 * room you are in if there is one, and the switch between the tier's four
 * bodies; then the selected body, scrolling — except Podcasts, which is a page
 * that fills rather than a column that scrolls, and which in a split is drawn
 * in the pane next door instead of here. See `podcastsBeside`.
 *
 * **The third body is Support**, added because Help and Chip in had been the
 * tail of whichever list was showing since they were promoted here on
 * 2026-09-01. That was the right container and the wrong place in it: a row
 * about the application waited out every channel somebody had, and did it
 * twice, once under each list. A tab is the same one tap from anywhere and
 * pushes nothing down. See `SupportBody`.
 *
 * **The lists are bodies rather than screens.** `ChannelsView` and
 * `ContactsView` render into this scroll and own no header, which is what
 * lets one frame hold either without knowing which. Neither has a way back to
 * the other any more — the switch is the whole of that — and neither draws
 * the live bar, which is the point of the tier rather than a detail of it.
 */
export function HomeView({
  list,
  onList,
  onEnterChannel,
  onOpenSettings,
  onOpenNotifications = () => {},
  onOpenSupport = () => {},
  onOpenHelp = () => {},
  onOpenLeaderboard,
  onOpenAudioLab,
  onOpenProfile,
  podcastsBeside = false,
  liveChannel = null,
  onReturnToChannel = () => {},
}: {
  /** Which of the four bodies is showing. See `List` in `ui/detail.ts`. */
  list: List;
  onList: (list: List) => void;
  onEnterChannel: (channelId: string) => void;
  onOpenSettings: () => void;
  /**
   * Opens the screen explaining what notifications are for, which is the only
   * thing the banner here does. **Nothing in this tier asks the system for
   * anything** — the dialog belongs to a screen somebody has read.
   */
  onOpenNotifications?: () => void;
  /** Opens the screen that explains donating, and carries the link out. */
  onOpenSupport?: () => void;
  /**
   * Opens the screen for asking The Floor a question and reading the answers.
   *
   * Unconditional, unlike the two below it: everybody can have a question, and
   * a way to ask one that appears only for some accounts is not a help
   * mechanism at all.
   */
  onOpenHelp?: () => void;
  /**
   * Opens the invitation standings. Absent unless this account has been
   * granted them, in which case nothing here says they exist at all — the
   * row is the whole of how anybody learns the screen does.
   */
  onOpenLeaderboard?: () => void;
  /**
   * The audio bench. Present only for a `debug` account, absent for everybody
   * else, and expected to disappear entirely once the experiment it exists for
   * has an answer.
   */
  onOpenAudioLab?: () => void;
  /**
   * Hands a tapped contact upward instead of opening the profile here.
   *
   * **Given only when this tier is the list pane of a split**, where a profile
   * belongs in the pane next door rather than in a 360pt column. Absent
   * everywhere else, and then this component owns the profile and shows it
   * over the whole tier.
   *
   * It moved up from `ContactsView` with everything else that was not a list.
   * `App.tsx` refuses to route profiles through itself, on the grounds that it
   * would have to know which screen one was opened from to know where closing
   * it goes back to; that argument does not reach here, because there is only
   * one answer — back to this tier, with the contacts showing, which is where
   * it was tapped.
   */
  onOpenProfile?: (contact: {
    id: string;
    name: string;
    /** Opens your own already editing; see ProfileView. */
    edit?: boolean;
  }) => void;
  /**
   * Whether the Podcasts page is being drawn in the pane next door, in which
   * case this tier draws no body for that tab at all.
   *
   * **True in a split and false everywhere else**, on the same reasoning as
   * `onOpenProfile` above and for a stronger case. The other three bodies are
   * columns of rows, which is what a 360pt column is for; the directory is a
   * document, and a document squeezed into that column beside an empty pane is
   * the wrong half of the window. So above the breakpoint the tab still lights
   * and still switches, and what it switches to is on the right — `App.tsx`
   * hands it to `Panes` as the empty pane's fallback.
   *
   * The tier is then a header with nothing under it while that tab is
   * selected, which is exactly what it is: the title, the room you are in and
   * the switch, all of which are the tier's own and none of which belong to a
   * body. Nothing is missing from it, because the thing it would have held is
   * on screen.
   */
  podcastsBeside?: boolean;
  /**
   * The channel you are present in right now, if you walked back here without
   * stepping out. Null when you are not in one — and never null merely
   * because that channel is also the pane next door, which is what makes this
   * bar look the same whatever the other half of a split is showing.
   */
  liveChannel?: {
    channelId: string;
    title: string;
    present: number;
    /** Muted by your own choice — not the floor, which is a different thing. */
    muted: boolean;
  } | null;
  /**
   * Back into the channel you are standing in — and, since the checklist
   * started pointing at it, onto a named tab of it. The tab is absent for the
   * bar itself, which is a way back to the room rather than to anything in
   * particular. See `ui/Introduction.tsx`.
   */
  onReturnToChannel?: (channelId: string, tab?: ChannelTab) => void;
}) {
  const t = useText().home;
  const brand = useText().panes;
  const app = useApp();

  /**
   * Whether a film of this account's is showing on one of its *other*
   * devices — which is the whole condition for offering to bring it here.
   *
   * Keyed on the live channel because it cannot be true of any other: a
   * picture is refused to anybody not in the room, so a film of yours that is
   * playing somewhere is playing in the room you are standing in.
   */
  const filmElsewhere =
    !!liveChannel && app.screensElsewhere.includes(liveChannel.channelId);

  /**
   * Whether anybody is waiting on an answer — what the waiting bar draws, and
   * what holds the introduction checklist back until it is dealt with. One
   * read for both; see `useWaiting`.
   */
  const { any: waiting } = useWaiting();

  /**
   * The channels this reader is nearby in, which get the live bar's treatment
   * in a different hue — see `nearbyBar` in the styles and § *Nearby / Stepped
   * out* in planning/GLOSSARY.md.
   *
   * **Read off the Home snapshot rather than handed down like `liveChannel`**,
   * and the asymmetry is the two states' rather than an oversight. Presence is
   * the account's *and* the device's: the server can hold you present in a
   * channel this process has never heard of, so that bar is drawn from what
   * the app knows it is connected to and `App.tsx` is the only place that
   * knows. Nearby claims no audio and no room, so there is nothing for a
   * device to disagree with — the account is within reach of these channels,
   * which is the same bit everybody else's roster is reading, and the snapshot
   * is the whole answer.
   *
   * **Only the live channel itself is suppressed, corrected 2026-09-12.** The
   * whole tier used to be, on the grounds that the two states were exclusive
   * by construction — entering stepped you out of everywhere else — so a
   * snapshot claiming both had merely not caught up. Half of that survives and
   * half of it does not. Entering a channel now leaves you *nearby* in the one
   * you left rather than stepped out of it, so present here and nearby there
   * is the ordinary state of somebody who has moved rather than a stale
   * snapshot, and suppressing the tier hid the reader's own nearby rooms from
   * the reader alone — everybody else's roster said *Nearby* about them the
   * whole time, and the way back was a bar that was not drawn.
   *
   * What is still true is the narrow claim, and it is what is kept: you cannot
   * be present in a room and nearby in **that** room, `ENTER` clearing the
   * wait, so a snapshot saying both about one channel has not caught up and
   * presence is the one that is true. Nothing is lost from the screen either
   * way: a channel with no bar is a channel with a row, the filter here and
   * the exclusion passed to `ChannelsView` being one decision made in one
   * place.
   */
  const nearby = nearbyChannels(app.home, useCardWords()).filter(
    (channel) => channel.channelId !== liveChannel?.channelId,
  );

  /**
   * A profile, when there is no pane to put it in. Held here rather than in
   * `ContactsView` because that is a body now and cannot cover anything; see
   * `onOpenProfile`.
   */
  const [profile, setProfile] = useState<{
    id: string;
    name: string;
    edit?: boolean;
  } | null>(null);
  /** Upward when there is a pane to open it in, here when there is not. */
  const openProfile =
    onOpenProfile ??
    ((contact: { id: string; name: string; edit?: boolean }) =>
      setProfile(contact));

  /**
   * Whether there is anywhere to donate at all, which decides only whether the
   * way in is shown. The explanation and the link itself are on the screen
   * behind it.
   *
   * Asked here rather than carried on the Home snapshot, which is pushed to
   * every client on every change and would be answering this question
   * constantly for a row that never moves. Failure is silence: an older server,
   * or one with no link configured, leaves this exactly as it was rather than
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

  if (profile) {
    return (
      <ProfileView
        accountId={profile.id}
        // Read from `app.me` for your own rather than from what the card said
        // when it was tapped, so a name changed on the profile itself is not
        // stale the moment it is written.
        fallbackName={
          profile.id === app.me?.id ? app.me.displayName : profile.name
        }
        onBack={() => setProfile(null)}
        // Stepping into a channel the two of you share. Handed straight
        // through: what a tap does — arrive, or merely open — is the profile's
        // business and the same preference the channel list reads.
        onEnterChannel={onEnterChannel}
        // Removing a contact from their own profile takes the row this was
        // opened from with it, so there is nothing to go back to.
        onRemoved={() => setProfile(null)}
        // Straight through from *Choose a Username*, which wants the field
        // rather than the screen it is on.
        beginEditing={profile.edit}
      />
    );
  }

  /*
    Pinned, all three rows of it. The list under it is as long as the number of
    channels or contacts somebody has, and none of this is part of either.

    The live bar is what this is really for: an open microphone behind a screen
    giving no sign of it is the failure that bar exists to prevent, and a sign
    that leaves the viewport on the first flick gives no sign for most of the
    screen. Switching lists is now the other half of the same argument — the
    bar used to go with the channel list, and the room you were in disappeared
    with it.
  */
  const header = (
    <View style={styles.header}>
      {/*
        The measure, applied to the header's contents and not to the header
        itself: the rule under it is an edge, and an edge that stops short of
        the window is not one. The horizontal padding is in here for the same
        reason — the column of cards below carries its padding inside the cap,
        so a header carrying it outside would sit the title twenty points off
        the rows it names.
      */}
      <View style={styles.headerInner}>
        <View style={styles.headerTop}>
          <Text style={type.title}>{brand.brand()}</Text>
          {/*
            Settings, and nothing beside it. It is about the application rather
            than about either list, which is why it is up here — the same
            argument that promotes Chip in, made about a button that was
            already in a header.

            The Contacts button that stood next to it is gone. It said "go to
            the other screen" about something that was never a screen; the
            switch below says which of two peers you are looking at, which is
            what was true all along.
          */}
          <View style={styles.headerActions}>
            <IconButton
              label={t.settings()}
              icon={(color) => <SettingsIcon color={color} />}
              onPress={onOpenSettings}
            />
          </View>
        </View>

        {/*
          You can be in a conversation while looking at either list, which means
          the app has to say so from somewhere that outlives both of them. This
          is that somewhere, and it is the whole reason this tier exists rather
          than being a tidier arrangement of the same parts.
        */}
        {liveChannel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.liveBarLabel(
              liveChannel.title,
              liveChannel.muted
            )}
            /*
              Counted as the tap the left swipe is measured against — this
              line and that gesture are the two ways back into the room you
              are standing in, and either number alone says nothing. Here
              rather than around `onReturnToChannel` in `App.tsx`, because the
              introduction checklist calls that same handler to open a channel
              by a different journey entirely, and counting those as this
              would make the control look used by people who never found it.
              See `core/navigation.ts`.
            */
            onPress={() => {
              app.recordNav('liveCard');
              onReturnToChannel(liveChannel.channelId);
            }}
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
                  style={[
                    styles.liveDot,
                    liveChannel.muted && styles.liveDotMuted,
                  ]}
                />
                <Text style={styles.liveTitle} numberOfLines={1}>
                  {liveChannel.title}
                </Text>
              </View>
              <Text style={styles.liveSub}>
                {liveChannel.present === 1
                  ? t.nobodyElseHereYet()
                  : t.present(liveChannel.present)}
                {t.tapToGoBack()}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {/*
          **The film, and the offer to bring it here.**

          It can only be on another of your devices if you are standing in the
          room it belongs to — the picture is refused to anybody who is not —
          so this is always about `liveChannel` and never needs a channel of
          its own to name. `screensElsewhere` is pushed to every device by the
          server for exactly this, and until now it was read in one place,
          inside the channel screen, to decide how a switch should read.

          **It is here because the push half was the only convenient one.**
          Sending the film away is a control on the device you are holding and
          always was; fetching it back meant opening the app on the device you
          had walked to, finding the channel, opening it, going to *Watch* and
          throwing the switch — five steps for the gesture people actually
          make, which is to sit down somewhere and want the film there.

          Neutral rather than one of the two presence hues: `floor` is the room
          you are standing in and `nearby` is one you are not, and where a film
          is playing is neither. A pinned bar is what `surface` is for.
        */}
        {filmElsewhere && liveChannel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.filmElsewhere(liveChannel.title)}
            onPress={() => {
              /*
                The whole claim, in one call: `showScreenFor` tells the server
                this device is showing it, and the server takes it off every
                other instance. Nothing here has to ask the device that has it
                to let go — see `screens.showing`, and `handOver` in
                `ChannelView` for why letting the eviction do it is what makes
                *exactly one screen* true by construction.
              */
              app.showScreenFor(liveChannel.channelId);
              onReturnToChannel(liveChannel.channelId, 'watch');
            }}
            style={styles.screenBar}
          >
            <View style={styles.rowMain}>
              <Text style={styles.screenTitle} numberOfLines={1}>
                {t.filmOnAnotherDevice()}
              </Text>
              <Text style={styles.liveSub}>{t.tapToWatchHere()}</Text>
            </View>
          </Pressable>
        ) : null}

        {/*
          A bar for each channel you are within reach of, under the live bar
          and never beside it. Both tiers are drawn at once since 2026-09-12,
          stepping from one room to the next being what now leaves you nearby
          in the first — see `nearby` above, where the one channel that cannot
          appear in both is filtered out.

          **Several is the ordinary case.** Presence is exclusive and this is
          not: a declaration is one tap in one channel and says nothing about
          any other, so somebody who has said *be nearby* in three rooms is
          within reach of three — and somebody who has walked through three
          rooms is within reach of the two behind them without having tapped
          anything at all. They are pinned for the live bar's reason
          rather than by analogy with it — being reachable in a room you are
          not looking at is a state with no other sign of itself, and the
          arrival that answers it is offered on the channel's own screen, which
          is precisely where you are not.

          Quieter than the live bar, in hue and in weight: nothing is happening
          to you in these rooms, and the one thing that could — somebody
          arriving — is a number this bar already carries.
        */}
        {nearby.map((channel) => (
          <Pressable
            key={channel.channelId}
            accessibilityRole="button"
            // Said in words for the reason the live bar's is: the dot is the
            // whole of the distinction on screen, and a dot reads as nothing.
            accessibilityLabel={t.nearbyBarLabel(
              channel.title,
              channel.presentCount
            )}
            // `onEnterChannel` rather than `onReturnToChannel`, which is the
            // live bar's — and neither of them steps in. Both navigate and
            // nothing more; the tap that arrives is `ENTER`, dispatched by
            // whoever sends it, and a nearby bar must not: stepping in ends
            // the declaration, so a bar that did it could not be pressed
            // twice and would answer a question nobody asked. The channel's
            // own screen offers *Step in* under a thumb, which is where the
            // choice belongs.
            onPress={() => onEnterChannel(channel.channelId)}
            style={styles.nearbyBar}
          >
            <View style={styles.rowMain}>
              <View style={styles.liveTitleRow}>
                {/*
                  Hollow, where presence is filled. The live bar spends this
                  same 9pt on availability; here there is nothing to be
                  available with, so the shape carries the rung instead — an
                  outline is the room you are outside of.
                */}
                <View style={styles.nearbyDot} />
                <Text style={styles.nearbyTitle} numberOfLines={1}>
                  {channel.title}
                </Text>
              </View>
              {/*
                "Nearby" first, because the state is the point of the bar and
                the count is what to do about it. `0 present` is not said as a
                number: a room with nobody in it is a fact about the room, and
                a nought beside a word like *present* reads as a failure to
                load.
              */}
              <Text style={styles.nearbySub}>
                {t.nearbySub(channel.presentCount)}
              </Text>
            </View>
          </Pressable>
        ))}

        {/*
          What somebody has asked of you, said in the one place both lists can
          be seen from.

          **Under the presence bars and above the two notices**, which is the
          order of who the line is about. An open microphone outranks
          everything and keeps the top; the notices below are the application
          asking for something — install this, allow that — and a person
          waiting for an answer outranks the application asking for a favour.
        */}
        <WaitingBar onList={onList} />

        <InstallNotice />

        <NotificationNotice onExplain={onOpenNotifications} />

        <ListSwitch list={list} onList={onList} />
      </View>
    </View>
  );

  return (
    <Screen
      header={header}
      /*
        The Podcasts tab is the one body that is not a column of cards: it is a
        page, and it fills what the tier leaves it rather than scrolling inside
        it. `fill` is `flexGrow` and nothing else, which gives a `flex: 1` child
        of the scroll a real height; the padding the other bodies take is the
        page's own business, it having brought its own margins. See
        `PodcastsView`.

        **And in a split it is not here at all** — see `podcastsBeside`. The
        content style is chosen the same way either way, an empty body being no
        harder to give `flexGrow` than a full one, and this stays one
        expression rather than two.
      */
      contentStyle={list === "podcasts" ? styles.fill : styles.container}
    >
      {list === "podcasts" ? (
        podcastsBeside ? null : (
          <PodcastsView />
        )
      ) : list === "support" ? (
        <SupportBody
          canSupport={canSupport}
          onOpenHelp={onOpenHelp}
          onOpenSupport={onOpenSupport}
          onOpenLeaderboard={onOpenLeaderboard}
          onOpenAudioLab={onOpenAudioLab}
        />
      ) : (
        <>
          {/*
            First in the scroll, above whichever list is showing, and only until
            this account has had a conversation.

            **It belongs to the tier for the live bar's reason.** A checklist
            spanning *get somebody here* and *open a channel* is about neither
            list, and drawing it inside one of them would put it in front of half
            the people it is for — and take it away when they flipped tabs
            mid-rung.

            **In the scroll rather than pinned above it**, unlike the two notices,
            because it is longer than a banner and pinning it would spend a fixed
            share of a small screen on something nobody opened the app to read.
            It is the mirror of the Support tab: that is a tap away because
            everything on this one is what somebody came here to do, and for an
            account with nothing in it yet, this *is* that.

            The trade, said out loud: it pushes `StartChannelRow` down, and that
            row went to the top of the scroll on 2026-09-02 so it would sit where
            *Add contact* sits on the other tab. It is bounded — this is gone the
            moment somebody has had a conversation, and the two rungs point at
            those two rows rather than competing with them — but it does
            contradict a dated decision. See planning/ONBOARDING.md.
          */}
          {/*
            The checklist is told which channel this person is standing in,
            because four of its rungs are done inside one and it can reach
            there directly rather than naming a list to go and find it in.
            Null whenever they are not present anywhere, which is when a list
            is the only honest destination.
          */}
          {/*
            **And not while somebody is waiting on an answer**, since
            2026-09-24. The ladder's first rung is *get somebody here*, which
            is the wrong thing to say to an account that arrived because
            somebody got *them* here and has not been answered yet: the
            application opens by asking a stranger to go recruiting while the
            person who recruited them sits unanswered above it. Answering is
            also the shorter job, and it ticks nothing on the ladder, so
            nothing is lost by putting the ladder a moment later.

            **Suppressed here rather than in `state/introduction.ts`**, which
            is where the rest of the policy lives and is the departure worth
            naming. What is waiting is the tier's own question — it is
            computed a few lines up for the bar, out of two selectors that
            belong to the two lists — and pushing it down into the policy
            would mean either passing the answer in or teaching that module to
            read a contact's status, which is a third reader of a fact two
            already share. The card's *contents* are still decided entirely
            there; this decides only whether the tier draws it, which is a
            thing the tier already did.
          */}
          {waiting ? null : (
            <Introduction
              onList={onList}
              live={liveChannel?.channelId ?? null}
              onOpenChannel={onReturnToChannel}
            />
          )}

          {list === "channels" ? (
            <ChannelsView
              onEnterChannel={onEnterChannel}
              // The bar above and a row down here are two renderings of one
              // channel, so exactly one of them appears. They were briefly
              // separate questions, while the bar was suppressed in a split and
              // the row was not — see `App.tsx`, which no longer suppresses it.
              liveChannelId={liveChannel?.channelId ?? null}
              // And the same for the bars above: exactly the channels a bar was
              // drawn for, so a suppressed bar leaves its row where it was.
              nearbyChannelIds={nearby.map((channel) => channel.channelId)}
            />
          ) : (
            <ContactsView
              onEnterChannel={onEnterChannel}
              onOpenProfile={openProfile}
            />
          )}
        </>
      )}
    </Screen>
  );
}

/**
 * The Support tab's body: how to ask for help, and how to help.
 *
 * **The tail of the scroll, made a place.** All of this used to sit under
 * whichever list was showing, and the argument for it being there was that
 * everything above it was what somebody opened the app to do. That argument
 * says where a thing goes when it has nowhere of its own; it stops applying
 * the moment it does. Nothing here is louder for having a tab — a tab is
 * still one tap, and it is one that never pushes a list down or waits at the
 * end of a hundred channels.
 *
 * **One list of cards, and each card says what it is for.** There were two
 * section labels here, *Help* and *Support*, on the reasoning that *support*
 * on this tab means support the project — money — while *help* means get
 * support, and that one heading over both senses of the word is how somebody
 * taps Chip in looking for an answer. That reasoning was right about the
 * hazard and wrong about the remedy: the tab is already called Support, so a
 * *Support* heading inside it labels the screen with its own name, and a
 * heading is a word where what was needed was a sentence. A line under each
 * button says what that button does, which is what a heading was standing in
 * for and could not manage — *Chip in* under a sentence about what the server
 * costs is not mistakable for the way to ask a question.
 *
 * So the cards are a single group in source order: Help, then the ones about
 * the project. The order is the whole of what the two headings were saying
 * about the grouping, and it survives them.
 *
 * **`default` on every one of them**, which since 2026-09-21 is what every
 * button on this screen is: the `ghost` variant is gone. The argument that
 * put these cards on `default` while there was a choice was that each of them
 * is the one thing its card is for, and that centred in an otherwise empty
 * card a transparent label read as a caption somebody had made tappable
 * rather than as the way through. That reading is now the only one available,
 * which is the whole point of retiring the variant. The fill is
 * `surfaceRaised` on a `surface` card — the ordinary weight of an ordinary
 * control and not an escalation: no colour is spent here, and *Chip in* is no
 * louder than *Help* standing above it.
 */
function SupportBody({
  canSupport,
  onOpenHelp,
  onOpenSupport,
  onOpenLeaderboard,
  onOpenAudioLab,
}: {
  /** Whether the server has anywhere to donate to. See `HomeView`. */
  canSupport: boolean;
  onOpenHelp: () => void;
  onOpenSupport: () => void;
  onOpenLeaderboard?: () => void;
  onOpenAudioLab?: () => void;
}) {
  const t = useText().home;
  // The mark on the tab that got somebody here, carried one step further in.
  const answered = useAnswerWaiting();
  return (
    /* The gap between cards, as every other group of them here gets it. Two
       cards flush against each other read as one card with a line through
       it. */
    <View style={styles.list}>
      {/*
        Help first, and above the cards about the project.

        Unconditional, where every other card here is granted or configured:
        anybody can have a question. There is no state in which offering to
        take one is wrong — and since it is the one card that always draws, it
        is also what stops this tab ever being empty.
      */}
      <Card style={styles.card}>
        {/*
          **The mark the tab wears, on the card it meant.** A dab on *Support*
          says something is waiting behind that tab and stops there, which was
          enough while the tab held one card and stopped being enough the day
          it held four: *Chip in*, the standings and the bench are all things
          that could plausibly have been what the mark was about, and somebody
          reading the tab's mark as being about any of them has been sent the
          wrong way by the mark itself. So the tab points at the tab and the
          card points at the answer, and the step after this one is `HelpView`,
          which clears both by being opened.

          **Nothing new is remembered for it.** It is the same `answered` the
          switch above draws from — see `useAnswerWaiting` — so the two cannot
          come apart, and the read that takes the tab's mark off takes this one
          off in the same frame.

          The word is *answered*, as on the tab, and for the tab's reason: what
          is waiting is the reading of it. A screen reader hears "Help,
          answered".
        */}
        <Button
          label={t.help()}
          badge={answered ? t.answered() : undefined}
          onPress={onOpenHelp}
        />
        {/* What the screen behind it actually is, which is a question box
            rather than a chat, and no promise about when — see `HelpView`,
            which refuses to make one for the same reason. */}
        <Text style={type.muted}>{t.askUsSomething()}</Text>
      </Card>

      {canSupport ? (
        <Card style={styles.card}>
          <Button label={t.chipIn()} onPress={onOpenSupport} />
          {/*
            **As loud as it was**, which is the decision HOME.md was written to
            make and which neither the tab, nor this line, nor the fill
            behind the label disturbs — see the note above on `default`.

            One sentence, and it says what the money is for and stops. The
            rest of the argument — that giving unlocks nothing, that nobody is
            told who has, which address to pay with — is the case for giving
            rather than a description of the button, and it is longer than
            belongs on a screen somebody is passing through. It lives one tap
            away in `SupportView`, where it has been chosen rather than
            imposed, and a test holds it there.
          */}
          <Text style={type.muted}>{t.whatItCosts()}</Text>
        </Card>
      ) : null}

      {/*
        Its own card rather than a second button beside Chip in: the two go to
        unrelated screens, and a card is the unit this screen uses for one
        place to go. It appears for the few accounts granted the standings and
        for nobody else, which is why this part of the tab survives a server
        with nowhere to give.
      */}
      {onOpenLeaderboard ? (
        <Card style={styles.card}>
          <Button label={t.leaderboard()} onPress={onOpenLeaderboard} />
          <Text style={type.muted}>{t.leaderboardWhy()}</Text>
        </Card>
      ) : null}

      {/*
        Alongside the standings because it is the same kind of thing — granted
        by hand, invisible to everybody else. It is not really a peer of these
        two: it is a bench, it writes the audio session directly, and it is
        meant to be deleted with its answer.
      */}
      {onOpenAudioLab ? (
        <Card style={styles.card}>
          <Button label={t.audioLab()} onPress={onOpenAudioLab} />
          <Text style={type.muted}>{t.audioLabWhy()}</Text>
        </Card>
      ) : null}
    </View>
  );
}

/**
 * The tier's four bodies, and which one you are looking at.
 *
 * **A switch rather than buttons that navigate**, which is the whole of
 * what this change is about. Channels and contacts are peers — two indexes
 * onto the people you can reach, one by the conversations you have with them
 * and one by name — and the pair used to be dressed as a root and a child: a
 * *Contacts* button in one header, a *Home* button in the other. Nothing about
 * them justified which was which.
 *
 * **Support is not a peer of those two**, which the order says and nothing
 * else needs to: it is last, and it is what the tier holds that is about the
 * application rather than about anybody in it. **Podcasts is not a peer
 * either**, and is not a fourth index onto anybody you know — it is the public
 * directory, and it sits between the lists and Support because that is where
 * it falls on the one axis this strip is ordered by.
 *
 * Drawn as a segmented control rather than as a tab bar at the foot. A tab bar
 * is for the top level of a whole application and there are four things in
 * this one, so it would spend a permanent strip of a small screen saying
 * something a line under the title says as well.
 *
 * The drawing is `Segmented`, shared with the channel screen's tabs; the
 * argument for why these belong side by side is this one's alone.
 */
/**
 * The one thing a browser cannot do, said once to somebody using one.
 *
 * **Web only, and it is not a nag about a nicer client.** Everything else the
 * browser gives up is the user's own business — a smaller screen, no lock
 * screen, no audio session — but notifications are what let *other people*
 * reach you, so a browser-only install is somebody quietly unreachable who has
 * not agreed to be. That is worth interrupting for once, and worth never
 * mentioning again after they have answered.
 *
 * Drawn only where there is an App Store to send anybody to: `updateUrl` is
 * unset on a box that has not been told, and a call to action that goes
 * nowhere is worse than none — the same graceful absence the landing page and
 * the invitation email make about the same setting.
 *
 * It sits above the switch rather than in either list because it is about the
 * application rather than about channels or contacts, which is the same
 * argument that put Settings in this header.
 */
function InstallNotice() {
  const t = useText().home;
  const { updateUrl } = useApp();
  // Read once on mount rather than watched: nothing else in this tab writes
  // it, and the only writer is the button below.
  const [dismissed, setDismissed] = useState(() => installNoticeDismissed());

  if (Platform.OS !== "web" || !updateUrl || dismissed) return null;

  return (
    <Card style={styles.install}>
      <View style={styles.noticeMain}>
        <Text style={type.body}>{t.putItOnYourPhone()}</Text>
        <Text style={type.muted}>{t.browserCannotNotify()}</Text>
      </View>
      <View style={styles.installActions}>
        <Button
          label={t.notNow()}
          onPress={() => {
            dismissInstallNotice();
            setDismissed(true);
          }}
        />
        <Button
          label={t.getTheApp()}
          onPress={() => {
            // Left standing rather than dismissed: they have not installed
            // anything yet, and a tab that quietly forgets is one that cannot
            // remind somebody who came back to think about it.
            void Linking.openURL(updateUrl);
          }}
        />
      </View>
    </Card>
  );
}

/**
 * That this phone cannot be reached, said once a day at most.
 *
 * **The sibling of `InstallNotice`, and the same argument one platform over.**
 * A browser cannot notify; a phone that has refused notifications has chosen
 * not to be notified — and in both cases the cost is not paid by the person
 * choosing. It is other people finding somebody who never answers. That is
 * worth mentioning, and worth mentioning quietly and rarely.
 *
 * **It does not ask for anything, and it cannot.** iOS has already been asked
 * and has kept the answer; there is no second dialog to raise from here. So
 * the banner offers the explanation, and the explanation offers Settings —
 * which is also why *Not now* is not an ordinary dismissal that hides it for
 * good. The state that decides the cadence lives in
 * `state/notificationAsk.ts`; this component only says when it was seen.
 *
 * `notifications.ask` is what governs it, so a phone with notifications on
 * never renders this at all, and neither does one that has not yet been asked
 * — that install is heading for the explanation itself.
 */
function NotificationNotice({ onExplain }: { onExplain: () => void }) {
  const t = useText().home;
  const { notifications } = useApp();
  const { ask, noteShown } = notifications;
  /**
   * Whether it is up, which is **not** the same as whether it is due.
   *
   * Raising it spends the day, and spending the day makes it stop being due —
   * so a banner drawn straight from `ask` would remove itself on the render
   * after it appeared. What `ask` answers is *may this be raised now*; once
   * raised it stays until this screen goes away or somebody dismisses it.
   */
  const [raised, setRaised] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // The day is spent when the banner appears rather than when it is answered.
  // See `askDue`: a banner that came back until it was formally dismissed
  // would be one that punished ignoring it.
  useEffect(() => {
    if (ask !== "nudge" || raised) return;
    setRaised(true);
    noteShown();
  }, [ask, raised, noteShown]);

  if (!raised || dismissed) return null;

  return (
    <Card style={styles.install}>
      <View style={styles.noticeMain}>
        <Text style={type.body}>{t.nobodyCanReachYou()}</Text>
        <Text style={type.muted}>{t.notificationsAreOff()}</Text>
      </View>
      <View style={styles.installActions}>
        {/*
          *Not now* rather than *Never*, and it is the truth: the day was
          already spent by the effect above, so this takes it off the screen
          and the earliest it can return is tomorrow. An app that let somebody
          switch this off for good would be an app quietly agreeing that they
          should be unreachable, which is the one thing it is here to say is
          worth knowing about.
        */}
        <Button
          label={t.notNow()}
          onPress={() => setDismissed(true)}
        />
        <Button label={t.tellMeMore()} onPress={onExplain} />
      </View>
    </Card>
  );
}

/**
 * Whether an answer has come back that this phone has not read — the Support
 * tab's mark, and the *Help* card's behind it.
 *
 * **One hook because it is one fact**, and because the two marks are one
 * sentence said in two places: the tab says *go and look* and the card says
 * *look here*. Two reads of `helpSeen` computing the same thing would be two
 * things that can disagree, and the way that failure looks is a marked tab
 * opening onto a screen with nothing marked on it — which is worse than no
 * mark at all, because somebody then goes looking through four cards for
 * whatever the tab meant.
 *
 * The debug override is inside it for the same reason: *Show every dab* has to
 * show every dab, and a preview that lit the tab and not the card would be a
 * preview of a state the app never has. See `forcedDabs` in `state/AppProvider`.
 */
function useAnswerWaiting(): boolean {
  const app = useApp();
  const { seenAnsweredAt, loaded } = app.helpSeen;
  // Nothing before the keychain has answered: `seenAnsweredAt` reads as never
  // seen until it does, which would flash a dab on every cold start of an
  // install that has read everything.
  return (
    app.forcedDabs ||
    (loaded && answersWaiting(app.home?.helpAnsweredAt, seenAnsweredAt))
  );
}

/**
 * What somebody has asked of you: at most one bar for the contact requests, at
 * most one for the channel invitations, and nothing at all the rest of the
 * time.
 *
 * **It exists because the first hour here is a scavenger hunt.** Somebody
 * invited by email arrives with a contact request already pending — the row is
 * written at signup, `Accounts.resolvePendingInvites` — and Home opens on
 * *Channels*, which for that account is empty. The request is one tab over
 * behind a *dab*, which is deliberately a mark and never a sentence. They
 * accept, the person who asked them then asks them into a channel, and that
 * card lands on the tab they have just left, with the same silence. Two things
 * waiting, each one behind a tab the reader is not standing on: the app knows
 * both and says neither in words.
 *
 * **A bar rather than the card itself**, which is the decision worth arguing.
 * Hoisting the rows would put *Accept* under a thumb a tap sooner, and it
 * would also draw a contact request and an invitation twice each — once here
 * and once in the list they belong to — which is the failure `liveChannelId`
 * and `nearbyChannelIds` exist to prevent for the channel rows, and the
 * failure STYLE.md rule 7 is about. So this says the sentence and the list
 * keeps the controls, exactly as the live bar says where you are standing and
 * the channel screen keeps the microphone. What was missing was never the
 * button; it was knowing there was one.
 *
 * **Two bars rather than one**, when both are outstanding. A single line
 * counting unlike things — *2 things waiting* — names neither and points at
 * one tab while meaning two. Each of these names what it is and goes where it
 * lives, and both at once is the rarer state anyway: the ordinary arrival
 * meets them one after the other.
 *
 * **Rose, on the border, over `surface`.** `waiting` is the token whose
 * meaning this is, spent on the dab and on the edge of an invitation row —
 * see `ChannelsView`'s `invite` style, which argues the fill away at length
 * and is the shape copied here. No eighteenth token and no tinted block: the
 * live bar stays the only one of those, violet being the floor and nothing
 * else.
 *
 * **It does not switch anybody's tab by itself**, which was the other way to
 * fix this and is worse. The first snapshot arrives a moment after the app
 * opens, so a rule that moved the list on it would move it under a thumb
 * already travelling — and it would have to decide, every launch after the
 * first, whether this arrival is still the thing somebody came for. A bar
 * says so and waits to be pressed.
 */
/**
 * How many things are waiting on an answer, of each kind.
 *
 * **One read, shared by the bar that draws it and the tier that suppresses
 * the checklist behind it** — `useAnswerWaiting`'s reasoning exactly. Two
 * readings of one fact are two things that can disagree, and the way that
 * failure looks here is a bar saying somebody is waiting above a checklist
 * that only hides when they are.
 *
 * The debug preview is inside it for the same reason it is inside that hook:
 * *Show every dab* has to show the app as it is in that state, which includes
 * the ladder being out of the way. Faked rather than forced, because unlike
 * the two dabs there is nothing here to draw without a name to put in it. See
 * `forcedDabs` in `state/AppProvider`.
 */
/**
 * The words the card builders in `ChannelsView` need, as a component can ask
 * for them.
 *
 * **They take words as an argument rather than reading a hook** — that is
 * `CardWords`' whole argument, since they are builders and not components.
 * This is the other half of it: every caller in here *is* a component, and
 * three copies of the same literal are three things that can drift apart.
 */
function useCardWords(): CardWords {
  const text = useText();
  return { channels: text.channels, naming: text.naming };
}

function useWaiting(): { people: number; rooms: number; any: boolean } {
  const app = useApp();
  const requests = answerableRequests(app.home);
  const invitations = waitingInvitations(app.home, useCardWords());
  const forced = app.forcedDabs;
  const people = forced && requests.length === 0 ? 1 : requests.length;
  const rooms = forced && invitations.length === 0 ? 1 : invitations.length;
  return { people, rooms, any: people > 0 || rooms > 0 };
}

function WaitingBar({ onList }: { onList: (list: List) => void }) {
  const app = useApp();
  const t = useText().home;
  const requests = answerableRequests(app.home);
  const invitations = waitingInvitations(app.home, useCardWords());
  const { people, rooms } = useWaiting();

  if (people === 0 && rooms === 0) return null;

  // One name or a count, never both — see `contactRequestWaiting`, where the
  // sentences and the reason for that are.
  const asking = requests[0]?.account.displayName ?? t.somebody();
  const invitation = invitations[0];
  const asks =
    people === 1 ? t.contactRequestWaiting(asking) : t.contactRequestsWaiting(people);
  const invites = t.invitationWaiting(
    rooms,
    invitation?.from ?? "",
    invitation?.title ?? "",
    invitation?.guest ?? false
  );

  return (
    <>
      {people > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.waitingBarLabel(asks)}
          onPress={() => onList("contacts")}
          style={styles.waitingBar}
        >
          <View style={styles.rowMain}>
            <Text style={styles.waitingTitle} numberOfLines={1}>
              {asks}
            </Text>
            <Text style={styles.liveSub}>{t.tapToAnswer()}</Text>
          </View>
        </Pressable>
      ) : null}

      {rooms > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.waitingBarLabel(invites)}
          onPress={() => onList("channels")}
          style={styles.waitingBar}
        >
          <View style={styles.rowMain}>
            <Text style={styles.waitingTitle} numberOfLines={1}>
              {invites}
            </Text>
            <Text style={styles.liveSub}>{t.tapToAnswer()}</Text>
          </View>
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * The switch, and the two marks it can wear.
 *
 * **Both dabs are read here rather than inside the bodies they are about**, for
 * the reason every other hoisted thing on this screen is: a tab says what is
 * behind it to somebody who is not looking at it, so the tier is the only place
 * that can draw one. What each mark *means* is still the body's question —
 * `answerableRequests` is `ContactsView`'s — and only the counting is done here.
 *
 * **The two are not symmetrical and the code should not pretend they are.**
 * Contacts is live state: the mark arrives with the request and leaves when it
 * is answered, and there is nothing to remember. Support is a fact that stays
 * true for ever once written, so the mark is the difference between what the
 * server holds and what this phone has read — `state/helpSeen.ts` argues it.
 *
 * A mark is drawn on the tab you are standing on as readily as on any other.
 * It is about what the tab holds, and Home opens on *Channels*, so the common
 * case is a dab on a tab you are not looking at anyway.
 *
 * **Two of the four can carry one, and that is not a rule about the other
 * two.** Channels has nothing to mark that the rows below it do not mark
 * better, and Podcasts is a page about other people's channels that this
 * account has no unread relationship with at all.
 */
function ListSwitch({
  list,
  onList,
}: {
  list: List;
  onList: (list: List) => void;
}) {
  const t = useText().home;
  const app = useApp();
  const requests = answerableRequests(app.home).length;
  // The same read the Support body makes, so the tab and the card behind it
  // cannot say different things.
  const answered = useAnswerWaiting();
  /*
    The debug preview for the Contacts mark, which is an `||` here; the Support
    mark's is inside `useAnswerWaiting`, so that the card behind that tab is
    forced along with it.

    **It forces the drawing and not the states behind it**, which is the whole
    of why it is read at this line. Both real conditions are still computed and
    still right, so turning it off is exactly turning it off; and the screens
    behind the two tabs say what they always said, because nothing was written
    to make the marks appear. What is being looked at is the app with both marks
    on it, rather than a mock of it. See `forcedDabs` in `state/AppProvider`.

    The words are the real words for the same reason — a preview that announced
    something a screen reader never hears would be a preview of the wrong thing,
    and these marks are half announcement.
  */
  const forced = app.forcedDabs;

  return (
    <Segmented
      options={[
        {
          value: "contacts",
          label: t.contacts(),
          icon: (color) => <ContactsIcon color={color} />,
          /*
            The words rather than a number, which is what `badge` takes — see
            `Segmented`. Plural unconditionally: a screen reader hearing
            "requests waiting" and finding one is told nothing untrue, and the
            alternative is this tier knowing how to count in English for the
            sake of a case it cannot see.
          */
          badge: forced || requests > 0 ? t.requestsWaiting() : undefined,
        },
        {
          value: "channels",
          label: t.channels(),
          icon: (color) => <ChannelsIcon color={color} />,
        },
        /*
          Third, and the first tab here that is about nobody in particular.
          Contacts and Channels are the people you can reach; this is every
          channel that has chosen to have a public page, which is a document
          the server already serves to strangers and which the app had no way
          into until 2026-09-22. It sits before Support on the same reasoning
          that puts Support last — the order is how far each tab is from the
          person holding the phone, and a directory of other people's
          conversations is further than either list and nearer than the
          application's own business.
        */
        {
          value: "podcasts",
          label: t.podcasts(),
          icon: (color) => <PodcastsIcon color={color} />,
        },
        /*
          Last, which is the whole of the claim being made about it. Contacts
          and Channels are the two indexes onto the people you can reach and
          are what somebody opened the app for; this is the part of the tier
          that is about the application, and it sits after all of them for the
          same reason its contents sat at the foot of the scroll before —
          reachable in one tap, and never in front of anything.
        */
        {
          value: "support",
          label: t.support(),
          icon: (color) => <SupportIcon color={color} />,
          // "answered" rather than "an answer waiting": what is waiting is the
          // reading of it, and the answer is already here. The override is
          // inside `useAnswerWaiting`, unlike the Contacts mark above, because
          // the card behind this tab has to be forced with it.
          badge: answered ? t.answered() : undefined,
        },
      ]}
      value={list}
      onChange={onList}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
  /** The Podcasts tab's body, which fills rather than scrolls; see above. */
  fill: { flexGrow: 1 },
  /**
   * The pinned top. It carries `container`'s horizontal padding itself, being
   * outside the scroll, so the title lines up with the rows under it, and the
   * hairline is what a pinned header needs and a scrolling one does not — see
   * the note on TranscriptView's.
   */
  header: {
    paddingTop: spacing(1),
    paddingBottom: spacing(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: { ...measure, paddingHorizontal: spacing(2.5), gap: spacing(1) },
  /** The title and the one button that is about the application. */
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  /**
   * Negative trailing margin, so `Button`'s card-sized horizontal padding
   * does not inset it further from the edge than the title is from the other
   * one.
   */
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: -spacing(1),
  },
  liveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.floorDim,
    borderColor: colors.floor,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(1.75),
  },
  liveTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1),
  },
  liveTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },
  liveSub: { fontSize: 13, color: colors.textMuted },
  /**
   * The nearby bar: the live bar's shape, in the other hue.
   *
   * **A copy of `liveBar` rather than a variant of it**, which is the smaller
   * of two evils here. Sharing the block and overriding two colours reads
   * tidily and hides the fact that these are two states rather than one state
   * at two strengths — and the next difference between them, whatever it is,
   * lands as a third override rather than in a block that says what this is.
   * Four lines are shared and stated twice; if a fifth arrives, extract then.
   *
   * **Nothing spaces these but `headerInner`'s gap**, which is the same
   * `spacing(1)` the lists under the switch put between their rows — so a
   * hoisted row sits at the same pitch as the rows it was hoisted out of.
   * There used to be a `marginTop` here as well, on the belief that a gap
   * does not reach the members of a mapped run; it does — `.map()` returns
   * ordinary siblings — so the two stacked and these bars alone stood 20pt
   * apart while everything else on the screen stood 8.
   */
  /**
   * The offer to bring the film to this device.
   *
   * Stated in full rather than sharing `liveBar`, which is this file's
   * standing rule for bars that coincide in shape — STYLE.md § *Per-screen
   * styles*. It is a third thing rather than a third strength: the other two
   * say where *you* are, and this says where the *film* is.
   */
  screenBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(1.75),
  },
  screenTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  /**
   * Something somebody has asked of you.
   *
   * **`screenBar`'s shape in the waiting hue**, stated in full rather than
   * shared with it — this file's standing rule for bars that coincide, the
   * same one `nearbyBar` is written out under. It is a fourth thing rather
   * than a fourth strength: two of these say where you are, one says where
   * the film is, and this one is about somebody else's question.
   *
   * **Border only, over `surface`.** The fill is what makes the live bar the
   * loudest thing in this header, and it should stay the only one: the room
   * you are standing in is happening now, and a request can be answered in a
   * minute or tomorrow. `ChannelsView`'s `invite` made this exact trade on
   * 2026-09-15 for the row this bar points at, so the two now carry the same
   * rose edge at two sizes, which is what they are.
   */
  waitingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.surface,
    borderColor: colors.waiting,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(1.75),
  },
  /** `nearbyTitle`'s weight: a hoisted row, not presence. */
  waitingTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  nearbyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.nearbyDim,
    borderColor: colors.nearby,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(1.75),
  },
  /**
   * A step down from `liveTitle`, which is 17pt semibold. The room you are in
   * is the loudest thing in this header and stays that way; a room you are
   * within reach of is 15pt and regular, which is the list's own body weight —
   * these bars are hoisted rows, and presence is not.
   */
  nearbyTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  nearbySub: { fontSize: 13, color: colors.textMuted },
  /** Hollow, in the nearby hue: outside the room, within reach of it. */
  nearbyDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.nearby,
  },
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
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.textFaint,
  },
  rowMain: { flex: 1, gap: 2 },
  /**
   * The same two lines of text, in a card rather than in a row.
   *
   * **Not `rowMain`, and that is the whole point of it existing.** `flex: 1`
   * means *take what is left of the main axis*, and the main axis is the
   * container's. In `liveBar` that is horizontal and it reads as intended; in
   * `install`, which is a column, it sets `flexBasis: 0` vertically — so the
   * text contributes no height to a card that is sizing itself to its
   * content, then grows into the nothing that leaves. Both notices rendered
   * as their buttons and a blank space above them.
   */
  noticeMain: { gap: 2 },
  /**
   * The install notice, which is a card in the header rather than the first
   * row of a list: it is about the application, and a list of channels that
   * began with something that is not a channel would be the overlap the two
   * lists were separated to avoid.
   */
  install: { gap: spacing(1), marginBottom: spacing(1.5) },
  installActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing(0.5),
  },
  list: { gap: spacing(1) },
  /** A card holding a button and the line explaining it. See `SupportBody`. */
  card: { gap: spacing(1) },
});
