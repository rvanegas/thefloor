import { WAITING_WINDOW_MS } from '../../../core/constants';

/**
 * Whether anybody is still at this machine — the clock a browser needs and a
 * phone does not.
 *
 * A phone has no explicit "background → step out" path. iOS suspends the
 * process, the socket goes silent, the server's sweep notices, the grace
 * period lapses and `DISCONNECT_EXPIRED` takes the presence away. Absence is
 * inferred from a connection that stopped, and nothing had to decide anything.
 *
 * A browser tab does not die. It keeps its socket, its heartbeat, its timers
 * and its audio for as long as the machine is awake, and `STILL_HERE` goes on
 * being sent by a machine rather than by a person — so an abandoned laptop
 * shows as present indefinitely: a ghost on Home, a seat in a channel, and
 * somebody others are told is there to talk to. There is nothing to infer
 * absence from, so it has to be measured.
 *
 * **What is measured is audio activity, and your own voice is not part of it.**
 * A microphone left open in an empty room hears traffic and hums, and a tab
 * that talked to itself for an hour is no more attended for it. What counts is
 * somebody *else* being audible, somebody *else* arriving, and this person's
 * own hand on the page.
 *
 * **Capture is not activity, which is why the audio-session rule is not this.**
 * `channelHasAudio` asks whether anybody in the room *could* be heard, and holds
 * steady through every silence on purpose, so the Bluetooth route does not
 * move under the first syllable somebody says. Two abandoned tabs each make
 * the other's microphone needed, so both read as capturing and neither would
 * ever expire — which is the case this exists to end.
 *
 * Pure and separate from the hook for the same reason `speaking.ts` and
 * `webRoute.ts` are: the rules are the whole substance, and none of them is
 * reachable through a component that needs a live room and a browser to
 * produce a single event.
 */

/** How long an unattended tab keeps its seat. */
export const ATTENTION_WINDOW_MS = WAITING_WINDOW_MS;

export interface Attention {
  /**
   * The channel this clock is about. A different one is a different clock —
   * stepping in anywhere is itself the freshest evidence there is.
   */
  channelId: string | null;
  /**
   * Everybody other than you who was in the room at the last look, which is
   * what makes an arrival visible. Guests included: somebody walking in
   * through a link is somebody walking in.
   */
  others: string[];
  /** The last moment there was evidence somebody is at this machine. */
  heardAt: number;
}

/** Standing nowhere, which is a clock that cannot run rather than one at zero. */
export const NOT_STANDING: Attention = { channelId: null, others: [], heardAt: 0 };

export interface Look {
  /** The channel this device is standing in, from `liveChannelHere`. */
  channelId: string | null;
  /** This account, whose own contribution is discarded here and nowhere else. */
  me: string;
  /** Everybody in the room, members and guests — `roomOccupants`. */
  occupants: string[];
  /** Whom the room says is audible right now — `SessionAudio.speaking`. */
  audible: string[];
  /**
   * Whether somebody *leaving* refreshes the clock, which only a phone wants.
   *
   * **A switch rather than a rule, because the two platforms genuinely differ
   * here.** On a phone the clock is scoped to a device standing alone, and the
   * moment that becomes true is a departure — so without this the newly-solo
   * person inherits whatever was left of a window that started while the others
   * were still talking, and can be stepped out seconds after being left. A
   * browser has the opposite problem: an abandoned tab in a room people come
   * and go from would be handed a fresh window by every departure, and never
   * expire at all. That tab is the entire reason the web clock exists.
   *
   * It lives on `Look` rather than in the hook because it is a fact about the
   * `others` diff, which is computed here — unlike the foreground rule of
   * 2026-09-06, which the native hook could keep to itself.
   */
  departureCounts?: boolean;
}

/**
 * A look at the room, folded into the clock.
 *
 * **`me` is removed here and at no call site**, so "your own voice never
 * counts" is one rule in one place with one test against it rather than a
 * filter every caller has to remember.
 *
 * **Audible is read as a state, not as an event**, which is what sidesteps the
 * trap `speaking.ts` documents: `ActiveSpeakersChanged` fires when the set
 * *changes*, so somebody talking uninterrupted for a minute produces one event
 * and nothing after it. A clock built from event timestamps would expire
 * mid-sentence. The set the room last reported goes on being true until it
 * reports another, so looking at it repeatedly is the honest reading — and the
 * caller therefore has to look on a timer rather than only when something
 * changes.
 *
 * **What the clock measures is how long the situation has been unchanged**, and
 * a change in who is in the room is a change in the situation. An arrival has
 * always counted. A departure counts too where the caller asks for it — see
 * `Look.departureCounts`, and the paragraph below for what this replaced.
 *
 * It used to read: *an arrival is evidence and a departure is not; somebody
 * leaving says nothing whatever about whether you are still here.* That is true
 * as literal evidence and it was still the wrong rule for a phone, because the
 * clock is not really an evidence ledger — it is a measure of staleness, and a
 * departure resets what is being measured. Somebody left alone by it is in a
 * different room from the one whose window was running.
 */
export function attend(prior: Attention, look: Look, now: number): Attention {
  if (look.channelId === null) return NOT_STANDING;

  const others = look.occupants.filter((id) => id !== look.me);

  // Stepping in starts the clock. Somebody who steps in alone and is never
  // joined times out, which is the whole of the cold-start decision.
  if (look.channelId !== prior.channelId) {
    return { channelId: look.channelId, others, heardAt: now };
  }

  const arrived = others.some((id) => !prior.others.includes(id));
  const departed =
    look.departureCounts === true &&
    prior.others.some((id) => !others.includes(id));
  const heard = look.audible.some((id) => id !== look.me);

  return {
    channelId: look.channelId,
    others,
    heardAt: arrived || departed || heard ? now : prior.heardAt,
  };
}

/**
 * The hand on the page — a click, a key, a touch, a scroll, the tab being
 * brought forward.
 *
 * It takes no evidence because there is none to weigh: somebody did something
 * deliberate to this document, and nothing about which gesture it was changes
 * the answer. Standing nowhere it is inert, so a stray click on Home cannot
 * arm a clock that is not running.
 */
export function touched(prior: Attention, now: number): Attention {
  if (prior.channelId === null) return prior;
  return { ...prior, heardAt: now };
}

/** Fifteen minutes since the last of any of it. */
export function unattended(prior: Attention, now: number): boolean {
  if (prior.channelId === null) return false;
  return now - prior.heardAt >= ATTENTION_WINDOW_MS;
}
