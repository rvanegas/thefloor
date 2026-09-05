/**
 * Making a subscribed track render again, without touching the room.
 *
 * **The recovery that is not a rebuild, and the distinction is the whole
 * point.** `planning/PLAYOUT.md` records the standing rule that the freeze
 * detector must never be wired to `reconnect()`, and the reason is that
 * rebuilding the room *is* the failing case: every rebuild reconnects into a
 * channel whose media participant is already sitting there, so the
 * subscription lands on the same tick as the socket, which is the arm of the
 * fault that has never once rendered. A detector wired to that would answer
 * the fault by re-entering it.
 *
 * Dropping and retaking one subscription goes the other way. Every observation
 * this project has of a track that renders — the seventeen-second case in
 * build 92, a file uploaded after somebody connected, a new channel — is a
 * subscription arriving at a room that is already up and an engine that is
 * already running. That is the state this produces on purpose, for one track,
 * leaving the socket, the session and every other subscription alone.
 *
 * **Why it is expected to work at all**, which is a hypothesis and is written
 * here so that a later reader can see what was believed rather than infer it.
 * The 2026-09-04 log has three freezes and three recoveries, and the only
 * event that ever changes which way a track is rendering is an engine
 * start, in either category direction — `playback` → `playAndRecord` revived a
 * track twice and `playAndRecord` → `playback` revived it once, and the same
 * transition that revived it once froze it another time. So the category is
 * not the variable and the engine restart is: a receiver appears to bind to
 * the playout instance that is live when it attaches, and a restart that
 * leaves playout enabled swaps the engine underneath it without rebinding. A
 * fresh receiver has nothing to be stale about.
 *
 * If that is wrong, this is inert rather than harmful: the track comes back
 * subscribed and silent, exactly as it was, and the `playout resumed` line
 * that would have said otherwise never appears. Which is the reason it ships
 * behind the `debug` column first — see the caller in `useSessionAudio.ts`.
 *
 * **The gap is load-bearing.** `setSubscribed(false)` and `setSubscribed(true)`
 * on the same tick are two subscription updates the SFU is entitled to
 * coalesce into no change at all, and a recovery that quietly does nothing is
 * worse than none: it would produce a log line saying it had acted. So the
 * retake is scheduled, and the scheduler is a parameter so a test can run it
 * without waiting.
 *
 * Types are declared structurally rather than imported, for the reason
 * `AudioIntent` is: this file must not pull `@livekit/react-native` into a
 * bundle that has no business loading it, and a test must be able to hand it
 * an object rather than a room.
 */

/** How long to leave a track unsubscribed before taking it back. */
export const REBIND_GAP_MS = 500;

/**
 * How many times one track may be rebound on one connection.
 *
 * Three, because every recovery in the 2026-09-04 log arrived within about a
 * second of the engine start that caused it — so if this works at all it works
 * on the first attempt, and the other two are for a poll that lands badly. A
 * track still frozen after three is evidence that this is the wrong repair,
 * and going on would only bury that under subscription churn.
 */
export const REBIND_ATTEMPTS = 3;

/**
 * How long to leave a rebound track alone before trying again.
 *
 * Longer than `PLAYOUT_FREEZE_MS` plus a poll, so that a track which is
 * rebound, renders for one reading and freezes again cannot spend its whole
 * budget inside a few seconds. What is being protected is the *evidence*: three
 * attempts spread over half a minute leave a log somebody can read, and three
 * in six seconds leave one nobody can attribute.
 */
export const REBIND_COOLDOWN_MS = 10_000;

interface RebindablePublication {
  trackSid: string;
  setSubscribed(subscribed: boolean): void;
  /**
   * Whether this client has *asked* for the track — the SDK's `subscribed !==
   * false` — as opposed to whether the track has arrived.
   *
   * **`isSubscribed` is the wrong one and was used here for a day.** It reads
   * `this.track !== undefined` under the desired flag, so it stays false from
   * the moment you ask until delivery completes: a guard on it would re-ask for
   * every track still in flight each time `takeSubscriptions` ran, and write a
   * second log line claiming a subscription that had already been taken. The
   * line is the evidence for the whole ordering experiment, so it must not
   * double.
   *
   * Optional because `rebindTracks`'s tests hand in plain objects, and hence
   * compared against `false` rather than trusted to be a boolean.
   */
  isDesired?: boolean;
}

interface RebindableParticipant {
  identity: string;
  audioTrackPublications: Map<string, unknown>;
}

export interface RebindableRoom {
  remoteParticipants: Map<string, RebindableParticipant>;
}

/**
 * Narrowed rather than cast, the same way the playout poll narrows a track
 * before asking it for statistics. `audioTrackPublications` admits a local
 * publication by type even though a remote participant cannot hold one, and a
 * cast here is the kind of shortcut that survives an SDK rename by failing
 * silently — in a file whose failure mode is *appearing* to have acted.
 */
function rebindable(publication: unknown): RebindablePublication | null {
  if (!publication || typeof publication !== 'object') return null;
  if (!('setSubscribed' in publication) || !('trackSid' in publication)) {
    return null;
  }
  const candidate = publication as RebindablePublication;
  if (typeof candidate.setSubscribed !== 'function') return null;
  if (typeof candidate.trackSid !== 'string') return null;
  return candidate;
}

/**
 * Drops and retakes the subscription to the named tracks, and says which.
 *
 * @param room the connected room, or null, which is not an error — a poll can
 *             land after a teardown and this is asked from one.
 * @param sids the tracks to rebind by sid, or null for every remote audio
 *             track. The detector names the sid it measured, so the narrow
 *             call is the ordinary one; the panel's button is what uses null.
 * @param schedule how to wait `REBIND_GAP_MS`, injected for the tests.
 * @returns one label per track acted on, `<identity> (<sid>)`, in the order
 *          found — the caller writes these to the diagnostic log, so they
 *          carry the identity that `sub +` and `playout frozen` already use
 *          and the sid that distinguishes two tracks of one participant.
 *
 * **Never throws.** It is called from a poll and from a button, and in both
 * cases a publication that has gone between the reading and the act is
 * ordinary rather than exceptional.
 */
export function rebindTracks(
  room: RebindableRoom | null,
  sids: Set<string> | null,
  schedule: (run: () => void, ms: number) => void = (run, ms) => {
    setTimeout(run, ms);
  }
): string[] {
  if (!room) return [];
  const acted: string[] = [];

  let participants: Iterable<RebindableParticipant>;
  try {
    participants = room.remoteParticipants.values();
  } catch {
    return [];
  }

  for (const participant of participants) {
    let publications: Iterable<unknown>;
    try {
      publications = participant.audioTrackPublications.values();
    } catch {
      continue;
    }
    for (const candidate of publications) {
      const publication = rebindable(candidate);
      if (!publication) continue;
      if (sids && !sids.has(publication.trackSid)) continue;
      try {
        publication.setSubscribed(false);
      } catch {
        continue;
      }
      // Only after the drop succeeded, so a label is a statement that
      // something happened rather than that something was attempted.
      acted.push(`${participant.identity} (${publication.trackSid})`);
      schedule(() => {
        try {
          publication.setSubscribed(true);
        } catch {
          // The room went while we waited. There is nothing to take back and
          // nothing to report: the teardown has already said so.
        }
      }, REBIND_GAP_MS);
    }
  }

  return acted;
}

/**
 * How long to let a room settle before taking its subscriptions.
 *
 * **The whole experiment is in this number being greater than zero.** With
 * `autoSubscribe: false` the socket comes up subscribed to nothing, and this is
 * the gap before the first subscription is asked for — so what is produced on
 * purpose is the state that has always rendered, a subscription arriving at a
 * room that is already up and an engine that is already running, rather than
 * the one that never has.
 *
 * A second, because that is the shape of the evidence rather than a tuned
 * value. The connections that render have had their track arrive seconds to
 * tens of seconds after the socket; the ones that do not have it arrive inside
 * the same tick. Anything comfortably clear of a tick tests the hypothesis, and
 * a second is short enough that somebody stepping into a channel does not
 * experience it as a fault.
 */
export const SUBSCRIBE_SETTLE_MS = 1_000;

/**
 * Subscribes to every remote audio track that is not subscribed already.
 *
 * The other half of `autoSubscribe: false`: with it off, nothing is subscribed
 * by the server and every publication — those present at connect and those
 * arriving later — has to be asked for. Both are asked for through here, and
 * deliberately so, because the late arrival is the case that has always worked
 * and there is no reason to give it a different path.
 *
 * @returns one label per track newly subscribed, `<identity> (<sid>)`, in the
 *          order found. Empty when there was nothing to take, which is the
 *          ordinary result of the second call onwards and is not an error.
 *
 * **Never throws**, for `rebindTracks`'s reasons: it is called from a timer and
 * from an event, and a publication that has gone in between is ordinary.
 */
export function takeSubscriptions(room: RebindableRoom | null): string[] {
  if (!room) return [];
  const taken: string[] = [];

  let participants: Iterable<RebindableParticipant>;
  try {
    participants = room.remoteParticipants.values();
  } catch {
    return [];
  }

  for (const participant of participants) {
    let publications: Iterable<unknown>;
    try {
      publications = participant.audioTrackPublications.values();
    } catch {
      continue;
    }
    for (const candidate of publications) {
      const publication = rebindable(candidate);
      if (!publication) continue;
      // Asked once, and `isDesired` rather than `isSubscribed` is what makes
      // that true — see the field's own note. Delivery can take as long as it
      // likes; what must not repeat is the asking.
      if (publication.isDesired !== false) continue;
      try {
        publication.setSubscribed(true);
      } catch {
        continue;
      }
      taken.push(`${participant.identity} (${publication.trackSid})`);
    }
  }

  return taken;
}
