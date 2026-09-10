/**
 * What a new account is shown before it has had a conversation, and when to
 * stop showing it.
 *
 * **An activation ladder, not a tour.** There are no coach marks and nothing
 * points at a control: every item is a thing the app can already see is done
 * or not done, read off the Home snapshot, and the list is a view of that
 * state rather than a script somebody is walked through. See
 * planning/ONBOARDING.md for what was decided against, which is most of the
 * pattern as it is usually built.
 *
 * Pure, and separated from the hook for the reason `notificationAsk.ts` gives
 * about itself: this is where the policy lives, it has more cases than it
 * looks like, and the component around it is not reachable by any test here.
 */

/**
 * How this account got here, decided once and then remembered.
 *
 * **The two arrivals want different things and it is not close.** Being
 * invited is how most people arrive, and the invitation is the first thing
 * they have — so a list beginning *add a contact* would open by telling them
 * to do something they have already had done for them. An uninvited install
 * has nobody, and there is nothing whatsoever to do here alone, so its first
 * problem is not learning the app but getting a second person into a room.
 *
 * **Latched rather than recomputed, and that is load-bearing.** It is
 * `somebody` — see `AppProvider` — asked once, at the first snapshot this
 * install ever saw. Asked continuously it would answer *invited* the moment an
 * alone account finally got a contact, which is precisely when that account is
 * halfway up the ladder, and the ladder would vanish under them one rung from
 * the top.
 */
export type Arrival = 'invited' | 'alone';

/** The rungs, in the order they are climbed. */
export type StepId = 'name' | 'username' | 'somebody' | 'stepIn';

export interface Step {
  id: StepId;
  /** The imperative, in the vocabulary GLOSSARY.md owns. */
  label: string;
  /** One line under it: why this one, not what to tap. */
  note: string;
  done: boolean;
}

/**
 * What Home should be drawing above the lists, if anything.
 *
 * One value rather than a set of booleans, on the reasoning `Ask` gives: these
 * are alternatives, and separate flags would let two of them be true at once.
 *
 * - `'none'` — the ordinary case, and every account that has ever stepped in.
 * - `'invited'` — a single card, because for this cohort three of the four
 *   items are born ticked and a list of things somebody else did for you is
 *   theatre. It says the one thing that is actually left.
 * - `'alone'` — the ladder, for the cohort it was designed for.
 */
export type Introduction =
  | { show: 'none' }
  | {
      show: 'invited';
      /** Who invited them, when there is still an invitation saying so. */
      from: string | null;
      /** Where the card goes. Null only if the snapshot has neither. */
      channelId: string | null;
    }
  | { show: 'alone'; steps: Step[] };

/** The three ways of having somebody, which is `somebody` in `AppProvider`. */
export function arrivalOf(home: {
  contacts: unknown[];
  rejoinable: unknown[];
  invites: unknown[];
}): Arrival {
  return home.contacts.length > 0 ||
    home.rejoinable.length > 0 ||
    home.invites.length > 0
    ? 'invited'
    : 'alone';
}

/**
 * What to show, from everything that decides it.
 *
 * **Silence is the default in every uncertain case**, which is the same trade
 * `useNotificationAsk` makes about its own first frames: being wrong for a
 * moment in the direction of showing nothing costs a second, and being wrong
 * the other way puts a checklist in front of somebody who finished with it
 * months ago.
 */
export function introduction(state: {
  /** False until the keychain has been read; nothing may be shown before it. */
  loaded: boolean;
  /** The Home snapshot, null before the first one arrives. */
  home: {
    contacts: unknown[];
    rejoinable: unknown[];
    invites: Array<{ channelId: string; from: { displayName: string } }>;
  } | null;
  /** Latched at the first snapshot; null until that has happened. */
  arrival: Arrival | null;
  /** When this account first stepped in. Non-null retires all of this. */
  doneAt: number | null;
  /** Their own name, which `AuthView` offers at signup and does not require. */
  displayName: string;
  /**
   * Their username, or null when they have none.
   *
   * **`undefined` means nobody has asked yet, and it withholds the ladder.**
   * It is not on the Home snapshot and not on `PublicAccount` — `ProfileView`
   * says why, and that division is deliberate — so it costs a request, and a
   * row that appeared a beat late telling somebody to choose the username they
   * already have is worse than a row that never appeared.
   */
  username: string | null | undefined;
  /** In a channel with somebody else, now — see `AppProvider`. */
  conversing: boolean;
}): Introduction {
  const { loaded, home, arrival, doneAt, displayName, username, conversing } =
    state;

  if (!loaded || !home || !arrival) return { show: 'none' };
  // Retired for good, and retired the instant it happens rather than at the
  // next launch: the hook writes `doneAt` off the same signal, but a card
  // still on screen during the conversation it was asking for is the one
  // moment it would be actively silly.
  if (doneAt !== null || conversing) return { show: 'none' };

  if (arrival === 'invited') {
    const invite = home.invites[0];
    return {
      show: 'invited',
      from: invite ? invite.from.displayName : null,
      channelId: invite ? invite.channelId : null,
    };
  }

  // The ladder is withheld entire while the username is unknown rather than
  // drawn with a row missing, so it does not gain a rung a second after
  // appearing.
  if (username === undefined) return { show: 'none' };

  return {
    show: 'alone',
    steps: [
      {
        id: 'name',
        label: 'Say who you are',
        note: 'A request from a nameless address is one people decline.',
        done: displayName.trim() !== '',
      },
      {
        id: 'username',
        label: 'Choose a username',
        // Optional everywhere else in the app, and the glossary says most
        // people have none — but an invite link is `/i/<username>/<pin>` and
        // there is no link without the first half. For somebody with nobody
        // here, that link is the only way of reaching out that goes on working
        // while they are asleep.
        note: 'An invite link is built out of it, and that is the way in that works while you sleep.',
        done: username !== null,
      },
      {
        id: 'somebody',
        label: 'Get somebody here',
        // Counts a request that has been sent, not one that has been answered:
        // the app's own words for an outgoing request are "an address rather
        // than a person", and waiting on somebody else's tap would leave this
        // unticked for a day after the only action available had been taken.
        note: 'Send an invite link, or start a channel and share a guest link while you wait in it.',
        done: home.contacts.length > 0,
      },
      {
        id: 'stepIn',
        label: 'Step in',
        note: 'That is the moment people can hear you, and it is what all of this is for.',
        // Never true here — `conversing` returns `'none'` above, and this is
        // the rung the whole ladder retires on. It is drawn unticked, on
        // purpose: an unfinished list is the only part of this pattern that
        // does any work.
        done: false,
      },
    ],
  };
}
