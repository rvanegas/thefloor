/**
 * A channel handed between two documents on this origin, out of the address.
 *
 * Two walks have to name a channel across a page load and neither may say it
 * in a URL: the guest page sending somebody into the app once they accept a
 * contact request, and the app sending somebody out to the seat page. Both are
 * one tab on one origin, which is exactly what `sessionStorage` is — the same
 * property the guest page's own seat has relied on since it was written, and
 * the reason `/g/c/:channelId` could stop carrying an id at all.
 *
 * **`sessionStorage` rather than `localStorage`.** A walk belongs to a visit.
 * A second tab is not on it, tomorrow's visit is not either, and a channel
 * left in a browser for a week is a room nobody remembers opening.
 *
 * **Two keys, because the two walks have different lifetimes**, and one key
 * was wrong in a way worth writing down. An arrival is one-shot: it is acted
 * on once and must not fire again, or the plain *Go to The Floor* link out of
 * the guest page would drop somebody into a channel they are a guest of and
 * not a member of, which the server refuses. A seat page's channel is the
 * opposite — it has to survive a reload of `/g/seat`, which is exactly what
 * the id in the path used to guarantee. So one is taken and one is left.
 *
 * Both keys are repeated in `server/web/guest.ts` rather than imported:
 * nothing in the server may import from `app/`, so a comment at each end is
 * the only link the two can have. `thefloor.token` is written up the same way
 * there.
 */
const HANDOVER_KEY = 'thefloor.handover';

/**
 * Which channel the seat page about to be opened is for.
 *
 * Left rather than handed: read on every load of `/g/seat`, including a
 * reload, and cleared by nothing — a seat page with no channel cannot tell
 * which of this tab's seats is its own and says it has lost the seat.
 */
const SEAT_CHANNEL_KEY = 'thefloor.seat.channel';

export interface Handover {
  channelId: string;
  /**
   * Whether the walk means to *arrive* rather than merely look.
   *
   * True for one caller: somebody who was audible in that room a second ago
   * as a guest and has just been made a member of it. Landing outside and
   * being asked to step in would be the app forgetting what it had watched
   * them do.
   *
   * **This was `?enter=1` on the address until 2026-09-04**, and its own
   * comment always described it as a one-shot intent rather than part of the
   * address. Here it stops being on the address at all, which is what it was
   * claiming to be. `tapToStepIn` is not consulted — that setting is about a
   * list of rooms where a tap is as likely to be curiosity as intent, and
   * this is not a tap on a list.
   */
  enter?: boolean;
}

/**
 * Leaves the channel the seat page is about to be opened for.
 *
 * Overwrites rather than accumulates: a tab is looking at one seat page at a
 * time, and the last walk out of the app is the one that page is about.
 */
export function leaveSeatChannel(channelId: string): void {
  try {
    globalThis.sessionStorage?.setItem(SEAT_CHANNEL_KEY, channelId);
  } catch {
    // Storage blocked. The seat page will say it has lost the seat, which is
    // the truth from where it is standing.
  }
}

/** Leaves an arrival for the app, to be acted on once. */
export function leaveHandover(handover: Handover): void {
  try {
    globalThis.sessionStorage?.setItem(HANDOVER_KEY, JSON.stringify(handover));
  } catch {
    // Safari with storage blocked throws rather than refusing quietly. The
    // walk then lands on the list, which is where it lands on native too.
  }
}

/**
 * The channel this document was walked to with, if any, taken rather than read.
 *
 * Absent everywhere but a browser: `globalThis.sessionStorage` is undefined on
 * native, so this answers null there without a platform test — the walks it
 * serves exist only on the web, seats and guest pages having no native form.
 */
export function takeHandover(): Handover | null {
  let raw: string | null = null;
  try {
    raw = globalThis.sessionStorage?.getItem(HANDOVER_KEY) ?? null;
    globalThis.sessionStorage?.removeItem(HANDOVER_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Handover>;
    // Nothing else on the record is trusted to exist: this crosses a document
    // boundary, so a version skew between the two ends is an ordinary state
    // rather than an impossible one.
    if (typeof parsed?.channelId !== 'string' || !parsed.channelId) return null;
    return { channelId: parsed.channelId, enter: parsed.enter === true };
  } catch {
    return null;
  }
}
