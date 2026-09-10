import React, { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button, Card, IconButton, Screen, SectionLabel } from './components';
import { SettingsIcon } from './icons';
import { ChannelsView } from './ChannelsView';
import { ContactsView } from './ContactsView';
import { Introduction } from './Introduction';
import { ProfileView } from './ProfileView';
import type { List } from './detail';
import { dismissInstallNotice, installNoticeDismissed } from './installNotice';
import { colors, measure, radius, spacing, type } from './theme';

/**
 * What the app opens on: a frame with a pinned top, and inside it one of the
 * two lists of people you can reach.
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
 * room you are in if there is one, and the switch between the two lists; then
 * the selected list, scrolling, with Chip in and Standings at the foot of it.
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
  liveChannel = null,
  onReturnToChannel = () => {},
}: {
  /** Which of the two lists is in the body. See `List` in `ui/detail.ts`. */
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
   * belongs in the pane next door rather than in a 340pt column. Absent
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
  onReturnToChannel?: (channelId: string) => void;
}) {
  const app = useApp();

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
          <Text style={type.title}>The Floor</Text>
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
              label="Settings"
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
                  ? 'Nobody else is here yet'
                  : `${liveChannel.present} present`}{' '}
                · tap to go back
              </Text>
            </View>
          </Pressable>
        ) : null}

        <InstallNotice />

        <NotificationNotice onExplain={onOpenNotifications} />

        <ListSwitch list={list} onList={onList} />
      </View>
    </View>
  );

  return (
    <Screen header={header} contentStyle={styles.container}>
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
        share of a small screen on something nobody opened the app to read. It
        is the mirror of Chip in at the foot: that sits last because everything
        above it is what somebody came here to do, and for an account with
        nothing in it yet, this *is* that.

        The trade, said out loud: it pushes `StartChannelRow` down, and that
        row went to the top of the scroll on 2026-09-02 so it would sit where
        *Add contact* sits on the other tab. It is bounded — this is gone the
        moment somebody has had a conversation, and the rungs point at that row
        rather than competing with it — but it does contradict a dated
        decision. See planning/ONBOARDING.md.
      */}
      <Introduction
        onEnterChannel={onEnterChannel}
        onOpenProfile={openProfile}
        onList={onList}
      />

      {list === 'channels' ? (
        <ChannelsView
          onEnterChannel={onEnterChannel}
          // The bar above and a row down here are two renderings of one
          // channel, so exactly one of them appears. They were briefly
          // separate questions, while the bar was suppressed in a split and
          // the row was not — see `App.tsx`, which no longer suppresses it.
          liveChannelId={liveChannel?.channelId ?? null}
        />
      ) : (
        <ContactsView onEnterChannel={onEnterChannel} onOpenProfile={openProfile} />
      )}

      {/*
        Last in the scroll, below whichever list is showing, and one line
        rather than three.

        **Promoted to the tier and left exactly as loud as it was**, which is
        the decision HOME.md was written to make. Being about the application
        rather than about either list is a claim about what it belongs to, not
        about how loudly it should ask — and the comment it inherited governs
        the tier exactly as it governed Home: everything above it is what
        somebody opened the app to do, and a request for money that sat above
        that would be reading the room wrong. Pinning it to the foot of the
        frame was the other option, and it loses on precisely that.

        The argument for it — what the server costs, that it unlocks nothing,
        which address to pay with — is longer than belongs on a screen somebody
        is passing through. That lives one tap away, where it has been chosen
        rather than imposed.
      */}
      {/*
        Help, at the foot of the list and above the section about the project.

        **Here rather than inside `ChannelsView`, which is what was asked for
        and is one tier off.** That component is the list of channels and
        nothing else — everything that was not a channel left it on 2026-09-01,
        Chip in included, and putting a button about the application back in
        would be undoing that for the second time. This is the foot of the
        scroll the list renders into, so it is the bottom of the channel list
        on screen; the only difference is that it is also the bottom of the
        contacts, which is right, a question not being about either list.

        **Its own group, above Support and not in it.** The label there means
        *support this project* — money — and this means *get support*. One
        section holding both senses of the word is how somebody taps Chip in
        looking for an answer.

        Unconditional, where every other row down here is granted or
        configured: anybody can have a question. There is no state in which
        offering to take one is wrong.
      */}
      <SectionLabel>Help</SectionLabel>
      <View style={styles.list}>
        <Card>
          <Button label="Help" variant="ghost" onPress={onOpenHelp} />
        </Card>
      </View>

      {canSupport || onOpenLeaderboard || onOpenAudioLab ? (
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
              label reads as the part of the app that is about the project
              rather than about a conversation, and the standings belong there
              too.
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
            {/*
              Alongside the standings because it is the same kind of thing —
              granted by hand, invisible to everybody else. It is not really a
              peer of these two: it is a bench, it writes the audio session
              directly, and it is meant to be deleted with its answer.
            */}
            {onOpenAudioLab ? (
              <Card>
                <Button
                  label="Audio lab"
                  variant="ghost"
                  onPress={onOpenAudioLab}
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
 * The two lists, and which one you are looking at.
 *
 * **A switch rather than two buttons that navigate**, which is the whole of
 * what this change is about. Channels and contacts are peers — two indexes
 * onto the people you can reach, one by the conversations you have with them
 * and one by name — and the pair used to be dressed as a root and a child: a
 * *Contacts* button in one header, a *Home* button in the other. Nothing about
 * them justified which was which.
 *
 * Drawn as a segmented control rather than as a tab bar at the foot. A tab bar
 * is for the top level of a whole application and there are two things in this
 * one, so it would spend a permanent strip of a small screen saying something
 * a line under the title says as well.
 *
 * `accessibilityState` rather than a word in the label: a screen reader
 * announces the selection itself, and "Channels, selected, button" is the
 * sentence it makes of this. Both halves stay pressable when selected — a
 * control that goes inert where you already are is one people press twice
 * wondering whether it registered.
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
  const { updateUrl } = useApp();
  // Read once on mount rather than watched: nothing else in this tab writes
  // it, and the only writer is the button below.
  const [dismissed, setDismissed] = useState(() => installNoticeDismissed());

  if (Platform.OS !== 'web' || !updateUrl || dismissed) return null;

  return (
    <Card style={styles.install}>
      <View style={styles.noticeMain}>
        <Text style={type.body}>Put The Floor on your phone</Text>
        <Text style={type.muted}>
          A browser cannot notify you, so nobody can reach you here unless you
          are looking. The app can.
        </Text>
      </View>
      <View style={styles.installActions}>
        <Button
          label="Not now"
          variant="ghost"
          onPress={() => {
            dismissInstallNotice();
            setDismissed(true);
          }}
        />
        <Button
          label="Get the app"
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
    if (ask !== 'nudge' || raised) return;
    setRaised(true);
    noteShown();
  }, [ask, raised, noteShown]);

  if (!raised || dismissed) return null;

  return (
    <Card style={styles.install}>
      <View style={styles.noticeMain}>
        <Text style={type.body}>Nobody can reach you</Text>
        <Text style={type.muted}>
          Notifications are off for The Floor, so an invitation or a ping
          arrives only if you happen to be looking.
        </Text>
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
          label="Not now"
          variant="ghost"
          onPress={() => setDismissed(true)}
        />
        <Button label="Tell me more" onPress={onExplain} />
      </View>
    </Card>
  );
}

function ListSwitch({
  list,
  onList,
}: {
  list: List;
  onList: (list: List) => void;
}) {
  return (
    <View style={styles.switch}>
      {(['channels', 'contacts'] as const).map((which) => (
        <Pressable
          key={which}
          accessibilityRole="button"
          accessibilityState={{ selected: list === which }}
          onPress={() => onList(which)}
          style={({ pressed }) => [
            styles.switchHalf,
            list === which && styles.switchHalfOn,
            pressed && styles.switchHalfPressed,
          ]}
        >
          <Text
            style={[
              styles.switchLabel,
              list === which && styles.switchLabelOn,
            ]}
          >
            {which === 'channels' ? 'Channels' : 'Contacts'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(2.5), paddingBottom: spacing(6) },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /**
   * Negative trailing margin, so `Button`'s card-sized horizontal padding
   * does not inset it further from the edge than the title is from the other
   * one.
   */
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -spacing(1),
  },
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.floorDim,
    borderColor: colors.floor,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(1.75),
  },
  liveTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  liveTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
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
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(0.5),
  },
  /**
   * The switch: one track, two halves, and the selected half raised out of it
   * rather than coloured. The accent belongs to the live bar directly above,
   * which is the one thing here meant to shout; a purple half would be
   * competing with a room somebody is standing in.
   */
  switch: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  switchHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(0.75),
    borderRadius: radius.sm,
  },
  switchHalfOn: { backgroundColor: colors.surfaceRaised },
  switchHalfPressed: { opacity: 0.7 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  switchLabelOn: { color: colors.text },
  list: { gap: spacing(1) },
});
