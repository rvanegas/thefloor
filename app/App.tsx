import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useSessionAudio } from './src/audio/useSessionAudio';
import { useKnockNudge } from './src/audio/useKnockNudge';
import { useSilencedNudge } from './src/audio/useSilencedNudge';
import { AppProvider, useApp } from './src/state/AppProvider';
import { recordEvent } from './src/audio/diagnostics';
import { liveChannelHere } from './src/state/live';
import { useAttention } from './src/state/useAttention';
import { AuthView } from './src/ui/AuthView';
import { HomeView } from './src/ui/HomeView';
import { HomeSettingsView } from './src/ui/HomeSettingsView';
import { ProfileView } from './src/ui/ProfileView';
import { SupportView } from './src/ui/SupportView';
import { LeaderboardView } from './src/ui/LeaderboardView';
import { ChannelView } from './src/ui/ChannelView';
import { UpdateRequiredView } from './src/ui/UpdateRequiredView';
import { NoDetailView, Panes } from './src/ui/Panes';
import {
  anyMicrophoneOpen,
  channelHasAudio,
  microphoneNeeded,
} from '../core/micNeeded';
import { describeChannel } from '../core/naming';
import { colors } from './src/ui/theme';
import { useLayout } from './src/ui/layout';
import { useRoute } from './src/ui/useRoute';
import { channelOf, NO_DETAIL, type Detail, type List } from './src/ui/detail';
import { takeHandover } from './src/ui/handover';
import {
  addressOf,
  detailOfAddress,
  type Address,
} from './src/ui/webRoute';

/**
 * Auth when signed out, and otherwise Home — the tier holding both lists of
 * people you can reach — with whatever you have opened beside it, or over it
 * where there is only room for one. What is open is one value rather than a
 * race down five flags; see `ui/detail.ts`.
 *
 * **A profile is among what can be open, and only ever in a split.** On a
 * phone it is not: `HomeView` and `ChannelView` each open the profiles they
 * are about and own the state for it, because routing that through here would
 * put this component in the business of knowing which screen a profile was
 * opened from so it could decide where closing one goes back to. That
 * argument is about a profile that *covers* what it was opened from. Beside a
 * list that never went away there is nothing to decide — closing empties the
 * pane — so the split is the one case it does not reach.
 *
 * **Presence is not a screen.** The audio connection is held here rather than
 * inside the channel screen, so walking back to Home leaves you in the
 * conversation — you can look up who else is around, or read a contact's
 * profile, without hanging up. The reducer has always treated presence and
 * navigation as different things; until this moved, the app was the only place
 * that conflated them, and a back button would silently have ended the call.
 *
 * What the connection follows is the channel you are *present in*, which the
 * server reports, rather than the channel whose screen happens to be mounted.
 *
 * **A wide window shows Home beside all of this rather than instead of it**,
 * and neither paragraph above changed for it. Profiles still belong to the
 * screens that open them, so the split gave this component no new reason to
 * learn where one was opened from; and the split is in what is returned rather
 * than in what is held, so presence is no more a screen than it was.
 */
function Root() {
  const app = useApp();
  const { ready, token } = app;
  /**
   * What the detail pane is showing, as **one value rather than five flags.**
   *
   * The chain this replaced resolved a channel id and four booleans in a fixed
   * order, which answers *which of several open things is on top* when the
   * question is *what did you last ask for*. See `ui/detail.ts` for the whole
   * argument and for the bug that made it worth the change; what matters here
   * is that every handler below now assigns rather than sets one flag and
   * remembers to clear the others.
   *
   * **A profile is among them, and only ever appears in a split.** The comment
   * at the top of this file refuses to route profiles through here, on the
   * grounds that it would make this component decide where closing one goes
   * back to. That argument is about a profile that *covers* the screen it was
   * opened from, and it still holds everywhere it applied: on a phone the
   * tier owns the profiles opened from its contact list, and `ChannelView`
   * owns the ones opened from its roster in either layout. A split is the case
   * the argument does not reach — the tier is the pane next door and never
   * went away, so there is no "back" to know about, and closing simply empties
   * the pane.
   */
  const [detail, setDetail] = useState<Detail>(NO_DETAIL);
  /**
   * Which of Home's two lists is in its body.
   *
   * **Not part of `detail`, because it is not what you opened — it is which
   * list you are indexing people by.** Home is the tier around both, and it is
   * the pane that never goes away: below the breakpoint it is the screen you
   * see when nothing is open, above it the column on the left. One value, read
   * the same way by both layouts.
   *
   * It was `contactsOpen`, and the rename is the change rather than a tidy-up
   * — the boolean was the asymmetry, naming one list and calling the other
   * *not that one*. See `List` in `ui/detail.ts`.
   */
  const [list, setList] = useState<List>('channels');
  const channelId = channelOf(detail);

  const me = app.me?.id ?? '';
  // Where this person is standing, on *this device*, across every snapshot
  // held rather than read off whichever one arrived last — which is what used
  // to hang the audio up when a channel nobody was looking at changed. The
  // device test, and the expiry that overrides both, are in state/live.ts:
  // this used to be spelled out here and now has a second reader in
  // ProfileView, which marks the same channel on a profile.
  const here = liveChannelHere(app.channelViews, me, app.standingIn, app.expired);
  const live = here?.channel ?? null;

  // Or asked for and not yet confirmed. The rule in `microphoneNeeded` is
  // right — a recording is something listening, so it opens the microphone —
  // but it reads server state, which arrives a round trip after the tap. That
  // round trip is when capture starts against nobody publishing, and a short
  // run ended having recorded nothing at all. See AppProvider.recordingAsked.
  const micNeeded =
    !!live && (microphoneNeeded(live, me) || app.recordingAsked === live.id);

  // What the *session* is configured from, where `micNeeded` decides only
  // whether we publish.
  //
  // **The one place the two audio-session rules are chosen between, and the
  // only place either is called.** Off — the default, and what has shipped
  // since 2026-08-18 — asks whether anybody present is capturing, so a room
  // that goes quiet hands the Bluetooth route back to full quality. On holds
  // the hands-free link for as long as this app has any audio at all, so the
  // link does not move under the first word somebody says. core/micNeeded.ts
  // carries the whole argument and says why this is a setting rather than a
  // decision.
  //
  // Same round-trip caveat as `micNeeded` above, and the same answer either
  // way: a recording asked for and not yet confirmed is audio here too.
  const hasAudio =
    !!live &&
    ((app.steadyHeadset ? channelHasAudio(live, me) : anyMicrophoneOpen(live)) ||
      app.recordingAsked === live.id);

  const audio = useSessionAudio(
    // Keyed on the audio rather than on the channel, which are no longer the
    // same thing: a conversation that moves takes its room with it, and this
    // hook tearing down and rebuilding on the new channel id would turn pure
    // bookkeeping into a dropped call for everybody in it.
    live ? live.mediaRoom : null,
    live ? live.id : null,
    token,
    !!live?.selfMuted[me],
    micNeeded,
    hasAudio,
    // **Was `app.debug`, and is `false` since the measurement came back.** The
    // automatic rebind ran three times on 2026-09-04 — twice on its own, once
    // by hand — and every one of them reached the SFU, produced a `sub -` and
    // a `sub +`, and left the track silent. Playout came back each time about
    // a second later, when the engine restarted with recording enabled, and
    // never otherwise.
    //
    // It could not have worked. Dropping the only remote subscription stops
    // the engine, and the retake restarts it — with `rec=F`, because the
    // condition this fires under is being alone with the shared-playback
    // track, so `hasAudio` is false. `rec=F` is the state that renders
    // nothing. The repair recreated the fault, which is the objection that
    // kept the detector away from `reconnect()`, and it applies here for the
    // same reason and was missed.
    //
    // Left wired rather than deleted: the call, the button and the bounds are
    // the apparatus that produced this reading, and the next hypothesis will
    // want them. Turning it back on is this argument becoming `app.debug`
    // again — but do not, until something explains why `rec=F` renders
    // nothing. See `audio/rebind.ts` and `planning/PLAYOUT.md`.
    false,
    // **The experiment this build exists for, and the thing to take back out.**
    // Produces `muted CALL` whenever anything is subscribed, so that being
    // alone with the shared-playback pump holds the microphone and starts the
    // engine `rec=T` instead of releasing it and starting `rec=F`. If the
    // fourteen-sample split in `PLAYOUT.md` is the mechanism, the track renders
    // and the correlation becomes a result; if it stays silent, the flag was a
    // coincidence and the investigation restarts.
    //
    // Note it is the *microphone* and not the category: `released CALL` is
    // already `playAndRecord` and already starts `rec=F`, so pinning the
    // session alone would have reproduced the fault under a new name.
    //
    // `app.debug` because holding the microphone lights the system indicator
    // and hands Bluetooth to HFP, and one phone answering a question must not
    // charge that to everybody. Whichever way it comes out, this argument goes
    // back to `false` and the derivation in `useSessionAudio` goes with it.
    app.debug
  );

  /**
   * Told without words that you are talking to nobody.
   *
   * Here rather than in `ChannelView` for the same reason the audio is: it
   * follows presence, and the person who most needs it is the one not looking
   * at the channel screen. See `useSilencedNudge`.
   */
  useSilencedNudge(live, me, audio.speaking);

  /**
   * Told that somebody is at the door, which is a question waiting on an
   * answer from whoever is in the room. Here rather than on the channel screen
   * for the reason above it.
   */
  useKnockNudge(live);

  /**
   * Stepped out of a channel nobody is attending, which is a browser's problem
   * and not a phone's — `state/useAttention.ts` says why the native half of
   * this is empty. Here with the two above because it reads the same standing
   * and the same active speakers they do, and because what it ends is presence
   * rather than a screen.
   */
  useAttention(live, me, audio.speaking);

  /**
   * Which screen you are on, in the audio log.
   *
   * Instrumentation only, and it is here because the log could not see the one
   * move TASKS § *Stepping Back In* is about: leaving the channel screen for
   * Home and coming back is not an `AppState` change, not a route change and
   * not a session write, so the whole reproduction happened between two log
   * lines with nothing in between. Presence is deliberately not navigation —
   * the audio hook lives above this switch precisely so that walking to Home
   * does not hang up — which is exactly what makes a navigation marker worth
   * stamping next to the engine's transitions rather than assumed from them.
   *
   * `recordEvent` is called by every build for every account and costs a
   * string in a forty-element ring; only an account with the `debug` column
   * can read it back.
   */
  useEffect(() => {
    recordEvent(channelId ? 'screen channel' : 'screen home');
  }, [channelId]);

  /**
   * Which audio-session rule is in force, in the audio log.
   *
   * Instrumentation only, and next to the marker above for the same reason:
   * the log is the one instrument that shows *ordering*, and flipping this
   * setting mid-channel is a session write with no other cause. Without a line
   * for it the log shows a configuration changing while nothing in the channel
   * changed, which is the shape of every bug this subsystem has had — so the
   * instrument would be manufacturing a false alarm out of somebody's thumb.
   *
   * **Fires on mount as well as on change**, which is deliberate and is the
   * more important half: HF-ONLY-WALK.md § *What you need* asks for every case
   * to be run twice under the two rules, and two logs that do not say which
   * rule produced them cannot be compared at all. The setting is persisted per
   * phone, so the mount line is often the only one there will be.
   *
   * `App.tsx` rather than `AppProvider`, with the other instrumentation, and
   * for the reason `core/micNeeded.ts` gives: this is the one place either
   * rule is chosen between, and a marker written anywhere else would be
   * claiming something it does not see.
   */
  useEffect(() => {
    recordEvent(`steady headset ${app.steadyHeadset ? 'on' : 'off'}`);
  }, [app.steadyHeadset]);

  /**
   * Follow a conversation that has changed channels.
   *
   * Only when this screen is on the channel it left — a move you are not
   * looking at is Home's business, and it shows the destination as a row like
   * any other. The socket has already switched what it watches, so the
   * snapshot for the new channel is on its way or already here.
   */
  const { movedChannel } = app;
  useEffect(() => {
    if (!movedChannel) return;
    setDetail((current) =>
      current.kind === 'channel' && current.channelId === movedChannel.from
        ? { kind: 'channel', channelId: movedChannel.to }
        : current
    );
  }, [movedChannel]);

  /**
   * A tap on a notification, which shows the live rooms rather than one of
   * them.
   *
   * **It named a channel and stepped you into it until 2026-09-04.** The
   * payload still carries the channel — the server has not changed — but
   * nothing reads it: a notification is not an instruction about which
   * conversation you meant, and there may well be more than one room with
   * somebody in it by the time a phone is picked up. So the tap brings the
   * Channels tab up with nothing open, where the Live section is the first
   * thing on it, and the choice is made by the person who was interrupted.
   *
   * That also took the last id out of the app that did not come from a list or
   * a handover. See decisions/DECISIONS.md § *An address names a place and
   * never an id*.
   *
   * Deferred until signed in and ready rather than acted on where it arrives:
   * a tap that launched the app is read while the stored token is still being
   * restored, and acting then would be undone by the effect below.
   */
  const { notificationTapped, clearNotificationTap } = app;
  useEffect(() => {
    if (!notificationTapped || !ready || !token) return;
    // Whatever was open closes, because this is an assignment: a tap means
    // come and look, and coming back to a settings screen somebody had left
    // open would be a surprise.
    setDetail(NO_DETAIL);
    setList('channels');
    clearNotificationTap();
  }, [notificationTapped, ready, token, clearNotificationTap]);

  /**
   * Signing out closes every screen stacked over Home.
   *
   * **This component does not unmount when the session ends.** A null `token`
   * changes what `Root` renders, not whether it exists, so without this each of
   * these outlives the account that opened it. Signing out is only reachable
   * from the settings screen, which made the settings case certain rather than
   * occasional: sign out, sign in, and you were looking at Settings again,
   * holding the previous session's `settingsOpen`.
   *
   * A channel is the one worth closing on its own account. Signing out inside
   * a channel and back in as somebody else left this rendering `ChannelView`
   * for a channel the new account may not be a member of — the server refuses
   * the snapshot, so it is a confused screen rather than a leak, but it is the
   * same staleness and it has no business surviving.
   *
   * Keyed on the token being gone rather than on it changing, because a
   * sign-in always passes through null within a session, while a token
   * refreshed for the same account should disturb nothing.
   */
  useEffect(() => {
    if (token) return;
    setDetail(NO_DETAIL);
    setList('channels');
  }, [token]);

  /**
   * A channel handed over by the document this tab was on a moment ago.
   *
   * One caller: a guest who has just accepted a contact request, been made a
   * member, and been sent from the guest page into the app. **It travels in
   * `sessionStorage` rather than in the address**, because no address in this
   * app names a channel — see `ui/handover.ts`, and `webRoute.ts` for why.
   *
   * Deferred until signed in and ready for the reason the notification tap
   * above is: the effect above clears every screen while there is no token and
   * cannot tell a sign-out from a session still being read out of storage.
   *
   * **Taken rather than read**, which is what makes re-running this harmless:
   * `app` changes identity often, so the effect fires more than once, and the
   * record is gone after the first.
   *
   * `watchChannel` first, because arriving this way skips every path that
   * would otherwise have subscribed — then `ENTER` if the walk meant to
   * arrive, so the action lands on a snapshot the app is subscribed to.
   */
  const { watchChannel } = app;
  useEffect(() => {
    if (!ready || !token) return;
    const handover = takeHandover();
    if (!handover) return;
    watchChannel(handover.channelId);
    if (handover.enter) app.act(handover.channelId, { type: 'ENTER' });
    setDetail({ kind: 'channel', channelId: handover.channelId });
    setList('channels');
  }, [ready, token, watchChannel, app]);

  /**
   * The address bar, which on a phone does not exist and in a browser *is* the
   * navigation.
   *
   * A no-op on native — `useRoute.ts` is the sibling that does nothing — so
   * this is called unconditionally rather than behind a platform test, a hook
   * that ran on one platform and not the other being a conditional hook.
   *
   * Gated on `ready && token`: the effect above clears every screen while
   * there is no token, and cannot tell a sign-out from a session still being
   * read out of storage. Applying an address before then is watching it be
   * wiped. See `useRoute.web.ts`.
   */
  const applyAddress = React.useCallback((next: Address) => {
    // An assignment, and one that always succeeds: every address restores, so
    // there is nothing here to normalise or refuse. **No address names a
    // channel**, so nothing here watches one — an arrival at a conversation is
    // a tap on a list or a `takeHandover` above, both of which subscribe on
    // their own account.
    const arriving = detailOfAddress(next);
    setDetail(arriving.detail);
    setList(arriving.list);
  }, []);

  useRoute(addressOf(detail, list), applyAddress, ready && !!token);

  /**
   * Whether there is room for the list and a screen at once.
   *
   * **Read here, with the hooks, and consulted by none of them.** A hook has to
   * be called before the early returns below, but nothing above this line has
   * any business knowing how wide the window is: the audio, the two nudges and
   * the route table are about presence and a session. The split happens
   * strictly in what is returned — which is what keeps the promise at the top
   * of this file, that walking to Home does not hang up. Nor does dragging the
   * window narrower.
   */
  const layout = useLayout();
  const split = layout === 'split';

  /**
   * Below the server's floor, and therefore not an app any more.
   *
   * Ahead of `ready` and of the token, because both of those are about a
   * session this build should not be starting: the restore that `ready` waits
   * for ends in a request whose answer this build may no longer read
   * correctly. The hooks above still run — they must, unconditionally — but
   * every one of them is inert with no socket and no live channel.
   */
  if (app.expired) return <UpdateRequiredView />;

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  if (!token) return <AuthView />;

  /** Nothing open, which is the way out of everything the pane can hold. */
  const close = () => setDetail(NO_DETAIL);
  /** A conversation, whatever was open before it. */
  const enterChannel = (id: string) =>
    setDetail({ kind: 'channel', channelId: id });

  /**
   * The screen you are looking at, or nothing.
   *
   * **One `switch` over one value, where this was an ordered chain.** The
   * order used to be the model, and `webRoute.ts` § `screenOf` still states it
   * for the address bar because a URL is read rather than assigned. Here there
   * is nothing left to order: the pane shows what was last asked for. See
   * `ui/detail.ts`.
   *
   * Home is not among the cases. Home is the pane beside this one, and below
   * the breakpoint it is what an empty answer here falls back to.
   */
  const renderDetail = (): React.ReactNode => {
    switch (detail.kind) {
      /*
        Only ever opened from the contact list in a split — see `list` — but
        rendered without asking which layout is in force, because a window
        dragged narrow while one is open should show it rather than blank the
        screen. Closing it then falls back to the contact list, which is
        exactly where it was opened from.
      */
      case 'profile':
        return (
          <ProfileView
            accountId={detail.id}
            // From `app.me` for your own, so a name changed on the profile
            // itself is not stale the moment it is written. The same read
            // `ContactsView` makes when it owns this screen.
            fallbackName={
              detail.id === app.me?.id ? app.me.displayName : detail.name
            }
            onBack={close}
            onEnterChannel={enterChannel}
            // Removing a contact takes the row this was opened from with it,
            // so there is nothing to go back to — and the list beside it has
            // already lost the row.
            onRemoved={close}
          />
        );

      case 'channel':
        return (
          <ChannelView
            channelId={detail.channelId}
            audio={audio}
            // Off this screen without leaving the channel. Deliberately not
            // `leaveChannelView`: that unwatches, and the snapshot it drops is
            // what tells this component you are still present.
            //
            // **One way out with one word, and unconditional since
            // 2026-09-01.** It used to be two — Home on a phone, which also
            // put the channel list back in the pane behind, and Close in a
            // split, withheld while you were present here because closing into
            // a contact list that could not show a live room would have left
            // somebody in a call with nothing on screen saying so. Home is the
            // tier now and carries the live bar above whichever list it is
            // showing, so there is nothing left to withhold and nothing to put
            // back: closing leaves the tier exactly as it was.
            onClose={close}
            onExit={close}
            // A profile opened from the roster lists the channels you and that
            // person share, and tapping one goes there — the same tap the same
            // cards take from the contact list. Presence is not a screen, so
            // this changes which conversation you are looking at and not
            // whether you are still in the one you left.
            onEnterChannel={enterChannel}
          />
        );

      // Reached from Home rather than from a channel, because what is in here
      // is about you rather than about whichever conversation you are in.
      case 'settings':
        return <HomeSettingsView onBack={close} />;

      // Reached from Home and from nowhere else, and offered only to an
      // account that has been granted it by hand. `app.leaderboard` comes from
      // `hello`, so revoking the column closes the way in at the next
      // connection.
      case 'standings':
        return <LeaderboardView onBack={close} />;

      case 'support':
        return <SupportView onBack={close} />;

      case 'none':
        return null;
    }
  };

  /**
   * The pane that never goes away, which is Home — the tier, holding whichever
   * of its two lists you are indexing people by.
   *
   * **Home is not a list any more, and that is the change.** Both of its lists
   * are lists of people you can reach — one by the conversations you have with
   * them, one by name — so they are two indexes onto the same thing, and the
   * frame that contains them is what carries the room you are standing in, the
   * way to the settings, and Chip in. This component chooses none of that: it
   * hands `list` down and takes it back, which is the whole of its part in the
   * switch. Everything else in this application is something you *opened*, and
   * opened things go in the pane on the right.
   *
   * It reads the same way in both layouts. Below the breakpoint there is one
   * pane, so the tier simply *is* what you see with nothing open; above it, it
   * is the column on the left. One state, one rendering, and no layout test.
   *
   * It is also what keeps the address honest without `webRoute.ts` changing:
   * with a channel open `screenOf` already prefers it, so a contact list
   * beside a conversation is still that conversation's address, and a contact
   * list with nothing open is `/contacts`, which is exactly what is showing.
   */
  const listPane = (
    <HomeView
      list={list}
      onList={setList}
      onEnterChannel={enterChannel}
      onOpenSettings={() => setDetail({ kind: 'settings' })}
      onOpenSupport={() => setDetail({ kind: 'support' })}
      onOpenLeaderboard={
        app.leaderboard ? () => setDetail({ kind: 'standings' }) : undefined
      }
      // Into the pane next door rather than over the tier — and only where
      // there is a pane next door. On a phone the tier owns its profile, which
      // is the case this file's opening argument is about; see the prop's own
      // comment in `HomeView`.
      onOpenProfile={
        split
          ? (contact) => setDetail({ kind: 'profile', ...contact })
          : undefined
      }
      // What the tier needs to show that a conversation is still going without
      // you looking at it. An open microphone behind a screen that gives no
      // sign of it is the one thing this could plausibly make worse — and the
      // reason the bar belongs to the tier rather than to either list is that
      // switching lists used to take it off the screen.
      //
      // **Not when that conversation is the pane next to this one.** The bar
      // says you are somewhere else and offers to take you back, and both
      // halves of that are false when the channel is on screen a hairline
      // away. It returns the moment the other pane is showing anything else,
      // which is when the sentence becomes true again.
      liveChannel={
        live && !(layout === 'split' && channelId === live.id)
          ? {
              channelId: live.id,
              title: titleOf(live.name, here!.participants, me),
              present: live.present.length,
              muted: !!live.selfMuted[me],
            }
          : null
      }
      // And the list leaves it out whether or not the bar is drawn, which is
      // why this is passed separately rather than read off `liveChannel`. The
      // argument that takes the bar away in a split takes the row away too: a
      // LIVE row is a way to open a channel, and the channel is already open
      // in the pane beside it. Suppressing one and not the other left the
      // conversation on screen twice, hoisted under a heading that offered to
      // take you where you were.
      liveChannelId={live?.id ?? null}
      onReturnToChannel={enterChannel}
    />
  );

  const showing = renderDetail();

  /**
   * Below the breakpoint this is the element tree that has always shipped —
   * `showing ?? listPane` reproduces the early-return order exactly — wrapped in
   * the one View that holds the detail subtree at a fixed depth so a resize
   * does not remount it. See `Panes`.
   */
  return (
    <Panes
      layout={layout}
      list={listPane}
      detail={showing ?? (layout === 'split' ? <NoDetailView /> : listPane)}
    />
  );
}

/**
 * What to call a channel on screen: its name if it has one, otherwise the
 * roster.
 *
 * Shares `describeChannel` with every other surface, which it did not when it
 * was written out longhand here — this was a fourth copy of the fallback, and
 * it still said "3 people" after the others had stopped.
 */
function titleOf(
  name: string | null,
  participants: Array<{ id: string; displayName: string }>,
  me: string
): string {
  if (name) return name;
  return describeChannel(
    participants.filter((p) => p.id !== me).map((p) => p.displayName)
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        <AppProvider>
          <Root />
        </AppProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
