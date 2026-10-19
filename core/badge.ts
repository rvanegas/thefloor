/**
 * The number on the app's icon: what is waiting for you, and who is about.
 *
 * Three things, each something Home shows:
 *
 * - **contact requests you can answer** — the incoming ones only. An outgoing
 *   request is one only the other person can settle, and a number that
 *   tapping through cannot bring down is the one thing a badge must not be.
 * - **invitations**, memberships and seats alike — every one, live or not,
 *   which is the *waiting bar*'s count rather than the *Invitations* section's.
 * - **contacts who are about** — *present* or *nearby* in at least one channel
 *   you can step into, passed as `about`. Each is counted once however many
 *   rooms they are in, so the number is people rather than places, and
 *   somebody who is not your contact is not counted at all.
 *
 * **A room you are standing in is not left out**, as it was while this counted
 * live rooms: a contact beside you is still a contact who is about.
 *
 * Typed on the fields it reads rather than on `HomeView`, so the server can
 * ask it without composing the rest of a Home snapshot.
 *
 * A state rather than a tally of notifications sent, so it falls on its own as
 * a request is answered or a contact leaves, and there is nothing to mark seen.
 */
export function badgeCount(
  home: {
    contacts: ReadonlyArray<{ account: { id: string }; status: string }>;
    invites: readonly unknown[];
  },
  about: ReadonlySet<string>
): number {
  const requests = home.contacts.filter(
    (entry) => entry.status === 'incoming'
  ).length;
  const company = home.contacts.filter(
    (entry) => entry.status === 'accepted' && about.has(entry.account.id)
  ).length;
  return requests + home.invites.length + company;
}
