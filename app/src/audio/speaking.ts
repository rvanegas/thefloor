/**
 * Who to *show* as speaking, which is not quite who LiveKit says is speaking.
 *
 * The room's own detection drops somebody the moment they stop making sound,
 * so a normal sentence — with its breath, and the gap before the next one —
 * arrives as a rapid series of on/off transitions. Rendered directly, the
 * indicator flickers through every pause, which reads as a fault in the app
 * rather than as an accurate account of the speech.
 *
 * So the *trailing* edge is held: somebody who leaves the active set goes on
 * being shown for a moment, and comes back instantly if they resume. The
 * leading edge is not delayed — a dot that appeared 300ms after somebody
 * started talking would be a different, worse fault.
 *
 * **The hold cannot be "a signal within the last two seconds".** That is the
 * obvious shape and it is wrong, because `ActiveSpeakersChanged` fires when the
 * set *changes* rather than continuously: somebody talking uninterrupted for a
 * minute produces one event at the start and nothing after it, so a
 * last-signal clock would expire mid-sentence and put the dot out while they
 * were still talking. What the event says is who is speaking *now*, and it goes
 * on being true until the next one — so the hold belongs on the removal.
 *
 * Pure and separate from the hook for the same reason `micNeeded` is: the
 * timing rules are the whole substance here, and they are not exercisable
 * through a component that needs a live room to produce a single event.
 */

/** How long somebody keeps their indicator after the room stops hearing them. */
export const SPEAKING_HOLD_MS = 2_000;

export interface SpeakingHold {
  /** Who the room says is speaking right now. */
  active: string[];
  /**
   * Who has stopped, and when to stop showing them. Someone who resumes is
   * removed from here rather than having their release pushed back — they are
   * simply active again.
   */
  releaseAt: Record<string, number>;
}

export const NOBODY_SPEAKING: SpeakingHold = { active: [], releaseAt: {} };

/**
 * Takes a fresh active-speaker set from the room.
 *
 * Anybody who has just left the set starts their hold. Anybody already holding
 * keeps the release they were given — the hold runs from when they stopped, so
 * a second event arriving during it must not extend it, or a room with several
 * people talking would keep everybody's indicator alive indefinitely.
 */
export function onActiveSpeakers(
  hold: SpeakingHold,
  speakers: string[],
  now: number
): SpeakingHold {
  const active = [...new Set(speakers)];
  const releaseAt: Record<string, number> = {};

  for (const [id, at] of Object.entries(hold.releaseAt)) {
    // Still holding, unless they have started again — in which case `active`
    // covers them and a release would put their dot out mid-sentence.
    if (!active.includes(id) && at > now) releaseAt[id] = at;
  }
  for (const id of hold.active) {
    if (active.includes(id)) continue;
    // Just stopped. `??=` rather than `=` so an existing hold wins, though the
    // two sets are disjoint by construction; being explicit costs nothing and
    // survives someone changing that.
    releaseAt[id] ??= now + SPEAKING_HOLD_MS;
  }

  return { active, releaseAt };
}

/**
 * Takes somebody's audio off the wire — they left the room, or their
 * microphone track did.
 *
 * Dropped outright rather than given a hold. The hold is a smoothing of live
 * speech — it exists so a breath does not put the dot out — and somebody whose
 * track has gone is not between two words. Holding them would show a person as
 * speaking for two seconds after their card already reads "Stepped out", which
 * is the same contradiction in miniature.
 *
 * These are the transitions `ActiveSpeakersChanged` does not cover, and the
 * reason the indicator could stick indefinitely before this existed. The event
 * fires when the *set* changes, and that set is computed from tracks the
 * server is observing — so it says nothing about a track that stops existing
 * mid-word. Whoever was in it stays in `active`, and `active` has no expiry;
 * only `releaseAt` does.
 *
 * Both ends of that produce a dot that stays lit for the rest of the session
 * in a two-person channel, and both have been seen:
 *
 * - **They leave mid-word.** LiveKit drops them from the room without
 *   re-emitting, and with nobody left to speak there is no later event to
 *   clear them.
 * - **Our own microphone closes.** The last other person stepping out releases
 *   the device, and a released — or merely muted — track is one the server has
 *   stopped observing, so nothing ever says we went quiet. That left the dot
 *   lit on your own card while you sat alone in a channel with the microphone
 *   shut, which is the state that says most plainly that it is a fault.
 */
export function onAudioGone(hold: SpeakingHold, id: string): SpeakingHold {
  // Returned untouched when they were not being shown, so the caller's
  // identity check sees no change. Most of these are about somebody who was
  // already silent, and every closing microphone raises one.
  if (!hold.active.includes(id) && hold.releaseAt[id] === undefined) {
    return hold;
  }
  const releaseAt = { ...hold.releaseAt };
  delete releaseAt[id];
  return { active: hold.active.filter((each) => each !== id), releaseAt };
}

/**
 * Who to show, active first and then whoever is still within their hold.
 *
 * Order is stable rather than alphabetical: the caller indexes into it by id,
 * and a list that reshuffles as people start and stop would be a needless
 * source of re-renders.
 */
export function shownAsSpeaking(hold: SpeakingHold, now: number): string[] {
  const held = Object.entries(hold.releaseAt)
    .filter(([, at]) => at > now)
    .map(([id]) => id);
  return [...hold.active, ...held];
}

/**
 * When this hold next changes what it shows, or null when nothing is pending.
 *
 * The caller needs it because a hold expiring is the one transition no event
 * announces: the room has already said everything it is going to say about
 * somebody who stopped talking, so something has to wake up and stop showing
 * them.
 */
export function nextReleaseAt(hold: SpeakingHold, now: number): number | null {
  const pending = Object.values(hold.releaseAt).filter((at) => at > now);
  return pending.length === 0 ? null : Math.min(...pending);
}
