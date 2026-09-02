import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  ConnectionQuality,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type TrackPublication,
} from 'livekit-client';
import {
  AudioSession,
  setupIOSAudioManagement,
  type AppleAudioConfiguration,
} from '@livekit/react-native';
import { setAllowHapticsDuringRecording } from '../../modules/audio-route';
import { api } from '../api/http';
import { recordEvent } from './diagnostics';
import {
  initialPlayoutWatches,
  onPlayoutReadings,
  PLAYOUT_POLL_MS,
  type PlayoutReading,
} from './playout';
import {
  ANDROID_OUTPUTS,
  androidSessionFor,
  nameOf,
  policyFor,
  sessionFor,
} from './session';
import {
  NOBODY_SPEAKING,
  nextReleaseAt,
  onActiveSpeakers,
  onAudioGone,
  shownAsSpeaking,
  type SpeakingHold,
} from './speaking';

/**
 * Joins the session's audio room and publishes the microphone.
 *
 * Deliberately thin: it does not decide who may speak. The floor is enforced
 * server-side by muting the publisher, which a client cannot undo — so this
 * connects, publishes, and reports what happened, and nothing here reasons
 * about eligibility.
 */

export type AudioStatus =
  | 'idle'
  /** Never connected, or deliberately torn down. */
  | 'connecting'
  | 'connected'
  /**
   * Connected once, dropped, and trying again — which `idle` used to be
   * indistinguishable from, and that was the whole of the bug this exists for.
   * A channel you have not joined and a channel whose audio has died are not
   * the same thing to look at.
   */
  | 'reconnecting'
  /**
   * Evicted from the room by another of this account's own devices, and not
   * coming back — the only disconnection that is somebody's decision rather
   * than a failure.
   *
   * Its own state rather than `idle` for two reasons, and the second is the
   * load-bearing one. It reads differently on screen: `idle` is a channel
   * whose audio never started, and this is one that stopped because you
   * picked it up elsewhere. And the foreground listener rebuilds a room from
   * any status but `connected` and `connecting` — so filing this as `idle`
   * would have every trip through the app switcher re-enter a room this
   * device has been evicted from, which is the ping-pong arriving by a second
   * route after the first was closed.
   */
  | 'displaced'
  | 'denied'
  | 'unavailable'
  | 'error';

/**
 * Backoff for rebuilding a room that dropped, mirroring `api/socket.ts`
 * deliberately: the two connections fail together often enough — a tunnel, a
 * dead network — that two different rhythms would only make the pair harder to
 * reason about.
 */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

export interface SessionAudio {
  status: AudioStatus;
  /** Set when status is 'error' or 'denied'. */
  message: string | null;
  /** Whether the server currently has our published track muted. */
  mutedByServer: boolean;
  /** How many other participants are publishing audio we can hear. */
  othersAudible: number;
  /**
   * Who is audibly speaking right now, by account id — the same identity the
   * server issues join tokens under, so these index straight into a channel's
   * participants without a second lookup.
   *
   * Includes you. It is the room's own judgement rather than ours: LiveKit
   * decides from the published audio level, which is the only place that
   * information exists, and this hook has never reasoned about who may speak.
   *
   * Empty while disconnected, which is honest — a stale name still pulsing on
   * a screen whose audio has dropped would be the one reading that matters.
   */
  speaking: string[];
  /**
   * Who the media plane has stopped hearing from — the earliest warning
   * anything in this app has that somebody is dropping out.
   *
   * **Earlier than the websocket can be, and about the right connection.**
   * `ChannelState.disconnectedAt` is the server noticing that a *control*
   * socket went quiet, which is bounded below by the heartbeat: up to
   * HEARTBEAT_TIMEOUT_MS to fail, plus a sweep phase, before anybody's screen
   * can say a word. This is the SFU's continuous judgement about the
   * connection the conversation is actually travelling on, pushed to every
   * client in the room, and `ConnectionQuality.Lost` is documented as what it
   * reports *before* the timeout that would produce `ParticipantDisconnected`.
   *
   * So the two are not redundant and neither replaces the other: this says
   * "your voice is not reaching them right now", which is what somebody
   * mid-sentence needs, and the server's says "they have given up their
   * place", which is what the roster is for. A person can be in either state
   * without the other — a phone whose media path is dead while its websocket
   * is fine is exactly the case STATES.md records under *Audio Connected*.
   *
   * `Lost` alone, deliberately. `Poor` is ordinary on a phone and passes
   * without anybody noticing anything; warning on it would put a red line
   * under half of every conversation and teach people to ignore it, which is
   * the same argument `useOfflineNotice` makes for its delay.
   *
   * Empty while disconnected, on the same reasoning as `speaking`: a warning
   * about somebody else, left on a screen whose own audio has dropped, is
   * describing the wrong failure.
   */
  failing: string[];
  /**
   * Whether anything you say is going out.
   *
   * **Not the same as whether the hardware is capturing**, and the two parted
   * company on 2026-08-20. A self-muted microphone in an occupied channel is
   * still capturing — the device is held open deliberately, so that muting
   * does not hand a Bluetooth headset between profiles and back — and this
   * still reads `false`, because it answers the question the user is asking.
   * The device state is not surfaced at all: iOS shows it, in the orange
   * indicator, and a second opinion here could only ever contradict it.
   *
   * False while you are alone in a channel and not recording, which is a state
   * worth reporting rather than leaving to be discovered: the screen otherwise
   * says the microphone is open when it is not.
   */
  micOpen: boolean;
  /**
   * What this hook last asked of the audio session, or null before it has
   * asked anything.
   *
   * **Diagnostic only. Nothing renders from it but `ui/AudioDebugPanel.tsx`,
   * and nothing decides anything from it.** It is here rather than recomputed
   * by the panel because it is the *asked* half of an asked-versus-actual
   * comparison, and a second computation of `sessionFor` would agree with this
   * one right up until the moment a disagreement was the thing being looked
   * for. Echoing what was applied is a fact; recomputing it is a guess that
   * happens to be usually right.
   *
   * Null again on every reconnection, because a fresh room starts from a
   * session nobody has configured — which is exactly what `appliedRef` means
   * by null, and the two must not drift.
   */
  asked: AudioIntent | null;
  /**
   * Tears the room down and builds a fresh one, session activation included.
   *
   * Added 2026-08-24 for the probe harness, and it is the only way back from a
   * dead engine that the app has. `startAudioSession` runs once per connection
   * and the foreground listener returns early while the status is `connected`,
   * so an engine that dies under a healthy room leaves nothing to press — the
   * operator investigating it reinstalled the app to carry on.
   *
   * It is the same generation bump the reconnect backoff uses, so it goes
   * through the ordinary teardown rather than a second path that would have to
   * agree with it. Exposed rather than triggered automatically on purpose:
   * whether a dead engine *should* rebuild itself is the fix still being
   * argued, and a harness must not quietly apply the change it exists to test.
   */
  reconnect: () => void;
}

/**
 * The inputs to the session decision and the decision itself, together.
 *
 * The four inputs are carried rather than dropped because "the session is
 * `CALL`" and "the session is `CALL` *because somebody else is talking while
 * you are muted*" are different readings, and only the second one tells
 * anybody whether it is right.
 */
export interface AudioIntent {
  /** What the hook was told. */
  selfMuted: boolean;
  micNeeded: boolean;
  hasAudio: boolean;
  othersAudible: number;
  /** What it decided. */
  intent: MicIntent;
  /** What it applied to the session, and what it handed the observer. */
  session: AppleAudioConfiguration;
  playout: AppleAudioConfiguration;
}


/**
 * Apple-only; on Android the category model does not apply.
 *
 * **The haptics permission is asserted here, next to the category**, because
 * it is a property of the same session and is subject to the same three
 * writers. iOS mutes the Taptic Engine for the whole duration of any session
 * that is using audio input, and the default is to do so — so the
 * silenced-speaker cue in `useSilencedNudge` was being discarded, silently and
 * with no error, for the entire time it could ever have fired. Turning it on
 * is one property assignment and is meaningless when nothing is capturing, so
 * it is stated unconditionally rather than only for `CALL`.
 *
 * Neither half's failure is worth taking a call down for: the configuration
 * swallows its error already, and the permission answers false rather than
 * throwing. `diagnostics.ts` reads the result back off the session, which is
 * the only evidence that means anything here.
 */
async function applyConfiguration(
  config: AppleAudioConfiguration
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await AudioSession.setAppleAudioConfiguration(config).catch(() => {});
  await setAllowHapticsDuringRecording(true);
}

/**
 * The same edge on Android, which until 2026-09-01 did not exist at all.
 *
 * **What was here before was nothing**, and that is the defect this closes
 * rather than a feature it adds: `applyConfiguration` returns early off iOS,
 * `pushPolicy` does too, and so an Android build connected to a room having
 * asked the platform for no audio mode, no stream type and no focus.
 *
 * **That is not the same as being misconfigured, and the difference was
 * measured rather than assumed.** The SDK defaults to
 * `MODE_IN_COMMUNICATION`, so the echo canceller was already on; what was
 * missing was the *transition* between the two states. Android stayed in
 * communication mode for as long as it was connected, so an empty channel held
 * the phone in voice-call mode and cost another app its playback — `IDLE`
 * unavailable, rather than `CALL` wrong. See src/audio/session.ts.
 *
 * **`configureAudio` must precede `room.connect`, and here that is already
 * true** rather than newly arranged: `applyFor` is called on the connect path
 * before the room is built, for the iOS reason that the session must be right
 * before the engine starts. The SDK states the same requirement for Android
 * explicitly, and the two agree, so no ordering changed for this.
 *
 * Swallows its error for the same reason the Apple half does. A configuration
 * that did not land is a routing problem to be read back off the device, not a
 * reason to fail a connection somebody is waiting on — and on Android there is
 * nothing to read it back *with*, since `app/modules/audio-route` is iOS-only.
 * `adb logcat` against `AudioManager` is the substitute, which is why
 * planning/ANDROID.md names it.
 */
async function applyAndroidConfiguration(hasAudio: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  await AudioSession.configureAudio({
    android: {
      audioTypeOptions: androidSessionFor(hasAudio),
      preferredOutputList: [...ANDROID_OUTPUTS],
    },
  }).catch(() => {});
}

/**
 * Records every write this app makes to the audio session, in development
 * builds only.
 *
 * It exists because the interesting failures here are all *routing* failures,
 * and when this was written nothing in the stack could see a route:
 * `AudioSession.getAudioOutputs` offers iOS only `default` and
 * `force_speaker`, and there is no route-change or interruption event on it to
 * subscribe to. So what is heard on the phone had to be correlated against
 * what was asked for, by hand, and that needed the asks timestamped.
 *
 * **`app/modules/audio-route` closed that gap on 2026-08-20**, and
 * `diagnostics.ts` now reads both halves on the phone itself. This stays
 * anyway: it is a `__DEV__` console line at the moment of the write, where the
 * panel is a sample taken afterwards, and the two answer different questions.
 *
 * **Two of the six audio-engine handler slots are mined, and it is worth
 * knowing which.** `audioDeviceModuleEvents`' setters hold a *single* handler
 * each, and the native audio policy is applied from inside exactly two of the
 * delegate callbacks — `willEnableEngine` and `didDisableEngine`. Both are
 * guarded on whether a JS handler is registered (`if (!isWillEnableEngineActive
 * && automaticAudioSessionConfig != nil)` in `AudioDeviceModuleObserver.m`), so
 * registering yours on either does not sit alongside the policy, it *replaces*
 * it. The symptom would be an echo or a dropped route appearing weeks later in
 * a build nobody associates with logging.
 *
 * `willStartEngine` and `didStopEngine` are not read by the policy and are
 * free. They carry the same `isPlayoutEnabled` / `isRecordingEnabled` pair, so
 * a `__DEV__`-only handler that logs and returns 0 is the way to see engine
 * transitions from JS, interleaved with these lines by construction. Keep it
 * log-only: the handler blocks the audio worker thread until it returns
 * (natively bounded at a couple of seconds), and calling into the engine or a
 * peer connection from inside one can deadlock against the very operation it
 * is holding up.
 *
 * And the ordering question — whether the native observer writes its own
 * configuration around ours — can be answered with no code at all, which is
 * where to start. The observer logs to `os_log`, and its lines include
 * `Native auto-config: setting category …`.
 *
 * **Not with `log stream`.** That reads *this Mac's* logs; it has no device
 * options at all on current macOS, so pointed at a phone it succeeds and shows
 * nothing, which is the worst way for an instrument to fail. Use the syslog
 * relay over **USB** — a network pairing is not enough:
 *
 *     idevicesyslog -m "Native auto-config"
 *
 * Console.app does the same thing with the device picked in its sidebar. Note
 * the observer writes from native code, so **a TestFlight build serves** — only
 * the `[audio]` lines below need a development build.
 */
function trace(
  config: AppleAudioConfiguration,
  hasAudio: boolean
): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(
    `[audio] ${nameOf(config)}`,
    JSON.stringify({
      hasAudio,
      category: config.audioCategory,
      options: config.audioCategoryOptions,
      mode: config.audioMode,
    })
  );
}

/**
 * Tells the native observer what to write at the next engine transition.
 *
 * Paired with `applyFor` and not merged into it, because the two are opposite
 * in time: `applyFor` states the configuration *now*, and this states the one
 * the observer will apply at a transition that has not happened yet. Which is
 * why every caller pushes this *first* and applies second — see `policyFor`.
 *
 * Cheap enough to call on every edge: natively it is a single atomic property
 * assignment, and it touches neither the session nor the engine.
 */
function pushPolicy(hasAudio: boolean): void {
  // **Android has no counterpart and is not missing one**, which is worth
  // stating because every other `Platform.OS !== 'ios'` guard in this
  // directory marks something Android still owes. This one does not: the
  // policy exists to agree with the SDK's *native observer*, a second writer
  // that re-applies a configuration on every audio-engine transition with no
  // JavaScript in the path. Android has no such observer and no shared
  // process-wide session object for one to write to — `configureAudio` is
  // applied once when the session starts and stays. So there is nobody here to
  // agree with, and a branch added to this function would be agreeing with
  // nothing. See src/audio/session.ts and planning/STATES.md.
  if (Platform.OS !== 'ios') return;
  setupIOSAudioManagement(true, policyFor(hasAudio));
}

/**
 * What the microphone should be doing — which is three states, not two.
 *
 * Splitting this out is the whole of the 2026-08-20 fix. `capturing` and
 * `released` used to be the only two, with self-mute collapsed into
 * `released`, and that collapse is what made muting cost a Bluetooth profile
 * handover: releasing the device is what hands a headset back from the
 * hands-free link to A2DP, and it is audible in both directions.
 *
 * - `capturing` — the device is open and what you say goes out.
 * - `muted` — you are self-muted with somebody here. Nothing goes out, and
 *   **the device is left exactly as it is**: still open if it was open, which
 *   is what removes the transition. Not opened if it was shut — see
 *   `holdMicrophone`.
 * - `released` — nobody needs it, so the device is genuinely let go and the
 *   session can hand back to `playback`.
 */
export type MicIntent = 'capturing' | 'muted' | 'released';

function intentFor(micNeeded: boolean, selfMuted: boolean): MicIntent {
  if (!micNeeded) return 'released';
  return selfMuted ? 'muted' : 'capturing';
}

/**
 * How many remote audio publications exist right now.
 *
 * **Never throws, and that is the whole reason it is a function.** It was two
 * lines inline and it took a connection down under test, because a room shaped
 * slightly differently had no `remoteParticipants` to spread — which is
 * precisely the fault this instrument was added to investigate: a diagnostic
 * that stops the thing it measures. `engineState.ts` has carried the same rule
 * since it was written, having learnt it the same way. An unreadable count
 * answers `-1`, which is not a number of tracks and so cannot be mistaken for
 * one.
 */
function publishedAlready(room: Room): number {
  try {
    let total = 0;
    for (const participant of room.remoteParticipants.values()) {
      total += participant.audioTrackPublications.size;
    }
    return total;
  } catch {
    return -1;
  }
}

/** The published microphone track, or null when nothing is published. */
function micTrack(room: Room) {
  return (
    room.localParticipant.getTrackPublication(Track.Source.Microphone)
      ?.audioTrack ?? null
  );
}

/**
 * Stops transmitting without letting go of the device.
 *
 * **It will not open a microphone that is shut, and that is a rule rather than
 * an omission.** Publishing a track and muting it a moment later is two awaits
 * apart, and in that window a live microphone is on the wire — which is the
 * one thing a mute must never do. So arriving here with nothing published
 * leaves nothing published: somebody who was alone and self-muted when a
 * second person walks in stays shut until they unmute, and pays one transition
 * then, at the moment they choose to speak.
 */
async function holdMicrophone(room: Room): Promise<void> {
  const track = micTrack(room);
  if (!track) return;
  // Belt and braces: the publish default is already false, and stating it here
  // means a future change to that default cannot silently turn every self-mute
  // back into a device release.
  track.stopOnMute = false;
  await room.localParticipant.setMicrophoneEnabled(false);
}

/**
 * Genuinely lets the device go, from either of the two states that can precede
 * it.
 *
 * **Unpublished rather than muted-and-stopped**, because `mute()` returns early
 * on a track that is already muted — so the obvious implementation, flipping
 * `stopOnMute` back to `true` and muting again, does nothing at all when
 * arriving here from `muted`. That is the transition where the device most
 * needs releasing: self-muted, and then the last other person leaves.
 */
async function releaseMicrophone(room: Room): Promise<void> {
  const track = micTrack(room);
  if (!track) return;
  await room.localParticipant.unpublishTrack(track, true);
}

/**
 * Puts the session where the microphone's state says it belongs.
 *
 * Both directions are stated, and that is the point rather than tidiness.
 * Applying only the playout half — which is what this did — pinned the session
 * to `playback` + `spokenAudio` and left it there through the *next* time the
 * microphone opened, capturing with the echo canceller off, so the far end
 * heard itself. The native policy did not save it: that reacts to the audio
 * *engine* changing state, and with a muted track still holding the device
 * open, the engine never left the recording state to re-enter it.
 *
 * `stopMicTrackOnMute` fixes the engine half and is the reason a Bluetooth
 * speaker is released at all, but the session is configured here regardless.
 * Depending on a transition we do not control is what broke this once.
 *
 * One input since 2026-08-27, and the audible count is no longer among them.
 * Both of the rules that can compute it are questions about the channel rather
 * than about what has finished subscribing, which is what took the write off
 * the engine's start. See core/micNeeded.ts.
 */
async function applyFor(hasAudio: boolean): Promise<void> {
  const config = sessionFor(hasAudio);
  trace(config, hasAudio);
  await applyConfiguration(config);
  // Each half is a no-op off its own platform, so both are stated
  // unconditionally and the branch lives in one place rather than at every
  // call site. `trace` above names the *state* — IDLE or CALL — which is the
  // one thing the two platforms genuinely share, so the development log line
  // reads the same on both.
  await applyAndroidConfiguration(hasAudio);
}

/**
 * @param mediaRoom the audio to be in, or null to stay disconnected. The
 *                  connection is keyed on this rather than on the channel. The
 *                  two have been equal since unnamed channels stopped moving,
 *                  but the server names the room separately and this hook does
 *                  not assume otherwise.
 * @param channelId the channel to ask for a credential for. Only ever read
 *                  when a connection is being made.
 * @param token     the app's own auth token, used to fetch a join credential
 * @param selfMuted the user's own mute, which is theirs alone and unrelated to
 *                  the floor
 * @param micNeeded whether anything is listening: somebody else present, or a
 *                  recording running. Told rather than worked out here — this
 *                  hook has never decided anything about who may speak.
 * @param hasAudio  whether the session should be a call. Computed by one of
 *                  two rules in core/micNeeded.ts and selected by the
 *                  `steadyHeadset` setting — *is anybody present capturing*
 *                  by default, or *does this app have any audio at all* when
 *                  it is on. This hook is handed the answer and does not know
 *                  which asked; `App.tsx` is where the choice is made.
 *
 *                  Distinct from `micNeeded`, which decides whether we
 *                  publish. Under either rule the two part company — a guest
 *                  without the microphone, and anybody self-muted, are audio
 *                  without being capture.
 */
export function useSessionAudio(
  mediaRoom: string | null,
  channelId: string | null,
  token: string | null,
  selfMuted: boolean,
  micNeeded: boolean,
  hasAudio: boolean
): SessionAudio {
  const [state, setState] = useState<SessionAudio>({
    status: 'idle',
    message: null,
    mutedByServer: false,
    othersAudible: 0,
    speaking: [],
    failing: [],
    micOpen: false,
    asked: null,
    // Replaced below, once `setGeneration` exists to close over. Never called
    // in between: nothing renders before the hook returns.
    reconnect: () => {},
  });
  const roomRef = useRef<Room | null>(null);
  /**
   * Bumped to rebuild the room, which is the whole mechanism.
   *
   * The connect effect below is keyed on the room *name*, which does not change
   * when a connection dies — so a room that dropped stayed dropped, and the
   * only thing that rebuilt it was remounting the hook. In practice that meant
   * force-quitting the app, which is what a tester had to do after taking a
   * Telegram call: CallKit seized the audio session, `livekit-client` exhausted
   * its own retries and fired `Disconnected`, and nothing here ever asked for
   * another connection. The socket has had `resume()` on foreground since long
   * before, under a comment reading "Nothing else does"; this is the audio
   * finally learning the same lesson.
   */
  const [generation, setGeneration] = useState(0);
  const attemptRef = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Same reason as `micNeededRef`: read at connect, acted on below. */
  const selfMutedRef = useRef(selfMuted);
  selfMutedRef.current = selfMuted;
  /**
   * Read through a ref inside the connect effect so that somebody arriving
   * does not tear the room down and rebuild it. The effect below is what acts
   * on a change.
   */
  const micNeededRef = useRef(micNeeded);
  micNeededRef.current = micNeeded;

  /** Read at connect, like the others: a move must not re-run the effect. */
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;

  /** Same again: somebody else muting must not tear the room down. */
  const hasAudioRef = useRef(hasAudio);
  hasAudioRef.current = hasAudio;

  /**
   * What was last asked of the session, so that the effect below can tell an
   * edge from a re-render.
   *
   * It has to hold both halves. The microphone is now not the only reason to
   * reconfigure — a track arriving or leaving moves the session between its
   * two closed states — so an effect that watched only `open` would sit
   * through the change that pauses somebody's music, and one that watched only
   * the configuration would re-run `setMicrophoneEnabled(true)` every time
   * somebody joined a call already in progress.
   *
   * Null while disconnected, and set back to null on teardown: a fresh room
   * starts from a session nobody has configured yet.
   */
  const appliedRef = useRef<{
    intent: MicIntent;
    config: AppleAudioConfiguration;
  } | null>(null);

  useEffect(() => {
    if (!mediaRoom || !channelIdRef.current || !token) return;

    let cancelled = false;
    // **Muting must not stop capturing, and releasing must.** Those are two
    // different closes and this flag cannot tell them apart — it is a publish
    // default, fixed for the life of the track — so it is set to the safer of
    // the two and the other is done explicitly in `closeMicrophone` below.
    //
    // It was `true` until 2026-08-20 and the comment here argued for it: a
    // muted track otherwise keeps the device open, so the orange indicator
    // stays lit and a Bluetooth headset stays in the mono hands-free profile.
    // Both true, and the second is the whole bug — stopping the track is what
    // hands the headset back to A2DP, so every self-mute and unmute cost a
    // profile handover and a tone. See planning/decisions/DECISIONS.md.
    const room = new Room({ publishDefaults: { stopMicTrackOnMute: false } });
    roomRef.current = room;

    const update = (patch: Partial<SessionAudio>) => {
      if (!cancelled) setState((s) => ({ ...s, ...patch }));
    };

    // The server mutes our publication to enforce a floor claim. Surfacing it
    // lets the UI tell the truth about whether the mic is actually live,
    // rather than inferring it from session state that may be a moment behind.
    //
    // TrackMuted/TrackUnmuted fire for remote participants too, so the local
    // one has to be picked out — otherwise the other person self-muting would
    // read as us being silenced.
    const isLocal = (participant: Participant) =>
      participant.identity === room.localParticipant.identity;
    const onMuted = (_pub: TrackPublication, participant: Participant) => {
      if (isLocal(participant)) update({ mutedByServer: true });
    };
    const onUnmuted = (_pub: TrackPublication, participant: Participant) => {
      if (isLocal(participant)) update({ mutedByServer: false });
    };
    // Counted by who, not merely whether: with several people, one track
    // arriving or leaving says nothing about the rest.
    const audible = new Set<string>();
    const onSubscribed = (
      track: RemoteTrack,
      _pub: TrackPublication,
      participant: Participant
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      audible.add(participant.identity);
      // **Logged since build 91, and the gap it fills was one this app made
      // for itself.** Until build 90 a subscription was legible in the log by
      // accident: it moved `othersAudible` off zero, that moved the session
      // from `IDLE` to `LISTENING`, and the session write was recorded. Build
      // 90 collapsed those two states to stop the write racing the engine —
      // and took the only evidence of a subscription with it. The failure
      // reported the same evening was `audible 0` against a server that was
      // publishing throughout, which is a *lost subscription* and not the
      // engine fault every earlier reading had shown. Nothing in the log said
      // when it went.
      recordEvent(`sub + ${participant.identity} (${audible.size})`);
      update({ othersAudible: audible.size });
    };
    const onUnsubscribed = (
      track: RemoteTrack,
      _pub: TrackPublication,
      participant: Participant
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      audible.delete(participant.identity);
      // The half that matters. A subscription that goes away without the room
      // dropping is silent everywhere else: `Disconnected` never fires, the
      // socket is fine, the screen is right, and there is simply nothing to
      // hear.
      recordEvent(`sub - ${participant.identity} (${audible.size})`);
      update({ othersAudible: audible.size });
    };

    // Held on the trailing edge rather than rendered raw — see ./speaking.ts.
    // The room drops somebody for the length of a breath, and following that
    // exactly makes the indicator flicker through every pause in a sentence.
    let hold: SpeakingHold = NOBODY_SPEAKING;
    let release: ReturnType<typeof setTimeout> | undefined;
    /**
     * Who the SFU currently reports as `Lost`, held per connection.
     *
     * Not smoothed the way `hold` is, and the asymmetry is deliberate. The
     * speaking indicator is smoothed because it follows speech, which stops
     * and starts inside a sentence; this follows a connection, which does not
     * flicker on that timescale — and the whole value of it is that it is
     * early, so a hold would spend the lead time it exists to provide.
     */
    const failing = new Set<string>();

    /**
     * Publishes the hold, and arms a timer for the moment it next changes.
     *
     * The timer is the part that is easy to leave out: a hold running out is
     * the one transition the room does not announce, having already said
     * everything it has to say about somebody who stopped talking. Without it
     * the last speaker's dot stays lit until somebody else happens to speak.
     */
    const publish = (at: number) => {
      clearTimeout(release);
      update({ speaking: shownAsSpeaking(hold, at) });
      const next = nextReleaseAt(hold, at);
      if (next === null) return;
      release = setTimeout(() => {
        const later = Date.now();
        hold = onActiveSpeakers(hold, hold.active, later);
        publish(later);
      }, next - at);
    };

    const onSpeakers = (speakers: Participant[]) => {
      const at = Date.now();
      hold = onActiveSpeakers(hold, speakers.map((s) => s.identity), at);
      publish(at);
    };

    /**
     * Somebody's audio stopped existing, which is what the speaker event does
     * not report — see `onAudioGone`. It is computed from tracks the server is
     * observing, so a track that goes away leaves whoever was in the set stuck
     * there, and `active` has no expiry.
     *
     * Three ways in, and they are not interchangeable: leaving the room,
     * unpublishing, and muting. The third is the one that looks skippable —
     * a self-mute keeps the device — and it is the one that fires when we go
     * quiet with somebody else still here.
     */
    const onQuiet = (participant: Participant) => {
      const next = onAudioGone(hold, participant.identity);
      if (next === hold) return;
      hold = next;
      publish(Date.now());
    };
    /** The same, for the events that hand us a publication first. */
    const onTrackQuiet = (pub: TrackPublication, participant: Participant) => {
      if (pub.kind !== Track.Kind.Audio) return;
      onQuiet(participant);
    };

    /**
     * The transport's own account of itself, which nothing else records.
     *
     * `Disconnected` is already handled below and is the only one this app
     * acts on. These are the states it passes *through* — a signal reconnect,
     * a subscription the SFU could not deliver — each of which can leave a
     * room that reports healthy and carries no audio. That combination is what
     * `c2f5039` described in 2026-08-11 as "subscribed to the new track,
     * reporting healthy, and silent", and it has never had a line in any log.
     *
     * Log-only. Acting on any of them is a change to how this app reconnects,
     * and that decision wants the evidence these produce first.
     */
    room
      .on(RoomEvent.Reconnecting, () => recordEvent('room reconnecting'))
      .on(RoomEvent.SignalReconnecting, () => recordEvent('room signal reconnecting'))
      .on(RoomEvent.Reconnected, () => recordEvent('room reconnected'))
      .on(RoomEvent.TrackSubscriptionFailed, (sid, participant) =>
        recordEvent(`sub failed ${participant.identity} ${sid}`)
      )
      .on(RoomEvent.TrackMuted, onMuted)
      .on(RoomEvent.TrackMuted, onTrackQuiet)
      .on(RoomEvent.TrackUnmuted, onUnmuted)
      .on(RoomEvent.TrackSubscribed, onSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
      .on(RoomEvent.ParticipantDisconnected, onQuiet)
      // The early warning. Held as a set on the room rather than derived from
      // it on each event, because the event carries one participant and the
      // screen wants all of them — and because a participant who leaves stops
      // reporting quality rather than reporting good quality, so anything
      // derived from the last event alone would leave a name lit for ever.
      .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        const id = participant?.identity;
        if (!id) return;
        const lost = quality === ConnectionQuality.Lost;
        if (lost === failing.has(id)) return;
        if (lost) failing.add(id);
        else failing.delete(id);
        recordEvent(`connection ${lost ? 'lost' : 'restored'} ${id}`);
        update({ failing: [...failing] });
      })
      // Somebody who has gone is no longer somebody whose connection is
      // failing: the warning has been overtaken by the fact. Without this the
      // last thing said about them stays true on screen for the life of the
      // room, since a departed participant reports no further quality.
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (!failing.delete(participant.identity)) return;
        update({ failing: [...failing] });
      })
      // Releasing the microphone is ours and only ever reported here; the
      // remote event is for somebody else's track going away. Both mean the
      // same thing to the indicator.
      .on(RoomEvent.LocalTrackUnpublished, onTrackQuiet)
      .on(RoomEvent.TrackUnpublished, onTrackQuiet)
      // Nobody is speaking on a connection that is gone, and the last thing
      // heard would otherwise stay lit for as long as the screen is open. The
      // hold is dropped outright rather than allowed to run out: it is a
      // smoothing of live speech, and there is no longer any.
      .on(RoomEvent.Disconnected, (reason) => {
        clearTimeout(release);
        hold = NOBODY_SPEAKING;
        // **Why the room went, which the log could not say until now.** A
        // rebuild appeared in it as a `connect` line from nowhere: the two
        // paths to one are this handler's backoff and the foreground listener,
        // and neither wrote anything. A reconnection whose cause is unknown is
        // a reconnection that cannot be correlated with the failure that
        // follows it, and every failure so far has followed one.
        recordEvent(`room disconnected (${reason ?? 'no reason given'})`);
        if (cancelled) return;
        failing.clear();
        // **The one disconnection that must not be retried.** The room admits
        // one participant per identity and the identity is the account, so
        // another of this account's devices entering evicts this one — and
        // that eviction is indistinguishable from a dead network to
        // everything below. Rebuilding would re-evict the device that just
        // took the room, which would rebuild in turn, and the two would trade
        // the conversation back and forth on a 500ms-doubling backoff for as
        // long as both screens were open. That is what "the two devices
        // competed for the audio" sounded like:
        // planning/TWO-DEVICES-WALK.md.
        //
        // So the loser stops, and stops here rather than waiting to be told.
        // The server says the same thing over the socket — `displaced` sets
        // `live` to null and tears this hook down through its own cleanup —
        // but that is a second message on a second connection, and a race or
        // a drop would leave nothing at all breaking the loop. This needs no
        // message: the eviction is itself the news, and it arrives on the
        // connection that the news is about.
        //
        // Its own status rather than `reconnecting`, because nothing is
        // reconnecting — a spinner promising a recovery no code will attempt
        // is the worse of the two lies — and rather than `idle`, because the
        // foreground listener rebuilds from `idle`.
        if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
          recordEvent('displaced at the media plane; not rebuilding');
          update({ status: 'displaced', speaking: [], failing: [] });
          return;
        }
        // `livekit-client` retries internally and only fires this once it has
        // given up, so reaching here means the connection is not coming back
        // by itself. Ours is the last word.
        update({ status: 'reconnecting', speaking: [], failing: [] });
        scheduleReconnect();
      });

    /**
     * Asks for a fresh room after a delay, which re-runs this effect and so
     * tears the dead one down through the ordinary cleanup path rather than a
     * second one that would have to agree with it.
     */
    const scheduleReconnect = () => {
      if (retryRef.current) return;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** attemptRef.current,
        RECONNECT_MAX_MS
      );
      recordEvent(`reconnect in ${delay}ms (attempt ${attemptRef.current + 1})`);
      attemptRef.current += 1;
      retryRef.current = setTimeout(() => {
        retryRef.current = null;
        setGeneration((g) => g + 1);
      }, delay);
    };

    (async () => {
      // `asked` goes with it: a room being rebuilt has configured nothing, and
      // leaving the last connection's answer on screen would be a panel
      // reporting a session that no longer has anything to do with it.
      update({ status: 'connecting', message: null, asked: null });
      try {
        const credential = await api.mediaToken(token, channelIdRef.current!);
        if (!credential.url) {
          update({
            status: 'unavailable',
            message: 'The server has no audio configured.',
          });
          return;
        }
        if (cancelled) return;

        const intent = intentFor(micNeededRef.current, selfMutedRef.current);

        // Mixing until this app has audio of its own, and a call once it has.
        // Applied before the session is taken, so it is never briefly the
        // wrong one.
        //
        // **Read off the channel rather than off the room, which is the point
        // of the 2026-08-27 rule and matters most here.** Nothing is
        // subscribed yet, so a rule keyed on the audible count would take a
        // mixing session at this line and rewrite it the instant the first
        // track arrived — which is the instant the engine starts, and the
        // collision build 90 was written to remove. `hasAudio` is already true
        // for a channel with somebody in it, so the configuration this
        // connection needs is the one it is given, before anything is active.
        const anyAudio = hasAudioRef.current;
        pushPolicy(anyAudio);
        await applyFor(anyAudio);
        appliedRef.current = { intent, config: sessionFor(anyAudio) };
        update({
          asked: {
            selfMuted: selfMutedRef.current,
            micNeeded: micNeededRef.current,
            hasAudio: anyAudio,
            othersAudible: 0,
            intent,
            session: sessionFor(anyAudio),
            playout: policyFor(anyAudio).playout,
          },
        });
        recordEvent(`connect ${intent} ${nameOf(sessionFor(anyAudio))}`);

        // Started explicitly, despite registerGlobals() also installing
        // automatic management. Leaving it to the automatic path alone meant
        // that after a party left and rejoined, the other side's playback never
        // resumed: subscribed to the new track, reporting healthy, and silent.
        // Taking the session here makes it active before anything is published
        // or subscribed, which is the state remote playback needs.
        await AudioSession.startAudioSession();
        await room.connect(credential.url, credential.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        /**
         * **How much was already there when we arrived, which is the variable
         * this whole investigation now turns on.**
         *
         * A connection either renders from its first sample or never renders
         * at all, and the one connection in a run of eight that rendered was
         * the one where the shared track appeared *seventeen seconds after*
         * connecting rather than immediately. Everything that fails —
         * re-entering a channel, stepping back in, rebuilding the room — has
         * the media participant already sitting in the room, so the
         * subscription lands the instant the socket is up. Everything that
         * works — a new channel, a track uploaded afterwards — does not.
         *
         * That is an inference from timing, and timing is a proxy. This is the
         * variable itself: publications present at the moment of connection,
         * counted before anything subscribes. See BACKLOG.md § *The engine
         * stops under a healthy room*.
         */
        recordEvent(`room connected, ${publishedAlready(room)} audio already published`);

        // A freshly connected room has published nothing, so neither close has
        // anything to act on and only the opening case does any work.
        if (intent === 'capturing') {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
        attemptRef.current = 0;
        update({ status: 'connected', micOpen: intent === 'capturing' });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        // A refused microphone is a normal outcome the user can fix, not a
        // failure of the session, so it is reported distinctly.
        const denied = /permission|NotAllowed|denied/i.test(message);
        update({
          status: denied ? 'denied' : 'error',
          message: denied
            ? 'Microphone access was refused. Enable it in Settings to be heard.'
            : message,
        });
        // Not for a refusal, which retrying cannot fix and which the foreground
        // listener will pick up if the user grants it in Settings.
        if (!denied) scheduleReconnect();
      }
    })();

    return () => {
      cancelled = true;
      // Before `cancelled` stops it doing anything, so the timer cannot
      // outlive the room it was smoothing.
      clearTimeout(release);
      room.removeAllListeners();
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      room.disconnect().catch(() => {});
      AudioSession.stopAudioSession().catch(() => {});
      roomRef.current = null;
      appliedRef.current = null;
      // Back to the starting policy, or the observer keeps whatever this
      // connection last needed. Leaving `CALL` behind is the live hazard:
      // disconnecting while somebody was still talking would arm the observer
      // to take `playAndRecord` — exclusive, and mono on a Bluetooth route —
      // at some later transition with no channel to justify it.
      pushPolicy(false);
    };
  }, [mediaRoom, token, generation]);

  /**
   * Rebuilds the room on returning to the foreground, when it is not already
   * up or on its way.
   *
   * The backoff is reset rather than waited out, for the reason `socket.resume`
   * gives: a delay grown to ten seconds was earned by failures in a network
   * condition the phone may no longer be in, and possibly on a different
   * network entirely. It is also the path back from a refused microphone that
   * the user has since granted in Settings.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !mediaRoom) return;
      if (state.status === 'connected' || state.status === 'connecting') return;
      // Nor a room another device holds. Every other status here is a failure
      // worth one more attempt on a network that may have changed; this one
      // is a decision, and the network has nothing to do with it. Rebuilding
      // would evict whichever device is actually carrying the conversation,
      // once per trip through the app switcher.
      if (state.status === 'displaced') return;
      // The second path to a rebuild, and the one that leaves no other trace:
      // it fires on a room that has already given up, so there is no
      // `Disconnected` next to it to explain the `connect` that follows.
      recordEvent(`foreground rebuild (was ${state.status})`);
      attemptRef.current = 0;
      setGeneration((g) => g + 1);
    });
    return () => subscription.remove();
  }, [mediaRoom, state.status]);

  /**
   * Keeps the microphone and the audio session in step with each other.
   *
   * Only self-mute touches the microphone. The floor is enforced by the server
   * withholding this participant from the other one, so a silenced user keeps
   * publishing exactly as before — which is deliberate, and is what keeps their
   * audio session alive so they can still hear and can speak again afterwards.
   *
   * This is also **the only owner of the session's configuration** once a
   * connection exists, which is deliberate rather than tidy. A second effect
   * watching the audible count would race this one at exactly the moment both
   * change — somebody arriving both makes a track audible and, via
   * `micNeeded`, opens the microphone — and the loser's write is what the
   * session keeps.
   *
   * The two halves are driven by different questions, which is the thing to
   * hold on to here: **the microphone** asks whether anything is listening for
   * us, and **the session** asks whichever question the `steadyHeadset`
   * setting selected — see the `hasAudio` parameter. Under either they part
   * company from `micNeeded`, which is the point: a guest without the
   * microphone, and anybody self-muted, are heard without capturing.
   *
   * It also means this effect re-runs when somebody changes that setting
   * mid-channel, and rewrites the session then. That is intended — it is how
   * the two rules get compared on one headset — and it is safe for the same
   * reason every other edge here is: the write is ordered against the
   * microphone below rather than left to a transition we do not control.
   */
  useEffect(() => {
    const room = roomRef.current;
    if (!room || state.status !== 'connected') return;
    const intent = intentFor(micNeeded, selfMuted);
    // `micNeeded` decides whether we publish; `hasAudio` decides what the
    // session is. Only the second may move the audio category, which is the
    // boundary a Bluetooth profile handover sits on.
    const config = sessionFor(hasAudio);

    // Identity comparison, which holds because `sessionFor` returns the module
    // constants themselves. Without this, a track arriving while the
    // microphone is already open would re-run `setMicrophoneEnabled(true)` on
    // a microphone that is open, for a configuration that has not changed.
    const applied = appliedRef.current;
    if (applied && applied.intent === intent && applied.config === config) {
      // **The configuration has not moved, but what explains it may have.**
      // A track arriving does not write the session — since build 90 because
      // both closed states were the same object, and since 2026-08-27 because
      // the subscribed count is not an input at all — and `asked` used to be
      // refreshed only when it did. The panel reads `audible` off `asked`, so
      // it froze at the connect value of zero and went on reporting *nothing
      // subscribed* through a subscription that had plainly happened. A
      // diagnostic asserting something false is worse than one saying nothing,
      // and it cost a wrong diagnosis on 2026-08-24 before the log line beside
      // it gave it away.
      setState((s) =>
        s.asked && s.asked.othersAudible === s.othersAudible
          ? s
          : {
              ...s,
              asked: {
                selfMuted,
                micNeeded,
                hasAudio,
                othersAudible: s.othersAudible,
                intent,
                session: config,
                playout: policyFor(hasAudio).playout,
              },
            }
      );
      return;
    }
    appliedRef.current = { intent, config };
    // Written before the awaits below rather than after them, deliberately.
    // This is the record of what was *asked*, and the ask happens here; a
    // panel that only learned about it once the awaits resolved would be
    // blind to precisely the case where one of them never does.
    setState((s) => ({
      ...s,
      asked: {
        selfMuted,
        micNeeded,
        hasAudio,
        othersAudible: s.othersAudible,
        intent,
        session: config,
        playout: policyFor(hasAudio).playout,
      },
    }));
    recordEvent(`${intent} ${nameOf(config)}`);

    // Before either branch, and before the `await` in them, because the
    // transition the observer reads this for is the one `setMicrophoneEnabled`
    // is about to cause. With somebody else in the room the playout value is
    // `CALL`, so the engine dropping to playout-only on a self-mute moves
    // nothing: the category holds and the Bluetooth route is not handed over.
    pushPolicy(hasAudio);

    // Order matters and is opposite in the two directions: the session must
    // already be a call before capture starts, and must stay one until capture
    // has stopped. Configuring a `playback` session that is still recording is
    // exactly what silences the echo canceller.
    //
    // `muted` is the case that has neither ordering problem, because it moves
    // nothing: the device stays as it was, and `hasAudio` cannot change on a
    // self-mute — being muted requires somebody else in the room, which is
    // itself audio. That is why this branch does not re-state the
    // configuration at all.
    (intent === 'capturing'
      ? applyFor(hasAudio).then(() =>
          room.localParticipant.setMicrophoneEnabled(true)
        )
      : intent === 'muted'
        ? holdMicrophone(room)
        : releaseMicrophone(room)
            // Re-stated rather than assumed, and note this no longer implies
            // `playback`: letting *our* device go hands the session back only
            // if this app has nothing left to play either. That is the edge
            // where somebody's music is let back in — the last person leaving
            // a channel, or a shared track coming to rest.
            .then(() => applyFor(hasAudio))
    ).catch(() => {});
    const transmitting = intent === 'capturing';
    setState((s) =>
      s.micOpen === transmitting ? s : { ...s, micOpen: transmitting }
    );
  }, [selfMuted, micNeeded, hasAudio, state.status, state.othersAudible]);

  /**
   * Watches whether this device is rendering what it is subscribed to.
   *
   * **The one measurement here that cannot be the fault**, which is why it
   * exists at all: every reader in `engineState.ts` touches the audio device
   * module, and touching it is what stopped the sound for four days. This asks
   * the *receiver* instead — `inbound-rtp` statistics, through livekit-client
   * — and the ADM is never involved. See `audio/playout.ts` for why a sample
   * count means anything.
   *
   * Log-only. It counts and dates a fault that until now was caught by ear,
   * inside a ring, by somebody who happened to be listening.
   *
   * Runs while connected, and stops while the app is in the background, where
   * the engine stops on purpose and a frozen count would be a finding about
   * nothing. A poll with nothing subscribed reads no tracks and therefore says
   * nothing, which is the same restraint stated once rather than twice.
   *
   * **It does not depend on `othersAudible`, and that is deliberate as of
   * 2026-08-25.** It used to, as a gate on there being anything to measure —
   * and since the watch lived inside the effect, every arrival and departure
   * silently restarted the clock. The cost was not the missed freeze but the
   * missed *recovery*: `reported` went back to false, so a track that resumed
   * after somebody joined logged nothing, and the absence of a `playout
   * resumed` line was then read as the freeze having persisted. The one
   * instrument that survives a force-quit was deleting its own most
   * interesting observation whenever the room changed shape.
   */
  useEffect(() => {
    if (state.status !== 'connected') return;
    let watches = initialPlayoutWatches();
    let cancelled = false;

    const poll = async () => {
      const room = roomRef.current;
      if (!room || cancelled || AppState.currentState !== 'active') return;
      // One reading per subscribed track, each clocked separately. Summing them
      // hid the fault this exists to catch: the shared-playback track can
      // render nothing while a person's track next to it keeps the total
      // moving. See `audio/playout.ts`.
      const readings: PlayoutReading[] = [];
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.audioTrackPublications.values()) {
          const track = publication.audioTrack;
          // `remoteParticipants` cannot hold a local track, but the publication
          // type admits one — so this is narrowed rather than asserted. A cast
          // here would be the kind of shortcut that survives an SDK change by
          // failing silently, which is the whole hazard this file is about.
          if (!track || !('getReceiverStats' in track)) continue;
          const stats = await track.getReceiverStats().catch(() => undefined);
          const samples = stats?.totalSamplesDuration;
          readings.push({
            key: publication.trackSid,
            label: participant.identity,
            samples: typeof samples === 'number' ? samples : null,
          });
        }
      }
      if (cancelled) return;
      const { next, events } = onPlayoutReadings(watches, readings, Date.now());
      watches = next;
      for (const event of events) recordEvent(event);
    };

    const timer = setInterval(() => void poll(), PLAYOUT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.status]);

  /**
   * Attached on the way out rather than held in state, so a rebuild is not
   * itself a state change that could re-run anything above.
   *
   * The backoff is reset with it, for `socket.resume`'s reason: a delay grown
   * to ten seconds was earned in a network condition that no longer applies,
   * and somebody pressing this is asking for now rather than eventually.
   */
  const reconnect = () => {
    attemptRef.current = 0;
    setGeneration((g) => g + 1);
  };

  return { ...state, reconnect };
}
