/**
 * The number on the app's icon: everything on Home that is waiting for you.
 *
 * Three things, each already a row on Home, so the icon and the screen it
 * opens onto cannot disagree about what is there:
 *
 * - **contact requests you can answer** — the incoming ones only. An outgoing
 *   request is one only the other person can settle, and a number that
 *   tapping through cannot bring down is the one thing a badge must not be.
 * - **invitations**, memberships and seats alike — every one, live or not,
 *   which is the *waiting bar*'s count rather than the *Invitations* section's.
 * - **live rooms you can step into** — a channel you belong to, or hold a seat
 *   in, with somebody connected in it. `rejoinable` excludes invitations, so
 *   an invitation with somebody in it is counted once, as an invitation.
 *
 * **Not a room you are standing in yourself**, which is passed as `standingIn`.
 * The badge says what is waiting, and a room you are already in is not waiting
 * for you — while it is the only live one, it would put a 1 on the icon of a
 * phone in a pocket for exactly as long as its owner is talking.
 *
 * **Somebody nearby does not count**, though Home files such a room under
 * *Live*. Nobody is in it, so there is nothing to step into yet. The word is
 * the glossary's: *live* is somebody in it right now.
 *
 * Typed on the three fields it reads rather than on `HomeView`, so the server
 * can ask it without composing the rest of a Home snapshot.
 *
 * A state rather than a tally of notifications sent, so it falls on its own as
 * a request is answered or a room empties, and there is nothing to mark seen.
 */
export function badgeCount(
  home: {
    contacts: ReadonlyArray<{ status: string }>;
    invites: readonly unknown[];
    rejoinable: ReadonlyArray<{ channelId: string; presentCount: number }>;
  },
  standingIn: readonly string[]
): number {
  const requests = home.contacts.filter(
    (entry) => entry.status === 'incoming'
  ).length;
  const live = home.rejoinable.filter(
    (entry) => entry.presentCount > 0 && !standingIn.includes(entry.channelId)
  ).length;
  return requests + home.invites.length + live;
}
