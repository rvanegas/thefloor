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
 * below, and `core/tried.ts` for why these four are the only ones the server
 * had to be taught to record at all.
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

/**
 * Every rung there is, in the order they are drawn.
 *
 * Here rather than inferred from a built list, because the reader that needs
 * it has no list in hand: `useIntroduction` reads dismissals off the keychain
 * before the first snapshot arrives, and a string out of storage has to be
 * checked against something. `core/tried.ts` keeps `TRIED_IDS` for the same
 * reason at the other end.
 */
export const STEP_IDS: readonly StepId[] = [
  'somebody',
  'stepIn',
  'install',
  'floor',
  'nearby',
  'guest',
  'player',
];

/** Whether a string off the keychain names a rung rather than anything at all. */
export function isStepId(value: unknown): value is StepId {
  return (
    typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value)
  );
}

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
 * **Two, since 2026-09-13, and it was three.** There was a single card for
 * the invited cohort, on the argument that its first rungs were born ticked
 * and a list of things somebody else did for you is theatre. The premise went
 * when `contactsBase` landed: an invited account arrives holding a contact,
 * its starting line is that contact, and *Get somebody here* asks it for
 * somebody of its own. Nothing is born ticked for anybody now, so everybody
 * gets the same ladder and there is no cohort left to draw a card for.
 *
 * **What went with it is the one control that reached past a list**: the
 * card's *Step in* opened the waiting channel outright, which `actionFor` in
 * `ui/Introduction.tsx` rules out for every rung and spells out why. The
 * `stepIn` rung goes to Channels like the five below it, and the channel
 * waiting for them is the first row there.
 *
 * - `'none'` — the ordinary case, and every account that has finished.
 * - `'ladder'` — the rungs, for everybody. Called `'alone'` until the card
 *   went, which was the name of the cohort that got a list rather than of
 *   what a list is.
 */
export type Introduction =
  | { show: 'none' }
  | { show: 'ladder'; steps: Step[] };

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
  } | null;
  /**
   * When this account first had a conversation, or null if it never has.
   *
   * **It no longer retires anything by itself**, which is the change of
   * 2026-09-13 and the reason it is no longer called `doneAt`. It ticks the
   * `stepIn` rung, and nothing else since the invited card went; retirement
   * is the whole ladder being finished. The stored
   * key is still `thefloor.intro.doneAt` and is written at exactly the moment
   * it always was, so no account has to be migrated — only what is concluded
   * from it changed. See `useIntroduction`.
   */
  conversedAt: number | null;
  /** The four *try* rungs, off the Home snapshot — `core/tried.ts`. */
  tried: Tried;
  /**
   * How many contacts this account had when the ladder started — latched at
   * the first snapshot this install ever saw, and again on *Show the checklist
   * again*. Null until that has happened, and nothing is drawn while it is.
   *
   * **It is what turns a count into an act, and it is why there is one
   * ladder.** `somebody` used to read `contacts.length > 0`, which is a fact
   * about the account rather than something anybody did while the ladder was
   * in front of them: an invited account is born holding one, so its first
   * rung was ticked before it was drawn, and *Show the checklist again* handed
   * an established account the same free tick. That born-ticked rung was the
   * entire argument for showing the invited cohort a card instead of a list.
   * Measured against the starting line, nobody is born ticked and everybody
   * gets the list.
   *
   * **It is also the latch**, which `Arrival` used to be: it is written once,
   * where the arrival was written, and its presence is what says this install
   * has seen a snapshot before.
   */
  contactsBase: number | null;
  /**
   * The rungs this person has put away by hand, which are drawn no more.
   *
   * **The second exit, and the first one that is the reader's.** Until
   * 2026-09-13 the only way out of this card was finishing it, which is fine
   * for a ladder somebody is climbing and wrong for one rung of it they have
   * decided against — a browser that will never be installed to, a guest link
   * for people who have no guests. A row that cannot be answered and cannot be
   * put away is one that makes the whole card worth ignoring, and a card worth
   * ignoring teaches somebody to skip the rows that would have helped.
   *
   * **It hides, it does not tick.** A dismissed rung is not done and is never
   * drawn as done: `tried` is a fact about the account and this is a statement
   * about the list, so nothing here writes to the four stamps and nothing
   * here is claimed on anybody's behalf. Doing the thing afterwards still
   * marks it; the row simply is not there to fill in.
   */
  dismissed: readonly StepId[];
}): Introduction {
  const { loaded, home, conversedAt, tried, install, dismissed, contactsBase } =
    state;
  const hidden = (id: StepId) => dismissed.includes(id);

  if (!loaded || !home || contactsBase === null) return { show: 'none' };
  // **`conversing` no longer blanks this**, reversed 2026-09-14 — see
  // `decisions/2026-09-14-the-checklist-stays-while-you-are-in-the-room.md`.
  // It was kept on the argument that a checklist on screen *during* the
  // conversation it asked for is actively silly, which is true of a screen
  // this card is not on: `HomeView` is its only reader, and the channel screen
  // draws none of it. What the rule actually hid was Home reached from the
  // live bar — the reader still standing in the room, which is the one reader
  // the four rungs below are written for and the only one `live` in
  // `ui/Introduction.tsx` can point anywhere.
  //
  // **Retired on the last rung, not the first conversation**, reversing
  // ONBOARDING.md § *Retirement* — see
  // `decisions/2026-09-13-the-checklist-outlives-the-first-conversation.md`.
  // The old rule was right about a ladder whose every rung came before
  // stepping in; with four that come after, retiring on the conversation would
  // mean they were never drawn at all.
  if (conversedAt !== null && allTried(tried)) return { show: 'none' };

  const installing = hidden('install') ? null : installStep(install);

  return ladder(
    [
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
        //
        // **Against the starting line rather than against nought** — see
        // `contactsBase`. The rung is a thing to do, and an account that
        // already had somebody has not done it by continuing to have them.
        done: home.contacts.length > contactsBase,
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
        // **The label says *with somebody* because that is what ticks it.**
        // `done` below is `conversedAt`, stamped only while another member is
        // present — `AppProvider`'s `conversing`. Called *Step in* it named an
        // act somebody could complete alone and then find unticked, which is
        // the one thing a ladder read off real state must never do.
        label: 'Step in with somebody',
        // The guest link left this instruction when the label changed: a
        // guest is not a member and does not stamp `conversedAt`, so naming
        // one here offered a way of climbing this rung that does not work.
        // The `guest` rung below is where guest links belong anyway.
        instruction:
          'On Channels, start one and step in, and stay there until somebody else steps in too. Anybody you invite arrives in that channel.',
        note: 'Two of you in a channel at once is the moment people can hear you, and it is what all of this is for.',
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
    dismissed
  );
}

/**
 * The ladder, with what has been put away taken out of it — and nothing at all
 * when that is everything.
 *
 * **An empty card is not a quiet card, it is a bug**, which is why the last
 * dismissal retires the introduction rather than leaving a heading with white
 * space under it. It is the same conclusion `installStep` reaches about its
 * own absence: a row that has nothing to say is not drawn, and a card whose
 * rows are all gone is not either.
 */
function ladder(steps: Step[], dismissed: readonly StepId[]): Introduction {
  const drawn = steps.filter((step) => !dismissed.includes(step.id));
  if (drawn.length === 0) return { show: 'none' };
  return { show: 'ladder', steps: drawn };
}

/**
 * The four things to try inside a channel, which are the same four for both
 * arrivals — see `core/tried.ts` for why they are the only rungs the server
 * had to be taught to record.
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
