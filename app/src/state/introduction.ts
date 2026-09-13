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

import type { Install } from './install';

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

/**
 * The rungs, in the order they are climbed.
 *
 * **Two, since 2026-09-13, and it was four.** *Say who you are* and *choose a
 * username* went when both became derived at signup — see
 * `core/derivedNames.ts`: an account is named and has a handle before anybody
 * types one, so both rows were born ticked for every account that can still
 * see this list, and a ladder whose first half congratulates you on things you
 * did not do is the theatre the invited card exists to avoid.
 *
 * **`install` is the third and is not always there**, added 2026-09-13. It is
 * the one rung that is about the client rather than about the account: a
 * browser can put this page on a home screen, and on a phone there is nothing
 * to install because the thing being run *is* the installation. `install.ts`
 * decides whether there is an offer at all and what to say, and there is no
 * rung when there is not.
 */
export type StepId = 'somebody' | 'stepIn' | 'install';

export interface Step {
  id: StepId;
  /** The imperative, in the vocabulary GLOSSARY.md owns. */
  label: string;
  /**
   * What to actually do, naming the place it is done.
   *
   * Added 2026-09-13 with the cut to two rungs. It is the half the labels
   * never carried: *get somebody here* is the goal, and somebody who has
   * never seen this app does not know that an invite link is a thing, still
   * less which of the two lists keeps one. The button beside it goes to that
   * list; this says what is waiting there.
   */
  instruction: string;
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
 * - `'invited'` — a single card, because for this cohort both items are born
 *   ticked and a list of things somebody else did for you is theatre. It says
 *   the one thing that is actually left.
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
      /**
       * The install rung, under the card, when a browser has one to offer.
       *
       * **The one thing that may join this card**, and it joins it rather than
       * turning it back into a list because it is not born ticked: the whole
       * argument against a list here is that it would congratulate this cohort
       * on two things somebody else did for them, and this is neither of them.
       * Null on a phone and in any browser that cannot install — which is most
       * of the time, and is why the card's shape is unchanged by default.
       */
      install: Step | null;
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
  /**
   * What this client can be installed as, if anything — `state/install.ts`.
   * `NOT_OFFERED` on every phone, and in a browser that already has it.
   */
  install: Install;
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
  /** In a channel with somebody else, now — see `AppProvider`. */
  conversing: boolean;
}): Introduction {
  const { loaded, home, arrival, doneAt, conversing, install } = state;

  if (!loaded || !home || !arrival) return { show: 'none' };
  // Retired for good, and retired the instant it happens rather than at the
  // next launch: the hook writes `doneAt` off the same signal, but a card
  // still on screen during the conversation it was asking for is the one
  // moment it would be actively silly.
  if (doneAt !== null || conversing) return { show: 'none' };

  const installing = installStep(install);

  if (arrival === 'invited') {
    const invite = home.invites[0];
    return {
      show: 'invited',
      from: invite ? invite.from.displayName : null,
      channelId: invite ? invite.channelId : null,
      install: installing,
    };
  }

  return {
    show: 'alone',
    steps: [
      {
        id: 'somebody',
        label: 'Get somebody here',
        instruction:
          'On Contacts, send an invite link — or add somebody by the address they sign in with.',
        note: 'A link works while you are asleep, and nobody can reach you until one of you does this.',
        // Counts a request that has been sent, not one that has been answered:
        // the app's own words for an outgoing request are "an address rather
        // than a person", and waiting on somebody else's tap would leave this
        // unticked for a day after the only action available had been taken.
        done: home.contacts.length > 0,
      },
      // Between the two, which is where it belongs on both readings: it is
      // not the first thing to do — nobody installs an app they have not
      // decided to keep — and it is not the last, because stepping in is what
      // the ladder retires on and nothing may sit below it.
      ...(installing ? [installing] : []),
      {
        id: 'stepIn',
        label: 'Step in',
        instruction:
          'On Channels, start one and step in. Anybody you invite arrives there, and a guest link works while you wait in it.',
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

/**
 * The install rung, or nothing at all.
 *
 * **Never ticked, and it disappears instead** — which is `stepIn`'s trick for
 * a different reason. There is no state here worth remembering: a browser that
 * is running the installed app says so, so the rung's absence *is* the tick,
 * and nothing has to be written down or cleared when somebody installs on one
 * machine and opens a tab on another. It is also what keeps this honest for
 * the cohort that will never install: the row is simply not there.
 *
 * The wording of `instruction` is the browser's own — see `install.ts`, which
 * is where the *how* differs and the only place it does.
 */
function installStep(install: Install): Step | null {
  if (!install.offer) return null;
  return {
    id: 'install',
    label: 'Put The Floor on your home screen',
    instruction: install.how,
    // **It does not promise notifications, and must not.** This app has no
    // service worker and no web push, so an installed browser app is exactly
    // as unreachable as the tab it came from. The notice that may talk about
    // being reached is `ui/installNotice.ts`, and it is about the App Store
    // app — the two sit in the same tier and saying the same thing in both
    // would make one of them a lie.
    note: 'It gets an icon of its own and opens without a browser around it, which is how you find your way back here.',
    done: false,
  };
}
