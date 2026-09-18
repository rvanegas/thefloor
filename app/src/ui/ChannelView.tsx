import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import {
  cooldownRemainingMs,
  floorRemainingMs,
  isSilenced,
} from '../../../core/floor';
import { playbackPositionMs } from '../../../core/playback';
import {
  initialWatchState,
  parseYouTubeUrl,
  watchPositionMs,
} from '../../../core/watch';
import { isRecordingActive, recordedMs } from '../../../core/recording';
import {
  ATTENTION_REPORT_MS,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_PARTICIPANTS,
  MAX_CLIP_LENGTH,
} from '../../../core/constants';
import {
  canClaimFloor,
  idleMs,
  isWaiting,
  nearbyMs,
  canInvite,
  canControlPlayback,
  canPauseRecording,
  canResumeRecording,
  canMuteOther,
  canSetSelfMute,
  mutableAt,
  canStartRecording,
  canLoadTrack,
  canStartWatch,
  canControlWatch,
  isPartyMuted,
  isWithheld,
  partyMuteRequested,
  canStopRecording,
  canPasteClip,
  canClearClip,
  canInviteGuest,
  canAskGuestJoin,
  canManageGuest,
  canEditChannel,
  hasTheRoom,
  isPresent,
  canPing,
} from '../../../core/channel';
import { inRoom } from '../../../core/guests';
import type { Guest } from '../../../core/types';
import type { ScreenDevice } from '../../../core/protocol';
import type { SessionAudio } from '../audio/useSessionAudio';
import { shareTrack } from '../api/download';
import { pickAndUploadTrack } from '../api/upload';
import { copyText, pasteText } from '../clipboard';
import { canShare, shareLink } from '../share';
import { useApp } from '../state/AppProvider';
import { liveChannelView } from '../state/live';
import { AudioDebugPanel } from './AudioDebugPanel';
import { ChannelSettingsView } from './ChannelSettingsView';
import { TranscriptView } from './TranscriptView';
import { ProfileView } from './ProfileView';
import { isSafeUrl, openUrl } from './links';
import {
  BellIcon,
  FloorIcon,
  HomeIcon,
  InviteIcon,
  MembersIcon,
  MicIcon,
  NotepadIcon,
  PauseIcon,
  PlayerIcon,
  RecordingsIcon,
  SettingsIcon,
  StepIcon,
  StopIcon,
  WatchIcon,
} from './icons';
import { WatchPlayer } from '../watch/WatchPlayer';
import {
  Button,
  Card,
  Empty,
  Field,
  IconButton,
  RecordingRow,
  TranscriptSearch,
  Reveal,
  Screen,
  SectionLabel,
  Segmented,
} from './components';
import { ago, duration } from './relativeTime';
import {
  colors,
  formatDuration,
  formatSeconds,
  measure,
  radius,
  spacing,
  type,
} from './theme';
import { louder, quieter } from './volume';
import { describeChannel } from '../../../core/naming';
import { useOfflineNotice } from './useOfflineNotice';
import { useCohortNotice } from './cohortNotice';

/** How far the skip buttons move, there being no scrubber to drag. */
const SKIP_MS = 15_000;

/**
 * The tabs of the channel screen, in the order they are drawn.
 *
 * **Who, then what, since 2026-09-12.** The first three are the people —
 * who is here, what they have written down, and how somebody who is not here
 * gets in — and the last three are what the channel is carrying: the track,
 * the recordings, the video. The order before this one ran the four carried
 * things together and put the ways in at the end, on the grounds that
 * inviting somebody is the rarest thing done here; rarity is a reason to keep
 * a tab off the one you land on and not a reason to file it away from the
 * subject it belongs to.
 *
 * It also puts the conditional tab last, which the earlier order did not.
 * `watch` is the one that is not always there — see `tabs` below — and a set
 * that loses its final entry leaves every other tab exactly where it was.
 */
export type ChannelTab =
  | 'members'
  | 'notepad'
  | 'invites'
  | 'player'
  | 'recordings'
  | 'watch';

/**
 * What the upload button says while it is uploading.
 *
 * The percentage is the whole of the progress indicator on purpose — a bar
 * would say the same thing less precisely, and the thing somebody staring at a
 * stuck upload wants is a number that is or is not changing. When the platform
 * will not say how big the body is there is no number, and the button says
 * only that something is happening.
 */
export function uploadingLabel(percent: number | null): string {
  return percent === null ? 'Uploading…' : `Uploading… ${percent}%`;
}

/**
 * The in-channel screen. Control states come from the same guards the server
 * enforces, so a greyed-out button and a refused action cannot disagree — but
 * the server is the authority and this only renders what it has been told.
 */
export function ChannelView({
  channelId,
  audio,
  tab: asked,
  onClose,
  onExit,
  onEnterChannel,
}: {
  channelId: string;
  /**
   * Held above this screen, because the connection outlives it: walking back
   * to the tier must not hang up. See App.tsx.
   */
  audio: SessionAudio;
  /**
   * Off this screen, still present, still connected — one way out with one
   * word, in both layouts.
   *
   * **It was two, until 2026-09-01.** A phone had *Home*, which revealed the
   * screen underneath, and the detail pane had *Close*, which emptied it — and
   * `Close` was withheld while you were present here, because closing into a
   * contact list that could not show a live room would have left somebody in a
   * call with nothing on screen saying so. Both of those went with the tier:
   * the list this closes into now carries the live bar above it whichever list
   * it is showing, so there is nothing to withhold, and one control is honest
   * about both — it reveals the tier on a phone and empties the pane in a
   * split.
   *
   * **And since 2026-09-12 it says which one**: a house rather than the cross
   * every other header draws, labelled *Home*. What the two layouts have in
   * common is not that the pane empties, it is that Home is what you are
   * looking at afterwards — so the destination is the honest thing to name
   * here, and it is nameable only because the tier made it one thing. See
   * GLOSSARY.md § *Close*.
   */
  onClose: () => void;
  /** Off this screen having given up presence or membership. */
  onExit: () => void;
  /**
   * To another channel entirely, which this screen offers in exactly one
   * place: the "Channels with them" cards on a profile opened from the roster.
   *
   * It used to offer it nowhere, on the reading that walking out of the
   * conversation you are in to go to another is not something an in-channel
   * screen should suggest. What that got wrong is that the cards were still
   * drawn — the section is worth reading either way — so the same list was
   * pressable from Contacts and inert here, and a card that says three people
   * are in a room and does nothing when tapped is not restraint, it is a dead
   * control. Presence is not a screen: going there does not hang anything up,
   * and the channel you leave behind is a tap away on the tier. See
   * App.tsx.
   *
   * Optional so this screen still renders where there is nowhere to route to,
   * the same way `ProfileView`'s own is.
   */
  onEnterChannel?: (channelId: string) => void;
  /**
   * The tab to land on, when whoever opened this screen had one in mind.
   *
   * **Undefined is the ordinary case and means the roster**, which is what
   * `tab` below says this screen is for. The one caller that names one is the
   * introduction checklist on Home — a rung about the guest link or the
   * player is about a tab, and sending somebody to the roster to hunt for it
   * reproduces the failure the rung exists to fix. See `ui/Introduction.tsx`.
   *
   * It is a request rather than a setting: this screen owns which tab is
   * showing from the moment it is drawn, and a tap on the bar overrides
   * whatever was asked for and is never undone by a rerender.
   */
  tab?: ChannelTab;
}) {
  const app = useApp();
  // This channel's snapshot, and nothing else's. Picked out by id rather than
  // taken from a single slot, so a snapshot arriving for another watched
  // channel cannot empty this screen — which it did, and which also hung up
  // the audio. See AppProvider.
  const view = app.channelViews[channelId] ?? null;
  const channel = view?.channel ?? null;
  // `?? []` is load-bearing rather than defensive. A server that predates this
  // field sends a snapshot without it, which is exactly what this build meets
  // between its release and the deploy that follows — the field is additive,
  // so the old server keeps working, and reading `.length` off nothing is the
  // one way that could still crash the screen.
  const recordings = view?.recordings ?? [];
  const me = app.me?.id ?? '';
  /**
   * Whether to offer a ping for somebody, which is two questions rather than
   * one — and they are stated together here so the two surfaces that ask
   * cannot drift apart.
   *
   * `canPing` is the reachability half: not yourself, and not somebody who can
   * hear you — and, since 2026-09-14, your own standing at this channel, since
   * a ping comes from the room or from beside it. A reader who has stepped out
   * gets no ping button anywhere on this screen, which is why that rung lives
   * in `core/` alongside the rest rather than being drawn here.
   *
   * The contact list is the authorization half, and it is not in
   * `core/` because `ChannelState` has no idea who knows whom — a channel
   * holds people a mutual friend brought in, and being in the room together is
   * not permission to put a notification on somebody's lock screen. The server
   * checks both, so a screen that has gone stale is refused rather than
   * silently sending.
   *
   * `?? []` **fails closed**, deliberately: no home means no ping button,
   * which is the safe direction and the same reading `InviteList` makes below.
   * Home arrives before any screen that can reach this one and is re-pushed on
   * every contact change, so the case is a moment at boot rather than a state
   * anybody sits in.
   */
  const mayPing = (targetId: string) =>
    !!channel &&
    canPing(channel, me, targetId) &&
    (app.home?.contacts ?? []).some(
      (entry) => entry.account.id === targetId && entry.status === 'accepted'
    );
  // One piece of state rather than three, because they are one thing: an
  // upload in flight, what it has managed so far, and how to stop it. `null`
  // is not uploading; a `cancel` of `null` is the moment between the picker
  // closing and the bytes moving, when there is nothing to stop yet.
  const [upload, setUpload] = useState<{
    percent: number | null;
    cancel: (() => void) | null;
  } | null>(null);
  const uploading = upload !== null;
  const [uploadError, setUploadError] = useState<string | null>(null);
  /**
   * A copy of the track being fetched, which is a wait and not an upload.
   *
   * Its own flag rather than a fourth field on `upload`: the two can run at
   * once — somebody may take a copy of what is on while replacing it — and
   * sharing has no progress and nothing to cancel, since the file is already
   * on the server and is at most the two hundred megabytes the upload allowed.
   */
  const [trackSharing, setTrackSharing] = useState(false);
  // What the clipboard section is saying about itself, if anything. Refusals
  // this screen makes on its own — an empty device clipboard, text past the
  // cap — because a paste travels as a socket action and a socket refusal is
  // rendered nowhere in a channel.
  const [clipError, setClipError] = useState<string | null>(null);
  // Whether the last copy landed, and nothing else. Same three states and the
  // same 2.5s fade as AudioDebugPanel, that being the established way a
  // clipboard refusal is reported: `copyText` returns a boolean precisely so
  // that a copy which did not happen is not announced as one.
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * Which recording's transcript is open, by id rather than by row.
   *
   * By id so the screen follows the snapshot: a transcript that lands while it
   * is open moves from "being transcribed" to the text without anybody tapping
   * anything, and a recording deleted underneath closes the screen rather than
   * leaving it showing a conversation that no longer exists.
   */
  const [transcriptFor, setTranscriptFor] = useState<string | null>(null);

  /**
   * **The notepad's draft**, which is the one editable thing on this screen
   * that is not a control on the room.
   *
   * It is local state rather than `channel.description` read straight, because
   * a `Field` bound to the snapshot loses a keystroke every time one arrives —
   * and on a tab, unlike on the settings screen this moved off, snapshots
   * arrive continuously while somebody is typing.
   *
   * `saved` is what the channel is known to hold, so leaving the field alone
   * dispatches nothing and a remote edit can be told from an unsaved local
   * one. Declared with the other state and above every early return, for the
   * reason `act` gives below.
   */
  const [notepad, setNotepad] = useState(channel?.description ?? '');
  const notepadSaved = useRef(channel?.description ?? '');
  const notepadHeld = channel?.description ?? '';
  /**
   * Adopts what the channel now says — somebody else wrote on it, or the first
   * snapshot has only just landed — **unless there is an unsaved edit in the
   * field**, in which case the person typing keeps what they typed and writes
   * it on blur. `saved` moves either way: it records what the channel holds,
   * which is what makes the next comparison honest.
   */
  useEffect(() => {
    setNotepad((draft) =>
      draft === notepadSaved.current ? notepadHeld : draft
    );
    notepadSaved.current = notepadHeld;
  }, [notepadHeld]);
  /**
   * **Whether the notepad is open to write on**, which since 2026-09-13 it is
   * not by default. The field used to be the notepad: whoever had the room saw
   * a box of text where everybody else saw the words. A sheet of paper is read
   * more often than it is written on, so the card shows the text and a small
   * *Edit* beside it, and the box appears where the text was when that is
   * pressed.
   *
   * Local and unremembered, like `tab`: arriving at the notepad is arriving to
   * read it.
   */
  const [notepadEditing, setNotepadEditing] = useState(false);

  /**
   * Sends an action to this channel.
   *
   * **Declared above every early return, deliberately.** This screen returns
   * early half a dozen times — the profile, the settings, an ended channel —
   * and those branches hand callbacks to the screens they render. A `const`
   * declared after the return they take is never initialised, so the closure
   * over it throws a `ReferenceError` the moment it is called rather than
   * when it is made: that is how "Mute them" on ProfileView crashed the app
   * in build 160 while every test that rendered the card passed.
   */
  const act = (action: Parameters<typeof app.act>[1]) =>
    app.act(channelId, action);
  /**
   * Whether the notepad is yours to write on — `canEditChannel`, the same
   * question the channel's name asks, so either you are in the channel or
   * nobody is. What it protects against is a member who is somewhere else
   * rewriting what a conversation in progress says it is for.
   */
  const mayWriteNotepad = !!channel && canEditChannel(channel, me);
  /**
   * Writes the notepad, if it has actually changed. Guarded as well as
   * disabled: the reducer refuses this silently, so a stale `saved` ref must
   * not record an edit that never landed.
   */
  /**
   * The words on the sheet, which is the draft when it is yours to write on
   * and what the channel holds when it is not. The two are the same thing
   * almost always — the draft is adopted from every snapshot there is nothing
   * unsaved to lose to — but somebody who steps out mid-sentence keeps a draft
   * that can no longer be written, and showing them that as the channel's
   * notepad would be showing them text nobody else has.
   */
  const notepadShown = mayWriteNotepad ? notepad : (channel?.description ?? '');
  const persistNotepad = () => {
    if (!mayWriteNotepad) return;
    if (notepad === notepadSaved.current) return;
    notepadSaved.current = notepad;
    act({ type: 'SET_DESCRIPTION', description: notepad });
  };
  /**
   * Which of the tabs at the top of this screen is showing.
   *
   * **Six of them, since 2026-09-12; two before that.** The pair was the
   * roster and the ways somebody else gets in, and everything the channel was
   * carrying — the clipboard, the track, the recording controls, what has been
   * recorded, the watch party — ran on below the roster under a *What the
   * channel is carrying* heading. That heading was the admission: five
   * sections that are not about the people in the room, stacked under the one
   * that is, on the longest screen in the application. Somebody wanting the
   * recordings scrolled past the floor, the microphone, the departure, the
   * clipboard, the film and the player to reach them.
   *
   * They are peers in the way Channels and Contacts are on Home — none is a
   * child of another — so they are a switch rather than six sections, and the
   * screen spends the room once instead of six times.
   *
   * **What stayed on the roster is what is true of the conversation right
   * now**: who is here, who may speak, whether you can be heard, whether you
   * are in it at all. What moved off it outlives the moment. That is the same
   * seam the heading drew; the tabs draw it with the scroll rather than with a
   * word.
   *
   * Local and unremembered: a channel screen opened is a channel somebody is
   * about to stand in, and the roster is what that person came for. Everything
   * else is deliberate and worth one tap.
   */
  const [tab, setTab] = useState<ChannelTab>(asked ?? 'members');
  /**
   * Whether this channel still owes its occupant an explanation. Null channel
   * id while the view is loading, which reads as "nothing to draw" — see
   * `useCohortNotice`.
   */
  const cohortNotice = useCohortNotice(view?.cohort ? channelId : null);
  /**
   * Follows a caller that names a tab while this screen is already up.
   *
   * The state above is seeded once, which is the whole of it on a phone: the
   * screen is mounted by the tap that asked for the tab. In a split it is not
   * — the channel can already be open beside the checklist that names one —
   * and without this the tap would move nothing at all.
   *
   * It runs on the value changing, so a tab chosen on the bar afterwards
   * stands until something asks for a different one.
   */
  useEffect(() => {
    if (asked) setTab(asked);
  }, [asked]);

  /**
   * **The notepad is written when the field goes away, not only when it is
   * blurred**, which is the half the settings screen got for free: *Close*
   * called `persist` on the way out, and there is no Close on a tab.
   *
   * Three ways the field can leave with an edit still in it — the tab
   * changes, Settings opens over it, or the whole screen goes — and only the
   * third actually loses anything, the draft living on this component rather
   * than in the `TextInput`. The first two are about promptness: a notepad
   * nobody else can see until the author happens to tap the box again is one
   * that reads as not having saved.
   *
   * A ref because `persistNotepad` is rebuilt every render, and an effect
   * depending on it directly would run on every one of them.
   */
  const persistNotepadRef = useRef(persistNotepad);
  persistNotepadRef.current = persistNotepad;
  useEffect(() => {
    if (tab !== 'notepad' || settingsOpen) {
      persistNotepadRef.current();
      // And the card goes back to being a sheet, so returning to the tab is
      // arriving to read rather than landing in a box with a keyboard up.
      setNotepadEditing(false);
    }
  }, [tab, settingsOpen]);
  // Unmount, which is the one that would otherwise drop the edit: closing the
  // channel, the channel ending, or the app tearing the screen down. Fire and
  // forget, like every other act — there is nothing to await and nobody left
  // to tell if there were.
  useEffect(() => () => persistNotepadRef.current(), []);
  /** While a guest link is being minted, which is a round trip. */
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  /** Where a link went when there was no share sheet to hand it to. */
  const [shareNote, setShareNote] = useState<string | null>(null);
  /**
   * The link somebody is typing into the watch card, before it is anything.
   *
   * Local rather than in the channel: a half-typed URL is not something the
   * other people in the room should be watching arrive character by character,
   * and the party begins when Start is pressed.
   */
  const [watchUrl, setWatchUrl] = useState('');
  /** While a follower link is being minted, which is a round trip. */
  const [linking, setLinking] = useState(false);
  /**
   * Whether the field for swapping the video is open over a loaded party.
   *
   * Local and transient, like `watchUrl` itself: somebody halfway through
   * pasting a link has not changed what the channel is watching, and the other
   * people in it have no business seeing the field appear on their screens.
   */
  const [changing, setChanging] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [watchNote, setWatchNote] = useState<string | null>(null);
  /**
   * Which of the watch card's two copy buttons last landed, and whether it did.
   *
   * One piece of state for two buttons rather than two, because only one of
   * them can have been pressed most recently and a shape that allowed both to
   * read "copied" at once would be describing something that cannot happen.
   * `ok` is carried rather than assumed — `copyText` returns whether it landed
   * precisely so a refusal is not announced as a success.
   */
  /**
   * Whether somebody is part-way through choosing where to watch.
   *
   * Local and transient: the list of devices is asked for at the moment the
   * button is tapped, and an answer that arrived later than the person's
   * attention is one they will ask for again.
   */
  const [choosing, setChoosing] = useState(false);
  const [watchCopied, setWatchCopied] = useState<{
    which: 'video' | 'screen';
    ok: boolean;
  } | null>(null);
  const [viewing, setViewing] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  // Before the early return below, which is where the rules of hooks want it.
  const showOffline = useOfflineNotice(app.status);

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2_500);
    return () => clearTimeout(timer);
  }, [copied]);

  // The same 2.5s the clipboard card uses, for the same reason: long enough to
  // read, short enough that a second copy is not mistaken for the first one's
  // acknowledgement.
  useEffect(() => {
    if (!watchCopied) return;
    const timer = setTimeout(() => setWatchCopied(null), 2_500);
    return () => clearTimeout(timer);
  }, [watchCopied]);

  useEffect(() => {
    app.watchChannel(channelId);
    // Deliberately not unwatching on unmount: leaving this screen is a separate
    // decision from leaving the channel, and conflating them would silently
    // drop the user out of a live conversation.
  }, [channelId]);

  /*
    **The screen's three effects, held up here above every early return.**

    This component returns early four times — an ended channel, a profile, the
    settings screen, a transcript — so a hook written down beside the watch
    card it belongs to is a hook that runs on some renders and not others,
    which React ends as "rendered fewer hooks than expected". The values they
    need are read off the channel directly rather than from the derived
    constants further down, for the same reason.
  */
  // Optional throughout, because this block sits above the guard that waits
  // for a first snapshot as well as above the four early returns — see the
  // comment above. A channel nobody has been sent yet has no party, nobody in
  // it and no screens, which is what these answer.
  const partyLoaded = !!channel?.watch?.party;
  const screenIsHere = app.screenFor === channelId && partyLoaded;
  const screenIsMine =
    screenIsHere &&
    !!channel &&
    isPresent(channel, me) &&
    app.standingIn === channelId;
  const screenSaid = (channel?.watchingHere ?? []).includes(me);

  /**
   * Tells the room when this device is both the screen and the voice.
   *
   * Reconciled rather than fired on a tap, so that a reconnection, a step-out
   * and a party ending all converge on the truth without any of them having to
   * remember to. The reducer ignores a report that says what it already holds,
   * so this settles in one round trip and then says nothing.
   */
  useEffect(() => {
    if (!partyLoaded || screenIsMine === screenSaid) return;
    app.act(channelId, { type: 'WATCH_HERE', watching: screenIsMine });
  }, [app, channelId, partyLoaded, screenIsMine, screenSaid]);

  /**
   * Stops being a screen when there is nothing to show.
   *
   * A party ending, or being replaced, leaves this device holding a role for a
   * film nobody is watching — and the picker would go on offering it as busy.
   * Cleared here rather than by the reducer: this is connection state, and
   * nobody's business but this device's.
   */
  useEffect(() => {
    if (partyLoaded || app.screenFor !== channelId) return;
    app.showScreenFor(null);
  }, [app, channelId, partyLoaded]);

  /**
   * A film playing on this screen is somebody being here.
   *
   * **Otherwise watching a film is how you get stepped out of the room you are
   * watching it in.** A browser's attention clock counts a hand on the page —
   * a click, a key, a scroll — and a person watching a video produces none of
   * those for two hours; a cross-origin YouTube iframe swallows its own clicks
   * besides, so even the ones they do make never reach this document. Fifteen
   * minutes in, `useAttention.web.ts` would step them out of the channel the
   * party is running in.
   *
   * **Evidence, rather than an exemption**, which is the distinction the
   * attention design turns on. An abandoned tab is the ghost that clock is
   * hunting; a tab showing a film somebody deliberately started, which stops
   * itself at the end and which the transport can pause from anywhere, is not
   * that. It is the same reasoning by which somebody else being audible counts
   * and your own microphone does not.
   *
   * Reported rather than decided — the server holds the clock — and rate
   * limited by `shouldReport`, so this costs one message per
   * `ATTENTION_REPORT_MS` however often it runs. Harmless on a phone, which
   * has no such clock: being frontmost already speaks for somebody who is only
   * watching.
   *
   * It does **not** cover the other half of `tasks/keep-alive-during-watch-party.md`
   * — a browser in the room while the film plays on another device has no
   * hand on it either, and nothing here is evidence about that tab.
   */
  useEffect(() => {
    if (!screenIsHere || channel?.watch?.status !== 'playing') return;
    const tell = () => app.reportAttentive();
    tell();
    const timer = setInterval(tell, ATTENTION_REPORT_MS);
    return () => clearInterval(timer);
  }, [app, screenIsHere, channel?.watch?.status]);

  /**
   * Resolves a tap on *Watch on another device* when there is nothing to
   * choose between.
   *
   * One other instance is not a choice, so it is not offered as one: the film
   * goes there and the card says which. Two or more draws the list; none draws
   * the banner, which is the case this cannot solve for somebody.
   */
  const myScreens = app.screens.filter((screen) => !screen.self);
  useEffect(() => {
    if (!choosing || myScreens.length !== 1) return;
    app.useScreen(channelId, myScreens[0].device);
    setChoosing(false);
  }, [app, channelId, choosing, myScreens]);

  /**
   * This screen is what its channel's attention clock is about, for as long as
   * it is on screen — and not a moment longer. The snapshot behind it lives on
   * when somebody presses Home, deliberately, because dropping it would be
   * leaving the channel; a snapshot nobody is looking at is not attention, so
   * the clock has to be told about the screen rather than about the snapshot.
   *
   * Reported at once as well as registered: opening a channel is the freshest
   * evidence there is of attending it, and waiting up to half a minute for the
   * next poll would let a room somebody just walked into keep ageing.
   *
   * **Above the early return below, and every hook must stay above it.** This
   * sat under it for one build, which crashed the app on entering any channel
   * at all: a tap opens this screen before its snapshot has arrived, so the
   * first render takes that return and the second — a moment later, snapshot
   * in hand — runs one hook more than the first. React counts hooks by call
   * order and refuses the difference outright. Nothing here needs `view`; the
   * clock is about the screen, which exists either way, and a channel being
   * looked at while it loads is exactly as true.
   */
  useEffect(() => {
    app.lookAt(channelId);
    app.reportAttentive(true);
    return () => app.lookAt(null);
  }, [channelId, app.lookAt, app.reportAttentive]);

  if (!view || !channel) {
    // A channel the server has said is gone is not one a snapshot is coming
    // for, so saying "Loading channel…" is a wait with no end: the ended
    // channel below is kept for thirty seconds and then deleted, and anybody
    // still standing here when that happens used to be left reading it
    // forever.
    const gone = app.goneChannels.includes(channelId);
    return (
      <View style={styles.centered}>
        {gone ? (
          <>
            <Text style={type.heading}>Channel gone</Text>
            <Text style={[type.muted, styles.centeredText]}>
              This channel is no longer there. It may have ended a while ago,
              or you may no longer be part of it.
            </Text>
          </>
        ) : (
          <Text style={type.body}>
            {app.status === 'open' ? 'Loading channel…' : 'Reconnecting…'}
          </Text>
        )}
        <Button
          label="Back to home"
          variant={gone ? 'primary' : 'ghost'}
          onPress={onExit}
        />
      </View>
    );
  }

  // Every participant, self included; the name directory for every id the
  // channel state carries.
  const others = view.participants.filter((p) => p.id !== me);
  /**
   * What to call this channel when nobody has named it. Computed once because
   * two screens draw it: the header below, and the settings field, whose
   * placeholder it is.
   */
  const derivedTitle = describeChannel(others.map((other) => other.displayName));
  const nameOf = (id: string | null) =>
    view.participants.find((p) => p.id === id)?.displayName ?? 'Someone';
  const now = app.serverNow();
  if (channel.status === 'ended') {
    return (
      <View style={styles.centered}>
        <Text style={type.heading}>Channel ended</Text>
        <Text style={[type.muted, styles.centeredText]}>
          Everyone left this channel, so it no longer exists. Start a new one
          to talk again.
        </Text>
        <Button label="Back to home" variant="primary" onPress={onExit} />
      </View>
    );
  }

  // Rendered instead of the channel, not instead of being in it: the audio
  // connection lives above this screen, so neither of these hangs up.
  if (viewing) {
    const pingedWith = view.pingedWith?.[viewing.id] ?? null;
    return (
      <ProfileView
        accountId={viewing.id}
        fallbackName={viewing.displayName}
        // Your own is one of these: the server allows it, and the screen leaves
        // out the Contact card when the id is yours. Nothing below needs a
        // special case — you are present, so there is no ping, and you are not
        // among your own contacts, so there is nothing to remove.
        onBack={() => setViewing(null)}
        // Stepping into another channel the two of you share. The profile
        // closes either way: for a different channel this screen is about to
        // be about that one, and for *this* channel — which is in the list,
        // deliberately, since a card saying they have not been in the room you
        // are sitting in is the point of the section — closing is the whole of
        // what the tap can mean. `ProfileView` has already done the ENTER by
        // then if the preference asks for one, so tapping the room you are
        // looking at steps you in exactly as Home's live card does.
        onEnterChannel={
          onEnterChannel
            ? (id) => {
                setViewing(null);
                if (id !== channelId) onEnterChannel(id);
              }
            : undefined
        }
        // Offered only for somebody who cannot hear you and who is a contact.
        // Pinging a person who can hear you means nothing — and somebody
        // inside the disconnect grace cannot, however present the roster says
        // they are — while pinging a stranger is a thing you may not do at
        // all, a channel being a place a mutual friend can put you in.
        // `mayPing` is both halves and the server enforces both, so a screen
        // that has gone stale — they walked in, or you removed them — is
        // refused rather than silently sending.
        //
        // Nothing is drawn in the card's place, and it does not need to be:
        // the Contact card further down this same scroll offers Add contact
        // for exactly this person, so the screen answers *why not* and *what
        // to do about it* in the order somebody reads them.
        onPing={
          channel && mayPing(viewing.id)
            ? (text) => app.ping(channel.id, viewing.id, text)
            : undefined
        }
        // When they may next be pinged, or null for now. The composer is
        // replaced by the wait rather than left there to be refused: the
        // server has always said no inside the window, and a button that is
        // offered, pressed and rejected teaches nothing that saying so up
        // front does not.
        pingableAt={view.pingableAt[viewing.id] ?? null}
        // What that ping said, where it said anything. The sender is resolved
        // to a name here because this is the screen holding the roster —
        // `nameOf` answers "Someone" for anybody it cannot find, which is the
        // right failure for a quotation: the words still say what was asked,
        // and withholding them over a missing name would leave the card quiet
        // for a reason nobody could see.
        //
        // Null for `by` when it was you. The card says "Sent." directly above
        // these words and does not need your name over them as well.
        pingedWith={
          pingedWith
            ? {
                by: pingedWith.by === me ? null : nameOf(pingedWith.by),
                text: pingedWith.text,
              }
            : null
        }
        // Their microphone, offered only where the favour means something:
        // somebody else, in the room, with you in it too. Those are the same
        // conditions `canMuteOther` checks, and they are asked again here
        // because the guard's answer is *whether the toggle is refused* and
        // this is *whether there is a toggle at all* — absent for somebody who
        // has stepped out, drawn and disabled for the two refusals that are
        // facts about them worth reading.
        mic={
          // `iAmPresent` itself is declared below this early return, so its
          // two halves are written out: the reducer thinks you are here, and
          // this device is the one standing in the channel.
          viewing.id !== me &&
          isPresent(channel, me) &&
          app.standingIn === channelId &&
          channel.present.includes(viewing.id)
            ? {
                muted: channel.selfMuted[viewing.id] ?? false,
                // Always asked about muting, that being the only direction
                // this control has — so the button is disabled exactly when
                // pressing it would do nothing.
                mayMute: canMuteOther(channel, me, viewing.id, true, now),
                // Only for the wording. `mayChange` above has already taken
                // this into account; this is what lets the screen say how long
                // is left instead of leaving a dead button unexplained.
                mutableAt: mutableAt(channel, viewing.id, now),
              }
            : null
        }
        // One direction. Unmuting somebody else is refused by `canMuteOther`
        // and there is no control that asks for it, so the action this sends
        // is always a mute.
        onSetMute={(muted) =>
          act({ type: 'SET_SELF_MUTE', muted, target: viewing.id })
        }
        // Removing a contact leaves every channel that held only the two of
        // you, and this screen is reached from inside one — which, for a
        // one-to-one channel, is exactly the channel that has just gone. So
        // the way out is Home rather than back: closing the profile onto a
        // channel you have left would land on "Channel gone", which is a true
        // sentence and a strange answer to a tap about a contact.
        onRemoved={onExit}
      />
    );
  }

  if (settingsOpen) {
    return (
      <ChannelSettingsView
        channel={channel}
        derivedTitle={derivedTitle}
        onBack={() => setSettingsOpen(false)}
        onLeft={() => {
          app.leaveChannelView(channelId);
          onExit();
        }}
      />
    );
  }

  /**
   * Whether you are in the room, as opposed to looking at it.
   *
   * The two were the same thing until "Tap a channel to step in" could be
   * turned off: every route to this screen entered first, so presence was
   * something the screen could assume. It cannot now, and this is what the
   * difference is drawn from — the microphone card, the door, and whether the
   * card under them offers a way in or a way out.
   *
   * Every other control is already guarded by a `can…` from core, each of
   * which asks about the room rather than the roster, so they disable
   * themselves without being told about this.
   */
  const iAmPresent = isPresent(channel, me) && app.standingIn === channelId;
  /**
   * Nearby in this channel, as the server has it.
   *
   * Read off `waiting` rather than off `app.nearbyIn`, because the three ways
   * into *Nearby* are one state and the roster does not distinguish them: two
   * are declared and one is inferred from a socket that went. What
   * `app.nearbyIn` decides is narrower — whether an arrival is said at all
   * on *this device* — and it reaches this screen as `arrived` below rather
   * than as this flag. See `state/useNearby.ts`.
   */
  const iAmNearby = channel.waiting.includes(me);
  /**
   * Who has arrived since this device declared itself nearby here, and is
   * still in the room.
   *
   * `app.nearbyArrival` is raised by `state/useNearby.ts` and cleared by
   * everything that ends the declaration; it is keyed by channel because a
   * device may be nearby in several at once, so this screen takes its own
   * room's entry and no other. The presence filter is this screen's, for the
   * reason in the line below.
   */
  const arrived = (app.nearbyArrival[channel.id] ?? []).filter((id) =>
    channel.present.includes(id)
  );
  /**
   * Standing here, but not on this device.
   *
   * The roster says present and this screen says otherwise, and both are
   * right: several devices may be signed in, and the one holding the room is
   * whichever entered last. So `iAmPresent` above is narrowed by it — the
   * microphone is closed here and the card offers a way in — while the roster
   * goes on listing this person, because the person is there.
   *
   * **Asked of `standingIn` rather than of `displaced`, which is the wider
   * question and the one worth asking.** `displaced` means the server sent
   * word, and it only ever does that when another device *acts*. A device that
   * merely opens a channel the account is already in is told nothing — there
   * is nothing to tell, the channel did not change — and it used to read the
   * roster and conclude it was standing here. This asks the only question the
   * screen actually has: is this the device holding the room?
   *
   * It covers a case `displaced` cannot, and covers it correctly: an app
   * launched afresh into a channel the account is still present in holds
   * nothing either, and is offered the same way in.
   */
  const elsewhereOnAnotherDevice = !iAmPresent && isPresent(channel, me);
  /**
   * Whether the server *said* another device took it, which is the difference
   * between the two sentences offered below.
   *
   * `elsewhereOnAnotherDevice` is true in two situations that look identical
   * from here and are not: another device holds the room, or this process
   * launched into a channel the account is still present in and holds nothing.
   * Only the first has another device to point at, and only the first is
   * something the server announces — it sends `displaced` when another session
   * acts, and says nothing at all to an app that has merely started up.
   *
   * So this is the one case where the vaguer sentence would be a worse answer
   * than the information available: when the server has told us, say what it
   * told us.
   */
  const takenByAnotherDevice = elsewhereOnAnotherDevice && app.displaced;
  /*
    `controlCards` was here and is gone as of 2026-09-13, with the three cards
    it governed.

    It read `!app.hideControlCards`, and what it decided was whether the
    microphone and the two departures each got a card down the screen as well
    as a slot in the footer. Every one of those cards has since been either
    deleted or reduced to the half a footer cannot carry, so there is nothing
    left for a setting about duplication to switch off:

      - **Step out**, deleted. Two buttons, both of them footer rungs, and by
        the end only one of them had so much as a sentence under it.
      - **Step in**, deleted. Three buttons, all three of them footer rungs.
        Its one sentence with no second home — you are in this channel on
        another device — is now drawn under the roster unconditionally.
      - **Your microphone**, kept that day minus its button, and deleted on
        2026-09-15 when the sentence that had justified keeping it was
        counted against the footer's tint and the roster's suffixes. What
        stands in its place is *Audio*, which is not about the microphone
        and is drawn only when the connection is failing.
      - **The floor**, which went the same way first: the Claim/Release button
        on 2026-08-31, the countdown to the holder's roster card on
        2026-09-12, the rest on 2026-09-13.

    The setting itself outlives this file, `hideControlCards` being on the
    wire and in a column on the accounts table — see core/settings.ts. What it
    no longer has is anything to govern.
  */
  /**
   * What Step Out does about the screen, as against about the room.
   *
   * Stepping out closed this screen from the first build, because for that
   * build the two were one act: every route in stepped in, so a screen you
   * were looking at was a room you were in, and there was nothing left to look
   * at once you had gone. "Tap a channel to step in" being turned off breaks
   * that — see `AppValue.tapToLook`. A tap is then only looking, and looking
   * at a channel you are not in is an ordinary state this screen already
   * draws: the footer offers Step In, the cards say what the room is doing,
   * and nothing about it wants closing.
   *
   * So it is that setting which decides, and it decides symmetrically, which
   * is the whole of the argument. If arriving at this screen did not put you
   * in the room, then leaving the room does not take you off this screen; if
   * it did, it still does. Somebody who has said that a tap is only looking
   * has said that this screen and that room are two things, and having said it
   * once should not have to say it again at the other door.
   *
   * The way off the screen is then the header's *Home*, which is where it
   * already was for anybody who arrived here without stepping in — the same
   * tap doing the same thing, whether or not you were in the room a moment
   * ago. Note that `onClose` is not `onExit` and does not unwatch: closing is
   * navigation, and a screen you are still looking at is one whose snapshots
   * you still want. Stepping out under this setting is neither of those — it
   * gives up the room and leaves the screen exactly where it was.
   */
  const stepOutClosesScreen = !app.tapToLook;
  /**
   * Steps out, and closes the screen if that is what stepping out means here.
   *
   * One function for the footer and the card that used to repeat it, which
   * said the same thing twice by design. They were two copies of these three
   * lines, and a pair like that is exactly the kind that drifts once there is
   * a condition in it — which is what it did. The card's *Be nearby* beside
   * it was not extracted the same way, and by the time the card was deleted
   * on 2026-09-13 it had lost the `markTried('nearby')` its footer twin
   * still had: declaring nearby from the card never ticked the checklist
   * rung. Only the footer calls this now, and the function stays a function
   * because the question it answers — does leaving here mean leaving the
   * screen — has one answer for whoever asks it.
   */
  const stepOut = () => {
    act({ type: 'STEP_OUT' });
    if (!stepOutClosesScreen) return;
    app.leaveChannelView(channelId);
    onExit();
  };
  /**
   * Whether somebody is to be shown as speaking *on this screen*, as against
   * somebody the room happens to be hearing.
   *
   * `audio.speaking` is one room's active speakers, and the audio follows
   * presence rather than navigation: you can stand in one channel and look at
   * another, and these ids index straight into any channel's roster. So
   * without narrowing, a person talking where you are standing lights up on
   * the screen of a channel they are absent from — a dot pulsing next to
   * "Stepped out", on a screen carrying no audio at all.
   *
   * Two narrowings, and neither implies the other. The screen has to be the
   * channel the audio is for, decided by the same `liveChannelView` App.tsx
   * passes the connection, so the two cannot drift into disagreeing about
   * which room this is. And the person has to be in that room — which is not
   * redundant, because presence and the room's judgement arrive by different
   * routes: a snapshot saying somebody stepped out can land before LiveKit
   * says their audio went, and the hold in `speaking.ts` would otherwise keep
   * them lit for two seconds after their own card says they left.
   *
   * `inRoom` rather than `isPresent` because a guest is in the room without
   * being in `present`, and the guest cards below ask this too.
   */
  const audioIsThisChannel =
    app.standingIn === channelId &&
    liveChannelView(app.channelViews, me)?.channel.id === channelId;
  /**
   * Who the server says is talking while the room is withholding them.
   *
   * **The half of the indicator the media plane cannot supply**, and the
   * reason it exists at all: a claim withholds people by unsubscribing every
   * listener from them, and the SFU tells a listener nothing further about
   * somebody they are not subscribed to — so without this, the outline would
   * say only what happened to be true at the moment the floor was taken. See
   * `ChannelView.speakingWhileWithheld` and `useSpeakingReport`.
   *
   * `?? []` for the reason `recordings` above carries: a server that predates
   * the field sends a snapshot without it, and this build meets exactly that
   * between its release and the deploy that follows.
   *
   * **Not gated on `audioIsThisChannel`.** The other half is a reading taken
   * by this device's own media connection and is about one room; this is the
   * server's account of the channel on screen, and is as true from a room you
   * are standing in elsewhere as from this one. It is still checked against
   * `isWithheld` here as well as on the server, so a released floor puts the
   * outline out on the snapshot that reports the release rather than on a
   * message that has to follow it.
   */
  const announcedSpeaking = view?.speakingWhileWithheld ?? [];
  const speakingHere = (id: string) =>
    (audioIsThisChannel && inRoom(channel, id) && audio.speaking.includes(id)) ||
    (inRoom(channel, id) &&
      isWithheld(channel, id) &&
      announcedSpeaking.includes(id));
  /**
   * Whether the room has stopped hearing from somebody, as the media plane
   * sees it. See `SessionAudio.failing`.
   *
   * **Never about you.** Your own connection failing is a thing this screen
   * already says, once, in the audio status line — and it says it in the first
   * person, where this line is written to be read about somebody else. Two
   * reports of one failure, one of them phrased as though you were watching
   * yourself from outside, is worse than either alone.
   */
  const failingHere = (id: string) =>
    id !== me && audioIsThisChannel && inRoom(channel, id) &&
    audio.failing.includes(id);
  /**
   * Whether the channel is mine to change, as against somebody else's
   * conversation to leave alone. See `hasTheRoom` in core.
   *
   * Every control it governs is disabled rather than hidden, which is the
   * opposite of what presence does to the microphone card above. The
   * difference is that these are things you may genuinely do here — a minute
   * from now, or a tap on Step In from now — and a control that vanishes when
   * somebody else walks in reads as a bug rather than as a rule.
   *
   * Since the only way this is false is that other people are present, every
   * sentence explaining it can say "step in", and they all do.
   */
  const iHaveTheRoom = hasTheRoom(channel, me);
  const iHoldFloor = channel.floor.holder === me;
  const theyHoldFloor = channel.floor.holder !== null && !iHoldFloor;
  const holderName = nameOf(channel.floor.holder);
  const iAmSilenced = isSilenced(channel.floor, me);
  /**
   * **No microphone is the same as muted, as far as the interface goes.**
   * A Mac mini has no built-in input, and this app publishes nothing without
   * one — see `SessionAudio.inputAvailable`, and the crash that made it
   * necessary. Saying "your microphone is open" there would be false, and
   * offering a Mute button that does nothing would be worse: the reducer would
   * accept the mute, the screen would change, and not one thing about what
   * anybody hears would move.
   */
  const noInput = audio.inputAvailable === false;
  const iAmSelfMuted = noInput || !!channel.selfMuted[me];
  const claimable = canClaimFloor(channel, me, now);
  const cooldown = cooldownRemainingMs(channel.floor, channel.present, me, now);
  const claimRemaining = floorRemainingMs(channel.floor, now);
  const recordingLive = isRecordingActive(channel.recording);
  /**
   * What is wrong with the audio, in words, or null while nothing is — which
   * is also whether the *Audio* card is drawn at all. See `describeAudio`.
   */
  const audioNote = describeAudio(audio);
  // Leaving is ordinary until you are the last one, at which point the same
  // tap destroys the channel. Nothing else in the interface would say so.
  const lastMember = channel.participants.length === 1;

  const playback = channel.playback;
  const track = playback.track;
  const position = playbackPositionMs(playback, now);
  const mayControlPlayback = canControlPlayback(channel, me);

  // Rendered instead of the channel, like the profile and the settings screens
  // above — the audio connection lives above this, so reading a transcript
  // does not hang anybody up. Looked up by id rather than held as a row, so
  // the screen follows the snapshot rather than a copy taken when it opened.
  const transcriptRow = recordings.find((r) => r.id === transcriptFor);
  if (transcriptFor && transcriptRow) {
    return (
      <TranscriptView
        recording={transcriptRow}
        onBack={() => setTranscriptFor(null)}
        manageable={iHaveTheRoom}
        // Offered only while this recording is what is loaded and the floor is
        // yours to drive: a line's times are positions in *this* recording, so
        // they mean nothing against another track, and a seek moves playback
        // for everybody in the room rather than for whoever tapped.
        onSeek={
          track?.recordingId === transcriptRow.id && mayControlPlayback
            ? (positionMs) => act({ type: 'SEEK', positionMs })
            : undefined
        }
      />
    );
  }
  // Driving what is on and putting something new on are two rules, and the
  // shared audio card needs both: an absent member may pause or clear a track
  // on an empty channel, and may not load one. `canStartWatch` is the same
  // split on the watch tab.
  const mayLoadTrack = canLoadTrack(channel, me);

  // `?? initialWatchState()` for the reason `clip` has its `?? null`: a server
  // that predates this field sends snapshots without it, which is what this
  // build meets between its release and the deploy that follows.
  const watch = channel.watch ?? initialWatchState();
  const party = watch.party;
  const watchAt = watchPositionMs(watch, now);
  const mayControlWatch = canControlWatch(channel, me);
  // The room without the floor clause. It governs the card's prose rather than
  // any control now: choosing which of your own devices shows a film changes
  // nothing about the channel, so nothing about it is gated — but somebody
  // outside a conversation that is going on is still told that first, ahead of
  // whose floor it is.
  const mayWatchHere = iHaveTheRoom;
  const mayStartWatch = canStartWatch(channel, me);
  /**
   * Whether *this* device is the one showing the film.
   *
   * A role rather than a place: an instance can be a screen for a channel it is
   * not standing in, which is the configuration this design prefers — the film
   * on a laptop that holds no audio session at all, the voice on the phone.
   */
  const screeningHere = screenIsHere;
  /**
   * Whether the room has been told that this account's screen and microphone
   * are one device.
   *
   * **Only true when both are this device.** A second instance showing a film
   * while the phone holds the room is exactly what the exception is not for:
   * that phone's microphone is not competing with anything.
   */
  // `?? []` for the reason `watch` has its `?? initialWatchState()`: a server
  // that predates this field sends snapshots without it, which is what this
  // build meets between its release and the deploy that follows.
  /** This account's other live instances — the ones a film could go to. */
  const otherScreens = myScreens;

  // The whole of why `parseYouTubeUrl` is in core: this decides whether the
  // button lights up and the server decides whether to accept, and a greyed
  // control and a refused action must not disagree about what a link is.
  const pastedIsLink = parseYouTubeUrl(watchUrl) !== null;
  // Two questions, and the interface needs both. `muteRequested` is what the
  // toggle shows — a button that flipped itself back every time the video
  // paused would be a control fighting its owner. `partyMuted` is what is
  // true right now, which is what the roster reports.
  const muteRequested = partyMuteRequested(channel);
  const partyMuted = isPartyMuted(channel);

  /**
   * Whether watching together is a thing this account has at all.
   *
   * Behind Labs, and the one experimental surface the app has to withhold for
   * itself: a recording's transcript vanishes because the server stops sending
   * the field, but a party is channel state and arrives on every snapshot
   * whether anybody asked for the feature or not.
   *
   * `|| party` is not a leak in that gate. Somebody who never asked for watch
   * parties can still be sitting in a channel where one is running — their own
   * player is being driven by it and the recording controls are refusing them
   * because of it — and a tab explaining that, with a Stop on it, is the only
   * honest thing to draw. What Labs decides is whether you can *begin* one,
   * which is what the server enforces; see `dispatch` in server/src/channels.ts.
   */
  const watchOffered = app.labs || !!party;
  /**
   * The tabs this account is offered, which is six or five.
   *
   * **The one variable tab is the only one it may be.** A tab bar that gains
   * and loses entries as the state of the room changes is the footer's
   * finger-under-the-thumb problem one control up: the thing you were reaching
   * for is somewhere else by the time you land. What governs this one is
   * `watchOffered`, which is a Labs setting and a party that is either running
   * or not — neither of them something that flickers — and the alternative was
   * a tab named *Watch* offered to somebody for whom watching does not exist.
   */
  const tabs: readonly {
    value: ChannelTab;
    label: string;
    icon: (color: ColorValue) => React.ReactNode;
  }[] = [
    {
      value: 'members',
      label: 'Members',
      icon: (color) => <MembersIcon color={color} />,
    },
    {
      value: 'notepad',
      label: 'Notepad',
      icon: (color) => <NotepadIcon color={color} />,
    },
    {
      value: 'invites',
      label: 'Invite',
      icon: (color) => <InviteIcon color={color} />,
    },
    {
      value: 'player',
      label: 'Player',
      icon: (color) => <PlayerIcon color={color} />,
    },
    {
      value: 'recordings',
      label: 'Recordings',
      icon: (color) => <RecordingsIcon color={color} />,
    },
    ...(watchOffered
      ? [
          {
            value: 'watch' as const,
            label: 'Watch',
            icon: (color: ColorValue) => <WatchIcon color={color} />,
          },
        ]
      : []),
  ];
  /**
   * The tab actually drawn, which is the one chosen unless it has gone.
   *
   * Only *Watch* can go, and it goes the moment a party stops in a channel
   * belonging to somebody without Labs — who is very likely the person looking
   * at it when it stops, that tab being where the Stop button is. Falling back
   * to the roster is the answer rather than leaving the screen blank: the tab
   * is gone because the thing it was about is over, and the roster is what the
   * screen is for.
   */
  const shown: ChannelTab = tabs.some((t) => t.value === tab) ? tab : 'members';

  /**
   * Mints a follower link and hands it to the share sheet.
   *
   * `Share` rather than the clipboard, because the destination is another
   * device: what somebody does with this is mail it to themselves, drop it in
   * a note, or send it to the iPad on the sofa. Offered whether or not a party
   * is running — opening the screen first and choosing the video afterwards is
   * the ordinary order of doing this.
   */
  /**
   * The video's link, as it was pasted.
   *
   * Straight onto the clipboard rather than through the share sheet, which is
   * the difference from the button below it: sharing is for sending to
   * somebody, copying is for putting somewhere — a note, a browser, the other
   * half of a conversation happening elsewhere.
   */
  const copyVideoLink = async () => {
    if (!party) return;
    setWatchCopied({ which: 'video', ok: await copyText(party.url) });
  };

  /**
   * What to call one of this account's devices in the picker.
   *
   * The name where the platform gave one, and the kind where it did not —
   * which is every browser, there being no device-name API on the web. A made
   * up name in a list of real ones would be worse than saying plainly that
   * this is the other browser.
   */
  const screenLabel = (screen: ScreenDevice) =>
    screen.name ?? (screen.client === 'web' ? 'A browser' : 'Another phone');

  /** What the copy button says, once it has been pressed. */
  const copyLabel = (which: 'video', idle: string) =>
    watchCopied?.which !== which
      ? idle
      : watchCopied.ok
        ? '✓ copied'
        : '✗ copy failed';

  // `?? null` for the same reason `recordings` has its `?? []`: a server that
  // predates this field sends snapshots without it, which is what this build
  // meets between its release and the deploy that follows.
  const clip = channel.clip ?? null;
  // Offered as a link only when the whole of what was pasted is one, and only
  // for a scheme `isSafeUrl` allows — the same allowlist that governs links in
  // a description, and for the same reason: this is text one member wrote and
  // another is being invited to hand to the OS. Finding a URL *inside* longer
  // text is deliberately not attempted; it would mean guessing which of
  // several somebody meant, and guessing wrong opens the wrong page.
  const clipUrl =
    clip && isSafeUrl(clip.text.trim()) ? clip.text.trim() : null;
  // Whitespace collapsed before it is shown. `numberOfLines` counts rendered
  // lines, so text that begins with a newline would spend the only one on
  // nothing and preview as blank — which reads as a paste that failed.
  const clipPreview = clip ? clip.text.replace(/\s+/g, ' ').trim() : '';

  const pasteClip = async () => {
    setClipError(null);
    const text = await pasteText();
    if (text === null) {
      setClipError('There is nothing on your clipboard to paste.');
      return;
    }
    if (text.length > MAX_CLIP_LENGTH) {
      // Refused here rather than sent and silently dropped by the reducer: a
      // paste travels as a socket action, which reports nothing back that this
      // screen shows. The cap is imported rather than restated so the sentence
      // and the rule cannot drift apart.
      setClipError(
        `That is too long to share. The channel clipboard holds ${MAX_CLIP_LENGTH} characters.`
      );
      return;
    }
    act({ type: 'PASTE_CLIP', text });
  };

  const copyClip = async () => {
    if (!clip) return;
    setCopied((await copyText(clip.text)) ? 'done' : 'failed');
  };

  const loadTrack = async () => {
    setUploadError(null);
    setUpload({ percent: null, cancel: null });
    try {
      // The checklist's `player` rung. **On putting something in the room and
      // not on pressing Play**: an empty player has no Play worth pressing, so
      // loading a track is the act somebody has to be shown, and everything
      // else on that tab follows from having done it once.
      await pickAndUploadTrack(app.token ?? '', channelId, {
        // Guarded on the current state rather than set outright: both of these
        // arrive from a native callback and can land after the upload has
        // ended, and neither should resurrect a finished one.
        onStart: (cancel) => setUpload((u) => (u ? { ...u, cancel } : u)),
        onProgress: (percent) => setUpload((u) => (u ? { ...u, percent } : u)),
      });
      app.markTried('player');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpload(null);
    }
  };

  /**
   * Hands whoever asked a copy of what the channel is listening to.
   *
   * An `Alert` on failure rather than the warning line the upload uses, and
   * deliberately the same one the recordings list raises: a share that does
   * not happen is about the thing you just tapped, not about the state of the
   * card, and the card's warning slot is for what is wrong with the track.
   */
  const takeTrack = async () => {
    if (!app.token || !track) return;
    setTrackSharing(true);
    try {
      await shareTrack(app.token, channelId, track.title);
    } catch (error) {
      Alert.alert(
        'Could not share',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setTrackSharing(false);
    }
  };

  /*
    Pinned, so which channel you are in and the two ways out of it do not
    scroll away. This screen is the longest in the application — eleven
    sections, several of which are lists — and Home was reachable only from the
    very top of it, which on a channel with a few recordings in it is a flick
    away from wherever anybody actually is.

    A header that stays has to be short, which decides the arrangement. The
    name shared a row with these two buttons until earlier today and was moved
    off it because it lost the width and truncated to pay for them; that
    reasoning was about a header whose height was spent once, at the top of a
    scroll. This one is spent on every screenful, so the name comes back onto
    the row — at 20 rather than 28, one line rather than two. What the
    truncation costs is smaller than it was, too: the description sits
    immediately below in the scroll, and the full name is in Settings, which is
    the button next to it.
  */
  const header = (
    <View style={styles.header}>
      {/*
        The measure goes on the contents, not on the header: the rule
        underneath is an edge, and an edge that stops short of the window is
        not one. The horizontal padding came in here with it, so the name lines
        up with the cards below rather than sitting outside their column.
      */}
      <View style={styles.headerInner}>
      <View style={styles.headerTop}>
        <View style={styles.headerMain}>
          {/*
            What this screen is, above what it is called. It costs a line in a
            header that is pinned and argued above to be short, and it is worth
            it for the unnamed case directly below: a channel nobody has named
            is headed by a list of who is in it, which is very nearly what the
            contact screen's header looks like. The word separates the two
            exactly where nothing else does — and since 2026-09-13 it is the
            only thing that does, the italic that used to mark the derived
            title having gone. Its counterpart there says *Contact*; see
            ProfileView, which carries the reasoning for both.
          */}
          <Text style={styles.headerKind}>Channel</Text>
          {/* One style, named or not. The italic that marked a derived title
              is gone; see the note on Home's channel rows for why. */}
          <Text style={styles.otherName} numberOfLines={1}>
            {channel.name ?? derivedTitle}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {/*
            **The whole indicator, and only here.** That a recording is
            running is the one fact on this screen somebody needs at every
            moment, so it is pinned — and it is pinned as the object it is:
            the disc, the word and the clock inside a hairline. The split
            that put the disc here and the pill on the Recording card was
            drawing one state two ways in two places, which is a state
            somebody has to learn twice; there is one of it again, and it is
            in the place that cannot scroll away.

            **What it costs is the name's width, which is the right thing to
            spend.** The pill takes what it needs and the name takes the rest
            and truncates — a truncated name still identifies the channel,
            and the full one is behind the button immediately beside it.

            Not a button. It sits in the row of buttons because that is where
            the space at the end of the name is, and it is the only thing in
            it that does nothing when pressed — hence the plain `View` with
            its own accessible name rather than an `IconButton` that would
            promise a control.
          */}
          {recordingLive ? (
            <View
              style={[styles.recordingStatus, styles.headerRecording]}
              accessible
              accessibilityRole="image"
              accessibilityLabel={
                channel.recording.status === 'paused'
                  ? 'Recording paused'
                  : 'Recording'
              }
            >
              <View
                style={[
                  styles.recordingDot,
                  channel.recording.status === 'paused' &&
                    styles.recordingDotPaused,
                ]}
              />
              <Text style={styles.recordingLabel}>
                {channel.recording.status === 'paused' ? 'Paused' : 'Recording'}
              </Text>
              <Text style={styles.recordingTime}>
                {formatDuration(recordedMs(channel.recording, now))}
              </Text>
            </View>
          ) : null}
          <IconButton
            label="Settings"
            icon={(color) => <SettingsIcon color={color} />}
            onPress={() => setSettingsOpen(true)}
          />
          {/*
            Off this screen without hanging up. The audio connection lives
            above this screen, so this is navigation and nothing else — and it
            means the same thing in both panes, which is what the tier made
            true. A glyph since 2026-09-02 and a house since 2026-09-12 —
            *Home* rather than the *Close* the other headers say, because
            here the destination is one thing and worth naming; the reasoning
            for naming the act instead everywhere else is in HomeSettingsView.
            See `onClose`.

            **Last in the row, since the pair became glyphs.** It is the way
            out, and every other screen in the app puts the way out at the
            trailing edge with nothing beyond it — as words the two read in
            order and Close came first, but as two shapes side by side what
            tells them apart is position as much as geometry, and the way out
            sitting where the way out always sits is the one you can hit
            without reading. Settings takes the place it vacated.
          */}
          <IconButton
            label="Home"
            icon={(color) => <HomeIcon color={color} />}
            onPress={onClose}
          />
        </View>
      </View>

      {/*
        **Six tabs, and between them they hold the whole screen.** The roster
        carries the conversation as it is happening — who is here, the floor,
        your microphone, the ways in and out. The four in the middle carry
        what the channel holds, which outlives the moment: what has been
        written down, what is playing, what is being recorded and what was,
        what is being watched. The last carries the two ways somebody who is not here gets
        in.

        The notepad used to sit above the switch, outside it and called the
        *description*, on the reasoning that it is what the channel *is* and so
        is as true of who gets in as of who is here. It is on *Notepad* now
        with the clipboard, which is the tab of things the channel has written
        down — and the line it cost was a line every screenful of every tab
        paid for, on the screen that has least room to spare.

        A switch rather than a tab bar at the foot, for the same reason Home's
        is one — the foot of this screen is already spent, on the controls that
        claim the floor and step in and out. It is two rows here rather than
        one, six words not fitting across a phone; see `Segmented`, which does
        the wrapping so that Home's two-way switch and this cannot drift apart.

        **Pinned with everything else up here.** They were the first
        thing in the scroll, which made them the first thing to leave it: two
        rows of switch that were only reachable by scrolling back to the top,
        on the longest screen in the application. A tab bar you have to go and
        find is one that quietly stops being used.

        Pinning them also settles what the header is *for*: which channel you
        are in, the ways out of it, whether you are being recorded, and which
        part of it you are looking at. Everything below scrolls; nothing that
        tells you where you are does.

        Inside `headerInner`, so the switch lines up with the cards below
        rather than running to the window's edge.

        **Here and nowhere else, since 2026-09-13.** A Floor Settings switch
        moved them into the footer for a day, and half the accounts that had
        never touched it were put on each side of that by a coin toss. Both
        are gone: a second home for a set of controls is a second place to
        look for them, and the top is where the tabs have been since there
        were tabs. See
        planning/decisions/2026-09-13-the-channel-tabs-stay-at-the-top.md.
      */}
      <View style={[styles.tabs, styles.tabsHeader]}>
        <Segmented options={tabs} value={shown} onChange={setTab} />
      </View>
      </View>
    </View>
  );

  /*
    The four things you do to a conversation, always within reach. Three of
    them are things you do while you are in it; the pair at the end is the two
    ways in and the two ways out, which is what presence being three rungs
    rather than a switch costs the bar — one more slot.

    **These are the controls, as of 2026-09-13, and not shortcuts to them.**
    Each of the four had a card on the roster tab saying the same thing in
    words, and that arrangement was defensible for exactly as long as the
    cards carried something the bar could not: the sentence saying why an act
    was refused, the warning about being recorded while silenced. One by one
    they stopped. The floor's card went first and in two steps — the button on
    2026-08-31, the rest on 2026-09-12 and 13, its readouts having moved to the
    roster card of whoever holds it. The microphone, Step in and Step out
    followed on 2026-09-13; the first kept its explanation and lost its button,
    and the other two were buttons and nothing else by the end.

    **What could not move down here did not get dropped for it.** That is the
    whole of the rule, and it is unchanged: an icon that greys with no reason
    given is the one shape this codebase does not allow a control to have. So
    *why* your microphone is shut is still a sentence, on the one card left; the
    floor's four reasons for refusing a claim are the one place the rule is
    bent, and the bend is paid for by the clock and the cooldown on the roster.
    Three of these four now say all they say in a glyph, a word and a colour,
    because there turned out to be nothing else about them worth saying.

    Nothing here is conditional on a setting, and nothing here may become so — a
    bar that changes shape with a preference is the same finger-under-the-thumb
    problem as one that changes shape with state. That used to be said against
    `hideControlCards`, which switched the cards off and never reached the bar;
    it now has nothing to be said against, the cards being gone for everybody.

    **Labelled, though the request was for icons.** Two of these three are
    mechanics this application invented — nobody arrives knowing what claiming
    the floor is, and a raised hand does not teach it. The label is what makes
    the icon legible the first time and the icon is what makes it findable
    after that.

    **All four are always present, greyed rather than absent**, which is the
    opposite of what the cards do. On a screen that scrolls, a control that is
    not true of you should not be there at all; in a fixed bar, items appearing
    and disappearing move the other two under a finger already on its way — and
    the mute you meant becomes the floor you did not. Position is the thing a
    footer is for, so position is what stays fixed.

    **That used to be argued from the thumb, and the thumb has stopped being
    universal.** On an iPad in landscape there is no thumb at the bottom of a
    1300pt screen, and the bar is capped and centred there rather than run edge
    to edge — see `footerInner`, which exists because a third of 1300 is not a
    control. What the cap does *not* touch is the property above: each action
    is still `flex: 1` within the bar, so all four are still a quarter of it
    whatever their labels say, and the floor still does not move when "Claim"
    becomes "Release", nor the door when a rung changes the word beside it. **Stability of position is the rule; reach was
    only ever the reason a phone had for wanting it.**
  */
  const footer = (
    <View style={styles.footer}>
      <View style={styles.footerInner}>
      <FooterAction
        label={iAmSelfMuted ? 'Unmute' : 'Mute'}
        hint={
          noInput
            ? 'This device has no microphone'
            : iAmSelfMuted
              ? 'Your microphone is muted'
              : 'Your microphone is open'
        }
        icon={(color) => <MicIcon color={color} muted={iAmSelfMuted} />}
        // The same guard the card's button uses. Holding the floor is holding
        // it open to speak, and the reducer refuses the mute either way. A
        // device with no input is disabled on top of that: there is nothing to
        // unmute, and the control would otherwise promise one.
        disabled={
          noInput || !iAmPresent || !canSetSelfMute(channel, me, !iAmSelfMuted)
        }
        // Being force-muted by somebody else's claim is not the same state as
        // muting yourself, and it is the one worth colouring: the microphone
        // is shut and you did not shut it.
        tone={iAmSilenced ? 'silenced' : iAmSelfMuted ? 'active' : 'idle'}
        onPress={() => act({ type: 'SET_SELF_MUTE', muted: !iAmSelfMuted })}
      />
      <FooterAction
        label={iHoldFloor ? 'Release' : 'Claim'}
        hint={iHoldFloor ? 'You have the floor' : 'Claim the floor'}
        icon={(color) => <FloorIcon color={color} />}
        disabled={!iHoldFloor && !claimable}
        tone={iHoldFloor ? 'active' : 'idle'}
        onPress={() => {
          // The checklist's `floor` rung, ticked on the claim and not on the
          // release: claiming is the thing somebody has to be shown once, and
          // releasing is what anybody who has claimed will do next anyway.
          if (!iHoldFloor) app.markTried('floor');
          act({ type: iHoldFloor ? 'RELEASE_FLOOR' : 'CLAIM_FLOOR' });
        }}
      />
      {/*
        The ladder itself, one slot per rung, in its own order: in, nearby,
        out. **Three slots rather than two**, since 2026-09-09, replacing the
        pair of flipping words adopted earlier the same day. See
        `planning/decisions/2026-09-09-presence-is-a-ladder.md`.

        The pair satisfied the footer's standing rule — position never changes
        with state — by keeping two fixed slots and flipping the word in each.
        Three satisfy it more completely: **no word here changes in any state**,
        and neither does any glyph. What moves is the accent.

        **So these three name the rungs, where every other control in this bar
        names an act.** That is what lets the colour mean what it means
        everywhere else — *this is true of you now* — on a control whose
        subject is a state rather than a toggle. A bell over "Step out" was the
        symptom that this slot had been asked to do both; an accent on
        "Step in" while you are already in would have been the same fault in
        the other half. Read them as a three-position switch: the lit one is
        where you are, the other two are where a tap takes you.

        **The rung you are on is inert**, and accented rather than greyed. Grey
        is this bar's word for *refused*, and being somewhere is not a refusal.

        **Except *Nearby*, which stays live while it is lit.** That rung is a
        claim with a clock on it rather than a place, and tapping it again
        restarts the clock — the renewal this screen had no way to offer, since
        the only way to reach the fifteenth minute was to step off the rung and
        back on. It looks no different from the other two while lit, which is
        deliberate: see `repeatable` on `FooterAction`.

        **Short forms, deliberately.** The long forms — "Step in", "Be
        nearby", "Step out" — are acts, and belonged on a control with a
        sentence under it; the cards that had them are gone as of 2026-09-13,
        and the arrival card that said "Step in" and "Stay nearby" went on
        2026-09-15, so no long form is left on this screen at all. A roster
        card still says *Present* and *Stepped out* about other people. These are the same
        three rungs at 11pt in a fifth of a phone, and the long forms truncate
        there.
      */}
      <FooterAction
        label="In"
        hint={
          iAmPresent
            ? 'You are in this channel'
            : 'Step in to the conversation'
        }
        icon={(color) => <StepIcon color={color} out={false} />}
        selected={iAmPresent}
        onPress={() => act({ type: 'ENTER' })}
      />
      <FooterAction
        label="Nearby"
        hint={
          iAmNearby
            ? 'You are nearby. Tap to restart the wait'
            : 'Be reachable without joining the conversation'
        }
        // The bell draws this rung and nothing else, which is the whole of why
        // it is a bell: what being nearby buys you is a notification and not
        // one thing more. See `BellIcon`.
        icon={(color) => <BellIcon color={color} />}
        selected={iAmNearby}
        // The one rung that stays live while it is lit: the tap restarts the
        // fifteen minutes rather than moving you anywhere. See `repeatable`.
        repeatable
        onPress={() => {
          app.markTried('nearby');
          act({ type: 'DECLARE_NEARBY' });
        }}
      />
      <FooterAction
        label="Out"
        hint={
          iAmPresent
            ? 'Leave the conversation'
            : iAmNearby
              ? 'Stop being reachable here'
              : 'You are not in this channel'
        }
        icon={(color) => <StepIcon color={color} out />}
        selected={!iAmPresent && !iAmNearby}
        // Never refused, from either rung above it: a departure is the one act
        // nothing on this screen can withhold. `stepOut` rather than a bare
        // action, since whether leaving closes the screen is one question with
        // one answer for the footer and the card alike.
        onPress={stepOut}
      />
      </View>
    </View>
  );

  return (
    <Screen header={header} footer={footer} contentStyle={styles.container}>
        {/*
          Why you are in a room with people you have never met.

          **Above the tab content rather than on one tab**, so it is the first
          thing under the switch whichever of the six is showing. Somebody who
          lands on *Notepad* and finds four strangers in a channel they did not
          open has the same question as somebody who lands on *Members*, and an
          explanation filed under one tab is one most of them would never
          reach.

          A readout: a sentence and a way to put it away, and no button
          repeating anything in the footer. So it is not `hideControlCards`'
          business and must not be given to it — see STYLE.md § *The cards a
          footer made redundant*, which says in as many words that the moment a
          card stops repeating the bar, that setting has no claim on it.

          It goes when the person says it can. Nothing about the channel
          changes when they do: it is an ordinary channel, they are an ordinary
          member of it, and the card was only ever the introduction.
        */}
        {cohortNotice.show && view.cohort ? (
          <Card style={styles.cohort}>
            <Text style={type.body}>Your getting-started channel</Text>
            <Text style={type.muted}>
              The Floor is for talking with people you already know, and it is
              no use at all on the first day, when nobody you know is here yet.
              So you have been introduced to a few people who joined around the
              same time as you, and to somebody who runs The Floor.
            </Text>
            <Text style={type.muted}>
              Nobody here is one of your contacts, and nobody can see your email
              address. Step in and say something, or leave whenever you like —
              Channel Settings, at the top, has Leave this channel.
            </Text>
            <View style={styles.cohortActions}>
              <Button label="Got it" variant="ghost" onPress={cohortNotice.dismiss} />
            </View>
          </Card>
        ) : null}
        {shown === 'members' ? (
          <>
        <View style={styles.presence}>
          {/*
            A card each, rather than the status lines this used to be. Who is
            in the room and who is talking is what the screen is *for*, and it
            was the smallest type on it — a line of muted grey under the title,
            below which four cards described what the channel was doing.
          */}
          <View style={styles.members}>
            {view.participants.map((participant) => (
              <ParticipantCard
                key={participant.id}
                channel={channel}
                participant={participant}
                self={participant.id === me}
                // Audible right now, as the room hears it rather than as the
                // reducer imagines it: the floor says who *may* speak, and
                // this says who is.
                speaking={speakingHere(participant.id)}
                // The earliest thing anybody in the room can be told about
                // somebody dropping out, and it is here rather than on the
                // channel's own status line because it is about one person.
                failing={failingHere(participant.id)}
                now={now}
                onPress={() => setViewing(participant)}
                // `mayPing`, the same gate the profile's composer uses and
                // the server enforces: not yourself, not somebody who can hear
                // you, not a stranger. The card narrows it further to whoever
                // is out of reach and still worth calling, which is the state
                // the shortcut is for.
                onPing={
                  mayPing(participant.id)
                    ? () => app.ping(channel.id, participant.id, '')
                    : undefined
                }
                pingableAt={view.pingableAt[participant.id] ?? null}
                attentiveAt={view.attentiveAt?.[participant.id] ?? null}
                // The claim's clock, on the card of whoever is holding it and
                // on nobody else's — `claimRemaining` is a fact about the
                // floor, and the roster is where it becomes a fact about a
                // person.
                floorRemaining={
                  channel.floor.holder === participant.id ? claimRemaining : null
                }
                // And the cooldown on your own, that being the only card it is
                // about. Somebody else's wait is not information this screen
                // owes you: it is not a thing you can act on, and six of them
                // would turn the roster into a row of clocks.
                cooldown={participant.id === me ? cooldown : null}
              />
            ))}
          </View>

          {/*
            Under the roster rather than on each card, because it is one fact
            about the room and not six facts about six people. A badge per card
            would say the same thing as many times as there are people and
            invite the reading that they had each been muted individually —
            which is precisely what this is not: nobody's own mute has been
            touched, and clearing this gives every one of them back as they set
            it.

            Placed here rather than in the watch card, though that is where the
            control is, because this is a claim about the roster directly above
            it: those people cannot be heard right now.
          */}
          {partyMuted ? (
            <Text style={styles.partyMuted}>
              Party-muted — nobody is heard while the video plays.
            </Text>
          ) : null}

          {/*
            **The other-device sentence, unconditionally, and it is the only
            one left here.** It sat beside a copy of the recording warning,
            both drawn only when the cards below were switched off and both
            carrying a sentence one of those cards would otherwise have said.
            The microphone card can no longer be switched off, so it keeps its
            warning and this pair is down to one.

            This one cannot go the same way, because there is no card left to
            put it on: it is true only of somebody who has *not* stepped in,
            and the microphone card is drawn only for somebody who has. The
            Step in card carried it until 2026-09-13 and was otherwise three
            buttons the footer already had.

            It stays rather than being left to the footer because it is not an
            explanation of a control. Stepping in from here closes a
            microphone somewhere else, and an icon in a bar cannot say so —
            the settings screen promised in as many words that this one stays
            whichever way that setting was set, and now it stays because
            nothing can take it away.

            Under the roster for the same reason the party-muted line is: it
            is a claim about the room you are looking at, made where you are
            looking.
          */}
          {!iAmPresent && elsewhereOnAnotherDevice ? (
            <Text style={type.muted}>
              {takenByAnotherDevice
                ? 'You are in this channel on another device. Stepping in here brings the conversation to this one and closes the microphone there.'
                : 'You are in this channel, but not on this device. Stepping in here brings the conversation to this one.'}
            </Text>
          ) : null}

          {/*
            **The arrival, which was a card until 2026-09-15.**

            It carried a heading, the sentence below, *Step in*, *Stay nearby*
            and an explanation. Four of those five were said elsewhere on this
            screen at the same moment: the sentence by the roster row directly
            above, which already says *Present*; *Step in* by the `In` rung,
            which sends the same `ENTER`; the explanation by your own roster
            row saying *Nearby* and by the lit bell; and the event itself by
            the notification, which since 2026-09-08 reaches a nearby phone
            with the app open deliberately — `reachesInApp` in server/push.ts,
            "exactly the person asking to be told". The fifth, *Stay nearby*,
            answered nothing in the room: its only effect was to put the card
            away, a control that existed because the card did.

            What was not said anywhere is the only thing left here: **the
            roster gives a clock to you and not to them.** Your own row reads
            *Nearby a few seconds*; theirs reads *Present* whether they walked
            in a second ago or an hour ago. *Just* is that difference, and it
            is one line.

            So the arrival is a claim about the room, like the two above it, and
            the answer is the rung — which is where every other act on this
            screen already lives. See
            `decisions/2026-09-15-the-arrival-is-a-line.md`, and
            `2026-09-13-the-cards-a-footer-made-redundant.md`, which is the
            same argument made about the card this one sat beneath.

            **Still filtered against the roster rather than expired on a
            clock**, which is what it always was: somebody who arrived and has
            since left is no longer news, and `channel.present` already says
            so — a line that outlived the arrival would be the screen
            contradicting the list directly above it. Nothing dismisses it,
            because a sentence that is true is not a question.
          */}
          {iAmNearby && arrived.length > 0 ? (
            <Text style={type.muted}>
              {`${describeChannel(arrived.map(nameOf))} just stepped in.`}
            </Text>
          ) : null}

          {/*
            Under the roster and above everything else, because somebody at
            the door is waiting on an answer from this screen and nothing else
            here is. Both lists are usually empty and render nothing at all.
          */}
          {/*
            `?? []` on both lists, and it is not defensive noise: a build of
            this app will meet a server that has never heard of guests every
            time somebody runs it against a box that has not been deployed yet,
            and the failure without it is a crash on the channel screen rather
            than a channel with nobody at the door. Same reasoning as
            core/guests.ts.
          */}
          {/*
            And nothing at the door when you are not in the room. Answering
            needs presence — `canAnswerKnock` — so a card offered here would be
            two buttons the reducer refuses, which is the one shape this
            codebase does not allow a control to have. Somebody else who is
            actually in the channel is being asked the same question.
          */}
          {(iAmPresent ? (channel.knocks ?? []) : []).map((knock) => (
            <Card key={knock.id} style={styles.stack}>
              <Text style={type.body}>
                <Text style={type.heading}>{knock.name}</Text> is at the door
                with a link to this channel.
              </Text>
              <Text style={type.muted}>
                They will be able to listen, and to speak only if somebody
                turns their microphone on. They cannot record, and they cannot
                reach anything else of yours.
              </Text>
              <View style={styles.guestActions}>
                <Button
                  label="Let them in"
                  onPress={() =>
                    act({ type: 'ANSWER_KNOCK', knockId: knock.id, accept: true })
                  }
                />
                <Button
                  label="No"
                  variant="ghost"
                  onPress={() =>
                    act({ type: 'ANSWER_KNOCK', knockId: knock.id, accept: false })
                  }
                />
              </View>
            </Card>
          ))}

          {/*
            Shown to everybody watching, unlike the knocks above — a guest is
            somebody in the room, and who is in the room is what this screen is
            for. What is withheld is the pair of buttons, and only from
            somebody who is not in there with them.
          */}
          {Object.values(channel.guests ?? {}).map((guest) => (
            <GuestCard
              key={guest.id}
              guest={guest}
              muted={!!channel.selfMuted[guest.id]}
              holdsFloor={channel.floor.holder === guest.id}
              speaking={speakingHere(guest.id)}
              failing={failingHere(guest.id)}
              manageable={canManageGuest(channel, me, guest.id)}
              askable={canAskGuestJoin(channel, me, guest.id)}
              asked={guest.asks?.[me]}
              invited={guest.invites?.[me]}
              // The third rung's guard, and it is the server's own: `INVITE`
              // refuses anybody who is not a contact, so the control is drawn
              // from the same fact rather than from the ask having been
              // accepted — which would be a second way to know one thing, and
              // wrong for the guest who was already a contact when they
              // arrived.
              addable={
                !!guest.accountId &&
                (app.home?.contacts ?? []).some(
                  (entry) =>
                    entry.account.id === guest.accountId &&
                    entry.status === 'accepted'
                )
              }
              onSpeech={(maySpeak) =>
                act({ type: 'SET_GUEST_SPEECH', guestId: guest.id, maySpeak })
              }
              onEject={() => act({ type: 'EJECT_GUEST', guestId: guest.id })}
              onAskContact={() =>
                act({ type: 'ASK_GUEST_CONTACT', guestId: guest.id })
              }
              onAskJoin={() => act({ type: 'ASK_GUEST_JOIN', guestId: guest.id })}
              onAddToChannel={() =>
                guest.accountId &&
                act({ type: 'INVITE', contactId: guest.accountId })
              }
            />
          ))}

          {/* Same delay as Home's: a foreground drops the socket every time,
              and this used to announce it the instant it happened. */}
          {showOffline ? (
            <Text style={styles.warning}>
              Reconnecting — a dropped connection counts as leaving.
            </Text>
          ) : null}
        </View>

        {/*
          **What is left of *Your microphone*, which is no longer about the
          microphone.** The card carried a sentence saying why the microphone
          was in the state it was in, and on 2026-09-15 that sentence was
          counted against what the rest of the screen already says. Three of
          its states were said twice — the footer tints Mute and accents
          Release, and your own roster card carries `· muted` and `· has the
          floor` — and the others were explanations of a control rather than
          facts about the room. STYLE.md's seventh load-bearing rule is the
          one that settles it: when the sentence goes the card goes.

          What could not be said anywhere else was never the microphone. It
          was the *connection*, and only when the connection is not working:
          a conversation that has silently stopped arriving is the one thing
          this screen exists to not let happen, and neither the bar nor the
          roster has a word for it. So `describeAudio` returns null while the
          audio is connected and there is no card at all, which is every
          ordinary moment in a channel.

          **Not drawn to somebody who has not stepped in**, as the card it
          replaces was not. There is no session to report on, and the one
          status that is true of an onlooker — the audio having moved to
          another device — is already a sentence under the roster, said
          there in terms of the room rather than of the transport.

          The recording warning went the same day and on its own argument.
          It said that being silenced is not being unrecorded, which is true
          of the bytes — a silenced stem reaches the bucket ungated, see
          server/src/export.ts — and false of everything a person can reach:
          the mix, a single speaker's stem and the transcript are all gated
          from the same function, deliberately so it cannot be right in one
          place and wrong in another. What the sentence described was the
          inside of the recorder, and it was read as a warning about being
          overheard. The accurate version of it is on the privacy page,
          which is where a fact about retention belongs.
        */}
        {iAmPresent &&
        (audioNote !== null || audio.playbackBlocked || audio.micSilent) ? (
          <>
            <SectionLabel>Audio</SectionLabel>
            <Card style={styles.stack}>
              {audioNote !== null ? (
                <Text style={audioTone(audio.status)}>{audioNote}</Text>
              ) : null}
              {/*
                The browser's two, and they are the reason this card is drawn
                at all while the status is `connected` — which is the state
                both of them happen in. On a phone both are constants and
                nothing below this ever renders; see `SessionAudio`.
              */}
              {audio.playbackBlocked ? (
                <PlaybackBlocked onAllow={audio.allowPlayback} />
              ) : null}
              {audio.micSilent ? <MicrophoneSilent /> : null}
            </Card>
          </>
        ) : null}

        {/*
          Its own card since 2026-09-15, having been a panel at the foot of
          the microphone's. It outlived that card for the reason it was never
          really part of it: the panel is an asked-versus-actual comparison
          against the audio session, which is a different subject from
          whether anybody can hear you, and it is drawn for an account rather
          than for a state.

          Shown only to an account with the `debug` column set, which is
          nobody by default — see server/src/db.ts. Not temporary and does
          not need deleting before the next upload: it is invisible to every
          account that has not been switched on, and switching one off is an
          `UPDATE` and a reconnect. DECISIONS.md § *How the diagnostic panel
          comes out, and what would trigger it* says who decides and names
          every piece.

          Not on web, whatever the column says. The comparison is against
          `AVAudioSession` — the category, the mode, the route, the engine's
          mute mode — and a browser has none of those. `useSessionAudio.web.ts`
          reports `asked` as permanently null by construction, so the panel
          would render a column of blanks and invite somebody to debug the
          wrong layer. See planning/decisions/DECISIONS.md § *The web app is a
          secondary interface*.
        */}
        {iAmPresent && app.debug && Platform.OS !== 'web' ? (
          <>
            <SectionLabel>Audio diagnostics</SectionLabel>
            <Card style={styles.stack}>
              <AudioDebugPanel
                asked={audio.asked}
                onReconnect={audio.reconnect}
                onResubscribe={audio.resubscribe}
              />
            </Card>
          </>
        ) : null}

          </>
        ) : null}

        {shown === 'notepad' ? (
          <>
        {/*
          **What the channel has written down**, which is two things: the
          clipboard, which is the last thing somebody in it handed everybody
          else, and the notepad, which is what the channel is *for*.

          They belong together because they are the same kind of thing at two
          speeds. Both are text the channel holds rather than a control on the
          room; one is replaced whenever anybody pastes, the other is written
          once and rarely changed. Nothing here claims audio, nothing here is
          refused by the floor, and neither is worth a line on every other tab.

          **The clipboard is first, since 2026-09-13.** The order was the other
          way when the notepad arrived here, on the reading that what a channel
          is for comes before what somebody just pasted. What a person opens
          this tab for is the paste: it is minutes old, it is the reason they
          were told to look, and the notepad is a standing sheet that changes
          about as often as the channel's name. The fast half goes at the top.

          **Named *Notepad* rather than *Notes*.** *Notes* reads as a list of
          them, one per thing somebody wanted to say, which is what this tab is
          not: it is one surface the channel keeps, written over. A notepad is
          a single sheet, which is exactly that.

          **And it is written on here**, since 2026-09-12 — the section carries
          the same name as the tab because it is the thing the tab is named
          after. It arrived read-only, on the reasoning that changing it is a
          settings act and Settings is a tap away in the header; what killed
          that is the word. A notepad you can read but must go to another
          screen to write on is not one, and it sits directly under a clipboard
          anybody present replaces in place.

          `mayWriteNotepad` is `canEditChannel`, the same gate the name keeps.
        */}
        <SectionLabel>Shared clipboard</SectionLabel>
        <Card style={styles.stack}>
          {clipError ? <Text style={styles.warning}>{clipError}</Text> : null}

          {clip ? (
            <>
              <Text style={type.heading}>Pasted by {nameOf(clip.authorId)}</Text>
              {/* One line: never more than fits, and a short paste therefore
                  shows in full. The bound is the line, not some notion of
                  withholding — enough to tell which link this is without
                  turning the card into a place long things are read, a
                  channel screen being one that gets left face-up on tables.
                  `numberOfLines` truncates with an ellipsis, so anything
                  longer says how it begins and stops. */}
              <Text style={type.body} numberOfLines={1}>
                {clipPreview}
              </Text>
              <Text style={type.muted}>{ago(now - clip.pastedAt)}</Text>

              <View style={styles.buttonRow}>
                <Button
                  label={
                    copied === 'done'
                      ? '✓ copied'
                      : copied === 'failed'
                        ? '✗ copy failed'
                        : 'Copy'
                  }
                  variant="primary"
                  style={styles.flexButton}
                  onPress={() => void copyClip()}
                />
                {clipUrl ? (
                  <Button
                    label="Open"
                    style={styles.flexButton}
                    onPress={() => void openUrl(clipUrl)}
                  />
                ) : null}
                <Button
                  label="Clear"
                  style={styles.flexButton}
                  disabled={!canClearClip(channel, me)}
                  onPress={() => act({ type: 'CLEAR_CLIP' })}
                />
              </View>
            </>
          ) : (
            <Empty>Nothing on the channel clipboard.</Empty>
          )}

          <Button
            label={clip ? 'Replace with my clipboard' : 'Paste my clipboard'}
            disabled={!canPasteClip(channel, me)}
            onPress={() => void pasteClip()}
          />

          <Text style={type.muted}>
            {canPasteClip(channel, me)
              ? 'One clipboard for the channel — pasting replaces what is on it, and anyone here can copy it.'
              : 'Step in to put something on the channel clipboard.'}
          </Text>
        </Card>

        {/*
          **Plain text, and a small *Edit*, since 2026-09-13.** The field that
          moved here from Settings brought a markdown parser, a live preview
          and two lines explaining which five marks worked; a notepad is a
          sheet somebody writes a reading list on, and none of that is what a
          sheet of paper does. What the card shows now is the words — the same
          words, to the person who may write them and to the person who may
          not — with the box appearing in their place only when *Edit* is
          pressed. The character cap is the one thing kept, that being the
          server's rule rather than a flourish.
        */}
        <SectionLabel>Notepad</SectionLabel>
        {/*
          In a card, which it was not when it sat above the tabs. There it was
          the first prose on the screen, under the header's rule, and a card
          around it would have been a box around the only thing there was. Here
          it has a section label over it and a card under it, and bare prose
          between the two reads as text that has come loose from something.
        */}
        {/*
          Brought wholly into view when the keyboard opens over it.

          **Not a `KeyboardAvoidingView` of its own**, which is the obvious
          reading of the problem and the wrong one: this screen is a `Screen`,
          so the box is already inside the application's one avoider, and a
          second one nested in it counts the keyboard's height twice on iOS
          and leaves a gap that tall under the card. What the avoider does not
          do is *scroll*, and the notepad sits far enough down a long tab that
          shortening the viewport can leave it under the keyboard entirely.

          Open while the box is showing rather than while it has focus: it is
          the only field on this tab, so any keyboard here is that one's. The
          card is the unit rather than the field, because a reveal that
          stopped at the field would leave *Done* and the character count
          beneath the keyboard.

          A `Reveal` rather than the hook it wraps, because the hook has to be
          called from inside the screen and this component is the one that
          renders it — called up there it reads no provider and moves nothing,
          which is how this shipped not working the first time. See
          `RevealContext`.
        */}
        <Reveal when={notepadEditing}>
          <Card style={styles.stack}>
            {notepadEditing ? (
              <>
                <Field
                  value={notepad}
                  onChangeText={(v) =>
                    setNotepad(v.slice(0, MAX_CHANNEL_DESCRIPTION_LENGTH))
                  }
                  placeholder="Links, a reading list, what this is for…"
                  autoCapitalize="sentences"
                  autoFocus
                  multiline
                  onBlur={persistNotepad}
                />
                <Text style={styles.count}>
                  {notepad.length} / {MAX_CHANNEL_DESCRIPTION_LENGTH}
                </Text>
                {/*
                  *Done* writes and puts the sheet back. Blur writes too — the
                  keyboard going down, or a tap somewhere else on the tab — so
                  nothing here depends on this button being found; it is the way
                  out of the box for somebody who has stopped typing, a
                  multiline field having no return key that means finished.
                */}
                <Button
                  label="Done"
                  variant="primary"
                  onPress={() => {
                    persistNotepad();
                    setNotepadEditing(false);
                  }}
                />
              </>
            ) : (
              <>
                {notepadShown.trim() ? (
                  <Text style={styles.description}>{notepadShown}</Text>
                ) : (
                  // Said rather than left blank, and it says what would change
                  // it: a card with a heading and nothing under it reads as
                  // something that failed to load.
                  <Text style={type.muted}>
                    {mayWriteNotepad
                      ? 'Nothing on the notepad. Write on it.'
                      : 'Nothing on the notepad. Step in to write on it.'}
                  </Text>
                )}

                {mayWriteNotepad ? (
                  <Button
                    label="Edit"
                    variant="ghost"
                    style={styles.notepadEdit}
                    onPress={() => setNotepadEditing(true)}
                  />
                ) : notepadShown.trim() ? (
                  <Text style={type.muted}>
                    Step in to write on this. It is what the channel is for, and
                    that is for whoever is in it to say.
                  </Text>
                ) : null}
              </>
            )}
          </Card>
        </Reveal>

          </>
        ) : null}

        {shown === 'player' ? (
          <>

        {/*
          No label over it, since 2026-09-13. The tab is called *Player* and
          this is the only thing on it, so SHARED AUDIO was the screen saying
          its own name twice — and the card's own sentence, at the foot of
          it, already says that everyone hears this. The recording transport
          one tab over has gone the same way, and for the same reason.
        */}
        <Card style={styles.stack}>
          {playback.failure ? (
            <Text style={styles.warning}>
              Playback stopped — {playback.failure}
            </Text>
          ) : null}
          {uploadError ? <Text style={styles.warning}>{uploadError}</Text> : null}

          {track ? (
            <>
              <Text style={type.heading} numberOfLines={1}>
                {track.title}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(
                        100,
                        (position / Math.max(1, track.durationMs)) * 100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressTime}>
                  {formatDuration(position)}
                </Text>
                <Text style={styles.progressTime}>
                  {formatDuration(track.durationMs)}
                </Text>
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label="−15s"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: 'SEEK', positionMs: position - SKIP_MS })
                  }
                />
                <Button
                  label={playback.status === 'playing' ? 'Pause' : 'Play'}
                  variant="primary"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: playback.status === 'playing' ? 'PAUSE' : 'PLAY' })
                  }
                />
                <Button
                  label="+15s"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: 'SEEK', positionMs: position + SKIP_MS })
                  }
                />
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label="Quieter"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback || playback.volume <= 0}
                  onPress={() =>
                    act({
                      type: 'SET_VOLUME',
                      volume: quieter(playback.volume),
                    })
                  }
                />
                <View style={styles.volumeReadout}>
                  <Text style={styles.progressTime}>
                    {Math.round(playback.volume * 100)}%
                  </Text>
                </View>
                <Button
                  label="Louder"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback || playback.volume >= 1}
                  onPress={() =>
                    act({
                      type: 'SET_VOLUME',
                      volume: louder(playback.volume),
                    })
                  }
                />
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label={upload ? uploadingLabel(upload.percent) : 'Change'}
                  style={styles.flexButton}
                  disabled={!mayLoadTrack || uploading}
                  onPress={loadTrack}
                />
                {/*
                  The one control on this card with no floor and no presence
                  behind it, for the reason the recordings list gives about its
                  own: taking a copy is a read. It changes nothing anybody in
                  the room can hear, so the rule about who decides what plays
                  has no business governing it — and what is greyed out while
                  somebody else holds the floor stays a statement about what
                  would change the room.
                */}
                <Button
                  label={trackSharing ? 'Preparing…' : 'Share'}
                  style={styles.flexButton}
                  disabled={trackSharing}
                  onPress={takeTrack}
                />
                <Button
                  label="Remove"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() => act({ type: 'CLEAR_TRACK' })}
                />
              </View>
            </>
          ) : (
            <Button
              label={upload ? uploadingLabel(upload.percent) : 'Play something together'}
              sublabel="An audio file from this phone"
              disabled={!mayLoadTrack || uploading}
              onPress={loadTrack}
            />
          )}

          {upload ? (
            // Outside both branches above, because an upload can be a first
            // track or a replacement and the way out is the same either way.
            // Disabled for the moment before the bytes move: the picker has
            // closed, there is no task yet, and a Cancel that did nothing
            // would read as the stuck upload it exists to escape.
            <Button
              label="Cancel upload"
              variant="ghost"
              disabled={!upload.cancel}
              onPress={() => upload.cancel?.()}
            />
          ) : null}

          <Text style={type.muted}>
            {theyHoldFloor
              ? // The point of the mechanic, stated where it bites: the track
                // does not stop, but it stops being yours to change.
                `${holderName} has the floor, so they decide what plays.`
              : iHoldFloor
                ? 'You have the floor — only you can change what plays.'
                : !mayControlPlayback
                  ? // The only remaining way these are disabled, the floor
                    // having been ruled out by the two branches above.
                    'Step in to put something on. What everybody is listening to is for whoever is listening.'
                  : !mayLoadTrack
                    ? // In the room's sense but not in the room: the channel is
                      // empty, so what is here is yours to drive and is not
                      // yours to replace. Said because two controls on this
                      // card are now greyed while the rest are live, which is
                      // otherwise the sort of thing that reads as a bug.
                      'Step in to put something on. What is already here you can still play or clear.'
                    : track
                      ? 'Everyone hears this, and anyone present can change it.'
                      : 'Whatever you play, everyone hears — and it is kept in the recording.'}
          </Text>
        </Card>

          </>
        ) : null}

        {shown === 'recordings' ? (
          <>
        {/*
          The transport, above the list it produces. It was on the *Player*
          tab, one card under the shared audio, on the grounds that recording
          is what playing is doing to the room; but the tab somebody goes to
          about a recording is the one named after them, and having gone there
          to stop one they had to find their way to a different tab to do it.
          Above the list rather than below it, so the control that is about
          right now is not reached past a history that may be any length.

          **Buttons carrying glyphs, since 2026-09-13, and the shape is the
          player's.** It spent a few hours as three bare glyphs huddled at the
          left margin — legible as a group, but drawn unlike every other
          control in the app, and in particular unlike the row of three doing
          the same job one tab over. What starts, holds and ends the shared
          track is `buttonRow` and `flexButton`: filled rectangles in equal
          thirds across the width. This is the same act on the same screen, so
          it is the same row, and a hand that has learnt one has learnt both.
          The glyphs stay — record, pause and stop are older than any wording
          of them — and each carries its word beneath it, in `sublabel`.

          **The word under the glyph arrived later the same day, with the
          paragraphs under the row leaving.** The case for a bare glyph is
          that a shape which has meant one thing since tape does not need a
          caption, and it holds right up until the shape is `disabled`: an
          inert grey square says neither what it does nor why it will not do
          it, and the answer used to be four muted paragraphs underneath.
          One word apiece costs a line of the row's height and takes the
          first half of that question away from the prose, which is what
          made removing the rest of it affordable. It is the footer's shape —
          a glyph over its word — and the footer is the other place in this
          app where three or four states sit in one row and half of them are
          refusals.

          Always all three, and in this order: start, hold, end, which is the
          run's own order and puts the irreversible one last where a thumb
          moving in a hurry is least likely to land on it. What is available
          is what is legible: a control you may press is filled, one you may
          not is `disabled` with a `textFaint` glyph and inert. Nothing
          appears or disappears, so the shapes stay where the thumb learned
          them.

          **In a `Card`, since 2026-09-13, which is the shared track's shape
          one tab over.** The row was bare on the background, and the
          argument above — that this is the same act as the player's
          transport and so is the same row — does not stop at the row: that
          one sits on `surface` with its failure lines under it, and so does
          this. A group of filled rectangles with nothing behind them reads
          as loose on a screen where everything that is a thing is on a card.
          What is inside is the transport and what went wrong; the list
          below is its own section and stays outside.

          Still no RECORDING label above it, which is the part of the
          bare-glyph pass that was right: the state of the run is reported in
          the header, and the tab is already named after these — and the
          words beneath the glyphs name the three acts rather than the
          object, so none of them is that label under another name.
        */}
        <Card style={styles.stack}>
          <View style={styles.buttonRow}>
            {/*
              Record and Resume are one control, because they are one idea —
              *start capturing* — and a paused run is the only state where the
              second is what that means. Splitting them would put a fourth
              button on a row whose whole argument is that the positions do not
              move.

              `primary` for the same reason Play has it one tab over: it is the
              one of the three somebody came here to press, and the other two
              are only reachable once it has been. Stop is not `danger` — that
              fill is spent on deletion, and ending a run keeps what it
              captured.
            */}
            <Button
              label={
                channel.recording.status === 'paused'
                  ? 'Resume recording'
                  : 'Record'
              }
              sublabel={
                channel.recording.status === 'paused' ? 'Resume' : 'Record'
              }
              variant="primary"
              style={styles.flexButton}
              icon={(color) => <RecordingsIcon color={color} />}
              disabled={
                channel.recording.status === 'paused'
                  ? !canResumeRecording(channel, me)
                  : !canStartRecording(channel, me)
              }
              onPress={() =>
                act({
                  type:
                    channel.recording.status === 'paused'
                      ? 'RESUME_RECORDING'
                      : 'START_RECORDING',
                })
              }
            />
            <Button
              label="Pause recording"
              sublabel="Pause"
              style={styles.flexButton}
              icon={(color) => <PauseIcon color={color} />}
              disabled={!canPauseRecording(channel, me)}
              onPress={() => act({ type: 'PAUSE_RECORDING' })}
            />
            <Button
              label="Stop recording"
              sublabel="Stop"
              style={styles.flexButton}
              icon={(color) => <StopIcon color={color} />}
              disabled={!canStopRecording(channel, me)}
              onPress={() => act({ type: 'STOP_RECORDING' })}
            />
          </View>

          {/*
            **What is left under the row is failure, and nothing else**, since
            2026-09-13. Four muted paragraphs used to hang here — what the last
            run captured, that the channel records itself, and the reason a
            grey control is grey — on the reasoning that a glyph cannot say any
            of it. The glyphs now carry their words, and three of the four were
            answering a question that is answered elsewhere on the way here: the
            run's state is the header's pill, what was saved is the list
            immediately below, and `autoRecord` is a switch in this channel's
            settings, set by somebody who was there when it was set. A greyed control
            with a paragraph under it is also a paragraph read before every
            recording and skipped after the second.

            A capture that stopped for a reason nobody asked for is the
            exception, in both tenses, because nothing else on this screen
            reports it and a recording that was not kept is not something to
            find out later.
          */}
          {channel.recording.failure ? (
            // Capture stopping for a reason nobody asked for must not read like
            // a recording somebody chose to end. Whoever was speaking on the
            // strength of the indicator needs to know it was not kept.
            <Text style={styles.warning}>
              Recording failed — {channel.recording.failure}
            </Text>
          ) : null}

          {/*
            The same about the run before this one. This line used to report
            every finished run — *Saved — 4:12 captured* — which is the list
            directly below it saying the same thing in the same place; a run
            that ended early is the half that list cannot tell you, since there
            it is only a short recording.
          */}
          {channel.recording.status === 'idle' &&
          channel.lastRecording?.failure ? (
            <Text style={styles.warning}>
              Ended early — {formatDuration(channel.lastRecording.durationMs)}{' '}
              captured.
            </Text>
          ) : null}
        </Card>

        {/*
          Recordings live here because they belong to the channel: it names
          them, its members are who may hear them, and deleting it deletes
          them. They were on Home, which put every conversation you had ever
          recorded into one list belonging to nothing.
        */}
        <SectionLabel>Recordings</SectionLabel>
        {/*
          Above the list, because the question it answers — which conversation
          was that in — is one the list itself cannot answer. Only shown once
          something in this channel has been transcribed.
        */}
        {recordings.some((r) => r.transcript?.state === 'ready') ? (
          <TranscriptSearch
            channelId={channelId}
            onOpen={(recordingId) => setTranscriptFor(recordingId)}
          />
        ) : null}
        {recordings.length === 0 ? (
          <Empty>Nothing recorded here yet.</Empty>
        ) : (
          <View style={styles.stack}>
            {recordings.map((r) => (
              <RecordingRow
                key={r.id}
                recording={r}
                // Playing one loads it as the channel's shared track, so it is
                // governed by exactly what governs a track somebody uploaded —
                // including the floor-holder's say over what plays.
                playable
                playDisabled={!mayControlPlayback}
                playDisabledReason={
                  channel.floor.holder
                    ? 'the floor decides what plays'
                    : 'step in to play'
                }
                manageable={iHaveTheRoom}
                onOpenTranscript={() => setTranscriptFor(r.id)}
              />
            ))}
          </View>
        )}
          </>
        ) : null}

        {shown === 'watch' ? (
          <>
          {/*
            Watching, which is deliberately not a second kind of shared audio.
            Nothing about the video travels through The Floor — everybody's own
            player shows it, with its own sound, and what this card drives is a
            clock. That is why it refuses recordings and why the shared audio on
            the *Player* tab empties when this one fills.
          */}
          <SectionLabel>Watch together</SectionLabel>
          <Card style={styles.stack}>
            {watch.failure ? (
              <Text style={styles.warning}>
                The watch party stopped — {watch.failure}
              </Text>
            ) : null}
            {watchError ? <Text style={styles.warning}>{watchError}</Text> : null}
            {watchNote ? <Text style={type.muted}>{watchNote}</Text> : null}

            {party ? (
              <>
                {/*
                  The film itself, when this device is the one showing it.

                  **The Floor still carries no video.** This is YouTube's own
                  player, unmodified and unobscured, playing its own picture
                  with its own sound; what travels through this application is
                  a position and a clock, exactly as it was when the player
                  lived on a laptop. What changed is the window.
                */}
                {screeningHere ? (
                  <WatchPlayer
                    watch={watch}
                    channelId={channelId}
                    // **The player's own controls are these buttons, reached
                    // the other way round.** A press on YouTube's bar used to
                    // be obeyed for a quarter of a second and then corrected
                    // away; it now moves the channel, for exactly the people
                    // the buttons below are enabled for, and comes back to
                    // every screen as an ordinary snapshot. For everybody
                    // else the frame does not answer at all, which is the
                    // greyed button said by the video.
                    mayControl={mayControlWatch}
                    onDuration={(durationMs) =>
                      act({ type: 'WATCH_READY', durationMs })
                    }
                    onIntent={(intent) => {
                      if (intent.do === 'play') act({ type: 'WATCH_PLAY' });
                      else if (intent.do === 'pause') act({ type: 'WATCH_PAUSE' });
                      else
                        act({
                          type: 'WATCH_SEEK',
                          positionMs: intent.positionMs,
                        });
                    }}
                  />
                ) : null}
                <Text style={type.heading} numberOfLines={1}>
                  {party.url}
                </Text>
                {party.durationMs ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(
                              100,
                              (watchAt / Math.max(1, party.durationMs)) * 100
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.progressLabels}>
                      <Text style={styles.progressTime}>
                        {formatDuration(watchAt)}
                      </Text>
                      <Text style={styles.progressTime}>
                        {formatDuration(party.durationMs)}
                      </Text>
                    </View>
                  </>
                ) : (
                  // No bar until a screen has said how long the video is —
                  // nothing here asks YouTube anything, so until then the only
                  // honest thing to show is how far in everybody is.
                  <Text style={styles.progressTime}>
                    {formatDuration(watchAt)} in
                  </Text>
                )}

                <View style={styles.buttonRow}>
                  <Button
                    label="−15s"
                    style={styles.flexButton}
                    disabled={!mayControlWatch}
                    onPress={() =>
                      act({ type: 'WATCH_SEEK', positionMs: watchAt - SKIP_MS })
                    }
                  />
                  <Button
                    label={watch.status === 'playing' ? 'Pause' : 'Play'}
                    variant="primary"
                    style={styles.flexButton}
                    disabled={!mayControlWatch}
                    onPress={() =>
                      act({
                        type:
                          watch.status === 'playing' ? 'WATCH_PAUSE' : 'WATCH_PLAY',
                      })
                    }
                  />
                  <Button
                    label="+15s"
                    style={styles.flexButton}
                    disabled={!mayControlWatch}
                    onPress={() =>
                      act({ type: 'WATCH_SEEK', positionMs: watchAt + SKIP_MS })
                    }
                  />
                </View>

                {/*
                  Muting the room, which is a different act from muting yourself
                  and says so. Watching something together is mostly not talking,
                  and every open microphone in a party is one pointed at
                  somebody's screen — so this is the remedy for the bleed as well
                  as for the noise.

                  It restores nothing when cleared: each person's own mute is
                  theirs and comes back exactly as they left it. See
                  `WatchState.mutedAll`.
                */}
                <Button
                  label={muteRequested ? 'Unmute the room' : 'Mute the room'}
                  sublabel={
                    muteRequested
                      ? 'Everyone can speak again; your own mute is unchanged'
                      : 'Quiet while the video plays; pause to talk'
                  }
                  disabled={!mayControlWatch}
                  onPress={() =>
                    act({ type: 'SET_WATCH_MUTE', muted: !muteRequested })
                  }
                />

                {/*
                  Changing what is on without stopping first.

                  Without it the only route from one video to the next is Stop
                  and start again, which empties the card, drops the followers to
                  "Nothing is playing", and makes a continuous evening read as
                  two unrelated ones. `START_WATCH` already replaces a party in
                  place — this is the interface catching up with what the reducer
                  could always do.
                */}
                {changing ? (
                  <>
                    <Field
                      value={watchUrl}
                      onChangeText={setWatchUrl}
                      placeholder="Paste a YouTube link"
                      autoFocus
                      editable={mayStartWatch}
                    />
                    <View style={styles.buttonRow}>
                      <Button
                        label="Watch this instead"
                        variant="primary"
                        style={styles.flexButton}
                        disabled={!mayStartWatch || !pastedIsLink}
                        onPress={() => {
                          act({ type: 'START_WATCH', url: watchUrl.trim() });
                          setWatchUrl('');
                          setChanging(false);
                        }}
                      />
                      <Button
                        label="Cancel"
                        variant="ghost"
                        style={styles.flexButton}
                        onPress={() => {
                          setWatchUrl('');
                          setChanging(false);
                        }}
                      />
                    </View>
                  </>
                ) : (
                  <View style={styles.buttonRow}>
                    <Button
                      label="Change video"
                      style={styles.flexButton}
                      disabled={!mayStartWatch}
                      onPress={() => setChanging(true)}
                    />
                    <Button
                      label="Stop"
                      variant="ghost"
                      style={styles.flexButton}
                      disabled={!mayControlWatch}
                      onPress={() => act({ type: 'STOP_WATCH' })}
                    />
                  </View>
                )}

                {/*
                  Two links and they are not the same kind of thing, which is why
                  the labels name which is which rather than both saying "Copy".

                  **The video's** is public: a YouTube URL anybody may hold, and
                  the one to send to somebody who is not in this channel at all.
                  **The screen's** is a credential — the token rides in its
                  fragment and follows this channel for six hours — and is for
                  another device belonging to somebody already here.

                  Copying rather than sharing, both of them, because the share
                  sheet is for sending to a person and a clipboard is for putting
                  somewhere: a note, a browser on the desk, the other half of a
                  conversation happening elsewhere. `shareWatchLink` is still
                  below for the sending case.
                */}
                {/*
                  Where to watch, which is two buttons and almost never three
                  taps.

                  **Not "Play here".** *Play* is the transport's word, and the
                  Play/Pause control is inches above this one — two acts
                  sharing one word on one screen is the drift GLOSSARY.md
                  exists to prevent. *Watch* is the feature's word and names
                  the state these set.

                  The picker below appears only when there is more than one
                  other device to choose between, which is unusual: one other
                  is not a choice, and is taken without asking.
                */}
                <View style={styles.buttonRow}>
                  <Button
                    label={screeningHere ? 'Watching here' : 'Watch here'}
                    style={styles.flexButton}
                    variant={screeningHere ? 'primary' : undefined}
                    onPress={() => {
                      setChoosing(false);
                      app.showScreenFor(channelId);
                    }}
                  />
                  <Button
                    label="Watch on another device"
                    style={styles.flexButton}
                    onPress={() => {
                      setChoosing(true);
                      app.listScreens();
                    }}
                  />
                </View>

                {choosing && otherScreens.length > 1
                  ? otherScreens.map((screen) => (
                      <Button
                        key={screen.device}
                        label={screenLabel(screen)}
                        sublabel={
                          screen.watching
                            ? 'Already showing something'
                            : undefined
                        }
                        onPress={() => {
                          app.useScreen(channelId, screen.device);
                          setChoosing(false);
                        }}
                      />
                    ))
                  : null}

                {choosing && otherScreens.length === 0 ? (
                  // The case this cannot solve for somebody. Signing in
                  // elsewhere is an errand, and the tempting fix — a link that
                  // did it for them — would put a full session credential in
                  // whatever they pasted it into. See planning/WATCH-IN-APP.md.
                  <Text style={type.muted}>
                    <Text style={styles.emphasis}>
                      No other device is signed in.
                    </Text>{' '}
                    Open The Floor on a laptop or tablet and sign in there, and
                    it will show up here as somewhere to watch.
                  </Text>
                ) : null}

                <Button
                  label={copyLabel('video', 'Copy video link')}
                  variant="ghost"
                  onPress={() => void copyVideoLink()}
                />

                {/*
                  "Open on this phone" was here and is gone as of 2026-08-23. It
                  handed the video to the device's own YouTube app at the right
                  second, and could correct nothing after that — a player outside
                  this app runs on its own clock, so it drifted from the party
                  from the moment it started. It was the one control here that
                  did not follow the channel.

                  What replaced it is "Copy video link" above: the same link, on
                  the clipboard, for whoever actually wants to open it somewhere
                  else. That is the honest version of the same act — it does not
                  imply the party goes with it.
                */}
              </>
            ) : (
              <>
                <Field
                  value={watchUrl}
                  onChangeText={setWatchUrl}
                  placeholder="Paste a YouTube link"
                  editable={mayStartWatch}
                />
                <Button
                  label="Watch something together"
                  variant="primary"
                  disabled={!mayStartWatch || !pastedIsLink}
                  onPress={() => {
                    act({ type: 'START_WATCH', url: watchUrl.trim() });
                    setWatchUrl('');
                  }}
                />
                {/*
                  Nothing offers a screen until there is something to show on
                  one. The choice belongs to a film — it is cleared when one
                  ends and asked again for the next — so an idle card has
                  nothing to ask.
                */}
              </>
            )}

            {/*
              Why the room is quiet, or why it is not.

              The headphone advice used to be the third branch here and is gone
              as of 2026-08-23. It warned about a leak — a microphone hearing its
              owner's own screen and sending the video back into the channel — at
              a time when an unmuted room was the norm. Muting is the default
              now, so the leak is prevented rather than advised against, and
              whoever deliberately unmutes is the last person who needs telling.
              The reasoning it carried is DECISIONS.md § *A watch party leaks into
              the channel through the microphone*, which is where it belongs: the
              constraint is still true, it is just no longer news.
            */}
            {party ? (
              partyMuted ? (
                // A room that has stopped carrying voices is otherwise
                // indistinguishable from a room where nobody is talking, so it
                // says which, and how to get out of it.
                <Text style={type.muted}>
                  <Text style={styles.emphasis}>The room is muted.</Text> No
                  microphone is open, so nothing leaks in from anybody's screen.
                  Pause the video to talk.
                </Text>
              ) : muteRequested ? (
                // Muted, but paused — so everybody has their voice back without
                // having asked for it. Said because the silence *returning* on
                // the next tap of Play would otherwise be the surprise: this is
                // the one moment somebody learns the rule.
                <Text style={type.muted}>
                  <Text style={styles.emphasis}>Paused, so you can talk.</Text>{' '}
                  The room goes quiet again when the video resumes.
                </Text>
              ) : (
                // Explicitly unmuted, which is a choice somebody made against the
                // default. Said plainly rather than left silent, because it is
                // the state in which the channel behaves least like the rest of
                // the watch party.
                <Text style={type.muted}>
                  <Text style={styles.emphasis}>The room is unmuted.</Text>{' '}
                  Everybody can be heard, including whatever their own screen is
                  playing.
                </Text>
              )
            ) : null}

            <Text style={type.muted}>
              {!mayWatchHere
                ? // First, because it outranks the rest: somebody outside a
                  // conversation that is going on has no use for being told whose
                  // floor it is or that a recording is running. It is also the
                  // only reason here that greys the second screen as well as
                  // everything else.
                  'Step in to start a watch party. What everybody is watching is for whoever is here.'
                : recordingLive
                  ? // Said out loud rather than left as a dead button. The two are
                    // exclusive because the video's sound never reaches The Floor,
                    // so a recording made alongside one would be missing the thing
                    // everybody was reacting to.
                    'Stop the recording first — a watch party is not recorded.'
                  : theyHoldFloor
                    ? `${holderName} has the floor, so they decide what plays.`
                    : iHoldFloor
                      ? 'You have the floor — only you can change what plays.'
                      : !mayStartWatch
                        ? // The empty channel, from outside it. Starting asks
                          // presence and the transport does not, so Stop is live
                          // beside a greyed Change video — see `canStartWatch`.
                          party
                          ? 'Step in to put something else on. What is here you can still stop.'
                          : 'Step in to start a watch party. Everybody watches in the app, here or on another of their own devices.'
                        : party
                          ? 'Everyone watches on their own screen, in step. Nothing about it is recorded.'
                          : 'Everybody watches in the app, in step — here, or on another device you are signed in on. Recording is off while a party is on.'}
            </Text>
          </Card>
          </>
        ) : null}

        {shown === 'invites' ? (
          <>
            {/*
              Two ways in, in the order they are reached for: a contact who
              already has an account, then a link for somebody who has not.
              The *Who gets in* heading that used to stand over the pair is
              gone — the tab above says it, and said twice it reads as two
              different claims.

              The first of the pair is headed *Contacts* rather than *Invite*
              as of 2026-09-12, when the tab itself became *Invite*: a heading
              repeating the tab immediately above it names nothing, where the
              pair *Contacts* and *Guest link* says which of the two ways in
              each card is.
            */}
        <SectionLabel>Contacts</SectionLabel>
        <Card style={styles.stack}>
          <InviteList
            channel={channel}
            me={me}
            mayInvite={iHaveTheRoom}
            onInvite={(contactId) => act({ type: 'INVITE', contactId })}
          />
        </Card>

        {/*
          Below inviting a contact, and it is the rarer of the two: a guest
          link is for somebody who is not here at all, has no account, and is
          not going to get one. Whoever is in the room has to let them in, so
          sharing the link is the beginning of the process rather than the end
          of it — which is why this says so rather than reading as "sent".
        */}
        <SectionLabel>Guest link</SectionLabel>
        <Card style={styles.stack}>
          <Text style={type.muted}>
            A link anybody can open in a browser. They knock, and whoever is in
            the channel decides. Manage the links this channel has in Settings.
          </Text>
          <Button
            label={
              sharing
                ? 'Making a link…'
                : // What it is about to do, rather than what it would rather
                  // do: a browser with no share sheet can keep the second
                  // promise and not the first. See src/share.ts.
                  canShare
                  ? 'Share a guest link'
                  : 'Copy a guest link'
            }
            disabled={sharing || !canInviteGuest(channel, me)}
            onPress={async () => {
              setSharing(true);
              setShareError(null);
              setShareNote(null);
              try {
                const url = await app.inviteGuest(channel.id);
                // After the mint and not before it: the rung claims a guest
                // link exists, and until this resolves none does.
                app.markTried('guest');
                const handoff = await shareLink(url);
                if (handoff === 'copied') {
                  setShareNote('Link copied. Paste it wherever you like.');
                } else if (handoff === 'failed') {
                  setShareError('The link would not copy. Try again.');
                }
              } catch (error) {
                setShareError(
                  error instanceof Error ? error.message : 'That did not work.'
                );
              } finally {
                setSharing(false);
              }
            }}
          />
          {canInviteGuest(channel, me) ? null : (
            <Text style={type.muted}>
              Step in to make a link. Who can get into a conversation is for
              the people having it.
            </Text>
          )}
          {shareError ? <Text style={styles.warning}>{shareError}</Text> : null}
          {shareNote ? <Text style={type.muted}>{shareNote}</Text> : null}
        </Card>
          </>
        ) : null}
    </Screen>
  );
}

/**
 * One of the four controls in the pinned footer: an icon, a word, and the
 * same guard its card uses.
 *
 * Not a `Button`. `Button` is a filled rectangle sized for a card — its
 * variants decide colour and it has no size axis, which is why two callers
 * already reach past it with a `style` prop. Three of them side by side would
 * make the footer heavier than anything it sits under, and the state here is
 * carried by the icon's colour rather than by a fill.
 *
 * `tone` is that colour, and it is a state rather than a variant: `active`
 * means this is the thing currently true of you — you are muted, you hold the
 * floor — and takes the accent; `silenced` is being muted by somebody else's
 * claim, which is the one state on this bar you did not choose. The label
 * takes the same colour as the icon so the two cannot disagree.
 *
 * `hint` is the accessibility label rather than anything drawn. "Mute" beside
 * an icon is enough to read and not enough to hear.
 */
function FooterAction({
  label,
  hint,
  icon,
  disabled,
  selected,
  repeatable,
  tone = 'idle',
  onPress,
}: {
  label: string;
  hint: string;
  icon: (color: ColorValue) => React.ReactNode;
  disabled?: boolean;
  /**
   * This control names a state you are already in — the rung of the ladder you
   * are standing on — so there is nothing for a tap to do.
   *
   * **Accented and inert, which is not the same as disabled.** Grey is this
   * bar's word for *refused*: the floor when nobody else is here, the
   * microphone on a device without one. Being somewhere is not a refusal, and
   * greying the rung you are on would say the interface had stopped you from
   * doing the thing you have already done. The accent is the same one the
   * microphone and the floor use, and means the same thing on all three —
   * *this is true of you now*.
   *
   * Takes precedence over `tone` and `disabled` in the colour below, being the
   * strongest statement any of them make. No caller passes it with either.
   */
  selected?: boolean;
  /**
   * This control names a state you are already in **and a tap still does
   * something** — the one combination the paragraph above does not cover.
   *
   * Only *Nearby* is like this, and it is because of what the rung is: the
   * other two are places you either are or are not, and being nearby is a
   * claim with a clock on it. Tapping the lit rung restarts that clock, which
   * is the renewal somebody asks for from the screen it is drawn on — nearby,
   * card reading "Nearby 14m", and no way to reach the fifteenth minute
   * except leaving the rung and coming back. See `DECLARE_NEARBY` in
   * core/channel.ts.
   *
   * **Accented and live**, so the bar still says where you are standing while
   * the control goes on being one. Nothing visible distinguishes it from an
   * inert rung, deliberately: what a tap here does is invisible until the
   * number under it moves, and a fourth appearance for one slot would be
   * teaching the bar a word for something nobody is looking for.
   */
  repeatable?: boolean;
  tone?: 'idle' | 'active' | 'silenced';
  onPress: () => void;
}) {
  const color = selected
    ? colors.floor
    : disabled
      ? colors.textFaint
      : tone === 'silenced'
        ? colors.silenced
        : tone === 'active'
          ? colors.floor
          : colors.text;
  const inert = !!disabled || (!!selected && !repeatable);
  /**
   * The disc behind the control, which says the same thing the colour does and
   * is drawn wherever the colour is not `text`: the rung you are standing on,
   * the microphone you have shut, the floor you hold, the silence somebody
   * else imposed. Not on a refusal — grey on a tinted disc would read as a
   * control that is on and unavailable at once, which is neither of the two
   * things this bar says.
   *
   * **Behind the glyph *and* the label, since 2026-09-10**, where it used to
   * ring the glyph alone. What gets read here is the pair — the label is what
   * makes the icon legible the first time, per the footer's own note — so the
   * thing the disc is selecting is the pair, and a disc that stopped above the
   * word drew a boundary through the middle of one control.
   */
  // `selected` first, since a lit rung is accented whether or not a tap still
  // does anything on it — see `repeatable`, which takes it out of `inert`
  // without taking it off the bar.
  const accented = !!selected || (!inert && tone !== 'idle');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      // `selected` rather than `disabled` for the rung you are on, so a screen
      // reader says which of the three you are on rather than that two thirds
      // of the bar is unavailable. The hint is written for it: "You are
      // nearby", not "Be nearby".
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.footerAction,
        pressed && !inert && styles.footerActionPressed,
      ]}
    >
      <View style={[styles.footerStack, accented && styles.footerStackAccented]}>
        <View style={styles.footerIcon}>{icon(color)}</View>
        <Text style={[styles.footerLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/*
  `GroupHeading` was here and is gone as of 2026-09-12, with the six tabs.

  It was the heading above a run of sections and the only two-level hierarchy
  in this application's chrome, and it existed for one seam on one screen: this
  one was long enough that *What the channel is carrying* had to be said out
  loud, because a flat column of ten identical labels could not show that the
  last six were a different kind of thing from the first four.

  The switch says it instead, and says it better — the sections below the seam
  are not merely labelled as separate, they are separate, and the scroll each
  of them sits in is its own. A heading was the cheapest way to draw a seam
  through one scroll; it was never the best way, and there is now nothing left
  for it to head.
*/

/**
 * One guest in the room, and the three things a member may do about them.
 *
 * Deliberately not a `ParticipantCard` with a badge. Everything that card
 * shows is about membership — invited, stepped out, waiting, how long since
 * they were heard from — and a guest has none of those states: they are here,
 * or they are gone and their card with them. Sharing the component would mean
 * teaching it which half of itself to hide.
 */
function GuestCard({
  guest,
  muted,
  holdsFloor,
  speaking,
  failing,
  manageable,
  askable,
  asked,
  invited,
  addable,
  onSpeech,
  onEject,
  onAskContact,
  onAskJoin,
  onAddToChannel,
}: {
  guest: Guest;
  muted: boolean;
  holdsFloor: boolean;
  speaking: boolean;
  /**
   * `canManageGuest`, which is presence-or-empty and membership. Both buttons
   * were live to anybody watching until 2026-08-22 and both were refused by
   * the reducer, which is the one shape this codebase does not allow a control
   * to have — and the microphone one renders `primary` when a guest is asking,
   * so the loudest button on the screen was wired to nothing.
   */
  /**
   * The media plane has stopped hearing from them. See `SessionAudio.failing`.
   *
   * Said about a guest for the reason it is said about a member: what the line
   * is for is telling whoever is talking to hold off, and a guest who has been
   * given the microphone is somebody in this conversation. It takes precedence
   * over every other line here, including the floor — a claim held by somebody
   * the room cannot hear is exactly the case worth interrupting.
   */
  failing: boolean;
  manageable: boolean;
  /**
   * Whether *this* member has asked to keep them, and what came of it.
   *
   * Per-reader rather than per-guest: two people in the room may each ask, and
   * a card that read "Asked" because somebody else had would be answering a
   * question this one has not put.
   */
  asked: 'asking' | 'refused' | 'accepted' | undefined;
  /**
   * `canAskGuestJoin` — `manageable` and the seat having no account behind it.
   * Its own guard rather than a `&&` here, so that the control and the reducer
   * are reading the same line.
   */
  askable: boolean;
  /** Whether *this* member has asked them onto The Floor, per `asked`. */
  invited: 'asking' | 'refused' | undefined;
  /**
   * Whether the account behind this seat is an accepted contact of the reader,
   * which is what `INVITE` requires and therefore what the third control is
   * drawn from.
   */
  addable: boolean;
  onSpeech: (maySpeak: boolean) => void;
  onEject: () => void;
  onAskContact: () => void;
  onAskJoin: () => void;
  onAddToChannel: () => void;
}) {
  const status = failing
    ? 'Not receiving you'
    : !guest.maySpeak
    ? guest.request === 'asking'
      ? 'Listening · asking to speak'
      : guest.request === 'refused'
        ? 'Listening · was told no'
        : 'Listening'
    : holdsFloor
      ? 'Has the floor'
      : muted
        ? 'Can speak · muted themselves'
        : speaking
          ? 'Speaking'
          : 'Can speak';

  return (
    <Card style={styles.stack}>
      <Text style={type.body}>
        <Text style={type.heading}>{guest.name}</Text> · guest
      </Text>
      <Text style={[type.muted, failing && styles.statusBad]}>{status}</Text>
      <View style={styles.guestActions}>
        <Button
          // The asking is what makes this urgent rather than administrative,
          // so the button says what it answers.
          label={
            guest.maySpeak
              ? 'Turn their microphone off'
              : guest.request === 'asking'
                ? 'Let them speak'
                : 'Turn their microphone on'
          }
          variant={guest.request === 'asking' ? 'primary' : 'ghost'}
          disabled={!manageable}
          onPress={() => onSpeech(!guest.maySpeak)}
        />
        {/*
          Being in a channel together is permission to ask, which is the rule
          members already have between themselves — and a guest is the one
          person in the room it could not reach, having no account to name.
          Answered on their own page, by them: this only asks.

          Disabled by the same `manageable` its siblings are, so no control
          here can offer something the reducer would refuse.
        */}
        <Button
          label={
            asked === 'asking'
              ? 'Asked'
              : asked === 'refused'
                ? 'They said no'
                : asked === 'accepted'
                  ? 'Contact'
                  : 'Add contact'
          }
          variant="ghost"
          disabled={!manageable || !!asked}
          onPress={onAskContact}
        />
        {/*
          **The weakest ask, and the only one that asks for nothing.** Offered
          to a seat with nobody behind it, because that is the only seat it
          means anything to: what it produces is an account, which an
          identified guest already has. `canAskGuestJoin` is the guard, so the
          control disappearing and the reducer refusing are the same line read
          twice rather than two rules.
        */}
        {guest.accountId ? null : (
          <Button
            label={
              invited === 'asking'
                ? 'Asked'
                : invited === 'refused'
                  ? 'They said no'
                  : 'Ask them to join'
            }
            variant="ghost"
            disabled={!askable || !!invited}
            onPress={onAskJoin}
          />
        )}
        {/*
          **The third rung, and the only one that is a membership.** Drawn only
          once they are a contact, which is what `INVITE` refuses without —
          and it is an ordinary invitation from here on: the same action, the
          same guard, the same roster cap. Accepting a contact ask stopped
          carrying this on 2026-09-16; a guest without a membership is the
          common case rather than a conversion that failed.
        */}
        {addable ? (
          <Button
            label="Add to channel"
            variant="ghost"
            disabled={!manageable}
            onPress={onAddToChannel}
          />
        ) : null}
        <Button
          label="Remove"
          variant="ghost"
          disabled={!manageable}
          onPress={onEject}
        />
      </View>
      {manageable ? null : (
        <Text style={type.muted}>
          Step in to answer for what a guest may do.
        </Text>
      )}
      {guest.maySpeak ? null : (
        <Text style={type.muted}>
          They can hear the channel. Nobody can hear them.
        </Text>
      )}
    </Card>
  );
}

/**
 * One person in the channel: who they are, whether they are here, and whether
 * they are talking.
 *
 * Pressable because "who is this?" is a real question about somebody an
 * acquaintance brought in, and the answer — their profile, and the request that
 * keeps them — is one tap from here.
 *
 * Your own card too, since 2026-08-22. It used to be the one card that did
 * nothing, because the profile screen would have offered to add you as your own
 * contact; that stopped being true when ProfileView learnt `isSelf`, and the
 * exception outlived its reason. What it shows you is what the roster around
 * you is looking at, and the way to change it, which is a question somebody
 * has from inside a channel and not only from settings.
 *
 * The speaking indicator is driven by the room rather than by the reducer. The
 * floor decides who *may* speak and the server enforces it; only the media
 * connection knows who is actually making noise, and the two are different
 * questions — a silent floor-holder and a self-muted person mouthing at a dead
 * microphone both look wrong if the badge is inferred from state.
 *
 * **The exception proves it rather than softening it.** Somebody the room is
 * withholding is heard by no media connection at all, so the only account of
 * them is their own device's, carried on the snapshot — see `speakingHere`.
 * It is still a report of noise being made rather than an inference from who
 * is permitted, which is the distinction this paragraph is about.
 */
function ParticipantCard({
  channel,
  participant,
  self,
  speaking,
  failing,
  now,
  floorRemaining = null,
  cooldown = null,
  onPress,
  onPing,
  pingableAt = null,
  attentiveAt = null,
}: {
  channel: ReturnType<typeof useApp>['channelViews'][string]['channel'];
  participant: { id: string; displayName: string };
  self: boolean;
  speaking: boolean;
  /**
   * The media plane has stopped hearing from them, which is the earliest
   * warning the room gets that somebody is dropping out. See
   * `SessionAudio.failing`.
   */
  failing: boolean;
  /** The server's clock, which is what the idle time is measured against. */
  now: number;
  onPress?: () => void;
  /**
   * Sends a ping with no words, or absent when this person cannot be pinged
   * from here at all — they are you, or they are standing in the room.
   *
   * Wordless on purpose, and it is the whole point of putting it here. The
   * composer on the profile is for when you have something to say; this is for
   * when the thing to say is *come back*, which the notification already says
   * by existing. A field would make the quick case slower than the considered
   * one.
   */
  onPing?: () => Promise<void>;
  /** When they may next be pinged, or null for now. */
  pingableAt?: number | null;
  /**
   * When they were last attending the application, or null if the server has
   * no clock for them. It is what the *Nearby* line counts, and nothing else
   * on this card: *Stepped out* is timed from presence. See `attention`
   * below for why the two cannot be the same number.
   *
   * Null is not "never". It is a build that predates the report, and the
   * *Nearby* line falls back to `nearbyMs`. See SHIMS.md.
   */
  attentiveAt?: number | null;
  /**
   * Milliseconds left in this person's claim, or null when the floor is not
   * theirs. It is `floorRemainingMs` passed down rather than computed here,
   * one reading of the clock for the whole screen.
   *
   * The clock is on the card because the claim is about *this person* — it is
   * their minute, and the roster is where anybody looks to see whose it is.
   * The floor had a section of its own that kept the clock until 2026-09-12,
   * which meant the one number on the screen that changes every second was
   * the one thing you had to look away from the room to read. That section is
   * gone entirely as of 2026-09-13, and this card is the only place the state
   * of the floor is drawn.
   */
  floorRemaining?: number | null;
  /**
   * Milliseconds until *you* may claim, or null when nothing is holding you
   * back. Non-null on your own card and on nobody else's: the cooldown is a
   * fact about what you may do next, and a step count the reducer keeps per
   * person would be six different numbers if every card carried its own.
   */
  cooldown?: number | null;
}) {
  const here = isPresent(channel, participant.id);
  const reconnecting = channel.disconnectedAt[participant.id] !== undefined;
  const muted = !!channel.selfMuted[participant.id];
  const holdsFloor = channel.floor.holder === participant.id;
  // Somebody who is neither speaking nor able to be heard: the badge would be
  // dead space, so the status carries it instead.
  /**
   * How long it is since anything was heard from them here, in words, or null
   * when there is no such duration — they are here, or nothing has ever been
   * heard from them in this channel.
   *
   * A restart is no longer one of those. The server refreshes this while
   * somebody is present, so what a deploy leaves behind is the last heartbeat
   * before it: "stepped out a minute ago" about somebody who was talking when
   * the process died, which is what anyone on this end can act on and
   * self-corrects the moment their app reconnects. It used to be stamped only
   * at departures, which meant a stale one could survive a restart and report
   * a person who had just been speaking as having left days earlier.
   *
   * Appended rather than given its own line: it qualifies "Stepped out", and a
   * second line under every absent person would make the roster twice as tall
   * to say something that is one clause long.
   */
  const away = idleMs(channel, participant.id, now);
  /**
   * How long this wait has been going on, which is the number the *Nearby*
   * line shows and is not always `away`.
   *
   * A declaration is timed from the declaration and a lost connection from the
   * last thing anybody heard. See `nearbyMs`, which holds the whole argument.
   */
  const waitingFor = nearbyMs(channel, participant.id, now);
  /**
   * How long since they were last attending the application, or null when the
   * server has no clock for them.
   *
   * **This is the *nearby* clock and only that.** It was briefly the one clock
   * this card showed about anybody absent, on 2026-09-09, and the two states
   * do not in fact ask the same question. *Nearby* is a claim about reach —
   * will a notification find them — and attention is exactly the evidence for
   * it. *Stepped out* is a claim about this room: when were they last in it.
   * Attention cannot answer the second, and answering it anyway produced the
   * sentence that gave the game away — somebody who has never once entered a
   * channel, reading it for the first time, described to themselves as having
   * been away four seconds. They had not been anywhere.
   *
   * The two clocks coincide when a rung was lost to a timeout, which is the
   * common case and is why one looked like it would do for both.
   *
   * Clamped like every other duration here, and against the server's clock
   * rather than the device's — a stamp taken a moment ago can arrive as a
   * small negative across a round trip. See `duration`.
   */
  const attention =
    attentiveAt === null ? null : Math.max(0, now - attentiveAt);
  /**
   * Present in spirit: their phone has gone to sleep on them, or they said
   * they were within reach, and either way a notification would still fetch
   * them. The status line says so and the ping button hangs off it, which is
   * the one place in the app where those two are the same fact.
   *
   * **No `away !== null` guard any more.** It was there when the only way to
   * be nearby was to have been present and gone quiet, so a missing stamp
   * meant a missing person. A declaration is knowledge without a stamp —
   * somebody can now be nearby in a channel they have never once entered —
   * and the guard denied it, leaving them drawn as *Invited* while their own
   * footer said *Nearby*. `isWaiting` already refuses anybody whose wait has
   * no clock at all.
   */
  const nearby = !here && isWaiting(channel, participant.id);
  /**
   * Out of reach and worth calling — which is `nearby`, plus the minute before
   * anybody is allowed to call it that.
   *
   * A phone suspends within a second of its owner pocketing it, and the room
   * is not told for five seconds more, and then the grace holds them nominally
   * present for a minute. Somebody who walked in on the arrival notification
   * spent all of that looking at "Present · reconnecting…" with nothing to
   * press — waiting out a timeout to be told what the line already said. The
   * status keeps saying reconnecting, because that is still what it is; what
   * changes is that the button is there while it does.
   */
  const callable = nearby || reconnecting;
  /**
   * Whether this card is offering a ping — which is also the answer to whether
   * the speaking indicator is worth drawing. Somebody callable is somebody the
   * room is not hearing, so the dot would be hollow for as long as the button
   * is there; two marks that can never disagree, one of which says nothing.
   */
  const pingable = !!onPing && callable;
  const [pinging, setPinging] = useState(false);
  /**
   * That this card sent one, which the server's window does not say yet.
   *
   * The snapshot carrying `pingableAt` is half a second behind the tap and the
   * notification has already gone, so waiting for it would leave the button
   * looking as though the press had been dropped. Same trade the profile
   * composer makes with `pingSent`.
   */
  const [pinged, setPinged] = useState(false);
  const app = useApp();
  // Recomputed rather than held, so it expires on its own: this card re-renders
  // twice a second while anybody is audible, and every second regardless while
  // `now` ticks.
  const pingWait =
    pingableAt !== null && pingableAt > app.serverNow()
      ? pingableAt - app.serverNow()
      : null;
  /**
   * Whether a ping sent from anywhere is still spending its window — this
   * card's own tap, or the one on the snapshot. The two say the same thing a
   * few hundred milliseconds apart.
   */
  const windowOpen = pinged || pingWait !== null;
  /**
   * Whether the control is drawn at all, which outlives being able to press
   * it. `pingable` is the offer and lapses the moment they stop looking
   * nearby; the window is five minutes (`PING_INTERVAL_MS`), and a card that
   * dropped the word "Pinged" partway through would invite a second ping the
   * server is going to refuse. So it stays until they can be called again —
   * except once they are here, which is the answer to the ping and makes the
   * speaking dot the more useful thing to hold the space.
   */
  const showPing = pingable || (!here && windowOpen);

  const sendPing = async () => {
    if (!onPing) return;
    setPinging(true);
    try {
      await onPing();
      setPinged(true);
    } catch {
      // Left to correct itself rather than reported on a card with no room for
      // a sentence. Three of the four refusals the server can give are already
      // on their way here as state: they walked in, and the card stops being
      // nearby; or somebody pinged them a moment ago, and the next snapshot
      // brings the window that disables this button and says "Pinged"; or the
      // reader themselves has stopped being present or nearby, which is a tap
      // they just made and whose snapshot takes every ping button on the
      // screen away.
      //
      // The last — they are not a contact — is the one that explains itself
      // to nobody, since the card stays nearby and the window is untouched. It
      // is unreachable from a build that has `mayPing`, which does not draw
      // the button at all; what can produce it is a screen whose contact list
      // said otherwise a moment ago, and the home push that corrects the list
      // is what takes the button away. So the swallow is still right: the
      // refusal it hides is one this screen has already stopped offering.
    } finally {
      setPinging(false);
    }
  };

  const status = here
    ? // Present but unreachable is its own state, not absence: they are still
      // in the channel and still hold whatever they hold. Saying so beats
      // making them vanish and reappear over a moment's bad signal.
      //
      // **Two sources, and the earlier one goes first — unless they agree.**
      // `failing` is the media plane's own judgement, pushed by the SFU about
      // the connection the conversation is travelling on; `reconnecting` is
      // the server noticing a control socket went quiet, which cannot beat the
      // heartbeat. So `failing` leads, and says the useful thing while
      // somebody is still mid-sentence rather than a quarter-minute after the
      // damage — which is the whole of what it is for. See
      // `SessionAudio.failing`.
      //
      // **When both hold, `failing` gives way**, since 2026-09-08. A lost
      // stream *and* a lost socket is a phone that has gone, and the two
      // planes are corroborating each other rather than describing different
      // things. "Not receiving you" would then be saying the one thing that is
      // not true of it — that they are here, and your voice is missing them.
      //
      // **And a socket that has gone reads *Nearby*, not *Present*.** The
      // grace period is a window in which somebody may come back; it is not a
      // claim that they can hear you, and for the length of it this card used
      // to say they were present while they were not. *Nearby* is what they
      // are to everybody else — out of reach, one notification away — and it
      // is already what this card offers, `callable` having included
      // `reconnecting` all along. So the ping was right and the word was
      // wrong.
      //
      // **No duration on it, unlike the nearby case below.** That one counts
      // from `lastPresentAt` and is minutes old by the time it renders; this
      // one is at most the grace period, and a countdown of seconds under
      // somebody's name invites watching it rather than pinging them. If they
      // do not come back the row simply keeps the word and gains the number.
      // See planning/decisions/2026-09-08-the-grace-is-not-a-presence.md.
      reconnecting
      ? 'Nearby'
      : failing
        ? 'Present · not receiving you'
        : 'Present'
    : isWaiting(channel, participant.id)
      ? // They did not leave; their phone did. Walking into a channel and
        // pocketing the phone suspends the process in under a second, so this
        // is what most absences from an otherwise empty channel actually are —
        // and "Stepped out" told whoever arrived to give up on somebody who
        // was one notification away. The clock is the same one the line below
        // uses; only the name changes, and only for WAITING_WINDOW_MS. Said as
        // a length rather than a moment, `away` being how long they have been
        // at it rather than when it started.
        //
        // **"Nearby", not "Been nearby", since 2026-08-27**, which reverses
        // 2026-08-22. The perfect tense was there to stop a bare reading
        // taking the number as a future — *nearby for ten minutes* heard as
        // how much longer they are within reach. Two words to pre-empt a
        // misreading is a poor trade on a roster line, and the misreading
        // needs a reader who does not know what the card is: the number sits
        // beside a name in a room they walked out of, and every other line on
        // this card measures backwards too. Shorter wins.
        //
        // **"Nearby", not "Waiting", since 2026-08-22.** The state is read by
        // somebody standing in an empty room, and that person is the one who
        // is waiting — a card telling them that the absent party is waiting
        // reverses who is doing what, and invites the reply *no, I am*.
        // Nearby says the useful thing instead: this person is within reach,
        // and one tap will fetch them. Which is also why the tap is on the
        // card. The state name in `core/` is still `waiting`, deliberately —
        // `ChannelState.waiting` is on the wire and cannot be renamed without
        // a two-step migration for a word no user ever sees.
        //
        // **The number is the attention clock, since 2026-09-09**, and the
        // word lost "for" with the change of clock. It counted the declaration
        // — how long this person had been nearby — which was a fact about a
        // rung rather than about them, and went stale the moment the rung
        // stopped being the thing anybody wanted to know. What a person
        // reading this wants is whether the notification will find somebody,
        // and *nearby 20s* answers it where *nearby for 14m* invites the
        // reader to work out how much of the fifteen minutes is left. See
        // `attentiveAt`, and `waitingFor` for what is shown when the server
        // has no attention clock for them.
        `Nearby ${duration(attention ?? waitingFor ?? 0)}`
      : channel.everPresent.includes(participant.id)
        ? // **The presence clock, not the attention clock.** For one day this
          // read `Away ${duration(attention)}`, on the argument that *stepped
          // out four minutes ago* is a claim the attention clock cannot make.
          // That much was right; the conclusion was not. The fix is to make
          // the claim with the clock that can make it, rather than to keep the
          // wrong number and soften the word until it fits — *away four
          // seconds* about somebody who left an hour ago is no truer for being
          // vaguer, it has just stopped saying which four seconds it means.
          //
          // What this line is for is the room: when was this person last in
          // it. `idleMs` is that and nothing else. Whether they are reachable
          // *now* is the line above, and somebody who is both gets it.
          away === null
          ? 'Stepped out'
          : `Stepped out ${ago(away)}`
        : // Never once here, so there is no interval since they were, and no
          // number belongs on this line. It carried `Invited · away ${…}` for
          // a day — the attention clock again, standing in for a presence that
          // has not happened — which is the reading that gave the whole
          // conflation away: a channel you have just been invited to, opened
          // for the first time, telling you that you have been away a few
          // seconds. An invitation is a standing fact with no clock on it.
          'Invited';

  const body = (
    /**
     * A row, so the control on the right is centred against the pair of lines
     * on the left rather than hung off the lower one. The ping is about the
     * person, which is both lines; sitting it on the status line put it a
     * half-line low and made the card look as though it had settled crooked.
     */
    <View style={styles.cardBody}>
      <View style={styles.cardText}>
        {/* One string rather than a name and a suffix, so it is one run of
            text to a screen reader and to anything else reading the tree. */}
        <Text style={styles.cardName} numberOfLines={1}>
          {self ? `${participant.displayName} (you)` : participant.displayName}
        </Text>
        {/*
          **The tone follows the word, not the flag it came from.** `failing`
          gives way to `reconnecting` above, so a card in that state says
          *Nearby* — and it was saying it in `danger` red, which is the colour
          for a live problem you can act on. Being out of reach is not one:
          it is the same rung half the roster sits on, drawn muted everywhere
          else. Only "Present · not receiving you" earns the red, that being
          the one status claiming somebody is here while your voice misses
          them.
        */}
        <Text
          style={[
            type.muted,
            styles.cardStatus,
            failing && !reconnecting && styles.statusBad,
          ]}
        >
          {status}
          {muted ? ' · muted' : ''}
          {holdsFloor ? ' · has the floor' : ''}
        </Text>
      </View>
      {/*
        The clock, between the name and the rail rather than in place of
        either. The dot beside it still answers a different question — the
        floor says whose minute it is, the dot says whether they are using it,
        and a holder who has gone quiet is worth being able to see.

        Two of them, never at once: a claim is running or it is not, and
        `cooldownRemainingMs` returns null for as long as one is. The claim's
        is full weight on a tinted card and the cooldown's is muted on a plain
        one, which is the difference between a minute somebody has and a wait
        you are serving.

        The cooldown's says "wait" in front of the number, since weight and
        colour are the only other thing distinguishing the two and a card seen
        on its own carries neither comparison. A bare "10s" beside your own
        name reads as time you have; "wait 10s" reads as time you owe.
      */}
      {floorRemaining !== null ? (
        <Text style={styles.cardClock}>{formatSeconds(floorRemaining)}</Text>
      ) : cooldown !== null ? (
        <Text style={[styles.cardClock, styles.cardClockMuted]}>
          {`wait ${formatSeconds(cooldown)}`}
        </Text>
      ) : null}
      {/*
        One rail, holding whichever of the two this card has something to say
        with. The ping is offered only while they are out of reach and recently
        so, which is the state it answers — somebody who stepped out an hour ago
        is a different act, open their profile and say something, and a button
        on every absent card would make the roster a row of buttons rather than
        a picture of the room.

        The dot is the dynamic part, and the only thing on this screen that
        changes several times a second: filled while they are audible, hollow
        otherwise, always in the same place so a card does not reflow every time
        somebody draws breath. It gives way to the ping, since somebody out of
        reach is somebody the room is not hearing — the dot could only sit
        hollow beside a button that says why.
      */}
      {showPing ? (
        <Button
          label={pinging ? 'Pinging…' : windowOpen ? 'Pinged' : 'Ping'}
          variant="ghost"
          style={styles.cardPing}
          // Disabled rather than hidden inside the window. The button
          // vanishing at the moment it is pressed reads as a mistake; saying
          // "Pinged" and refusing a second one says what happened.
          disabled={pinging || windowOpen || !pingable}
          onPress={() => {
            void sendPing();
          }}
        />
      ) : (
        <View
          style={[styles.speakingDot, speaking && styles.speakingDotLive]}
          accessibilityElementsHidden
        />
      )}
    </View>
  );

  /**
   * No seconds in it, deliberately. The clock beside the name ticks once a
   * second and a label carrying it would have a screen reader announce the
   * card afresh every time — the fact worth saying is whose the floor is, and
   * that does not change while the number does.
   */
  const label = `${participant.displayName}${self ? ', you' : ''}. ${status}.${
    holdsFloor ? ' Has the floor.' : ''
  }${speaking ? ' Speaking.' : ''}${onPress ? ' View profile.' : ''}`;

  if (!onPress) {
    return (
      <View
        style={[
          styles.participantCard,
          holdsFloor && styles.participantCardFloor,
          speaking && styles.participantCardLive,
        ]}
        accessibilityLabel={label}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.participantCard,
        holdsFloor && styles.participantCardFloor,
        speaking && styles.participantCardLive,
        pressed && styles.participantCardPressed,
      ]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Who can be invited: accepted contacts of *this user* who are not already in
 * the channel, the cap permitting. The guard is the same one the server
 * enforces, so a shown button and a refused invite cannot disagree — except on
 * contacts, which are the server's check; the list only offers contacts, so
 * the two disagree only if a contact was dropped mid-channel.
 *
 * **`canInvite` is asked about the contact, not about the room.** It carries
 * `hasTheRoom` too, so filtering on it whole would empty this list for
 * somebody standing outside an occupied channel — and an empty list here says
 * "every contact you could invite is already in this channel", which would be
 * false and unrecoverable, there being nothing left on screen to explain
 * itself. So the room half arrives as `mayInvite` and disables the buttons,
 * and the list still shows who is there to be asked.
 */
function InviteList({
  channel,
  me,
  mayInvite,
  onInvite,
}: {
  channel: ReturnType<typeof useApp>['channelViews'][string]['channel'];
  me: string;
  mayInvite: boolean;
  onInvite: (contactId: string) => void;
}) {
  const app = useApp();
  const invitable = (app.home?.contacts ?? []).filter(
    (entry) =>
      entry.status === 'accepted' &&
      !channel.participants.includes(entry.account.id)
  );

  if (channel.participants.length >= MAX_CHANNEL_PARTICIPANTS) {
    return (
      <Text style={type.muted}>
        Channels hold up to {MAX_CHANNEL_PARTICIPANTS} people.
      </Text>
    );
  }
  if (invitable.length === 0) {
    return (
      <Text style={type.muted}>
        Every contact you could invite is already in this channel.
      </Text>
    );
  }
  return (
    <>
      {invitable.map((entry) => (
        <View key={entry.account.id} style={styles.inviteRow}>
          <Text style={[type.body, styles.inviteName]} numberOfLines={1}>
            {entry.account.displayName}
          </Text>
          <Button
            label="Invite"
            disabled={!canInvite(channel, me, entry.account.id)}
            onPress={() => onInvite(entry.account.id)}
          />
        </View>
      ))}
      <Text style={type.muted}>
        {mayInvite
          ? 'They see the invitation on their home screen and join when they like.'
          : 'Step in to invite anybody. An invitation lands in whatever is being said, so it belongs to whoever is saying it.'}
      </Text>
    </>
  );
}

/**
 * Plain-language audio state when there is something wrong with it, and null
 * when there is not.
 *
 * **Null is the whole of the change of 2026-09-15.** This used to describe
 * every state including the healthy ones, on a card headed *Your microphone*
 * that was drawn whenever you were present. Three of the healthy sentences
 * were the footer and the roster said again, and the fourth — audio connected,
 * microphone closed until somebody else is here — was an explanation of a
 * control rather than a report on the transport. What is left is the half
 * nothing else on the screen can say: the conversation is not arriving, or
 * never started, or was refused.
 *
 * So the ordinary moment in a channel draws no card at all, which is the
 * property to preserve if a state is ever added here. **A new case returns a
 * sentence only if a person who is not debugging this application would want
 * to know it**; anything else belongs in the diagnostics panel, which has its
 * own card and its own audience.
 */
function describeAudio(audio: SessionAudio): string | null {
  switch (audio.status) {
    case 'idle':
      return 'Audio not connected.';
    case 'connecting':
      return 'Connecting audio…';
    // Distinct from 'idle' on purpose. Both used to read as "not connected",
    // so audio that had died mid-conversation looked exactly like audio that
    // had never started — and since the only recovery was force-quitting, the
    // screen was quietly wrong about the one thing it is here to report.
    case 'reconnecting':
      return 'Audio dropped — reconnecting…';
    // Not a failure and not a quiet channel, which is why it is neither of the
    // two above. The room is fine and somebody is in it; it is just not this
    // screen. `elsewhereOnAnotherDevice` says the same thing about presence,
    // and this says it about the audio.
    case 'displaced':
      return 'Audio moved to your other device.';
    // Nothing to say. The three sentences this used to pick between reported
    // a working connection, whether anybody else was audible, and whether the
    // microphone was open — the first needs no saying, and the other two are
    // the roster and the footer's job. See the note above.
    case 'connected':
      return null;
    case 'denied':
      return audio.message ?? 'Microphone access refused.';
    case 'unavailable':
      return 'Audio is not configured on the server.';
    case 'error':
      return `Audio failed: ${audio.message ?? 'unknown error'}`;
  }
}

/**
 * The browser is refusing to let this page make sound.
 *
 * **The button is the whole point and cannot be replaced by a retry.** A page
 * nobody has interacted with may be denied playback, and what lifts the denial
 * is a real gesture — so this is the one card in the app whose control exists
 * to be pressed rather than to do anything, and pressing it is the act. See
 * `SessionAudio.allowPlayback`.
 *
 * `primary`, which the screen otherwise spends on nothing: while this is up
 * the channel is inaudible, and there is exactly one thing to do about it.
 * It is never drawn beside another commitment, since the card is not drawn at
 * all unless the browser has said no.
 */
function PlaybackBlocked({ onAllow }: { onAllow: () => void }) {
  return (
    <>
      <Text style={type.body}>
        <Text style={styles.emphasis}>This browser will not play sound yet.</Text>{' '}
        It waits to be asked, so nothing said in this channel is reaching you.
      </Text>
      <Button label="Play the channel" variant="primary" onPress={onAllow} />
    </>
  );
}

/**
 * The microphone was granted and appears to be carrying nothing.
 *
 * **A question rather than a verdict**, which is why it says what was observed
 * and not that the microphone is broken: somebody in a quiet room with noise
 * suppression on reads exactly the same way. `core/capture.ts` carries the
 * measurement and the reasoning.
 *
 * No control. The cure is to open the app in a real browser, which is not
 * something a button here can do — the sibling notice on `AuthView` is the one
 * that can, because there the link is all there is, and by the time somebody
 * is standing in a channel a copied link costs them the room. Stepping out and
 * back in publishes a fresh microphone, which is what takes the reading again.
 */
function MicrophoneSilent() {
  return (
    <Text style={type.body}>
      <Text style={styles.emphasis}>Nothing is coming from your microphone.</Text>{' '}
      If you have been talking, nobody is hearing it — which is what an app&rsquo;s
      built-in browser usually does on iOS. Open this in Safari or Chrome
      instead; stepping out and back in takes the reading again.
    </Text>
  );
}

function audioTone(status: string) {
  // Reconnecting is coloured with the failures rather than the quiet states:
  // it is a conversation that has stopped working, and it earns a glance.
  return status === 'denied' || status === 'error' || status === 'reconnecting'
    ? styles.audioBad
    : styles.audioMuted;
}

const styles = StyleSheet.create({
  audioMuted: { ...type.muted, color: colors.textFaint },
  audioBad: { ...type.muted, color: colors.danger },
  /**
   * A roster line that has stopped being reassuring.
   *
   * The same argument `audioBad` makes one line up, applied to one person
   * instead of the connection: somebody the room cannot hear is a conversation
   * that has stopped working for them, and it earns a glance. It is the only
   * thing on a roster card that is ever coloured, which is what makes a glance
   * enough.
   */
  statusBad: { color: colors.danger },
  /**
   * `flex: 1` so the name takes the slack in the header row and truncates
   * rather than pushing Home and Settings off the edge.
   *
   * 20 rather than `type.title`'s 28: this rides above every screenful now,
   * so its height is paid for on all of them, and a large title is a thing a
   * scroll is entitled to at its top and a pinned bar is not.
   */
  // No `flex: 1`: it sits in `headerMain`, which is a column, and there it
  // would stretch down the header rather than along it. The width it
  // truncates against is that column's, which the row constrains.
  otherName: { fontSize: 20, fontWeight: '700', color: colors.text },
  container: { padding: spacing(2), paddingBottom: spacing(2) },
  /**
   * The getting-started card. `gap` rather than margins between its three
   * children, and the dismissal pushed to the end of its own row so it sits
   * where every other card's action does rather than under the last sentence.
   */
  cohort: { gap: spacing(1), marginBottom: spacing(2) },
  cohortActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(2),
  },
  centeredText: { textAlign: 'center', lineHeight: 20 },
  presence: { gap: 2, marginBottom: spacing(0.5) },
  /**
   * The switch between the tabs. Its own margin rather than the notepad's,
   * back when that sat above it: the notepad is often empty and the gap above
   * the roster is not.
   */
  tabs: { marginTop: spacing(0.5), marginBottom: spacing(0.5) },
  /**
   * The same switch, pinned in the header instead of scrolling with the page.
   *
   * No margins of its own: `headerInner` already sets the gap between the
   * name row and this, and the header's own `paddingBottom` is the space
   * between this and the hairline. The horizontal padding is inherited from
   * `headerInner` too, which is what lines the switch up with the cards below
   * rather than with the window.
   */
  tabsHeader: { marginTop: 0, marginBottom: 0 },
  members: { gap: spacing(1), marginTop: spacing(1) },
  guestActions: { flexDirection: 'row', gap: spacing(1), flexWrap: 'wrap' },
  participantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.25),
    gap: 2,
  },
  /** The accent, the same one the floor gets: this is the app's one mechanic. */
  participantCardLive: { borderColor: colors.floor },
  /**
   * Whoever holds the floor, tinted rather than outlined — because the outline
   * is taken, and by the one thing it must not be confused with.
   *
   * `participantCardLive` means *speaking*, driven by the room — and, for
   * somebody the room is withholding, by their own device saying so; this means
   * *permitted*, driven by the reducer. They are different questions and
   * routinely disagree — a holder sitting silent, a self-muted person whose
   * claim is running — so they cannot share an edge. The fill says whose
   * minute it is and the border says whether they are spending it, and a card
   * that is both reads as both.
   *
   * Before `pressed`, so pressing a holder's card still looks pressed.
   */
  participantCardFloor: { backgroundColor: colors.floorDim },
  participantCardPressed: { backgroundColor: colors.surfaceRaised },
  /**
   * The name and status on the left, the ping or the speaking dot on the
   * right, centred against the pair. A row rather than the control sharing the
   * status line: the status is one clause long and the button is two words, and
   * stacking them would make every roster card taller to hold something only a
   * nearby person's card has.
   */
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
  },
  /** Takes the slack, so a long name or status wraps rather than crushing the
      control beside it. */
  cardText: { flexShrink: 1, flexGrow: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardStatus: { flexShrink: 1 },
  /**
   * Tightened, since `Button` is sized for a card of its own and this one sits
   * inside a row of text. Ghost keeps it from competing with the floor, which
   * is the only thing on this screen entitled to colour.
   */
  cardPing: { paddingVertical: spacing(0.5), paddingHorizontal: spacing(1), minHeight: 0 },
  /**
   * The floor's two clocks, at the weight of a name rather than of the
   * 34-point readout they replace. A card is a line of text and a number
   * beside it; the number was that size when it was the only thing in a card
   * of its own, and at that size on a roster row it would be the first thing
   * read about a person whose name it dwarfed.
   *
   * Tabular, so the row does not shuffle as the digits change, and
   * `flexShrink: 0` so the name yields to it rather than the other way about.
   *
   * Plain text rather than the accent, as the big readout was: the claim's
   * clock sits on a card already tinted `floorDim`, and the accent on that
   * fill is a violet on a violet in dark mode. The card carries the colour and
   * the number carries the number.
   */
  cardClock: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  cardClockMuted: { fontWeight: '600', color: colors.textMuted },
  speakingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  speakingDotLive: {
    borderColor: colors.floor,
    backgroundColor: colors.floor,
  },
  /**
   * The notepad's words. Body rather than the muted grey it was in: it was a
   * line under a header when that style was written, and it is the content of
   * its own card now, with the muted tone left to the sentences *about* it.
   */
  description: {
    ...type.body,
    lineHeight: 20,
    marginTop: spacing(0.5),
    marginBottom: spacing(0.5),
  },
  /**
   * The notepad's *Edit*, which is small on purpose: `flex-start` so it is the
   * width of the word rather than of the card, the sheet being the thing on
   * this card and this being the way to change it. A ghost tone for the same
   * reason — the text is what is read here, not the control beside it.
   */
  notepadEdit: { alignSelf: 'flex-start', paddingHorizontal: spacing(1) },
  /** The notepad's character count, under the field while it is open. */
  count: {
    ...type.muted,
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  /**
   * The pinned header, which carries the same horizontal padding as
   * `container` so the name lines up with the cards under it.
   *
   * The hairline is the one thing a pinned header needs that a scrolling one
   * does not, for the reason TranscriptView's says: without an edge the
   * content slides up to the buttons and stops, with nothing saying which of
   * the two moved.
   */
  header: {
    paddingTop: spacing(1),
    paddingBottom: spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: { ...measure, paddingHorizontal: spacing(2), gap: spacing(0.5) },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  /**
   * The kind and the name, taking whatever the controls leave — which since
   * the recording pill came up here is less, and varies with whether one is
   * running at all. That is the arrangement rather than a defect in it: the
   * name is the one thing on the row that degrades gracefully, so it is the
   * one that gives, and what will not fit ends in an ellipsis. `flex: 1`
   * takes the slack; the `numberOfLines={1}` at the two sites does the rest.
   */
  headerMain: { flex: 1, gap: spacing(0.5) },
  headerKind: { ...type.label },
  /**
   * Negative trailing margin: `Button`'s horizontal padding is sized for a
   * card, and without it the pair sits further from the edge than the name is
   * from the other one, which reads as a mistake rather than as chrome.
   */
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -spacing(1),
    // Explicit, though it is React Native's default: this row must not be
    // the thing that shrinks. Everything in it is either a touch target at
    // its minimum size or a pill whose text says a duration, and the name
    // beside it is what truncates instead.
    flexShrink: 0,
  },
  /**
   * The pinned footer.
   *
   * A top hairline for the reason the header has a bottom one: without an
   * edge the last card slides under the icons and stops, with nothing saying
   * which of the two moved. `surface` rather than `bg` so the bar reads as
   * sitting above the page — the same relationship the cards have to it.
   *
   * No bottom inset here. `App.tsx` wraps the whole application in a
   * `SafeAreaView` with `edges={['top', 'bottom']}`, so the home indicator is
   * already accounted for; adding padding for it here would double it.
   */
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing(1),
    paddingBottom: spacing(0.75),
  },
  /**
   * The bar itself, capped and centred inside the full-bleed surface above.
   *
   * Narrower than `measure`, and by a lot: 620 divided up is a target for an
   * icon and one word wide enough to stop reading as a control and start
   * reading as a row of banners. It was 480 while there were three of these,
   * putting each at 160 against the ~125 a phone gives them — the same object,
   * slightly larger, rather than a different one. 560 across four keeps that
   * ratio at 140 against a phone's ~90, where holding 480 would have dropped
   * an iPad's below the phone's and left the bar looking cramped on the wider
   * screen.
   *
   * The rule and the fill stay full-bleed, for the reason the header's do: an
   * edge that stops short of the window is not an edge.
   */
  footerInner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing(1),
  },
  /**
   * `flex: 1` on all four, so each is a quarter of the bar whatever its label
   * says. The alternative — sizing to content — moves its neighbours when
   * "Claim" becomes "Release" or "Be nearby" becomes "Step out", which is a
   * target shifting under the thumb at the exact moment somebody is reaching
   * for it a second time.
   *
   * `minHeight` is the 44pt Apple asks for. The disc inside is taller than
   * that on its own, so this is a floor the layout already clears rather than
   * one it depends on — kept because the disc's height is a visual decision
   * and the target's is not.
   */
  footerAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: spacing(0.25),
  },
  footerActionPressed: { opacity: 0.6 },
  /**
   * The glyph and its label as one object, and the shape the accent fills.
   *
   * **Fixed height and a radius of half it**, so the disc appears and vanishes
   * without moving anything: the box is the same size accented or not, and the
   * bar does not change height when somebody claims the floor. Round rather
   * than a rounded rectangle, for the reason the smaller disc was round — a
   * rectangle at this size reads as a second button inside the button.
   *
   * `minWidth` equal to the height is what makes it a circle for the short
   * labels and a pill for the long ones, rather than a circle that clips
   * "Nearby". `maxWidth` keeps it inside its fifth of the bar; the label
   * ellipsises there rather than pushing its neighbours, which is the same
   * promise `flex: 1` above makes about position.
   */
  footerStack: {
    minWidth: 54,
    maxWidth: '100%',
    height: 54,
    borderRadius: 27,
    paddingHorizontal: spacing(1),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  footerStackAccented: { backgroundColor: colors.surfaceRaised },
  /** A fixed box around a 22px glyph, so the icons sit on one line. */
  footerIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * 11px, which is smaller than anything else in this application and is the
   * one place that is right: it is a caption under a glyph that has already
   * said it, and the pair is what gets read rather than either half.
   */
  footerLabel: { fontSize: 11, fontWeight: '600' },
  /**
   * The seam between the conversation and what the channel is carrying.
   *
   * The rule is the whole of the visual weight; the text is `type.label`'s
   * size in `textMuted` rather than a third heading size. Top margin is
   * larger than `SectionLabel`'s so the group reads as beginning here rather
   * than as one more section.
   */
  warning: { color: colors.silenced, fontSize: 13, marginTop: spacing(0.5) },
  // Advice rather than a failure, so it carries weight without the colour a
  // warning uses — nothing is broken when a watch party needs headphones.
  emphasis: { fontWeight: '600', color: colors.text },
  // Under the roster, in the same muted grey the descriptions use rather than
  // the silenced colour: nothing is wrong, the room is quiet on purpose.
  partyMuted: {
    ...type.muted,
    textAlign: 'center',
    marginTop: spacing(0.75),
  },
  /**
   * The indicator itself: the disc, the word and the clock inside a hairline
   * pill. It lived on the Recording card until the header took it back, and
   * the surface, the border and the padding are that card's verbatim.
   *
   * `surface` rather than `surfaceRaised` — the token that would lift it off
   * a card is the default `Button` fill, and a pill wearing it reads as a
   * control that does nothing when pressed. An outline that is plainly not a
   * button is the better of the two, in the header as it was on the card.
   *
   * `alignSelf: 'center'` rather than the `flex-start` the card wanted: this
   * now sits in a row beside two 44pt glyph buttons, and the pill is shorter
   * than they are, so it wants the row's centre line. Without an `alignSelf`
   * at all it stretches to the row's height and stops being a pill.
   */
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing(0.75),
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.5),
  },
  /**
   * What the pill adds for its place in the header's row of buttons.
   *
   * A gap of its own, since the two neighbours are 44pt boxes whose padding
   * is their spacing and the pill has none to give. `flexShrink: 0` so the
   * name's `flex: 1` takes every remaining point and the pill keeps its
   * width — the whole arrangement rests on the name being the thing that
   * gives, and a pill squeezed to half a clock states nothing.
   */
  headerRecording: { marginRight: spacing(0.5), flexShrink: 0 },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.recording,
  },
  recordingDotPaused: { backgroundColor: colors.textFaint },
  recordingLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  recordingTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.floor },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  volumeReadout: { justifyContent: 'center', minWidth: 44, alignItems: 'center' },
  stack: { gap: spacing(1) },
  buttonRow: { flexDirection: 'row', gap: spacing(1) },
  flexButton: { flex: 1 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1.5),
  },
  inviteName: { flex: 1 },
});
