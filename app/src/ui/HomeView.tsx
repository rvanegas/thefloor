import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button, Card, IconButton, Screen, SectionLabel } from './components';
import { SettingsIcon } from './icons';
import { ChannelsView } from './ChannelsView';
import { ContactsView } from './ContactsView';
import { ProfileView } from './ProfileView';
import type { List } from './detail';
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
  onOpenSupport = () => {},
  onOpenLeaderboard,
  onOpenProfile,
  liveChannel = null,
  onReturnToChannel = () => {},
}: {
  /** Which of the two lists is in the body. See `List` in `ui/detail.ts`. */
  list: List;
  onList: (list: List) => void;
  onEnterChannel: (channelId: string) => void;
  onOpenSettings: () => void;
  /** Opens the screen that explains donating, and carries the link out. */
  onOpenSupport?: () => void;
  /**
   * Opens the invitation standings. Absent unless this account has been
   * granted them, in which case nothing here says they exist at all — the
   * row is the whole of how anybody learns the screen does.
   */
  onOpenLeaderboard?: () => void;
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
  onOpenProfile?: (contact: { id: string; name: string }) => void;
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

  /**
   * A profile, when there is no pane to put it in. Held here rather than in
   * `ContactsView` because that is a body now and cannot cover anything; see
   * `onOpenProfile`.
   */
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(
    null
  );
  /** Upward when there is a pane to open it in, here when there is not. */
  const openProfile =
    onOpenProfile ??
    ((contact: { id: string; name: string }) => setProfile(contact));

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

        <ListSwitch list={list} onList={onList} />
      </View>
    </View>
  );

  return (
    <Screen header={header} contentStyle={styles.container}>
      {list === 'channels' ? (
        <ChannelsView
          onEnterChannel={onEnterChannel}
          // The bar above and a row down here are two renderings of one
          // channel, so exactly one of them appears.
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
