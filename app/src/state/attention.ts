import { ATTENTION_REPORT_MS } from '../../../core/constants';

/**
 * Whether anybody is at this machine — and, since 2026-09-09, nothing more
 * than that.
 *
 * **This file used to hold the whole rule and now holds none of it.** It was a
 * private clock per client: it watched who was audible, who had arrived, and
 * whether a hand had touched the page, decided for itself when fifteen minutes
 * had passed, and told the server the answer with one `ATTENTION_EXPIRED`. Two
 * copies of that rule existed, one per platform, and they disagreed about
 * enough that the difference had to be written down twice.
 *
 * The clock is now the server's. What a client owes it is evidence, and
 * evidence is all this file is about. See `ChannelRegistry.expireInattentive`
 * for what is done with it, and `ClientMessage.attentive` for why it is a
 * message of its own rather than something read off the traffic that was
 * already arriving.
 *
 * **What counts as evidence is still platform-specific, and legitimately so.**
 * A browser has clicks, keystrokes and scrolls, and an abandoned tab is
 * exactly the ghost the window hunts, so a hand is what a tab must show. A
 * phone has none of those to offer for somebody reading one screen, so what
 * stands in for a hand there is the app being frontmost — a state rather than
 * an act, decided on 2026-09-06 and kept: expiring somebody who is looking at
 * the screen and has simply not touched it is what the narrower reading does,
 * and on a phone that is what reading looks like.
 *
 * **What is no longer evidence is the audio.** Somebody else being audible
 * used to refresh this clock, on the reasoning that a room with a voice in it
 * is a room somebody is attending. It is not: the person being talked at may
 * have walked away, and the phone in their pocket hears the voice perfectly
 * well. Talking over the media plane is now the one thing that never counts,
 * in either direction — a person is attending because they are *there*, and
 * what protects a silent listener from the window is `subscribeable` in
 * `core/`, which asks whether there was anything in the room to listen to.
 */

/**
 * Whether a report is due, given when the last one was sent.
 *
 * The gate exists because the evidence is continuous and the report is not: a
 * scroll produces one of these per frame, and the foreground is a state that
 * is true for as long as somebody is looking. One message per
 * `ATTENTION_REPORT_MS` is enough against a fifteen-minute window, and it is
 * two orders of magnitude below the heartbeat already on the wire.
 *
 * Zero means nothing has been sent on this connection, which is due — the
 * first evidence after a reconnection is the most valuable, being the one that
 * says the app came back.
 */
export function shouldReport(lastReportedAt: number, now: number): boolean {
  return now - lastReportedAt >= ATTENTION_REPORT_MS;
}
