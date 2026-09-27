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
  if (!hasMicrophone(channel, me)) return false;
  /*
    **The watch exception, which left this predicate on 2026-09-23 and came
    back on 2026-09-26.** A device showing the film closes its microphone, so
    that `sessionFor` asks for `playback` and the film is stereo rather than
    mono, ducked and voice processed.

    **What it costs is about a second on every press of Play**, all of it spent
    tearing the microphone down before the session can move — build 277:
    `engine stop` at 0.92 to 1.11 seconds with the category change immediately
    behind it, against 0.27 to 0.41 seconds for a pause. That measurement is
    why the exception left, and it still stands. What it bought was not worth
    it, which is the part that turned out to be wrong.

    **Holding the device and changing the configuration instead cost the room
    its conversation.** `SCREENING` was `playAndRecord` under `default`, and on
    build 296 the audio engine stopped mid-run and nothing restarted it, so a
    pause put every microphone back onto a dead engine and nobody could be
    heard until they left the channel and returned. It did not even buy the
    second back: `watch playing after 1689ms`.

    **Corrected 2026-09-27: the film stopped it, not the write.** The
    configuration was measured directly on build 302 and stops nothing. The
    `WKWebView` taking the audio session as the film begins is what stops the
    engine, and holding the microphone is what leaves it stopped — there being
    no release and retake to bring it back. So this exception is the repair
    rather than a concession, and it is why the second on Play is a second and
    not a silence. See
    planning/decisions/2026-09-27-the-film-stops-the-engine.md.

    So the second is paid and the film keeps its stereo. See
    `planning/decisions/2026-09-26-the-film-keeps-its-stereo.md`, and
    `planning/tasks/` for what a resume that costs nothing would need.
  */
  return !isScreening(channel, me);
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
 * **What this answers moved on 2026-09-23 and moved back on 2026-09-26.** For
 * three days it decided which session configuration a device held while it went
 * on capturing — `SCREENING` rather than `CALL` — and on build 296 the audio
 * engine stopped mid-run with nothing to restart it. So it decides again what
 * it originally did: whether this device captures at all. The write turned out
 * not to be the cause of that stop; see below and the 2026-09-27 entry.
 * `microphoneNeeded` says why, and what it costs.
 *
 * **The exception to the one rule above, and it is written down as one so that
 * nobody later deletes it as an inconsistency.** *You hold the audio system if
 * and only if you are stepped in* has been the whole of this file since the
 * 2026-09-08 redesign; this is the first thing to qualify it.
 *
 * **What it buys is stereo**, and the reason it has to buy it by closing
 * something is worth stating exactly, because the obvious cheaper version was
 * tried and shipped and failed. A screen and a microphone on one device cannot
 * both be served: an open microphone forces `playAndRecord`, and the useful
 * modes for it are voice modes — mono over Bluetooth, ducked, voice processed —
 * and the film is what everybody came for.
 *
 * The category was never the problem; the *mode* is, and `allowBluetooth` is,
 * and both are choices. So the cheap version held the device and changed only
 * the configuration, and on build 296 the room could not talk when the film
 * paused, the engine having stopped with nothing to restart it.
 *
 * **What is corrected as of 2026-09-27 is why, and the answer is the film.** The
 * write was not the cause: this exact configuration was applied to a capturing,
 * rendering engine on build 302 and held forty seconds without stopping it. What
 * stops the engine is the `WKWebView` taking the audio session as the film
 * begins — three reproductions on build 303, including one with nothing
 * subscribed. And nothing restarts it because holding the microphone is what
 * removes the release and retake. See
 * planning/decisions/2026-09-27-the-film-stops-the-engine.md.
 *
 * **So this exception stands on the second on Play**, which is build 277's
 * measurement and is untouched by any of that: releasing and retaking the
 * device is what tears the engine down and brings it back up, and it costs
 * about a second. **The price is paid by whoever pressed Play, once**, and not
 * by the conversation. That is the ordering the 2026-09-23 attempt had
 * backwards, and it is the reason this is still here.
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
