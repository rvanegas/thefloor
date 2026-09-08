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
 * and the watch-party clause. Neither is a tidy-up: the session follows your
 * own mode rather than the roster, so this predicate no longer reads who else
 * is here; and a watch party's film plays on **another device**, so an
 * exclusive claim does not silence it and the occupants simply mute, which is
 * ordinary self-mute using machinery that already exists. `partyWithholds`
 * stays in `core/watch.ts` for the server's withholding, which is a different
 * question.
 *
 * The one thing this still asks about somebody other than the caller is what
 * kind of person the caller is, which is the guest case below.
 */
export function microphoneNeeded(
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
