/**
 * What a new account is shown above the two lists, and when to stop showing
 * it — which since 2026-09-13 is when the last rung is done rather than when
 * the first conversation happens.
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
import { allTried, type Tried } from './tried';

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
 *
 * **Four more since 2026-09-13, and they are a different kind of rung.**
 * `floor`, `nearby`, `guest` and `player` are things done *inside* a channel,
 * so every one of them is reachable only after `stepIn` — which is exactly
 * when this whole card used to disappear. They are the reason retirement
 * moved off the first conversation and onto the last rung; see `introduction`
 * below, and `tried.ts` for why these four are the only ones not read off a
 * snapshot.
 *
 * **They say *try this*, where the three above say *this is true of you*.**
 * That is a real departure — `planning/ONBOARDING.md` § *What is deliberately
 * left out* rules out "a checklist that lists everything the app does" on the
 * grounds that it stops being an activation ladder. These four are bounded to
 * the four controls somebody would otherwise never find, rather than to the
 * feature list, and they retire for good the moment they are behind somebody.
 */
export type StepId =
  | 'somebody'
  | 'stepIn'
  | 'install'
  | 'floor'
  | 'nearby'
  | 'guest'
  | 'player';

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
 * - `'none'` — the ordinary case, and every account that has finished.
 * - `'invited'` — a single card, because for this cohort the rungs above
 *   `stepIn` are born ticked and a list of things somebody else did for you is
 *   theatre. It says the one thing that is actually left. **It is what this
 *   cohort sees until it has conversed, and not a moment longer**: after that
 *   the four *try* rungs are neither born ticked nor done for them by
 *   anybody, so there is a real ladder to draw and they get one.
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
  /**
   * When this account first had a conversation, or null if it never has.
   *
   * **It no longer retires anything by itself**, which is the change of
   * 2026-09-13 and the reason it is no longer called `doneAt`. It ticks the
   * `stepIn` rung and it decides which of the two things an `invited` arrival
   * is shown; retirement is now the whole ladder being finished. The stored
   * key is still `thefloor.intro.doneAt` and is written at exactly the moment
   * it always was, so no account has to be migrated — only what is concluded
   * from it changed. See `useIntroduction`.
   */
  conversedAt: number | null;
  /** The four *try* rungs, per install — `tried.ts`. */
  tried: Tried;
  /** In a channel with somebody else, now — see `AppProvider`. */
  conversing: boolean;
}): Introduction {
  const { loaded, home, arrival, conversedAt, tried, conversing, install } =
    state;

  if (!loaded || !home || !arrival) return { show: 'none' };
  // **Nothing at all while a conversation is happening**, which is unchanged
  // and is not the retirement: a card still on screen during the conversation
  // it was asking for is the one moment it would be actively silly. It comes
  // back on Home afterwards with whatever is left, which is the whole point of
  // the four rungs below — they are done in a channel, and read here.
  if (conversing) return { show: 'none' };
  // **Retired on the last rung, not the first conversation**, reversing
  // ONBOARDING.md § *Retirement* — see
  // `decisions/2026-09-13-the-checklist-outlives-the-first-conversation.md`.
  // The old rule was right about a ladder whose every rung came before
  // stepping in; with four that come after, retiring on the conversation would
  // mean they were never drawn at all.
  if (conversedAt !== null && allTried(tried)) return { show: 'none' };

  const installing = installStep(install);

  // **The card is for the cohort that has not yet conversed, and only that.**
  // It exists because the rungs before `stepIn` are born ticked here and a
  // list of somebody else's doing is theatre; the four below are done by
  // nobody but the reader, so once the one thing this card asks for has
  // happened there is an honest ladder left and the argument for the card is
  // spent.
  if (arrival === 'invited' && conversedAt === null) {
    const invite = home.invites[0];
    return {
      show: 'invited',
      from: invite ? invite.from.displayName : null,
      channelId: invite ? invite.channelId : null,
      install: installing,
    };
  }

  // **An invited account that has conversed is shown the four and no more.**
  // Drawing `somebody` and `stepIn` ticked above them would be the theatre the
  // card was built to avoid, a fortnight later and with two extra rows of it.
  if (arrival === 'invited') {
    return { show: 'alone', steps: tryingSteps(tried) };
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
      // decided to keep — and it does not belong under `stepIn`, since
      // everything below that rung is done inside a channel and this is the
      // one rung that is about the client rather than the account or the room.
      // (It used to be *not last* because stepping in was what the ladder
      // retired on; that is no longer true of the ladder, and the placement
      // survives it on the reason above.)
      ...(installing ? [installing] : []),
      {
        id: 'stepIn',
        label: 'Step in',
        instruction:
          'On Channels, start one and step in. Anybody you invite arrives there, and a guest link works while you wait in it.',
        note: 'That is the moment people can hear you, and it is what all of this is for.',
        // **It ticks now, where it never could before.** This was the rung the
        // whole ladder retired on, so it was drawn permanently unticked and
        // the card vanished the moment it came true. With four rungs below it
        // the card outlives the conversation, and a rung that stayed hollow
        // afterwards would be claiming somebody had not done the thing they
        // had just done.
        done: conversedAt !== null,
      },
      ...tryingSteps(tried),
    ],
  };
}

/**
 * The four things to try inside a channel, which are the same four for both
 * arrivals — see `tried.ts` for why they are the only rungs this app writes
 * down about itself.
 *
 * **Every instruction names the tab or the slot**, rather than the feature.
 * These sit on Home and are done two screens away, and the whole failure mode
 * they exist to fix is somebody never finding a control; a row that named
 * *the player* without saying which of six tabs it is on would reproduce it.
 */
function tryingSteps(tried: Tried): Step[] {
  return [
    {
      id: 'floor',
      label: 'Claim the floor',
      instruction:
        'In a channel, tap Claim in the bar along the bottom. Everybody else is muted until you release it.',
      note: 'It is the thing the app is named after: one person speaking, and nobody able to talk over them.',
      done: tried.floor,
    },
    {
      id: 'nearby',
      label: 'Say you are nearby',
      instruction:
        'In a channel, tap Nearby. It notifies everybody who is not there that you are within reach for the next quarter of an hour.',
      note: 'It is how a conversation starts without anybody having to arrange one: you are reachable without being in it.',
      done: tried.nearby,
    },
    {
      id: 'guest',
      label: 'Bring in a guest',
      instruction:
        "On a channel's Invite tab, share a guest link. Whoever opens it is in the channel in a browser, with no account and nothing to install.",
      // **The lifetime is the note and not a footnote.** The glossary is
      // explicit that a guest link stops working once the channel is empty of
      // members, and *send a link, they will join later* is what everybody
      // assumes. ONBOARDING.md § *Three things the campaign exposes* names
      // this as something the copy has to say; this is the copy saying it.
      note: 'Stay in the channel while they open it — a guest link stops working the moment no member is there.',
      done: tried.guest,
    },
    {
      id: 'player',
      label: 'Play something together',
      instruction:
        "On a channel's Player tab, add audio. Everybody in the room hears it at the same moment, and you can still talk over it.",
      note: 'It is the one thing here that is not somebody talking, and the room stays a room while it plays.',
      done: tried.player,
    },
  ];
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
