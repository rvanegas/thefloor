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

/**
 * The invitation somebody arrived on, waiting for them to have a session.
 *
 * The third walk, and the only one this end does not write: it is left by the
 * invite page in `server/src/invite.ts`, which repeats this key with a comment
 * pointing back here, exactly as the guest page repeats the two above.
 *
 * **Kept until spent rather than one-shot, since 2026-10-12** — see
 * `peekInvite`, which says why that became safe and what is still taken on
 * read.
 *
 * It waits for a session rather than being acted on at boot, which is the one
 * thing that makes it different from the others: the walk it completes has a
 * sign-in in the middle of it, and the app has no token until that is done.
 */
const INVITE_KEY = 'thefloor.invite';

/**
 * Whose link was followed.
 *
 * **The pin is optional since 2026-09-25**, links having stopped carrying one:
 * `/i/<username>` is a standing door rather than a seat, so the username is
 * the whole of it. What still arrives with a pin is a link minted before that
 * day, sitting in the thread it was pasted into, or a page older than this
 * build — both are passed on unchanged and the server honours them. See
 * planning/SHIMS.md.
 */
export interface Invite {
  username: string;
  pin?: string;
}

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
   * claiming to be.
   *
   * **This is the one arrival that still enters a room**, and it outlived the
   * setting that used to make it unusual. `tapToLook` was consulted nowhere
   * here — that setting was about a list of rooms, where a tap is as likely to
   * be curiosity as intent — and since 2026-09-21 no tap arrives anywhere, so
   * the distinction this paragraph drew is now the difference between this
   * caller and the whole of the rest of the app.
   */
  enter?: boolean;
}

/**
 * Where the guest page keeps the seat it is sitting in.
 *
 * The fourth key, and the second this end writes for the other to read — so
 * it is repeated in `server/web/guest.ts` with a comment pointing back, like
 * the rest. It is written here for one walk: an account taking up a seat it
 * was *invited* into, which begins in the app and ends on the guest page.
 *
 * A seat got by knocking is written by that page itself, at the moment the
 * door opens. This one cannot be: the invitation is answered against the
 * account's own session, which the guest page does not have, so the app makes
 * the call and leaves the credential where that page already looks.
 */
const SEAT_KEY = 'thefloor.seat';

/**
 * The shape the guest page stores, which is that page's `Seat` and not this
 * one's business beyond writing it.
 *
 * `channelLink` is empty for an invited seat, and that is not a gap: a seat
 * reached from Home is found by its channel, which is what
 * `leaveSeatChannel` leaves. The link half is how a seat is found from the
 * address somebody was *sent*, and an invitation is not sent as an address.
 */
export interface SeatCredential {
  channelId: string;
  guestId: string;
  secret: string;
}

/**
 * Leaves a seat for the guest page to pick up, with the channel beside it.
 *
 * Both keys, because the page needs both: the channel to know which seat page
 * it is, and the credential to open a socket with. Writing one without the
 * other is the state that draws *this browser is not holding a seat*.
 */
export function leaveSeat(seat: SeatCredential): void {
  try {
    globalThis.sessionStorage?.setItem(
      SEAT_KEY,
      JSON.stringify({
        channelLink: '',
        channelId: seat.channelId,
        guestId: seat.guestId,
        secret: seat.secret,
      })
    );
  } catch {
    // Storage blocked, which the seat page reports as having lost the seat.
    // Nothing is recoverable here and nothing is lost on the server: the seat
    // has been taken up and stays taken up.
  }
  leaveSeatChannel(seat.channelId);
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
 * The key the community page leaves a join code under — `JOIN_KEY` in
 * `server/src/community-page.ts`, repeated rather than imported for the reason
 * `INVITE_KEY` is.
 */
const JOIN_KEY = 'thefloor.join';

/** A *join link*'s code, as it crosses from the community page to this tab. */
export interface Join {
  code: string;
}

/**
 * The join code this tab was handed by the community page, **read rather than
 * taken, since 2026-10-11** — and `peekInvite` followed it a day later.
 *
 * It stays in the tab until `forgetJoin` says it was spent, because the
 * sign-in between arriving and spending can be long: a trip to the mail app
 * for a code, which is exactly when iOS reloads a backgrounded tab. Taken on
 * read, a reload there lost the join with nothing to say so. Nothing can be
 * spent twice by leaving it: a join is not single use — a second spend of the
 * same code opens the channel again rather than failing. Null everywhere but
 * a browser.
 */
export function peekJoin(): Join | null {
  let raw: string | null = null;
  try {
    raw = globalThis.sessionStorage?.getItem(JOIN_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Join>;
    if (typeof parsed?.code !== 'string' || !parsed.code) return null;
    return { code: parsed.code };
  } catch {
    return null;
  }
}

/** Drops the join from the tab, once it has been spent. */
export function forgetJoin(): void {
  try {
    globalThis.sessionStorage?.removeItem(JOIN_KEY);
  } catch {
    // Storage blocked, so there was nothing to forget.
  }
}

/**
 * The invitation this visit arrived on, **read rather than taken since
 * 2026-10-12**, on `peekJoin`'s reasoning: it stays in the tab until
 * `forgetInvite` says it was spent, so the sign-in in between — and a reload
 * of a tab left for the mail app — cannot lose it.
 *
 * **Leaving it is safe even with a pin in it**, which every invitation has
 * again since 2026-10-15. A pin is single use, but the server answers the
 * person who spent it with the channel it made rather than *already used*
 * (`redeemInvitePin`), so a reload that spends it twice tells nobody their
 * own acceptance failed. Taking it on read, which is what this did with a pin
 * until that day, lost it to the sign-in's trip to the mail app.
 *
 * Null on native, where `sessionStorage` does not exist; a phone's road is
 * the link itself, read by `useInviteLink.ts`, which calls this on mount so
 * that one holder answers for both.
 */
export function peekInvite(): Invite | null {
  let raw: string | null = null;
  try {
    raw = globalThis.sessionStorage?.getItem(INVITE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Invite>;
    // Crossed a document boundary, so a version skew is ordinary.
    if (typeof parsed?.username !== 'string' || !parsed.username) {
      forgetInvite();
      return null;
    }
    const pin = typeof parsed?.pin === 'string' && parsed.pin ? parsed.pin : undefined;
    return { username: parsed.username, ...(pin ? { pin } : {}) };
  } catch {
    forgetInvite();
    return null;
  }
}

/**
 * Where the *member link* page leaves its invitation for this tab —
 * `MEMBER_INVITE_KEY` in `server/src/member-invite.ts`. Since 2026-10-16.
 */
const MEMBER_INVITE_KEY = 'thefloor.memberInvite';

/** A member link's two halves, as they cross from its page to this tab. */
export interface MemberInvite {
  username: string;
  pin: string;
}

/**
 * The member link this tab was handed, read rather than taken, on
 * `peekInvite`'s reasoning: it stays until `forgetMemberInvite` says it was
 * spent, so the sign-in in between cannot lose it, and a second spend by the
 * same person is answered with the channel rather than *already used*.
 */
export function peekMemberInvite(): MemberInvite | null {
  let raw: string | null = null;
  try {
    raw = globalThis.sessionStorage?.getItem(MEMBER_INVITE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MemberInvite>;
    if (typeof parsed?.username !== 'string' || !parsed.username || typeof parsed.pin !== 'string' || !parsed.pin) {
      forgetMemberInvite();
      return null;
    }
    return { username: parsed.username, pin: parsed.pin };
  } catch {
    forgetMemberInvite();
    return null;
  }
}

/** Drops the member link from the tab, once it has been spent. */
export function forgetMemberInvite(): void {
  try {
    globalThis.sessionStorage?.removeItem(MEMBER_INVITE_KEY);
  } catch {
    // Storage blocked, so there was nothing to forget.
  }
}

/** Drops the invitation from the tab, once it has been spent. */
export function forgetInvite(): void {
  try {
    globalThis.sessionStorage?.removeItem(INVITE_KEY);
  } catch {
    // Storage blocked, so there was nothing to forget.
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
