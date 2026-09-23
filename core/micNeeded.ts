import { guestMaySpeak, inRoom, isGuest } from './guests';
import type { ChannelState, UserId } from './types';

/**
 * Whether this device should be capturing.
 *
 * **One rule, since the *Stepping in, and stepping in nearby* redesign of
 * 2026-09-08: you hold the audio system if and only if you are stepped in.**
 * Being in a room is itself the claim — the microphone opens on the way in,
 * before anybody has arrived and whether or not anybody ever does, so that an
 * arriving voice is heard rather than attended to.
 *
 * **This reverses the standing principle this file used to carry** — *being in
 * an empty channel should cost the speakers nothing* — and the reversal is
 * deliberate rather than an oversight. The cost is real: a Bluetooth headset
 * goes to the mono hands-free profile and another app's audio stops, for as
 * long as the visit lasts. **Nearby is the escape hatch**, and it is what the
 * old rule was trying to be: somebody who wants to be reachable without their
 * music stopping declares themselves nearby instead of stepping in, and claims
 * nothing at all. The old rule served both intentions with one state and had
 * to guess which was meant.
 *
 * **What left with it.** The occupancy clause — *is anybody else in the room* —
 * and the watch-party clause. The first is not a tidy-up: the session follows
 * your own mode rather than the roster, so this predicate no longer reads who
 * else is here.
 *
 * **The second has come back, inverted, and the sentence it left on is now
 * false.** It read: *a watch party's film plays on another device, so an
 * exclusive claim does not silence it and the occupants simply mute*. Since
 * the player moved into the app the film may be on this very device, and then
 * the microphone is not a bystander but the thing standing between its owner
 * and a film in stereo. See `isScreening` below, which is that clause in its
 * new form — an exception rather than a condition, and narrower than the one
 * that left.
 *
 * The one thing this still asks about somebody other than the caller is what
 * kind of person the caller is, which is the guest case below.
 */
export function microphoneNeeded(channel: ChannelState, me: UserId): boolean {
  /*
    **The watch exception left this predicate on 2026-09-23 and became a
    question about the session instead.**

    It used to subtract `isScreening` here — a device showing the film closed
    its microphone, so that `sessionFor` could ask for `playback` and the film
    got the stereo bloom. What that cost was measured on build 277 and is
    worse than what it bought: closing the device takes about a second, and
    the whole of it is spent between somebody pressing Play and the film
    starting. `engine stop` at 0.92 to 1.11 seconds, with the category change
    immediately behind it; pausing, which tears nothing down, moved category
    in 0.27 to 0.41 seconds every time.

    So the device is held for the length of the party and the *configuration*
    changes instead — `SCREENING` in `app/src/audio/session.ts`, which is
    `playAndRecord` under a non-voice mode with A2DP output. `isScreening` is
    still the question; it is asked by the session rather than by this, and
    nothing is published either way because a screening run is enforced-muted.
  */
  return hasMicrophone(channel, me);
}

/**
 * Whether this person has a microphone in this room at all.
 *
 * **The rule above, minus the watch exception below it**, and the two are
 * separated for a reason that is not tidiness: `anyScreenInTheRoom` in
 * channel.ts has to ask whether somebody's microphone matters *in order to
 * decide whether it should be closed*, and asking `microphoneNeeded` for that
 * would be asking a question whose answer is what it is about to compute. One
 * predicate is about the person and the room; the other is about this moment.
 */
export function hasMicrophone(
  channel: ChannelState,
  me: UserId
): boolean {
  // Nearby, stepped out, and not a participant are one answer, and it is no.
  // Stated here rather than left to the call site because it is the whole rule
  // — every caller that used to lean on the occupancy clause for this is now
  // leaning on this line.
  if (!inRoom(channel, me)) return false;
  // A guest with no grant has no microphone to need. Their LiveKit token is
  // minted unable to publish, so asking for capture would open a device
  // microphone that nothing is allowed to carry — and on a phone that is the
  // same profile handover as a real call, paid for to publish nothing.
  //
  // **This is why *stepped in* names two session configurations rather than
  // one.** The hope was that this predicate and `channelHasAudio` would
  // collapse into each other once the roster left both; the guest is why they
  // cannot. The divergence is narrower than it was and it is permanent.
  if (isGuest(channel, me) && !guestMaySpeak(channel, me)) return false;
  return true;
}

/**
 * Whether this device is showing the film right now, and so must not capture.
 *
 * **What this answers moved on 2026-09-23.** It used to decide whether this
 * device captured at all; it now decides which session configuration it holds
 * while it does — `SCREENING` rather than `CALL`. The question is the same and
 * the answer is spent differently; `microphoneNeeded` says why.
 *
 * **The exception to the one rule above, and it is written down as one so that
 * nobody later deletes it as an inconsistency.** *You hold the audio system if
 * and only if you are stepped in* has been the whole of this file since the
 * 2026-09-08 redesign; this is the first thing to qualify it.
 *
 * **What it buys is stereo, and it no longer buys it by closing anything.**
 * The sentence here used to read that a screen and a microphone on one device
 * cannot both be served, because an open microphone forces `playAndRecord`
 * under a voice mode — mono over Bluetooth, ducked, voice processed — and the
 * film is what everybody came for. The category was never the problem: the
 * *mode* is, and `allowBluetooth` is, and both are choices. `SCREENING` keeps
 * `playAndRecord` with neither of them.
 *
 * **The price that used to be paid here was a profile handover at every
 * pause, and it turned out to be a second on every resume.** See
 * `microphoneNeeded`.
 *
 * **Two properties of a watch party make it safe, and neither generalises.**
 * A loaded party already refuses a recording — `canStartRecording` requires
 * `watch.party === null`, playing or paused and wherever anybody is watching —
 * so the capture being declined feeds nothing; and it feeds no subscription
 * either, because a run with a screen in the room is enforced-muted for its
 * length. The other is that a film keeps the app in front, which is where iOS
 * requires a *new* microphone to be asked for: the deferred promotion in
 * STATES.md is what a backgrounded reacquisition would otherwise hit, and it
 * is also what covers somebody swapping away mid-film.
 *
 * **Keyed on `enforced` rather than on the party's mute.** They coincide by
 * construction — a run with a screen in the room begins muted and cannot be
 * unmuted — and reading the sampled flag is what keeps this in step with the
 * room's expectations rather than a tick ahead of them.
 */
export function isScreening(channel: ChannelState, me: UserId): boolean {
  // Optional for `partyMuteRequested`'s reason: a server older than these
  // fields sends snapshots without them, which this build meets between its
  // release and the deploy that follows. No party and no screens is what those
  // channels had.
  const watch = channel.watch;
  if (watch?.status !== 'playing' || !watch.enforced) return false;
  return (channel.watchingHere ?? []).includes(me);
}

/**
 * Whether The Floor has any audio right now, which decides whether this app
 * claims the audio system at all.
 *
 * **The same rule as `microphoneNeeded`, minus the guest clause**: stepped in
 * is a claim, and nothing else is. A guest without a speech grant subscribes
 * and hears the room, so they have audio without having capture — `LISTENING`
 * in `app/src/audio/session.ts`, which is `playback` and, like `CALL`,
 * exclusive.
 *
 * **The claim is exclusive, and that is the change of 2026-09-08.** Nothing
 * mixes any more: a phone has either claimed the audio system or released it,
 * and there is no third configuration that half-holds it. `IDLE` — `playback`
 * with `mixWithOthers` — left the codebase with this rule, because the state
 * it was kept for is now a phone that holds no session whatsoever.
 *
 * **The header this replaced asserted something the device refuted.** It said
 * a capturing session must be exclusive, taking that from commit `0fd88c7`'s
 * *"the option bought nothing and the category cost everything"*. Nine
 * configurations measured on 2026-09-08 say otherwise: `playAndRecord` with
 * `mixWithOthers` under a non-voice mode let a podcast play at 48 kHz with an
 * input tap running. The category costs nothing; the **mode** does, the voice
 * modes asserting `duckOthers` behind the caller's back. So exclusivity here
 * is a **choice** — made for the reason at the top of this file — rather than
 * a constraint inherited from a misattribution.
 *
 * **Shared playback is no longer a case, and neither is a recording.** Both
 * used to be reasons to hold the session in a room that was otherwise quiet;
 * both can only happen in a room you are standing in, and standing in one is
 * already the whole answer.
 */
export function channelHasAudio(channel: ChannelState, me: UserId): boolean {
  return inRoom(channel, me);
}
