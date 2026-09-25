import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  canPlayWatch,
  watchIsPlaying,
  trackIsPlaying,
  canUnmuteRoom,
  isPartyMuted,
  isWithheld,
  partyMuteRequested,
  canStopRecording,
  canPasteClip,
  canClearClip,
  canInviteGuest,
  canAskGuestJoin,
  canManageGuest,
  canWithdrawGuestInvite,
  canEditChannel,
  hasTheRoom,
  isPresent,
  canPing,
} from '../../../core/channel';
import { inRoom, pendingGuests } from '../../../core/guests';
import type { Guest } from '../../../core/types';
import type { ScreenDevice } from '../../../core/protocol';
import type { SessionAudio } from '../audio/useSessionAudio';
import { shareTrack } from '../api/download';
import { pickAndUploadTrack } from '../api/upload';
import { copyText, pasteText } from '../clipboard';
import { canShare, shareLink } from '../share';
import { useApp } from '../state/AppProvider';
import { liveChannelView } from '../state/live';
import { learningToStepIn } from '../state/introduction';
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
  PeopleIcon,
  MicIcon,
  NotepadIcon,
  PauseIcon,
  ListenIcon,
  RecordingsIcon,
  SettingsIcon,
  StepIcon,
  StopIcon,
  WatchIcon,
} from './icons';
import {
  FooterAction,
  GuestCard,
  InviteList,
  MicrophoneSilent,
  ParticipantCard,
  PlaybackBlocked,
  audioTone,
  describeAudio,
} from './channelCards';
import { styles } from './channelStyles';
import { WatchTransport } from '../watch/Transport';
import { useIsTurned, useWatchShape, useWholeWindow } from './layout';
import { DockSlot, usePicture } from '../watch/Picture';
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
import { useText, type Strings } from '../i18n';
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
  | 'people'
  | 'notepad'
  | 'invites'
  | 'listen'
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
export function uploadingLabel(
  percent: number | null,
  t: Strings['channel']
): string {
  return percent === null ? t.uploading() : t.uploadingPercent(percent);
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
  onTab,
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
  /**
   * Told when the tab changes, for a caller that wants to bring somebody back
   * to where they were.
   *
   * **This screen still owns the tab**, which is why this is a report rather
   * than the other half of a controlled pair: nothing above can set it except
   * by asking for one at mount through `tab`, and a caller that ignores this
   * entirely behaves exactly as before. `App.tsx` is the only listener, and
   * uses it for the swipe out of a channel and straight back into it — see
   * `Swipes` there for why that pair and nothing else.
   */
  onTab?: (tab: ChannelTab) => void;
}) {
  const t = useText().channel;
  const namingWords = useText().naming;
  const linkWords = useText().links;
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
  const [tab, setTab] = useState<ChannelTab>(asked ?? 'people');
  /**
   * Whether this channel still owes its occupant an explanation. Null channel
   * id while the view is loading, which reads as "nothing to draw" — see
   * `useCohortNotice`.
   */
  const cohortNotice = useCohortNotice(view?.cohort ? channelId : null);
  /**
   * Whether this member has just put the public-page card away, before the
   * snapshot carrying that back has arrived.
   *
   * **Local and optimistic, unlike everything else the card knows.** Whether
   * the card is owed at all is the server's answer — a row, so it follows the
   * person onto their other devices rather than being dismissed per install
   * as the *getting-started* card is. But the announce it provokes is a round
   * trip, and a card that stayed on screen for it would read as a button that
   * did nothing. Keyed on the channel id so that opening a different channel
   * asks the snapshot again rather than inheriting this one's answer.
   */
  const [publicNoticeRead, setPublicNoticeRead] = useState<string | null>(null);
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
   * A tab chosen on the bar, which is the only thing anybody above is told
   * about.
   *
   * Deliberately not an effect on `tab`: a seed from `asked` is something the
   * caller already knows, and reporting it back would be this screen telling
   * `App.tsx` what `App.tsx` just said.
   */
  const chooseTab = (next: ChannelTab) => {
    setTab(next);
    onTab?.(next);
  };

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
  /**
   * What came of asking a contact in as a guest, per contact.
   *
   * **Per contact rather than one line under the list**, because the list is
   * a column of people and an error under all of them answers about none of
   * them. `'asking'` while the round trip is out, the server's own sentence
   * when it refused, and the row going quiet — `'asked'` — when it did not.
   *
   * Three of the refusals cannot be asked here at all: a dormant seat, an
   * invitation already outstanding, and the fortieth guest are
   * `guest_sessions` rows that no `ChannelState` carries. So this is not a
   * fallback for a guard that should have been drawn — it is the only place
   * those three can be said.
   */
  const [askedIn, setAskedIn] = useState<
    Record<string, 'asking' | 'asked' | string>
  >({});
  /** While a guest link is being minted, which is a round trip. */
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  /** Where a link went when there was no share sheet to hand it to. */
  const [shareNote, setShareNote] = useState<string | null>(null);
  /**
   * Why the last press of the watch card's paste button did nothing.
   *
   * **There is no field here any more, as of 2026-09-20.** A YouTube link is
   * machine text arriving from somewhere else — a share sheet, a browser, a
   * message — so what everybody actually did with the field was paste into
   * it, and on a phone that is a long press, a magnifier and a popover
   * aimed at a box whose contents nobody can proofread anyway. The button
   * reads the clipboard itself. What is lost is typing a link out by hand,
   * which nobody was doing.
   *
   * So the two ways it can fail have to be said, an empty clipboard and one
   * holding something that is not a link being indistinguishable from a
   * button that is simply broken. Local and transient, like `changing`: it
   * is about one press on one device.
   */
  const [watchPasteError, setWatchPasteError] = useState<string | null>(null);
  /** While a follower link is being minted, which is a round trip. */
  const [linking, setLinking] = useState(false);
  /**
   * Whether the field for swapping the video is open over a loaded party.
   *
   * Local and transient, like `watchPasteError`: somebody who has pressed
   * *Change video* has not changed what the channel is watching, and the
   * other people in it have no business seeing that press at all. It is the
   * confirmation step of a swap — the press that reads the clipboard is the
   * one under it.
   */
  const [changing, setChanging] = useState(false);
  /**
   * Whether the list of films this channel has watched before is open.
   *
   * **Local, transient and shut on every mount**, like `changing` above and
   * for the same two reasons: opening a list is not an act on the channel, and
   * the other people in the room have no business seeing somebody read it.
   *
   * Behind a press rather than always drawn, which is STYLE.md § *A card of
   * many items asks for one of them* applied to a card whose subject is the
   * film that is on — ten rows above the transport would be a wall in front of
   * the thing the card is for, on a screen somebody opened to press Play.
   */
  const [pickingPast, setPickingPast] = useState(false);
  /**
   * Whether the picture is filling this device.
   *
   * **Local to one device and to one moment of it**, like `changing` above and
   * unlike everything else on this card: how big the film is on somebody's
   * phone is not a fact about the party, and a channel that carried it would be
   * one where standing up to fetch a drink resized four other people's screens.
   * It is not in `core` and not in a snapshot.
   *
   * **A press is what sets it, on every platform.** It was derived from the
   * shape of the window for a day — a phone turned sideways on *Watch* — and
   * that route is gone with the portrait lock, which stops a phone outside
   * full screen being sideways at all. What it decides now is which way up the
   * phone *may* be: see `watch/orientation.ts`, and the derivation below.
   */
  /*
    **Held by the picture rather than here, since the picture outlives this
    screen.** The one player is mounted above the route table and stays there
    when the picture is expanded — `Dock.Place`, and the note on the effect
    below — so the flag that says how big it is has to live where the player
    does rather than on a screen the player outlasts. Local state is the
    fallback for a harness that renders this screen with no picture above it.
  */
  const picture = usePicture();
  const [ownFullScreen, setOwnFullScreen] = useState(false);
  const fullScreen = picture ? picture.fullScreen : ownFullScreen;
  const setFullScreen = picture ? picture.setFullScreen : setOwnFullScreen;
  /**
   * That the film will not play, as the player found out.
   *
   * Only the expanded picture reads it; see the collapse below, and
   * `WatchPlayer`'s `onRefusal` for why it is reported at all.
   *
   * **One source since 2026-09-23**, and it was two. There used to be a
   * player on this screen as well as the one above the route table, so a
   * refusal could arrive by either road and this screen kept its own half in
   * state. There is one player now, wherever the picture is drawn, so there
   * is one road.
   */
  const filmRefused = !!picture?.refused;
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
  /**
   * Whether a first snapshot of this channel has arrived at all.
   *
   * The half that tells *no party* apart from *not told yet* — see the effect
   * that gives the screen role up, which is the one rule that has to know the
   * difference.
   */
  const channelHere = !!channel;
  /**
   * Whether this *account* is in the room, on this device or any other.
   *
   * The account's half of `steppedIn`, on its own, because the rules below
   * need exactly this and not the per-device fact: a laptop showing the film
   * while the phone holds the presence is not stepped in here and must go on
   * showing it.
   *
   * **`inRoom` rather than `isPresent`, for the reason the roster asks it
   * that way**: a guest is in the room without ever being in `present`, so a
   * film gated on presence alone would be one a guest could never see — on a
   * link somebody sent them in order to watch something together. *Nearby*
   * and *stepped out* fail this; a guest does not, having no rung to be on.
   */
  const inTheRoom = !!channel && inRoom(channel, me);
  /**
   * Whether this device is the one standing in this channel.
   *
   * **Both halves, and the second is the per-device one.** Presence is the
   * account's — the channel says you are in the room — and `standingIn` is
   * this instance's, so a phone holding your presence means the laptop you
   * also have open is *not* stepped in here. Which is exactly the question
   * *Watch on* has to answer: the film belongs on the device you are in the
   * room on.
   *
   * A guest passes the first half by being a guest — see `inTheRoom` — which
   * is the same standing `WATCH_HERE` is given in the reducer, `inRoom` there
   * too. So a guest sent a link to watch something gets the film on the
   * browser they opened it in, and reports it like anybody else.
   */
  const steppedIn = inTheRoom && app.standingIn === channelId;
  /**
   * Whether this device is showing the party's film.
   *
   * **Being in the room is part of it, and is a precondition rather than a
   * repair.** The effect below gives the role up when the account leaves, but
   * an effect runs after a commit — so a rule written only there would mount
   * the player for a render, load the page and take it away again, on a
   * screen belonging to somebody who is *nearby* or *out*. Everything that
   * draws or expands the picture reads this, so the whole of it obeys the one
   * rule: **no film mounts, or plays, for somebody who is not in the
   * channel.**
   *
   * *Nearby* is not a half-measure here. It is `waiting` rather than
   * `present` — the rung is reachability and not attendance — so it fails
   * this the same way stepping out does, which is what makes it an answer to
   * *I do not want to watch this*.
   */
  const screenIsHere =
    app.screenFor === channelId && partyLoaded && inTheRoom;
  const screenIsMine = screenIsHere && steppedIn;
  /**
   * **Whether this is the party's *second device*, which is a whole screen.**
   *
   * A party can be spread across two instances of one account, and when it is
   * they are not interchangeable: one holds the room — the presence, the
   * microphone, the floor — and the other holds the film. The first is the
   * remote control and the second is the television. `screenIsMine` is the
   * single-device case, both roles on one instance, and this is the other one:
   * the screen, with the room somewhere else.
   *
   * **It replaces the channel screen rather than sitting on a tab of it.**
   * Until 2026-09-20 the second device drew the whole of the channel — six
   * tabs, the roster, the floor, *Watch on*, *Stop watching*, the field for
   * swapping the video — with the film docked on the sixth of them. So every
   * control of the party existed twice, in two places, on two devices, and
   * the one thing a television is for was one tab in.
   *
   * What is drawn instead is the film and the controls that are about the
   * film: the transport and *Full screen*, which is what somebody sitting in
   * front of it reaches for. Everything else stays on the device holding the
   * room, which is where the person is.
   *
   * **The three rungs are the exception, and they are the exception for a
   * mechanical reason rather than a tasteful one.** *In* on this device is
   * what makes it the first one, and *Nearby* and *Out* are what end the
   * film. Without them a second device could neither take the room nor give
   * the picture back, and the switch that put the film here lives on the
   * other device — so this state would be one nothing on this screen could
   * leave.
   *
   * See `planning/decisions/2026-09-20-the-second-device-is-a-television.md`.
   */
  const secondDevice = screenIsHere && !steppedIn;
  const screenSaid = (channel?.watchingHere ?? []).includes(me);
  /**
   * Whether the film is on one of this account's *other* devices.
   *
   * Pushed rather than asked for — see `screensElsewhere` — because it is
   * what the *Watch on* switch shows as chosen on the device that handed the
   * film away, and a device that learnt it only by asking would show nothing
   * chosen at exactly the moment somebody had just chosen.
   */
  const screenElsewhere = app.screensElsewhere.includes(channelId);

  /**
   * Tells the room when this device is both the screen and the voice.
   *
   * Reconciled rather than fired on a tap, so that a reconnection, a step-out
   * and a party ending all converge on the truth without any of them having to
   * remember to. The reducer ignores a report that says what it already holds,
   * so this settles in one round trip and then says nothing.
   *
   * **Only from the device standing in the room, which is the whole of the
   * protocol this used to break.** `watchingHere` is a list of *people* — the
   * reducer keys it on `userId` — while `screenIsMine` is a fact about an
   * instance, so a second instance of one account reading the flag reads
   * somebody else's answer as its own. It then disagreed with it: the phone
   * showing the film reported true, the laptop that had merely opened the
   * channel reported false, each report pushed a snapshot that made the other
   * one wrong again, and the two flipped the flag between them for as long as
   * both screens were open.
   *
   * What that cost is not a flicker. `isScreening` in core/micNeeded.ts reads
   * this list, so every flip opened and closed the phone's microphone —
   * `LISTENING` to `CALL` and back, at the speed of a round trip, under a film
   * that was playing on it. The picture stuttered for as long as the other
   * device had the channel up, which is exactly how it was reported.
   *
   * `steppedIn` is the guard because it is what the wire already says:
   * *sent only by the instance that holds this account's presence, and only
   * about itself* — see `ChannelAction.WATCH_HERE`. A device that is not in
   * the room has no business describing who is watching in it, and the
   * account's departure clears the flag anyway, `watchingHere` being filtered
   * by `present` wherever it is read.
   */
  useEffect(() => {
    if (!partyLoaded || !steppedIn || screenIsMine === screenSaid) return;
    app.act(channelId, { type: 'WATCH_HERE', watching: screenIsMine });
  }, [app, channelId, partyLoaded, steppedIn, screenIsMine, screenSaid]);

  /**
   * **Two ways in, and which one a surface has depends on whether it has a
   * wrist.**
   *
   * *Full screen* on the watch card is the press, on every platform. And on a
   * handheld, **turning the phone sideways is the other**, which is the
   * gesture every other film on that phone already answers to.
   *
   * ## What the turn costs the flag, which is that a press expires
   *
   * `turned` is not stored. It is `useIsTurned` against the window, and it is
   * the whole state on a phone somebody is holding sideways — so the picture
   * and the glass cannot disagree, and there is no flag to be left set by a
   * rotation nobody told it about.
   *
   * So this boolean is the *other* route and means one thing only: **somebody
   * asked for the picture without turning anything.** It is what a phone held
   * upright asks with, what a phone lying flat asks with — iOS holds the
   * interface orientation it had when the gravity vector stops saying
   * anything, so a flat phone never turns and never turns back — and what a
   * laptop and an iPad ask with, neither of them having a turn to perform.
   *
   * **And it expires the moment the phone is turned**, in the effect below.
   * Without that, somebody who pressed *Full screen* upright and then turned
   * the phone would be holding a press *and* a turn, and turning back would
   * leave the press standing: the picture would refuse to collapse for a
   * gesture that visibly should collapse it. The turn is the stronger
   * statement and it takes the flag with it.
   *
   * ## Why the window can be read at all, which it could not for a few hours
   *
   * **A handheld is portrait unless it is at the film** —
   * `usePortraitUnlessAtTheFilm`, kept from `Picture` for the whole
   * application, and `watch/orientation.ts` is the rule. The condition it
   * locks against is {@link atTheFilm} below, which is these same terms: the
   * phone may turn on the watch card and inside the picture, and nowhere
   * else.
   *
   * That is what makes `isTurned` honest. A landscape window on a handheld
   * cannot be a browser window, cannot be an iPad, and cannot be some other
   * screen that happened to be wide — the only handheld screens allowed to be
   * landscape are these two, so the window being landscape means a wrist
   * moved. When the lock was the whole application's, this route was not
   * merely unused but unreachable; when there was no lock at all, it fired on
   * three surfaces that never asked.
   *
   * ## The rest of the terms
   *
   * Every term after the first is a way of having nothing to expand, and each
   * one used to need its own collapse:
   *
   * - **The *Watch* tab**, because the other five tabs are not the film.
   * - **A party, screening here, playable** — the three ways the state could
   *   be emptied out from underneath somebody, all of which ended in a black
   *   rectangle with controls over it that no longer did anything: the party
   *   stopping, the film moving to another device, and YouTube refusing to
   *   play it. None of the three is something the person watching did, and
   *   none is announced by anything visible from inside the picture. Falling
   *   out of full screen lands them on the card, where the Stop, the switch
   *   and the refusal in words all are.
   * - **Nothing else covering the channel.** The settings, a profile and a
   *   transcript are early returns above this one and would still be showing;
   *   expanding underneath them would take the corner player down for a film
   *   nobody could see.
   *
   * Above the early returns with its siblings, so it reads the channel
   * directly rather than the derived constants further down. See the block
   * comment above.
   */
  /** Whether the picture was asked for without a turn; see above. */
  const [pressedFullScreen, setPressedFullScreen] = useState(false);
  /*
    **How the watch body is laid out, read here for `columns` alone.**

    Above the early returns with its siblings — a hook below one is a hook the
    settings screen does not run, and React counts them. That is not a style
    rule in this file, it is the defect this line arrived with.

    This sits above `Screen`, so the body height it sees is the unmeasured
    zero, and that is correct rather than tolerated: whether there is room for
    two columns is a question about the pane's *width* and nothing else. The
    picture's own box, which does read the height, is decided inside
    `DockSlot`, where the measurement is. Two readings of one pure function,
    each taken where it can answer the half it needs.
  */
  const watchShape = useWatchShape();
  /**
   * Whether there is a film here to be at, which is two questions in one.
   *
   * **It is what full screen is guarded by and what the portrait lock is
   * opened by**, deliberately the same expression: a phone is allowed to be
   * sideways exactly where being sideways means something, so there is no
   * state in which the window is landscape and the turn is ignored. Every
   * term after the tab is a way of having nothing to expand — see the block
   * above for what each one is and what it costs to leave out.
   *
   * It stays true while the picture is expanded, the tab and the party and
   * the rest being unchanged by it. That is what keeps the phone unlocked for
   * the whole of the film rather than only on the way in.
   */
  const atTheFilm =
    /*
      **The *Watch* tab, or the second device, which has no tabs at all.**

      The tab was the whole of this term until 2026-09-20, and on a second
      device it is a question about a switch that is not drawn: that screen is
      the film and its transport and nothing else, so *which of six* has no
      answer there and the default one — *People* — is the answer `tab`
      happens to hold. Left as it was, a laptop showing the film could not be
      expanded and a phone showing it could not be turned, on the one surface
      whose entire purpose is the picture.
    */
    (tab === 'watch' || secondDevice) &&
    partyLoaded &&
    screenIsHere &&
    !filmRefused &&
    !settingsOpen &&
    !viewing &&
    !transcriptFor;
  const turned = useIsTurned();
  const wantsFullScreen = (pressedFullScreen || turned) && atTheFilm;
  /*
    **The television takes the window, for the reason the expanded picture
    does.** A second device is one screen showing one film; a list of every
    other channel beside it is the remote control drawn a second time, on the
    device that exists precisely because the remote control is elsewhere. Above
    `SPLIT_AT` — a laptop, which is where a watch party is actually watched —
    that list was two thirds of the window.

    **`list` rather than `glass`**, which is the smaller of the two claims:
    this screen keeps a footer of three rungs, and they have to stay off the
    home indicator. See `WindowClaim`.

    Gated on `fullScreen` rather than on `wantsFullScreen` so that it reads the
    same term the early return above does — the two are a render apart while
    the effect settles, and claiming on the other one would put the list back
    for that render on the way into full screen. The handover is safe in both
    directions because React runs every cleanup in a commit before every mount.
  */
  useWholeWindow(secondDevice && !fullScreen ? 'list' : null);
  useEffect(() => {
    if (fullScreen !== wantsFullScreen) setFullScreen(wantsFullScreen);
  }, [fullScreen, wantsFullScreen, setFullScreen]);
  /*
    A press expires on the turn, which is the one thing that can overrule it.
    Guarded on `turned` rather than run on every change of it, so that turning
    back is the window's statement and not a second clearing of a flag that is
    already down. See the block above for what it costs to leave out.
  */
  useEffect(() => {
    if (turned) setPressedFullScreen(false);
  }, [turned]);
  /*
    And the lock is told, from the one screen that can answer the question.
    Same shape as the full-screen effect above and for the same reason: the
    flag lives in the picture, which outlives this screen, so it is written
    rather than held — and cleared on the way out below, since a channel
    screen that closes while the phone is unlocked would leave every other
    screen in the application turnable.
  */
  const tellPicture = picture?.setAtTheFilm;
  useEffect(() => {
    tellPicture?.(atTheFilm);
  }, [tellPicture, atTheFilm]);
  const leaveTheFilm = useRef(tellPicture);
  leaveTheFilm.current = tellPicture;
  useEffect(() => () => leaveTheFilm.current?.(false), []);

  /*
    And collapsed when this screen goes, which is the one exit the effect above
    cannot see. The flag lives above the route table now, so a screen closed
    while the picture was expanded would leave it set with nobody left to
    answer for it — and the corner player, which stands down for the duration,
    would never come back.
  */
  const collapse = useRef(setFullScreen);
  collapse.current = setFullScreen;
  useEffect(() => () => collapse.current(false), []);

  /*
    **What full screen is made of, as of 2026-09-23 — and it is no longer a
    render.**

    This screen used to hand back `FullScreen` with a player of its own inside
    it, and that was the reload: a `WebView` reparented is a `WebView` rebuilt,
    so a turn of the wrist tore one down and built another — 1.0 to 1.5
    seconds of black, measured on build 276, on the most ordinary gesture
    anybody makes at a film.

    The player never moves now. It stays where it has been mounted since
    2026-09-19, above the route table, and is given the whole window to fill;
    the scrim goes over it, drawn by the component that draws the player,
    because nothing below this point in the tree can be painted above it. So
    this screen goes on rendering underneath, invisibly, and publishes the
    three things the scrim cannot work out for itself.

    **Publishing rather than passing**, and the shape is forced: an element
    cannot be handed to an ancestor, and an element is a new object on every
    render, so anything that carried one upward would re-render this screen
    for ever. Booleans compare equal and stop. See `Picture.Controls`.

    This screen still draws nothing at all while the state is on — see the
    return further down, which is the old early return with its body removed.

    **Up here with the other effects, and not beside the render it replaced.**
    Half a dozen early returns stand between this point and there — an ended
    channel, the settings, a transcript — and a hook after any of them is a
    hook that is sometimes not called. It is the same trap the note on `act`
    describes a few hundred lines above, in its more expensive form: a `const`
    read too early throws where it is used, and a hook skipped takes the whole
    screen down on the render after it.
  */
  useEffect(() => {
    if (!picture) return;
    const showing = fullScreen && partyLoaded && screenIsHere;
    if (!showing || !channel) {
      picture.setControls(null);
      return;
    }
    picture.setControls({
      mayControl: canControlWatch(channel, me),
      mayPlay: canPlayWatch(channel, me),
      /*
        **No way out on the scrim while the phone is the way out.** A press of
        an exit here would set a flag that is already down — the state is the
        window's while `turned`, and the window does not change because
        somebody pressed something — so the button would be visibly dead,
        which is worse than absent. Turning the phone upright is what leaves,
        and it is the gesture every other film on the phone answers to.

        Everywhere else it is the whole of the control, and that is most
        surfaces: a laptop, an iPad, and a phone held upright or lying flat,
        all of which reached this state by pressing and none of which has a
        turn that would get them out.
      */
      mayExit: !turned,
    });
  }, [picture, fullScreen, partyLoaded, screenIsHere, channel, me, turned]);

  /*
    The way out, registered once. `setExit` keeps it in a ref and
    `setPressedFullScreen` is a setter, so neither end of this re-renders
    anything and the effect has nothing to do on a later pass.
  */
  useEffect(() => {
    picture?.setExit(() => setPressedFullScreen(false));
  }, [picture]);


  /**
   * Stops being a screen when there is nothing to show.
   *
   * A party ending, or being replaced, leaves this device holding a role for a
   * film nobody is watching — and the picker would go on offering it as busy.
   * Cleared here rather than by the reducer: this is connection state, and
   * nobody's business but this device's.
   *
   * **Only once there is a snapshot to read it off, which is the repair of
   * 2026-09-20.** `partyLoaded` is false for two quite different reasons —
   * the party is over, and the first snapshot has not arrived yet — and this
   * screen mounts in the second of them every time: opening a channel sends
   * `watch.channel` and the view lands a round trip later. So a second device
   * that was handed the film while looking at anything else gave the role
   * straight back on the frame it opened the channel to watch it on, which is
   * a television that goes blank the moment you walk up to it. It is
   * `Picture`'s rule about a null `slot` in the other layer: a thing that has
   * gone away and one that has not landed yet are not the same absence.
   */
  useEffect(() => {
    if (!channelHere || partyLoaded || app.screenFor !== channelId) return;
    app.showScreenFor(null);
  }, [app, channelHere, channelId, partyLoaded]);

  /**
   * **Stepping out is how you stop watching, and it is the only way.**
   *
   * The picture used to exist only while the *Watch* tab was showing, which
   * made tapping another tab a way to leave a film without leaving the room.
   * It is mounted for as long as this device is the screen now — see
   * `watch/Dock.tsx` — so *the tab bar has stopped being a transport*, and
   * something else has to be. The ladder already is: in, nearby, out. Nearby
   * and out are the two answers to not wanting to watch, and both of them are
   * a statement to the room rather than a silent withdrawal behind a tab.
   *
   * **The account's standing in the room and not this device's**, which is
   * the whole care in this: a film handed to the laptop is being watched by a
   * person whose phone is what holds their presence, and a rule written
   * against `steppedIn` would take it off that laptop the moment it arrived.
   *
   * The server agrees rather than being told — `watchingHere` is filtered by
   * `present` wherever it is read — so this is the device doing locally what
   * the room already believes about it.
   *
   * **And not before there is a snapshot to read it off**, which is the same
   * repair as the effect above and the same mistake twice: `inRoom` is
   * answered by the channel, so with no channel it answers *no*, and every
   * mount before the first snapshot looked exactly like somebody who had
   * stepped out. Of the two this is the worse one — it is the rule that no
   * film plays for somebody who is not in the room, and *we have not been
   * told yet* is not that person.
   */
  useEffect(() => {
    if (!channelHere || inTheRoom || app.screenFor !== channelId) return;
    app.showScreenFor(null);
  }, [app, channelHere, channelId, inTheRoom]);

  /**
   * **A television is the screen or it is nothing: it never has a corner.**
   *
   * The picture floats when no screen leaves it a hole — `Picture`'s
   * `place`, which is `slot ? 'docked' : 'floating'` — and that is right for
   * the device somebody is standing in the room on. Going Home there leaves
   * the film in the corner and a tap on it comes back, which is the whole
   * point of the player hanging above the route table.
   *
   * **It is wrong for a second device, which is a screen showing one film and
   * nothing else.** A corner rectangle on a television is the state that
   * screen was cleaned up to stop being: the film on the glass, shrunk, with
   * the channel list back beside it and every control of it on the other
   * device. There is no control here that reaches it — no Home, no tab — but
   * on the web the browser's own back button and address bar leave any screen
   * in this application, and that route was reaching it.
   *
   * So leaving the television gives the screen role up, which stops the film
   * on this device and tells the server, so that the *Watch on* switch on the
   * device holding the room stops saying the picture is over here. **The act
   * is the same one that switch performs** and not a new kind of withdrawal:
   * it says nothing about the room, the account stays present on the other
   * instance, and the party's clock runs on for anybody else watching. It is
   * the fourth way out of this state and the only one that leaves your
   * standing in the channel alone — the three rungs all change it.
   *
   * **A layout effect rather than an effect**, which is the one subtlety: the
   * cleanup of a passive effect runs after the frame is painted, so the corner
   * this exists to forbid would be drawn once on the way out. This one runs
   * inside the commit, and the state it sets is flushed before the paint.
   *
   * **Refs because the cleanup has no deps**, the same shape as `collapse`
   * above: what is wanted is the last thing that was true while this screen
   * was on the glass, not the value some render closed over.
   */
  /**
   * **A film sent here takes the device, whatever it was showing.**
   *
   * The ask is somebody at another of this account's devices deciding that
   * the picture belongs on this glass, and there is no tap coming on this one
   * — so it is an assignment rather than an offer, and `App.tsx` answers it by
   * opening the channel. What that alone does not reach is this screen's own
   * three: the profile, the settings screen and a transcript are early
   * returns *above* the television, and all three are component state that a
   * change of `channelId` does not touch. A browser sitting in another
   * channel's settings, handed a film, went on drawing a settings screen —
   * now for the channel the film is in, which is the one state worse than
   * having ignored the ask.
   *
   * Cleared when this device becomes the second device rather than when the
   * ask lands, because the ask is spent by `App.tsx` before this screen is
   * mounted and cannot be read here. Becoming a television is the same fact a
   * render later, and it is the one this screen can see.
   */
  useEffect(() => {
    if (!secondDevice) return;
    setViewing(null);
    setSettingsOpen(false);
    setTranscriptFor(null);
  }, [secondDevice]);

  const television = useRef(false);
  television.current = secondDevice;
  const releaseScreen = useRef(app.showScreenFor);
  releaseScreen.current = app.showScreenFor;
  useLayoutEffect(
    () => () => {
      if (television.current) releaseScreen.current(null);
    },
    []
  );

  /**
   * **The film comes up on the device you are looking at.**
   *
   * *Watch on* had a third answer until 2026-09-18 — neither segment chosen,
   * for a party loaded with the film on nothing — and what that meant in
   * practice is that starting a watch party showed you no film until you
   * noticed a switch you had not touched. Watching is the point; the device
   * in your hand is the obvious place; so it is the default, and the switch
   * is how you move it rather than how you turn it on.
   *
   * **Only when no device of mine is already showing it**, which is what
   * keeps two of somebody's own instances from fighting over it. The server
   * takes the film off every other instance the moment one declares — see
   * `screens.showing` in server/src/ws.ts — so without this guard a phone
   * and a laptop both open on the same channel would each declare, each be
   * evicted by the other, and each declare again.
   *
   * Even in the race where both read *nobody is showing it* in the same
   * instant, this settles in one round: the evicted instance is told, learns
   * `screensElsewhere`, and stops asking. What it must not do is ask again
   * on being evicted, which is why the condition is about where the film is
   * and not about what this device would prefer.
   *
   * **Once per film, and that is what makes it a default rather than a
   * rule.** Handing the picture to the laptop clears this device's own role
   * a moment before the server says where the film went, so a standing
   * invariant would read that gap as *nobody is showing it* and take the
   * film straight back. A default is something that happens when a film
   * arrives; after that, where it plays is the switch's business and this
   * has no further opinion. A new video is a new film and defaults again.
   *
   * **And only for a device that is stepped in**, which is the whole of the
   * rule: *this device* is the default in the room, and *other device* is
   * the default outside it. Somebody reading a channel they have stepped out
   * of has not asked to watch anything, and a film starting on its own in
   * front of them — with its sound — is the thing this must not do.
   *
   * Not marked as taken while stepped out, deliberately, so that stepping in
   * later is what the default waits for rather than something it has already
   * missed. **And stepping out again does undo it, which is the change of
   * 2026-09-19** — it used to leave an existing screen where it was, on the
   * grounds that this is a default rather than an invariant, and that was
   * affordable while the picture only existed on one tab. It is mounted
   * wherever you are in the channel now, so leaving the room has to be what
   * turns it off; see the effect above.
   */
  /**
   * How wide the scrubber is, so a tap on it can be turned into a position.
   *
   * A ref rather than state: it is read inside the press that follows the
   * layout, never rendered, and putting it in state would re-render the
   * channel every time the track was measured. **Declared up here with the
   * other hooks**, every one of which has to stay above this screen's early
   * returns — one below them crashed the app on entering any channel for a
   * build.
   */
  const trackWidth = useRef(0);

  const defaulted = useRef<string | null>(null);
  /**
   * Whether the mark above was spent on *another device has it* rather than on
   * this device taking the film.
   *
   * **Because a deferral is not a decision, which is the repair of
   * 2026-09-24.** `screenElsewhere` is a push, and a push can be retracted a
   * round trip later — so the default could read *the laptop has it*, spend
   * its one chance on that reading, and then watch the reading go away. What
   * it left behind is the state the watch card has no branch for: no device is
   * the screen, nothing in the account says one is, and the transport runs
   * above an empty space with no button under it.
   *
   * A deploy is how it was reached. Every instance reconnects inside the same
   * second; one that was the screen restates `screens.showing` from `onopen`
   * before it has processed the step-out that ended its role; the device
   * walking back into the room reads that declaration once, defers to it, and
   * is still deferring when the declaring device gives the role up a moment
   * later. See `screens.showing` in server/src/ws.ts.
   */
  const deferred = useRef(false);
  // Read off `channel` rather than the `party` local below, every hook having
  // to stay above this screen's early returns.
  const filmOn = channel?.watch?.party?.videoId ?? null;
  useEffect(() => {
    // Two things clear the mark, and the second is new as of 2026-09-19:
    // there is no film, or this account has left the room. Leaving takes the
    // picture away — the effect above — so stepping back in has to be able to
    // bring it back, and a mark that outlived the departure would make the
    // second visit the one where nothing happens.
    if (filmOn === null || !inTheRoom) {
      defaulted.current = null;
      deferred.current = false;
      return;
    }
    /*
      **The third thing that clears it: the device deferred to has gone.**

      Narrow on purpose, and each term is load-bearing. `deferred` restricts
      this to a mark spent on somebody else's screen rather than on this
      device's own — so handing the film to the laptop is untouched, which is
      the race the paragraph below is about: that gap has `deferred` false and
      falls straight through to the early return, exactly as it did before.

      What is left is the case where this device stood aside for a screen that
      then stopped being one, and nothing else in the interface will ever ask
      the question again.
    */
    if (deferred.current && !screenElsewhere && app.screenFor !== channelId) {
      defaulted.current = null;
      deferred.current = false;
    }
    if (defaulted.current === filmOn || !steppedIn) return;
    defaulted.current = filmOn;
    deferred.current = screenElsewhere && app.screenFor !== channelId;
    if (app.screenFor === channelId || screenElsewhere) return;
    app.showScreenFor(channelId);
  }, [app, channelId, filmOn, inTheRoom, screenElsewhere, steppedIn]);

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
    handOver(myScreens[0].device);
    setChoosing(false);
    // `handOver` is rebuilt every render and listing it would re-run this on
    // each one; what it closes over — `app` and `channelId` — is listed
    // instead, which is the same dependency said accurately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, channelId, choosing, myScreens]);

  /**
   * Gives the film to another of this account's devices.
   *
   * **And does not stop showing it here, which is the repair of 2026-09-18.**
   * This used to clear its own role in the same breath, so that a switch
   * could not read *other device* while this device was plainly still
   * playing one. What that missed is that `screens.use` only *asks*: the
   * server passes the request to the target, and the film moves when the
   * target declares itself the screen — at which point the server takes it
   * off every other instance anyway, this one included.
   *
   * So the eager clear was the app second-guessing the one thing that can
   * see all of somebody's devices at once, and it opened a window with the
   * film on **nothing**: cleared here, and never picked up there if the
   * target was slow, backgrounded, or no longer had the channel open. A
   * device switch that lands on neither screen is what that looks like.
   *
   * Letting the eviction do it makes *exactly one* true by construction
   * rather than by agreement. The cost is that this device goes on showing
   * the film for the length of a round trip after the press, which is
   * honest — it is still the screen until the other one takes over — and the
   * switch says so, being a reading of where the film is rather than of what
   * was asked for. See `screens.showing` in server/src/ws.ts.
   */
  function handOver(device: string): void {
    app.useScreen(channelId, device);
  }

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
            <Text style={type.heading}>{t.channelGone()}</Text>
            <Text style={[type.muted, styles.centeredText]}>
              {t.channelGoneBody()}
            </Text>
          </>
        ) : (
          <Text style={type.body}>
            {app.status === 'open' ? t.loadingChannel() : t.reconnecting()}
          </Text>
        )}
        <Button
          label={t.backToHome()}
          variant={gone ? 'primary' : 'default'}
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
  const derivedTitle = describeChannel(
    others.map((other) => other.displayName),
    namingWords
  );
  const nameOf = (id: string | null) =>
    view.participants.find((p) => p.id === id)?.displayName ?? t.someone();
  const now = app.serverNow();
  if (channel.status === 'ended') {
    return (
      <View style={styles.centered}>
        <Text style={type.heading}>{t.channelEnded()}</Text>
        <Text style={[type.muted, styles.centeredText]}>
          {t.channelEndedBody()}
        </Text>
        <Button label={t.backToHome()} variant="primary" onPress={onExit} />
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
        // Passed in rather than read there, on `derivedTitle`'s terms: it
        // lives on the snapshot rather than on `ChannelState`, and this
        // screen has already resolved the snapshot.
        publicAt={view.publicAt ?? null}
        publication={view.publication}
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
   * Who in this room has the film up, as the server counts screens.
   *
   * **Only while the film is running**, which is the guard rather than a
   * tidiness: `screening` is a device saying which channel it would show a
   * film for, and it is set from the moment somebody opens a party's channel —
   * so without this the roster would read *watching* at people looking at a
   * room where nothing is playing. A party that has just stopped leaves the
   * declaration standing on every one of those devices until each of them
   * notices.
   *
   * **And a pause says the same thing a stop does**, which is why this asks
   * `status` rather than merely whether there is a party. A film is paused so
   * that the room can talk about it, and everybody's picture is sitting still:
   * *watching* is then a claim about attention that the screen has no evidence
   * for, since a declaration survives the person putting the phone down. The
   * line exists to answer *did the room come with me*, and that question is
   * only live while something is actually playing.
   *
   * Empty from a server older than the field, which draws the roster the way
   * it drew before there was one. See SHIMS.md.
   */
  const watchingNow = channel.watch?.status === 'playing' ? (view.watching ?? []) : [];
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
   * at once you had gone.
   *
   * **It is `false` outright since 2026-09-21**, when a tap stopped ever
   * arriving. It was `!app.tapToLook` while that was a setting, and it decided
   * symmetrically, which was the whole of the argument: if arriving at this
   * screen did not put you in the room, then leaving the room does not take
   * you off this screen. Now nothing arrives here, so nothing leaves here —
   * looking at a channel you are not in is the ordinary state this screen
   * draws, the footer offers Step In, the cards say what the room is doing,
   * and nothing about it wants closing.
   *
   * **Kept as a named constant rather than inlined**, because the question it
   * answers is real and the answer could change again; a `false` threaded
   * through `stepOutOfChannel` says which question is being answered where an
   * absent branch would not. See
   * decisions/2026-09-21-a-tap-only-ever-looks.md.
   *
   * The way off the screen is then the header's *Home*, which is where it
   * already was for anybody who arrived here without stepping in — the same
   * tap doing the same thing, whether or not you were in the room a moment
   * ago. Note that `onClose` is not `onExit` and does not unwatch: closing is
   * navigation, and a screen you are still looking at is one whose snapshots
   * you still want. Stepping out under this setting is neither of those — it
   * gives up the room and leaves the screen exactly where it was.
   */
  const stepOutClosesScreen = false;
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
  const audioNote = describeAudio(audio, useText().channelCards);
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
  // **One rule since 2026-09-20, where this was two.** Driving what is on and
  // putting something new on both ask presence now — an absent member may no
  // longer play or clear a track on an empty channel, which is what build 261
  // was seen doing. Both are still read, because the card greys the two sets
  // of controls separately and a guard that collapses today may part again.
  const mayLoadTrack = canLoadTrack(channel, me);

  // `?? initialWatchState()` for the reason `clip` has its `?? null`: a server
  // that predates this field sends snapshots without it, which is what this
  // build meets between its release and the deploy that follows.
  const watch = channel.watch ?? initialWatchState();
  const party = watch.party;
  /**
   * The films this channel has watched before, newest first.
   *
   * `?? []` for the reason `watch` has its `?? initialWatchState()` — a server
   * that predates the field sends snapshots without it, and a card offering
   * nothing is what every card looked like before this.
   */
  const watchedBefore = watch.history ?? [];
  const watchAt = watchPositionMs(watch, now);
  const mayControlWatch = canControlWatch(channel, me);
  /**
   * Play alone, which is the one thing on the transport a run refuses.
   *
   * Separate from `mayControlWatch` because the other four controls beside it
   * are the ways out of a party and stay available for the length of any run
   * — see `canPlayWatch`. Read here rather than inferred from the recording
   * state so the greyed button and the reducer are one rule, which is what
   * every guard on this screen does.
   */
  const mayPlayWatch = canPlayWatch(channel, me);
  const mayStartWatch = canStartWatch(channel, me);
  /**
   * The two transports, each of which is asked after by the other's card.
   *
   * Read from the same predicates the guards read rather than from `watch`
   * and `playback` here, so the sentence under a greyed control and the rule
   * that greyed it cannot drift apart — which is what the guards live in
   * `core/` for.
   */
  const filmPlaying = watchIsPlaying(channel);
  const trackPlaying = trackIsPlaying(channel);
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

  /**
   * Takes the YouTube link off the clipboard and starts the party on it.
   *
   * **The clipboard is read on the press rather than watched.** Reading it
   * to decide whether a button is enabled would mean polling it — and on iOS
   * every read a person did not ask for is a paste notification, which is the
   * system telling them an app went through their clipboard. So the button is
   * lit whenever the floor allows a film to be put on, and whether there is a
   * link is answered afterwards, in words.
   *
   * The whole of why `parseYouTubeUrl` is in core: this decides whether the
   * press does anything and the server decides whether to accept, and a
   * refusal here and a refusal there must not disagree about what a link is.
   */
  const pasteWatchUrl = async () => {
    setWatchPasteError(null);
    const text = await pasteText();
    if (text === null) {
      setWatchPasteError(t.nothingOnClipboard());
      return;
    }
    const url = text.trim();
    if (parseYouTubeUrl(url) === null) {
      setWatchPasteError(t.notAYouTubeLink());
      return;
    }
    act({ type: 'START_WATCH', url });
    setChanging(false);
  };
  /**
   * Puts a film this channel has watched before back on.
   *
   * **The stored URL rather than the id**, which is what makes this the same
   * act as pasting: `START_WATCH` carries a link and the server parses it with
   * `parseYouTubeUrl`, so a row here goes through exactly the checks a
   * clipboard does. Nothing has to trust the history, and there is no second
   * way into a party for a video nobody has parsed.
   */
  const watchAgain = (url: string) => {
    setWatchPasteError(null);
    act({ type: 'START_WATCH', url });
    setChanging(false);
    setPickingPast(false);
  };
  /**
   * One row per film the channel has watched, stacked down the card.
   *
   * Full-width buttons rather than a row of them, which is STYLE.md § *A
   * choice of more than three goes down the page rather than across it* — and
   * it is the shape the device picker a few hundred lines below already uses,
   * for the same reason: the rungs are named things, and a name is what gets
   * truncated first.
   *
   * **A film keeps whatever it was able to learn about itself.** The title is
   * the one a player reported while it was on, so a party stopped in its first
   * seconds is remembered nameless — the row then says so rather than drawing
   * the URL, a link being machine text that nobody can read back to a film.
   * The length sits under the name where it is known, which is the one fact
   * that separates two versions of the same thing.
   */
  const pastFilmRows = watchedBefore.map((film) => (
    <Button
      key={film.videoId}
      label={film.title ?? t.aFilmNobodyNamed()}
      sublabel={
        film.durationMs === null ? undefined : formatDuration(film.durationMs)
      }
      disabled={!mayStartWatch}
      onPress={() => watchAgain(film.url)}
    />
  ));
  // Two questions, and the interface needs both. `muteRequested` is what the
  // toggle shows — a button that flipped itself back every time the video
  // paused would be a control fighting its owner. `partyMuted` is what is
  // true right now, which is what the roster reports.
  const muteRequested = partyMuteRequested(channel);
  const partyMuted = isPartyMuted(channel);
  /**
   * Whether the room's mute is anybody's to lift, which is a third question
   * and not a rewording of either above.
   *
   * False for a run that began with somebody watching on the device they are
   * in the room on: their screen cannot serve the film in stereo and hold a
   * microphone open at once, so the quiet is the party's condition rather
   * than a preference of whoever pressed the button. See `canUnmuteRoom`,
   * which is the same guard the reducer refuses `SET_WATCH_MUTE` with.
   */
  const mayUnmuteRoom = canUnmuteRoom(channel);

  /**
   * The tabs this account is offered, which is six, always the same six.
   *
   * *Watch* was the one variable tab while watching together was behind Labs,
   * and it is not any more: a tab bar that gains and loses entries as the
   * state of the room changes is the footer's finger-under-the-thumb problem
   * one control up — the thing you were reaching for is somewhere else by the
   * time you land — and the reason to tolerate it was withholding an
   * experimental feature, which is no longer a thing being done here.
   */
  const tabs: readonly {
    value: ChannelTab;
    label: string;
    icon: (color: ColorValue) => React.ReactNode;
  }[] = [
    {
      value: 'people',
      label: t.tabPeople(),
      icon: (color) => <PeopleIcon color={color} />,
    },
    {
      value: 'notepad',
      label: t.tabNotepad(),
      icon: (color) => <NotepadIcon color={color} />,
    },
    {
      value: 'invites',
      label: t.tabInvite(),
      icon: (color) => <InviteIcon color={color} />,
    },
    {
      value: 'listen',
      label: t.tabListen(),
      icon: (color) => <ListenIcon color={color} />,
    },
    {
      value: 'recordings',
      label: t.tabRecordings(),
      icon: (color) => <RecordingsIcon color={color} />,
    },
    {
      value: 'watch',
      label: t.tabWatch(),
      icon: (color) => <WatchIcon color={color} />,
    },
  ];
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
    screen.name ?? (screen.client === 'web' ? t.aBrowser() : t.anotherPhone());

  /** What the copy button says, once it has been pressed. */
  const copyLabel = (which: 'video', idle: string) =>
    watchCopied?.which !== which
      ? idle
      : watchCopied.ok
        ? t.copied()
        : t.copyFailed();

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
      setClipError(t.nothingOnClipboard());
      return;
    }
    if (text.length > MAX_CLIP_LENGTH) {
      // Refused here rather than sent and silently dropped by the reducer: a
      // paste travels as a socket action, which reports nothing back that this
      // screen shows. The cap is imported rather than restated so the sentence
      // and the rule cannot drift apart.
      setClipError(t.clipTooLong(MAX_CLIP_LENGTH));
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
        t.couldNotShare(),
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
          <Text style={styles.headerKind}>{t.headerKindChannel()}</Text>
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
                  ? t.recordingPaused()
                  : t.recording()
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
                {channel.recording.status === 'paused' ? t.paused() : t.recording()}
              </Text>
              <Text style={styles.recordingTime}>
                {formatDuration(recordedMs(channel.recording, now))}
              </Text>
            </View>
          ) : null}
          <IconButton
            label={t.settings()}
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
            label={t.home()}
            icon={(color) => <HomeIcon color={color} />}
            /*
              Counted, because the right swipe does exactly this and nobody
              knows which of the two people reach for. The glyph's own number
              means nothing on its own — it is large when the app is used and
              small when it is not — so it is the share against `swipeOut`
              that is the figure, and neither half can be read without the
              other. See `core/navigation.ts`.

              **This press and not `onClose`.** The same handler is the way
              off two other screens in here — the error wall and the empty
              state, both labelled *Back to home* — and those are somebody
              getting out of a dead end rather than choosing between two ways
              to leave a conversation. Counting them here would pad the
              control the swipe is being compared against.
            */
            onPress={() => {
              app.recordNav('home');
              onClose();
            }}
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
        <Segmented options={tabs} value={tab} onChange={chooseTab} />
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
  /**
   * **The three rungs, which are one slot each and are drawn in two places.**
   *
   * The channel's own footer has them after the microphone and the floor, and
   * the second device's footer has them and nothing else — the same elements
   * rather than two sets that must be kept in step, for the reason
   * {@link watchTransport} is one row: a rung that learnt something in one of
   * them and not the other is the drift this extraction exists to prevent.
   *
   * **Only one of the two footers is ever mounted**, the second device being
   * an early return, so there is no question of these appearing twice.
   */
  const rungs = (
    <>
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
        label={t.rungIn()}
        hint={iAmPresent ? t.rungInHintPresent() : t.rungInHint()}
        icon={(color) => <StepIcon color={color} out={false} />}
        selected={iAmPresent}
        onPress={() => act({ type: 'ENTER' })}
      />
      <FooterAction
        label={t.rungNearby()}
        hint={iAmNearby ? t.rungNearbyHintOn() : t.rungNearbyHint()}
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
        label={t.rungOut()}
        hint={
          iAmPresent
            ? t.rungOutHintPresent()
            : iAmNearby
              ? t.rungOutHintNearby()
              : t.rungOutHint()
        }
        icon={(color) => <StepIcon color={color} out />}
        selected={!iAmPresent && !iAmNearby}
        // Never refused, from either rung above it: a departure is the one act
        // nothing on this screen can withhold. `stepOut` rather than a bare
        // action, since whether leaving closes the screen is one question with
        // one answer for the footer and the card alike.
        onPress={stepOut}
      />
    </>
  );

  const footer = (
    <View style={styles.footer}>
      <View style={styles.footerInner}>
      <FooterAction
        label={iAmSelfMuted ? t.unmute() : t.mute()}
        hint={
          noInput
            ? t.noMicrophone()
            : iAmSelfMuted
              ? t.microphoneMuted()
              : t.microphoneOpen()
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
        label={iHoldFloor ? t.release() : t.claim()}
        hint={iHoldFloor ? t.youHaveTheFloor() : t.claimTheFloor()}
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
      {rungs}
      </View>
    </View>
  );

  /**
   * **The transport, which is one row drawn in two places.**
   *
   * The card has it under the picture and the expanded picture has it over
   * the bottom of itself, and they are the same component rather than two
   * that must be kept in step — a scrubber that learnt a new trick in one of
   * them and not the other is exactly the drift `watch/Transport.tsx` exists
   * to prevent. Both may now be mounted at once, the expanded one being drawn
   * by `Picture`; each holds the width of its own track, so that is no longer
   * a question this screen has to answer.
   *
   * Null with no party, there being nothing to drive.
   *
   * **Taken as an argument since 2026-09-20, for the one thing the two places
   * do not share.** The film's name is drawn under the progress bar in a
   * body — on the card and on a *second device*, both of which are a page
   * somebody is reading — and not on the expanded picture, where the scrim
   * carries the transport and *Exit full screen* and nothing else. That rule
   * is the day's other decision and this is the first thing it has had to
   * refuse; a flag rather than a second copy of the row, which is what this
   * extraction exists to prevent.
   */
  /**
   * **The transport, wherever it is drawn.**
   *
   * The row itself left this file on 2026-09-23 — `watch/Transport.tsx` — so
   * that the expanded picture's copy could be drawn by `Picture`, which is
   * this screen's ancestor and cannot be handed an element made here. What is
   * left is the derivation, which is this screen's to do: who may drive the
   * film, and how far in the room has got.
   */
  const watchTransport = (withTitle: boolean) => (
    <WatchTransport
      watch={watch}
      party={party}
      watchAt={watchAt}
      mayControl={mayControlWatch}
      mayPlay={mayPlayWatch}
      withTitle={withTitle}
      act={act}
    />
  );

  /**
   * **The hole the docked picture is drawn into, and nothing else.**
   *
   * The film itself is not mounted here and has not been since 2026-09-19. It
   * hangs above the route table — `watch/Picture.tsx` — because a `WebView` is
   * rebuilt the instant it is reparented, so wherever it is mounted is the
   * furthest anybody can go without losing the film. Mounted on this screen,
   * going Home lost it; mounted on the *Watch* tab before that, a tab bar did.
   *
   * What is left here is the *Watch* tab's half of the arrangement: a pinned
   * row has to take its own height out of the body so that nothing is hidden
   * beneath it, and a picture positioned over the whole application cannot do
   * that. So this reserves the height and reports where it ended up, and the
   * picture lays itself over it. See `DockSlot`, which is both halves.
   *
   * **Null in exactly the three cases there is nothing to make room for**: no
   * party, a film on another device of this account's, and full screen — which
   * is an early return below with a player of its own.
   *
   * Every other tab leaves no hole, which is the whole of how the picture
   * knows to float: the absence of one *is* the instruction.
   */
  const dockSlot =
    party && screeningHere && !fullScreen && tab === 'watch' ? <DockSlot /> : null;

  /*
    **The picture, filling the phone, and the channel still under it.**

    An early return rather than an overlay, which is this codebase's shape for
    a screen that replaces another — the profile, the settings and the
    transcript above are all the same move, and there is no `Modal` in this
    application at all. See `Introduction`, which argues it.

    **What it costs is a reload, and the cost is affordable for one reason.**
    Expanding reparents the `WebView`, so the page is rebuilt and the film
    starts again from nothing, and so does collapsing. The channel holds the
    position and the play state, and `useFollow` puts a fresh player back where
    everybody is without being asked — so the price is a few seconds of black
    and a buffer for the person who pressed it, not a lost place in the film
    and nothing at all for anybody else. Avoiding it means hoisting the player
    out of the scroll and floating it over a measured placeholder, which is a
    great deal of machinery for a second of black; it is the thing to do if the
    flash turns out to be what people complain about.

    Guarded on both halves rather than on `fullScreen` alone, so that the
    render is impossible to reach with nothing in it — the effect above
    collapses these away, and this is what holds between the state changing and
    the effect running.

    **The footer is not passed, as of 2026-09-20.** It was, for a day, on the
    argument that this is a talking application before it is a video one and
    that an evening where nobody can reach their own microphone without first
    leaving the film is the wrong trade. What is passed now is the transport
    and the way out, and nothing else: expanded, the only controls are the
    film's and the one that ends the state. The room's five — mute, the floor,
    and the three rungs — are one press or one turn of the wrist away, so the
    bar was buying reachability that was never more than a second off, at a
    fifth of a sideways phone. See `FullScreen`, which carries the rest of it.
  */

  /*
    **Nothing, while the picture has the glass.**

    The old early return handed back `FullScreen` with a player inside it;
    what is left of it hands back nothing, and the two are the same statement.
    The picture is drawn above this whole route table and covers it, so
    anything rendered here would be underneath an opaque film.

    **It is not merely a saving.** A screen left mounted behind the picture is
    one whose buttons still answer a finger at the edges of the scrim and
    still appear to VoiceOver, which reads out a roster nobody can see over a
    film. Drawing nothing is what keeps the expanded picture the only thing
    there is, which is what it is for.

    The publication above runs either way, being an effect: what the scrim may
    offer is this screen's to say, and saying it is now the whole of this
    screen's part in the state.
  */
  if (fullScreen && party && screeningHere) return null;

  /*
    **The second device, which is a television and is drawn as one.**

    An early return, the same shape as the one above it and as the settings,
    the profile and the transcript: this codebase replaces a screen rather
    than putting a layer over it, and there is no `Modal` in the application
    at all.

    **Everything on it is about the film.** The transport — the scrubber, the
    two fifteen-second seeks and play/pause — and *Full screen*, and the three
    rungs in the footer. What is deliberately not here is every other control
    of the party: *Watch on*, *Stop watching*, the field that swaps the video,
    the room's mute, the share links, and the five other tabs with the roster
    and the floor and the microphone on them. Those all stayed where the
    person is, which is the device holding the room — and the whole of the
    reason a party has two devices is that the film is not there.

    **The rungs are one way out of this state, and *Other device* is the
    other.** *In* takes the room, which makes this the first device and hands
    back the ordinary channel screen a render later; *Nearby* and *Out* both
    leave the room, which gives up the screen role and stops the film. All
    three are answers to the room, which is why the fourth exists: declining
    the job is a fact about this glass and leaves the account standing exactly
    where it stood — it pauses the film and sends the picture back to the
    device holding the room, which is the *Watch on* switch thrown the other
    way rather than anything new. See the button below.

    **The header is a caption and holds no controls at all.** *Home* was there
    for a day, on the argument that a way off a screen is navigation rather
    than a control and that without one this device is an application that
    cannot be used for anything else until somebody stops watching. That is
    true of a television, which is the thing this screen is: the way off it is
    to stop watching, and that is a rung. A second device is not a phone
    somebody is also reading on — it is the screen in the corner of the room,
    and the account is holding the other device, where every way into the rest
    of the application already is. The settings gear went for the same reason
    it always had: it is a channel control. So is the recording pill, which is
    a fact about the room rather than about the film.

    **The list beside it goes too, and by the same claim the expanded picture
    makes** — see the `useWholeWindow` call above. Above `SPLIT_AT` this screen
    had every other channel in a column down its left, which is the remote
    control drawn a second time on the device that exists because the remote
    control is somewhere else.

    **The hole, not the player.** `DockSlot` reserves the height and reports
    where it landed, and the one `WebView` above the route table lays itself
    over it — mounting a second player here would be two pages, two buffers
    and two sets of audio on one party. Same slot, same two shapes, same
    arithmetic as the *Watch* tab's; see `watchShapeFor`.
  */
  if (secondDevice && party) {
    return (
      <Screen
        header={
          <View style={styles.header}>
            <View style={styles.headerInner}>
              <View style={styles.headerTop}>
                <View style={styles.headerMain}>
                  <Text style={styles.headerKind}>{t.headerKindWatching()}</Text>
                  <Text style={styles.otherName} numberOfLines={1}>
                    {channel.name ?? derivedTitle}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        }
        /*
          **Three slots rather than four, which does not bend the footer's
          rule.** That rule is that a control never moves under a thumb
          already on its way to it, and it is about one bar on one screen
          across every state that screen can be in — this bar is three rungs
          in all of them. A screen with its own footer is not the channel's
          footer changing shape: Home has none at all.
        */
        footer={
          <View style={styles.footer}>
            <View style={styles.footerInner}>{rungs}</View>
          </View>
        }
        aside={<DockSlot />}
        asidePlace={watchShape.columns === 2 ? 'beside' : 'above'}
        contentStyle={styles.secondDeviceBody}
      >
        {watchTransport(true)}
        {/*
          Ungated by the floor, like the one on the watch card and unlike the
          transport beside it: how big the film is on this device is nobody
          else's business and nothing about it reaches the channel.
        */}
        <Button label={t.fullScreen()} onPress={() => setPressedFullScreen(true)} />
        {/*
          **The one control here that is not about the film, and it is about
          this device rather than about the party.** It declines the job: the
          film stops being on this glass, the screen role goes back, and the
          *Watch on* switch on the device holding the room stops saying the
          picture is over here. The account stays present on the other
          instance, nobody's microphone changes, and nothing about the room
          moves at all.

          **It is the *Watch on* switch thrown the other way, and so it does
          what throwing that switch does — both halves of it.** The switch
          refuses a move while the film is running, and says so: *pause the
          film to move it to another device*. A press here is that move, made
          from the far end, so it pauses first rather than tearing the picture
          off a running scene — and then asks another of this account's
          devices to take it, which is the *other device* answer said from a
          television, where the other device is the one holding the room.

          **Without the second half the film lands on nothing, playing**, and
          that is a dead end rather than a state: no device is showing it, and
          the switch that would move it somewhere is disabled precisely
          because it is still running. The person who walked away from the
          television then has to find the transport on their phone and pause a
          film they cannot see in order to get it back. So the picture follows
          them: paused, on the device in their hand.

          **The pause is the channel's**, which is the one thing here that
          everybody else feels: a film has one clock and pausing it stops it
          for the party. That is not a cost this press invents — it is what
          the switch has always charged for moving a picture between devices,
          and the sublabel now says it rather than promising the party plays
          on, which it did and which was the half that was untrue.

          The pause is best-effort and the hand-off does not wait on it. A
          television without the floor cannot pause anything — `mayControlWatch`
          governs the transport above — and the server refuses that press; the
          decline is about this glass either way and is not the channel's to
          allow.

          **The device standing in the channel, asked for by description.**
          Not the picker's pair of `listScreens` and `choosing`, which is what
          this did for half a day: that list says which of the account's
          instances are signed in and nothing about where the person is, so a
          television reading it was choosing between devices when it already
          knew the answer — the film goes back to the one holding the room.
          The server resolves it, being the only thing that can see all of
          somebody's sockets at once; see `screens.use` in server/src/ws.ts.
          Releasing the role here rather than leaving it to the eviction — the
          reverse of `handOver`'s rule — because the film going off *this*
          screen is the whole of what was asked for, and waiting a round trip
          for a device that may never answer is the one outcome a decline may
          not have.

          **It is here because the rungs were the only way out and all three
          of them are answers to the room.** *In* takes the presence, *Nearby*
          and *Out* leave; a person who simply does not want the film on this
          particular screen had to change their standing in the channel to say
          so. This is the fourth way out and the only one that leaves that
          standing alone.

          **Not *Home*, which is what this was first**, and not a second
          *Stop*: Home is navigation and would have been carrying a second
          meaning it does not carry anywhere else in the app, and *Stop* on
          the watch card is `STOP_WATCH`, which ends the film for the whole
          channel. This ends nothing.

          **The switch's own words, and since 2026-09-20 they are exactly
          its own words.** It read *Not on this device* first, which is the
          answer said in the negative — a third phrasing of a question the
          app already asks in two segments, and one that names what it is
          not rather than where the film goes. *Other device* is what the
          switch would say from here, said from here, and it is the answer
          this press actually gives: the film moves to the account's other
          device. See GLOSSARY § *Screen*.

          **Full width under *Full screen* rather than beside it.** Two
          `flexButton`s would put this in half a phone's card, which is about
          140 points, and the label does not survive it; STYLE.md § *Button*
          carries the arithmetic.

          The sublabel is what carries this rather than the fill, which since
          2026-09-21 is the same one every button has. It says *leaves this
          screen* rather than *stops*: what a reader needs before the tap is
          that this is not the film ending, and *screen* is the role being
          handed back. That sentence was doing the work even while a quieter
          tone was available to say it alongside.
        */}
        <Button
          /*
            **The same words the card uses, since 2026-09-23.** This device is
            showing the film, so the offer it makes is the one any device
            showing the film makes; it said *Other device* when the card had a
            switch with a segment of that name to match. The sublabel is what
            keeps it honest — from here *another device* means the one holding
            the room, and there is no picker, a second device's way out being
            to give the film back rather than to pass it on.
          */
          label={t.watchOnAnotherDevice()}
          sublabel={t.handBackSublabel()}
          onPress={() => {
            /*
              **It paused the film first until 2026-09-23**, for the reason
              the *Watch on* switch refused a running one, and it stops for
              the same reason: the film does not restart on the far side, it
              carries on from where the room has got to. Handing the picture
              back is not an ending and no longer looks like one.
            */
            app.showScreenFor(null);
            // Null is *the device standing in this channel*, which is the one
            // the person is holding and the one no list can name.
            app.useScreen(channelId, null);
          }}
        />
        {/*
          The one sentence on the screen, and it is here because the state is
          not self-evident: a device showing a film with almost nothing beside
          it has to say where the rest of the controls went. It names the
          other device rather than listing what is missing — and it is a
          readout, so § *The cards a footer made redundant* has no claim on
          it: it repeats no control on this screen or any other.

          **No *room* in it**, which is the one word it wanted and may not
          have: the interface never calls a channel that, the media layer's
          `Room` being LiveKit's noun for a LiveKit thing. See
          `planning/decisions/README.md` § *On vocabulary*.
        */}
        <Text style={type.muted}>{t.filmIsOnThisDevice()}</Text>
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      footer={footer}
      aside={dockSlot}
      /*
        **Beside the card on a wide pane, above it otherwise.** The picture and
        the transport compete for height in one column and for nothing at all
        in two, so a pane with room for both gets both; `watchShapeFor` in
        `ui/layout.ts` holds the rule and the arithmetic. Passed even when
        there is no hole, which costs nothing and keeps this from being a
        second place that decides when there is one.
      */
      asidePlace={watchShape.columns === 2 ? 'beside' : 'above'}
      contentStyle={styles.container}
    >
        {/*
          Why you are in a room with people you have never met.

          **Above the tab content rather than on one tab**, so it is the first
          thing under the switch whichever of the six is showing. Somebody who
          lands on *Notepad* and finds four strangers in a channel they did not
          open has the same question as somebody who lands on *People*, and an
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
            <Text style={type.body}>{t.cohortTitle()}</Text>
            <Text style={type.muted}>{t.cohortWhy()}</Text>
            <Text style={type.muted}>{t.cohortWho()}</Text>
            <View style={styles.cohortActions}>
              <Button label={t.gotIt()} onPress={cohortNotice.dismiss} />
            </View>
          </Card>
        ) : null}
        {/*
          That this channel has a public page, said to somebody who has not
          been told.

          **The decision it reports is not this card's to take, and the card
          says nothing that implies otherwise.** Any member may give a channel
          a page and any member may take it down, which is unchanged; this
          exists because that decision used to be visible only to the person
          who made it. Somebody added to a channel that went public last month
          arrived into a settled fact with no moment at which they were ever
          shown it, and the only place it was written down is a settings screen
          most people never open. So the sentence is owed once, to everybody,
          and the absence of a row on the server is the debt — see db.ts §
          public_notices.

          **What it must not become is a consent card.** Nobody is being asked
          to agree, because nothing here turns on their answer: their voice is
          protected by a different mechanic entirely, per recording and
          unanimous, and offering a button that looked like a veto over the
          page would promise a power the next tap would fail to deliver. The
          third line is the one that does the work — it says what is and is not
          published, and where the decision that matters is actually taken.

          Above the tab content for the *getting-started* card's reason: the
          question is the same whichever of the six tabs somebody landed on,
          and an explanation filed under one is one most of them never reach.
          It is a readout with a way to put it away and repeats nothing in the
          footer, so `hideControlCards` has no claim on it either.
        */}
        {view.publicNotice && publicNoticeRead !== channelId ? (
          <Card style={styles.cohort}>
            <Text style={type.body}>{t.publicNoticeTitle()}</Text>
            <Text style={type.muted}>{t.publicNoticeWhat()}</Text>
            <Text style={type.muted}>{t.publicNoticeRecordings()}</Text>
            <View style={styles.cohortActions}>
              <Button
                label={t.gotIt()}
                onPress={() => {
                  // Optimistic, then sent. A failure leaves the card to come
                  // back on the next snapshot, which is the honest outcome:
                  // the server has no record of this person having read it.
                  setPublicNoticeRead(channelId);
                  void app.acknowledgeChannelPublic(channelId).catch(() => {});
                }}
              />
            </View>
          </Card>
        ) : null}
        {tab === 'people' ? (
          <>
        <View style={styles.presence}>
          {/*
            **The four groups this tab draws, each under its own label.**

            The tab is *People*, which names the container; the labels name
            what each group is, which the tab deliberately no longer does.
            Until 2026-09-22 this tab was called *Members* and drew all four
            groups unlabelled — a name narrower than its contents, on the
            argument that the heading over a list of people should say whose
            room it is. Adding guest invitations, which are neither members
            nor anybody in the room, is what broke that: the seam the name was
            papering over now has four sides to it.

            **These four were chosen against Spanish as well as against each
            other.** *Members* beat *Roster* on 2026-09-14 partly because it
            translates and *roster* does not, and that reason reached none of
            the three places the rename was written up. One of the four was
            picked *around* a collision: *invitado* is both *guest* and
            *invited*, so the pending-seat group is named with the noun rather
            than the participle — *Invitations* rather than *Invited as
            guests*, which renders as *invitados como invitados*.

            **The Spanish itself is no longer written here**, as of
            2026-09-23: these are catalogue messages now, and
            planning/GLOSSARY.md § *Part Three* is where the vocabulary is
            settled. What this comment keeps is why the English words are the
            words, which is the half a reader of this file needs.

            **A label per group, drawn only when the group has somebody in
            it** — except *Members*, which always does and which now carries
            the vocabulary the tab's old name taught.
          */}
          <SectionLabel>{t.members()}</SectionLabel>
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
                // Whether they have the film up, from the snapshot rather
                // than from `watchingHere` — which is the microphone's list
                // and says nothing about a second device. See
                // `ChannelView.watching`.
                watching={watchingNow.includes(participant.id)}
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
              {t.partyMuted()}
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
              {takenByAnotherDevice ? t.elsewhereTaken() : t.elsewhere()}
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
              {t.justSteppedIn(describeChannel(arrived.map(nameOf), namingWords))}
            </Text>
          ) : null}

          {/*
            **How to be heard, for as long as somebody has not been.**

            The third sentence under the roster, and the only one of the three
            that is an instruction rather than a claim about the room. That
            makes it the one thing on this screen the footer already says —
            `rungIn`'s hint is *Step in to the conversation* — so § *The cards
            a footer made redundant* has to be answered rather than assumed:
            what it adds is that the hint is not read. A `FooterAction`'s hint
            is its accessibility label and nothing else draws it, so the word
            under the thumb is *In* alone, and *In* does not teach anybody that
            the room they are looking at cannot hear them. That is the gap this
            fills, and it is a sentence rather than a card for the same reason
            the arrival is one: there is no control here that the footer does
            not already carry.

            **It retires, which is what keeps it from being repetition.**
            `learningToStepIn` is true only while the ladder is still asking
            for a first conversation, so this is drawn for an account in its
            first days and for nobody else — the rule the section states is
            about the screen every reader sees for ever, and an instruction
            that goes away the moment it has been taken up is not that. See
            `decisions/2026-09-24-the-channel-screen-says-how-to-be-heard.md`.

            **Not while the room is held on another device**, where the
            sentence directly above already says what stepping in here does and
            this one would contradict it: somebody in the channel on their
            other phone can hear perfectly well.
          */}
          {!iAmPresent &&
          !elsewhereOnAnotherDevice &&
          learningToStepIn(app.introduction) ? (
            <Text style={type.muted}>{t.howToBeHeard()}</Text>
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
          {iAmPresent && (channel.knocks ?? []).length > 0 ? (
            <SectionLabel>{t.atTheDoor()}</SectionLabel>
          ) : null}
          {(iAmPresent ? (channel.knocks ?? []) : []).map((knock) => (
            <Card key={knock.id} style={styles.stack}>
              <Text style={type.body}>
                <Text style={type.heading}>{t.knockLead(knock.name)}</Text>
                {t.knockRest()}
              </Text>
              <Text style={type.muted}>{t.knockWhatTheyGet()}</Text>
              <View style={styles.guestActions}>
                <Button
                  label={t.letThemIn()}
                  onPress={() =>
                    act({ type: 'ANSWER_KNOCK', knockId: knock.id, accept: true })
                  }
                />
                <Button
                  label={t.no()}
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
          {Object.keys(channel.guests ?? {}).length > 0 ? (
            <SectionLabel>{t.guests()}</SectionLabel>
          ) : null}
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

          {/*
            **The fourth group, and the only one that is nobody in the room.**
            Named on 2026-09-22 with the other three labels and drawn from
            2026-09-22, when a pending invitation reached `ChannelState` so
            that it could occupy one of the forty it promises.

            Shown to members and not to guests: `guestView` builds its roster
            by enumerating `present` and `guests` rather than by spreading the
            state, so this stays out of a guest's screen without anything
            having to withhold it. Who has been asked in is administration, and
            a guest's roster is who is here.
          */}
          {pendingGuests(channel, now).length > 0 ? (
            <SectionLabel>{t.invitations()}</SectionLabel>
          ) : null}
          {pendingGuests(channel, now).map((invited) => (
            <Card key={invited.id} style={styles.stack}>
              <View style={styles.inviteRow}>
                <Text style={[type.body, styles.inviteName]} numberOfLines={1}>
                  {invited.name}
                </Text>
                {/*
                  **No clock, which is the member invitation's precedent.**
                  A roster row says *Invited* about somebody who has never
                  been here and gives no interval, because there is no visit
                  to count from — see `ParticipantCard`, which argued this out
                  at length. The same is true here and more so: this one is
                  not even a member.

                  Its own guard rather than `canManageGuest`, which would
                  refuse every row in this group — an invited seat is
                  deliberately not in `guests`.
                */}
                <Button
                  label={t.takeBack()}
                  disabled={
                    !canWithdrawGuestInvite(channel, me, invited.id, now)
                  }
                  onPress={() => {
                    void app.withdrawGuestInvite(channel.id, invited.id);
                  }}
                />
              </View>
              <Text style={type.muted}>
                {invited.invitedBy === me
                  ? t.youAskedThemIn()
                  : t.theyAskedThemIn(nameOf(invited.invitedBy))}
              </Text>
            </Card>
          ))}

          {/* Same delay as Home's: a foreground drops the socket every time,
              and this used to announce it the instant it happened. */}
          {showOffline ? (
            <Text style={styles.warning}>{t.reconnectingIsLeaving()}</Text>
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
            <SectionLabel>{t.audio()}</SectionLabel>
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
            <SectionLabel>{t.audioDiagnostics()}</SectionLabel>
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

        {tab === 'notepad' ? (
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
        <SectionLabel>{t.sharedClipboard()}</SectionLabel>
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
                      ? t.copied()
                      : copied === 'failed'
                        ? t.copyFailed()
                        : t.copy()
                  }
                  variant="primary"
                  style={styles.flexButton}
                  onPress={() => void copyClip()}
                />
                {clipUrl ? (
                  <Button
                    label={t.open()}
                    style={styles.flexButton}
                    onPress={() => void openUrl(clipUrl, linkWords)}
                  />
                ) : null}
                <Button
                  label={t.clear()}
                  style={styles.flexButton}
                  disabled={!canClearClip(channel, me)}
                  onPress={() => act({ type: 'CLEAR_CLIP' })}
                />
              </View>
            </>
          ) : (
            <Empty>{t.nothingOnTheChannelClipboard()}</Empty>
          )}

          <Button
            label={clip ? t.replaceWithMyClipboard() : t.pasteMyClipboard()}
            disabled={!canPasteClip(channel, me)}
            onPress={() => void pasteClip()}
          />

          <Text style={type.muted}>
            {canPasteClip(channel, me) ? t.oneClipboard() : t.stepInToPaste()}
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
        <SectionLabel>{t.notepad()}</SectionLabel>
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
                  placeholder={t.notepadPlaceholder()}
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
                  label={t.done()}
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
                      ? t.notepadEmptyWritable()
                      : t.notepadEmpty()}
                  </Text>
                )}

                {mayWriteNotepad ? (
                  <Button
                    label={t.edit()}
                    style={styles.notepadEdit}
                    onPress={() => setNotepadEditing(true)}
                  />
                ) : notepadShown.trim() ? (
                  <Text style={type.muted}>{t.stepInToWrite()}</Text>
                ) : null}
              </>
            )}
          </Card>
        </Reveal>

          </>
        ) : null}

        {tab === 'listen' ? (
          <>

        {/*
          No label over it, since 2026-09-13. The tab is called *Listen* and
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
                  label={t.back15()}
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: 'SEEK', positionMs: position - SKIP_MS })
                  }
                />
                <Button
                  label={playback.status === 'playing' ? t.pause() : t.play()}
                  variant="primary"
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: playback.status === 'playing' ? 'PAUSE' : 'PLAY' })
                  }
                />
                <Button
                  label={t.forward15()}
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() =>
                    act({ type: 'SEEK', positionMs: position + SKIP_MS })
                  }
                />
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label={t.quieter()}
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
                  label={t.louder()}
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
                  label={upload ? uploadingLabel(upload.percent, t) : t.change()}
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
                  label={trackSharing ? t.preparing() : t.share()}
                  style={styles.flexButton}
                  disabled={trackSharing}
                  onPress={takeTrack}
                />
                <Button
                  label={t.remove()}
                  style={styles.flexButton}
                  disabled={!mayControlPlayback}
                  onPress={() => act({ type: 'CLEAR_TRACK' })}
                />
              </View>
            </>
          ) : (
            <Button
              label={
                upload ? uploadingLabel(upload.percent, t) : t.playSomethingTogether()
              }
              sublabel={t.anAudioFile()}
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
              label={t.cancelUpload()}
              disabled={!upload.cancel}
              onPress={() => upload.cancel?.()}
            />
          ) : null}

          <Text style={type.muted}>
            {filmPlaying
              ? // First, because it greys every control on this card and no other
                // branch here would explain why. **Pausing is the way out**, not
                // stopping the party — said in those words because the control
                // that lifts this is on another tab, and a reader who is not told
                // which one goes looking for it here. See `watchIsPlaying`.
                t.filmIsPlaying()
              : theyHoldFloor
                ? // The point of the mechanic, stated where it bites: the track
                  // does not stop, but it stops being yours to change.
                  t.theyDecideWhatPlays(holderName)
                : iHoldFloor
                  ? t.youDecideWhatPlays()
                  : !mayControlPlayback
                    ? // The only remaining way these are disabled, the floor
                      // and the film having been ruled out above. It used to
                      // be followed by a second sentence for the member
                      // standing outside an empty channel, who could drive
                      // what was loaded but not replace it; since 2026-09-20
                      // that person is refused both and this covers them.
                      t.stepInToPlay()
                    : track
                      ? t.everyoneHearsThis()
                      : t.everyoneHearsAndItIsKept()}
          </Text>
        </Card>

          </>
        ) : null}

        {tab === 'recordings' ? (
          <>
        {/*
          The transport, above the list it produces. It was on the *Listen*
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
                  ? t.resumeRecording()
                  : t.record()
              }
              sublabel={
                channel.recording.status === 'paused' ? t.resume() : t.record()
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
              label={t.pauseRecording()}
              sublabel={t.pause()}
              style={styles.flexButton}
              icon={(color) => <PauseIcon color={color} />}
              disabled={!canPauseRecording(channel, me)}
              onPress={() => act({ type: 'PAUSE_RECORDING' })}
            />
            <Button
              label={t.stopRecording()}
              sublabel={t.stop()}
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
        <SectionLabel>{t.recordings()}</SectionLabel>
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
          <Empty>{t.nothingRecordedYet()}</Empty>
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
                    ? t.floorDecidesWhatPlays()
                    : t.stepInToPlayShort()
                }
                manageable={iHaveTheRoom}
                onOpenTranscript={() => setTranscriptFor(r.id)}
              />
            ))}
          </View>
        )}
          </>
        ) : null}

        {tab === 'watch' ? (
          <>
          {/*
            Watching, which is deliberately not a second kind of shared audio.
            Nothing about the video travels through The Floor — everybody's own
            player shows it, with its own sound, and what this card drives is a
            clock. That is why it refuses recordings and why the shared audio on
            the *Listen* tab empties when this one fills.
          */}
          {/*
            No label over it, since 2026-09-22, on the reasoning the *Listen*
            tab's card already carried from 2026-09-13: the tab is called
            *Watch* and this is the only thing on it, so WATCH TOGETHER was
            the screen saying its own name twice. This one predated that rule
            by three weeks and was simply missed by it.
          */}
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
                  **The picture is not in this card and has not been since
                  2026-09-19.** It is pinned above the tab, over the whole
                  body — see `picture` and `watch/Dock.tsx` — because a player
                  that lives on a tab is a player that stops when somebody
                  taps another one. What is left here is everything that is
                  not the film: the transport, the switch that says which
                  device is showing it, the room's mute, and the way out.

                  **The Floor still carries no video**, wherever the frame is
                  drawn. It is YouTube's own player, unmodified and
                  unobscured, playing its own picture with its own sound, and
                  what travels through this application is a position and a
                  clock. And there is nothing to press on it: YouTube's bar is
                  off (`controls: 0`) because it was an input surface on a
                  player this channel drives as an output surface, and the API
                  never says which of the two caused a state change. The
                  transport below is unambiguous because a button press *is*
                  an action.
                */}
                {/*
                  **The URL was the heading here and is gone as of
                  2026-09-18.** A YouTube link is machine text: it names the
                  video only to somebody who already knows the id, it is the
                  longest string on the card, and `numberOfLines={1}` meant
                  what it actually showed was `https://www.youtube.com/watc…`
                  — the half that is the same for every film. Drawn in
                  `heading`, it claimed to be the subject of the card while
                  saying nothing about which film was on.

                  **What replaces it is the film's name, as of
                  2026-09-20**, and it is under the progress bar rather than
                  here — see the transport. Nothing replaced it for two days,
                  on the reasoning that asking YouTube for a name would be the
                  first time this application talked to it; the player already
                  holds the name of what it loaded, so there was a third way
                  and nothing is asked of anybody. `WatchParty.url` is still
                  never drawn: it is kept so the interface can hand back what
                  was pasted, which is *Copy video link*, below.

                  What says a film is on is the transport, the *Watch on*
                  switch and the picture itself. A follower device has all
                  three.
                */}
                {watchTransport(true)}
                {/*
                  **Full screen, and the only way in.**

                  It stood here until 2026-09-19, when turning the phone
                  replaced it; the replacement was right about a phone and
                  wrong about everything else — a tablet and a browser window
                  are landscape without anybody having asked — and it came
                  back on 2026-09-20 with the turn beside it. The turn is gone
                  as of the portrait lock: a phone outside full screen is
                  upright, so there is no sideways window left to read as a
                  request. One control, the same on every surface.

                  **What killed it the first time cannot happen now.** The old
                  control locked the phone into *landscape* for as long as it
                  was up, and exiting released the lock, so somebody who
                  pressed *Exit full screen* while still sideways got the
                  channel screen sideways with nothing to say otherwise with.
                  The lock runs the other way round now — see
                  `watch/orientation.ts` — and exiting turns the phone upright
                  onto a screen that wanted upright.

                  **On the device showing the film and nowhere else.** A phone
                  that handed the picture to the laptop still drives the party
                  from the transport above — which is what makes that row worth
                  having everywhere — and has no picture of its own to expand.

                  Ungated by the floor, like *Watch on* and unlike the
                  transport: how big the film is on one person's device is
                  nobody else's business, and nothing about this reaches the
                  channel.
                */}
                {screeningHere ? (
                  <Button
                    label={t.fullScreen()}
                    onPress={() => setPressedFullScreen(true)}
                  />
                ) : null}
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
                {/*
                  **Gone rather than greyed while the mute is enforced**, and
                  it is the one refusal on this card that earns that.
                  Everything else here is refused by something about *you* —
                  you are not in the room, somebody else has the floor — and
                  a grey button with a sentence under it is how this
                  application says so, because the answer changes when you
                  step in or they let go.

                  An enforced mute is not about the reader at all. It is a
                  fact about the run: somebody is watching on the device they
                  are in the room on, the question was asked when Play was
                  pressed, and nothing anybody on this screen does will
                  change the answer before the film is paused. An *Unmute the
                  room* that is grey for the whole of a two-hour film is a
                  control offering something that is not on offer, which is
                  the shape § *Copy on controls* is about. What stands in its
                  place is the sentence below, which says the room is muted
                  and now says why.

                  Only the Unmute half disappears: a party that is *not*
                  muted cannot be enforced, so the Mute button is always
                  here. See `canUnmuteRoom`, and `WatchState.enforced` for
                  why the question is sampled at the edge of a run rather
                  than asked continuously — which is also what stops this
                  button vanishing under somebody's finger.
                */}
                {muteRequested && !mayUnmuteRoom ? null : (
                  <Button
                    label={muteRequested ? t.unmuteTheRoom() : t.muteTheRoom()}
                    sublabel={
                      muteRequested ? t.unmuteTheRoomSub() : t.muteTheRoomSub()
                    }
                    disabled={!mayControlWatch}
                    onPress={() =>
                      act({ type: 'SET_WATCH_MUTE', muted: !muteRequested })
                    }
                  />
                )}

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
                    {/*
                      **Two presses, with no field between them.** The field
                      was the step that made this deliberate — a swap empties
                      four other people's picture and starts it again from
                      black — and reading the clipboard on the first press
                      would put that on whatever link happened to be sitting
                      there. So *Change video* asks and this answers, and the
                      clipboard is read only once somebody has said twice
                      that they mean it.
                    */}
                    {watchPasteError ? (
                      <Text style={styles.warning}>{watchPasteError}</Text>
                    ) : null}
                    <View style={styles.buttonRow}>
                      <Button
                        label={t.watchThisInstead()}
                        sublabel={t.watchThisInsteadSub()}
                        variant="primary"
                        style={styles.flexButton}
                        disabled={!mayStartWatch}
                        onPress={() => void pasteWatchUrl()}
                      />
                      <Button
                        label={t.cancel()}
                        style={styles.flexButton}
                        onPress={() => {
                          setWatchPasteError(null);
                          setChanging(false);
                        }}
                      />
                    </View>
                    {/*
                      **No second disclosure here.** *Change video* is already
                      the press that says somebody means to empty four other
                      people's picture, so the list is open behind it — asking
                      twice more for a film the channel has already watched
                      would be a deeper way in than the clipboard, which is
                      the one that can put on anything at all.
                    */}
                    {pastFilmRows.length > 0 ? (
                      <>
                        <Text style={type.muted}>{t.orPutOneOfTheseBackOn()}</Text>
                        {pastFilmRows}
                      </>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.buttonRow}>
                    <Button
                      label={t.changeVideo()}
                      style={styles.flexButton}
                      disabled={!mayStartWatch}
                      onPress={() => setChanging(true)}
                    />
                    <Button
                      label={t.stop()}
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
                  **Where to watch: the one thing you can do about it, and
                  nothing when there is nothing to do.**

                  It was a switch until 2026-09-23 — *This device* against
                  *Other device*, one of them always chosen, drawn on every
                  device whatever the film was doing. That shape answered
                  *where is the film* and offered the move as a side effect of
                  reading the answer, which meant half of it was always inert:
                  the segment naming the device you were holding did nothing
                  when the film was already there.

                  So it is an action now, and only the one that applies.
                  Showing the film here, the offer is to send it away; showing
                  it elsewhere, the offer is to fetch it. There is never a
                  control that would do nothing if pressed, and each device
                  still says where the film is — by which offer it makes, and
                  by whether the picture is on it.

                  **It is the shape Home's bar already had.** *The film is on
                  another device · tap to watch here* was the same offer made
                  from the device you had walked to, and there was no reason
                  for the same act to be a switch in one place and an offer in
                  the other.

                  **Not "Play on".** *Play* is the transport's word and the
                  Play/Pause control is inches above this one; two acts
                  sharing one word on one screen is the drift GLOSSARY.md
                  exists to prevent.

                  The picker below appears only when there is more than one
                  other device to choose between, which is unusual: one other
                  is not a choice, and is taken without asking.
                */}
                {screeningHere ? (
                  <Button
                    label={t.watchOnAnotherDevice()}
                    onPress={() => {
                      setChoosing(true);
                      app.listScreens();
                    }}
                  />
                ) : screenElsewhere && inTheRoom ? (
                  <>
                    {/*
                      **Said as well as implied.** The offer alone would carry
                      it — you would not be asked to watch here if you already
                      were — but the absence of a picture on this screen reads
                      equally as *nothing is playing anywhere*, and the
                      transport above is running either way. One line removes
                      that, and it is the sentence Home's bar uses, the two
                      being the same fact reached from different screens.
                    */}
                    <Text style={type.muted}>{t.filmIsOnAnotherDevice()}</Text>
                    <Button
                      label={t.watchOnThisDevice()}
                      onPress={() => {
                        setChoosing(false);
                        app.showScreenFor(channelId);
                      }}
                    />
                  </>
                ) : inTheRoom ? (
                  /*
                    **The film is loaded and on no device at all**, which had
                    no branch here until 2026-09-24 and so drew nothing: no
                    picture, no offer, no sentence, with the transport running
                    inches above it. The party was playing and there was
                    nothing on this screen that could be pressed to see it.

                    The default at `defaulted` is what normally makes this
                    unreachable — a film arriving takes the device you are
                    holding — so every way in is a bug somewhere else, and one
                    of them is fixed in the same commit. It is drawn anyway,
                    because *the card offers what you can do about where the
                    film is* has to hold in all three cases or it is not a
                    rule. A default that fails to fire is then something
                    somebody can get out of rather than a party that has to be
                    stopped and started again to be watched.

                    No sentence beside it, unlike the branch above: that one
                    says where the film is because the offer alone would not
                    carry it, and here the offer is the whole of the fact.
                  */
                  <Button
                    label={t.watchOnThisDevice()}
                    onPress={() => {
                      setChoosing(false);
                      app.showScreenFor(channelId);
                    }}
                  />
                ) : null}
                {!inTheRoom ? (
                  // The same shape as the sentence below: beside the refused
                  // control, saying which rung answers it.
                  <Text style={type.muted}>{t.stepInToWatch()}</Text>
                ) : null}
                {choosing && otherScreens.length > 1
                  ? otherScreens.map((screen) => (
                      <Button
                        key={screen.device}
                        label={screenLabel(screen)}
                        sublabel={
                          screen.watching
                            ? t.alreadyShowingSomething()
                            : undefined
                        }
                        onPress={() => {
                          handOver(screen.device);
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
                    <Text style={styles.emphasis}>{t.noOtherDeviceLead()}</Text>
                    {t.noOtherDeviceRest()}
                  </Text>
                ) : null}

                <Button
                  label={copyLabel('video', t.copyVideoLink())}
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
                {/*
                  The one press that starts a party, and it is the paste.
                  Nothing is typed here — see `watchPasteError` for why the
                  field went — so the link is named in the sublabel rather
                  than in a placeholder, and the two ways the clipboard can
                  disappoint are said above the button.
                */}
                {watchPasteError ? (
                  <Text style={styles.warning}>{watchPasteError}</Text>
                ) : null}
                {/*
                  `default`, not `primary`, since 2026-09-22. STYLE.md spends
                  `primary` on the one commitment on a *screen*, and the
                  channel screen's one is the browser's playback refusal —
                  which never draws on a phone, so this one was the only
                  weight a phone ever saw and it made the identical control
                  one tab over look like the lesser act. The sublabel is a
                  noun phrase for the same reason: *Play something together*
                  names where its audio comes from, and this names where its
                  link does.
                */}
                <Button
                  label={t.watchSomethingTogether()}
                  sublabel={t.watchSomethingTogetherSub()}
                  disabled={!mayStartWatch}
                  onPress={() => void pasteWatchUrl()}
                />
                {/*
                  **The way back to something this channel has already
                  watched.**

                  A link arrives on a clipboard and is gone by the next
                  evening, and until this existed the only route back to
                  Tuesday's film was to go and find the video again — which
                  the channel could have answered, having watched it. See
                  `WatchState.history`.

                  Behind a press, and shut every time the card is drawn: the
                  card's subject is starting something, and a list of ten old
                  films standing above the one commitment on it would be the
                  wall STYLE.md § *A card of many items* is about. The count
                  is in the label so that opening it is a decision somebody
                  can make without opening it.
                */}
                {pastFilmRows.length > 0 ? (
                  <>
                    <Button
                      label={
                        pickingPast
                          ? t.hideWhatWeHaveWatched()
                          : t.watchedBefore(pastFilmRows.length)
                      }
                      sublabel={
                        pickingPast ? undefined : t.watchedBeforeSub()
                      }
                      onPress={() => setPickingPast(!pickingPast)}
                    />
                    {pickingPast ? pastFilmRows : null}
                  </>
                ) : null}
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
                  <Text style={styles.emphasis}>{t.roomIsMutedLead()}</Text>
                  {t.roomIsMutedRest()}
                  {!mayUnmuteRoom
                    ? // The second half of the button that is not there. It is
                      // only ever said on a run where it is true, and it names
                      // the condition rather than the person: whose device it
                      // is is nobody else's business, and *somebody* is the
                      // whole of what anyone needs to know to understand why
                      // the previous sentence cannot be argued with.
                      t.roomStaysMuted()
                    : ''}
                </Text>
              ) : muteRequested ? (
                // Muted, but paused — so everybody has their voice back without
                // having asked for it. Said because the silence *returning* on
                // the next tap of Play would otherwise be the surprise: this is
                // the one moment somebody learns the rule.
                <Text style={type.muted}>
                  <Text style={styles.emphasis}>{t.pausedSoYouCanTalkLead()}</Text>
                  {t.pausedSoYouCanTalkRest()}
                </Text>
              ) : (
                // Explicitly unmuted, which is a choice somebody made against the
                // default. Said plainly rather than left silent, because it is
                // the state in which the channel behaves least like the rest of
                // the watch party.
                <Text style={type.muted}>
                  <Text style={styles.emphasis}>{t.roomIsUnmutedLead()}</Text>
                  {t.roomIsUnmutedRest()}
                </Text>
              )
            ) : null}

            <Text style={type.muted}>
              {trackPlaying
                ? // First, and ahead of presence, because `canControlWatch`
                  // refuses on this ground too — so the branch below would
                  // otherwise answer *step in* to somebody standing in the
                  // room. The mirror of the sentence the *Listen* card leads
                  // with, in the same position for the same reason: it greys
                  // every control here, and the way out is a control on
                  // another tab. See `trackIsPlaying`.
                  t.somethingOnListen()
                : !mayControlWatch
                  ? // Next, because it outranks the rest: somebody who is not in
                    // the room has no use for being told whose floor it is or that
                    // a recording is running. **And since 2026-09-20 it is a
                    // reason that greys every control on the card** — the transport,
                    // the room's mute and Stop included, which used to stay live
                    // for an absent member on the reasoning that an empty channel
                    // is nobody's conversation. See `canControlWatch`.
                    party
                    ? t.stepInToDriveTheFilm()
                    : t.stepInToStartAParty()
                  : recordingLive
                    ? // Said out loud rather than left as a dead button. The two are
                      // exclusive because the video's sound never reaches The Floor,
                      // so a recording made alongside one would be missing the thing
                      // everybody was reacting to.
                      t.stopTheRecordingFirst()
                    : theyHoldFloor
                      ? // **Reachable since 2026-09-24**, and narrowed in the
                        // same breath. A claim could not be made over a film
                        // at all while `canClaimFloor` asked `watchPartyIsOn`,
                        // so these two branches were dead; it asks
                        // `watchIsPlaying` now, and a paused film takes a
                        // claim. What they said while dead was the Listen
                        // card's sentence — *they decide what plays* — which
                        // is false here: the floor governs `mayStartWatch`,
                        // which is *Change video*, and `canControlWatch`
                        // leaves the transport to whoever is in the room. The
                        // Stop button live beside that sentence was the tell.
                        t.theyDecideWhichFilm(holderName)
                      : iHoldFloor
                        ? t.youDecideWhichFilm()
                        : !mayStartWatch
                          ? // Whatever is left, which after the branches above is
                            // little: presence is asked first now, so this is no
                            // longer the empty channel read from outside it. It
                            // said *step in* until 2026-09-20 and would have been
                            // addressing somebody already here.
                            t.notAvailableJustNow()
                          : party
                            ? t.everyoneWatchesInStep()
                            : t.everybodyWatchesInTheApp()}
            </Text>
          </Card>
          </>
        ) : null}

        {tab === 'invites' ? (
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
        <SectionLabel>{t.contacts()}</SectionLabel>
        <Card style={styles.stack}>
          <InviteList
            channel={channel}
            me={me}
            mayInvite={iHaveTheRoom}
            states={askedIn}
            onInvite={(contactId) => act({ type: 'INVITE', contactId })}
            onGuest={async (contactId) => {
              setAskedIn((prior) => ({ ...prior, [contactId]: 'asking' }));
              try {
                await app.askInAsGuest(channel.id, contactId);
                setAskedIn((prior) => ({ ...prior, [contactId]: 'asked' }));
              } catch (error) {
                setAskedIn((prior) => ({
                  ...prior,
                  [contactId]:
                    error instanceof Error ? error.message : t.thatDidNotWork(),
                }));
              }
            }}
          />
        </Card>

        {/*
          Below inviting a contact, and it is the rarer of the two: a guest
          link is for somebody who is not here at all, has no account, and is
          not going to get one. Whoever is in the room has to let them in, so
          sharing the link is the beginning of the process rather than the end
          of it — which is why this says so rather than reading as "sent".
        */}
        <SectionLabel>{t.guestLink()}</SectionLabel>
        <Card style={styles.stack}>
          <Text style={type.muted}>{t.guestLinkWhat()}</Text>
          <Button
            label={
              sharing
                ? t.makingALink()
                : // What it is about to do, rather than what it would rather
                  // do: a browser with no share sheet can keep the second
                  // promise and not the first. See src/share.ts.
                  canShare
                  ? t.shareAGuestLink()
                  : t.copyAGuestLink()
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
                  setShareNote(t.linkCopied());
                } else if (handoff === 'failed') {
                  setShareError(t.linkWouldNotCopy());
                }
              } catch (error) {
                setShareError(
                  error instanceof Error ? error.message : t.thatDidNotWork()
                );
              } finally {
                setSharing(false);
              }
            }}
          />
          {canInviteGuest(channel, me) ? null : (
            <Text style={type.muted}>{t.stepInToMakeALink()}</Text>
          )}
          {shareError ? <Text style={styles.warning}>{shareError}</Text> : null}
          {shareNote ? <Text style={type.muted}>{shareNote}</Text> : null}
        </Card>
          </>
        ) : null}
    </Screen>
  );
}
