import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/http';
import type { HomeView } from '../../../core/protocol';
import { recordEvent } from '../audio/diagnostics';
import type { Install } from './install';
import { storage } from './storage';
import {
  legacyTried,
  NOTHING_TRIED,
  TRIED_IDS,
  TRIED_KEYS,
  type Tried,
  type TriedId,
} from './tried';
import {
  introduction,
  isStepId,
  type Introduction,
  type StepId,
} from './introduction';

/**
 * The two things this has to remember *about the account*, the rest of the
 * ladder being derived from the snapshot — which since 2026-09-13 includes the
 * four *try* rungs. The `thefloor.intro.tried.*` keys are read once and handed
 * to the server now; nothing writes them — `tried.ts`.
 *
 * **Cleared on sign-out, unlike every other key here**, and the difference is
 * what they are about. `installNotice.ts` and the four `thefloor.notifications`
 * keys survive sign-out deliberately: they record what this *browser* or this
 * *install* has been shown, and iOS grants its one dialog per install however
 * many people sign in on the phone. These record what an *account* has done —
 * what it started from, and whether it has ever had a conversation — and a
 * second account signing in on the same phone has done neither. Left standing
 * they would tell a brand-new account it had finished.
 */
/**
 * **Read once and deleted, and nothing writes it any more.** It held how an
 * account arrived — `invited` or `alone` — which decided whether it was shown
 * a card or a ladder, and which of the two it was stopped mattering when
 * `contactsBase` made the first rung tick on an act rather than on a standing
 * fact. What is left is its other job: its presence says this install has seen
 * a snapshot before, which is what stops an account already halfway up the
 * ladder having its starting line drawn from wherever it happens to be today.
 * See the load effect. Gate 198 — planning/SHIMS.md.
 */
const LEGACY_ARRIVAL_KEY = 'thefloor.intro.arrival';
/**
 * **The name is historical and the key string must not change.** It is written
 * at exactly the moment it always was — the first conversation — and every
 * account already carrying one means precisely that. What changed on
 * 2026-09-13 is what is *concluded* from it: it used to retire the whole
 * checklist and now it ticks one rung and nothing else. Renaming the key
 * would have discarded that
 * stamp on every install for no gain; the field it loads into is called
 * `conversedAt`, which is what it has always meant.
 */
const CONVERSED_AT_KEY = 'thefloor.intro.doneAt';
/**
 * Which rungs have been put away by hand, comma-separated, in the order they
 * were dismissed.
 *
 * **A list in one key rather than a key per rung**, which is the opposite of
 * what `thefloor.intro.tried.*` did and is right for a different reason. Those
 * four were four independent facts, each written at a moment of its own and
 * each read once by the hand-up; these are one preference about one card, are
 * always written together, and there are seven of them. `storageKeys.test.ts`
 * objects to a blob that hides keys from `INSTALL_KEYS` — this hides none: it
 * is one key holding one list, and the list's members are not keys.
 *
 * **Cleared on sign-out with the other two**, and for their reason: it says
 * what *this person* has decided against reading, and the next account signing
 * in on the same phone has decided nothing.
 */
const DISMISSED_KEY = 'thefloor.intro.dismissed';
/**
 * How many contacts this account had when the ladder started, so that *Get
 * somebody here* asks for somebody rather than for somebody already there.
 *
 * **The rung is about an act, and a count is not one.** `home.contacts` is a
 * standing fact, so reading the rung off `length > 0` ticked it for anybody
 * who had ever been in touch with anybody — which is every invited account
 * from its first frame, and every account that taps *Show the checklist
 * again*. Latched once, at the first snapshot this install ever saw, and the
 * rung is done when the count has gone *up* since.
 *
 * **It is the latch as well as the line.** Its absence is what says this
 * install has not seen a snapshot yet, which `thefloor.intro.arrival` used to
 * say; nothing is drawn until it holds a number. An install that was climbing
 * before it existed is given nought rather than whatever it holds today — see
 * `LEGACY_ARRIVAL_KEY` and the load effect, since writing anything else would
 * un-tick a rung somebody earned.
 *
 * Cleared on sign-out with the three above, and for their reason — it is a
 * fact about one account's starting line.
 */
const CONTACTS_BASE_KEY = 'thefloor.intro.contactsBase';

/** The stored form, ignoring anything that is not a rung this build knows. */
function parseDismissed(stored: string | null): StepId[] {
  if (!stored) return [];
  return stored.split(',').filter(isStepId);
}

/**
 * Nothing here is in `REINSTALL_FORGETS`' company, and that is deliberate.
 * `useNotificationAsk` forgets three of its four keys on a reinstall because
 * they describe an install whose permission state died with it. These describe
 * the person: deleting the app does not undo having been invited, and does not
 * undo having had a conversation. It is the same reasoning that keeps
 * `conversed`, made about the same fact.
 */

/**
 * What this hook hands back: what to draw, and the one way of undoing it.
 *
 * A pair rather than the bare `Introduction` it used to be, because the
 * checklist has no other exit than being finished — see `forget`.
 */
export interface IntroductionState {
  introduction: Introduction;
  /**
   * Records one of the four *try* rungs as done, called from wherever that
   * thing is actually done rather than from the checklist — which is the whole
   * difference between these four and every other rung. It goes to the server
   * and comes back on the next Home snapshot; see `core/tried.ts`.
   */
  markTried: (id: TriedId) => void;
  /**
   * Puts one rung away for good, from the card itself.
   *
   * **The only control on this card that acts on the card**, every other one
   * being a way to the screen where the rung is actually climbed. It is the
   * reader's exit from a row they have decided against, and it is per rung
   * rather than per card on purpose: *I will never install this in a browser*
   * and *I have no guests to bring* are two different sentences, and a single
   * *hide all of this* would make somebody spend the second to say the first.
   *
   * Written to the keychain rather than to the account, alongside
   * `contactsBase` and `conversedAt` and unlike the four *try* stamps. Those four are facts
   * about a person that a second device has no way to derive — which is what
   * moved them to the server — and this is a preference about a card, which a
   * second device is entitled to ask again. Undone only by `forget` below.
   */
  dismiss: (id: StepId) => void;
  /**
   * Puts this account back where it started, for a debug account only.
   *
   * **There is nothing else that does this.** The account keys are cleared on
   * sign-out, but signing in again re-latches the starting line from the same
   * snapshot and `conversedAt` is written off `conversing`, which by then is a
   * fact about an account that has conversed — so signing out and back in
   * returns somebody to exactly the silence they were in. The four *try* rungs
   * are on the account since 2026-09-13 and would survive that route entirely,
   * which is why this one reaches the server. *Forget this phone* clears the
   * six keys as part of `INSTALL_KEYS`, but it takes the session with it, is
   * aimed at the whole install, and no longer touches the four rungs at all;
   * this is the checklist alone, on an account that stays signed in.
   *
   * The state is reset alongside the keys rather than left to a relaunch,
   * which is what makes the ladder reappear on the tap.
   *
   * **It moves the starting line to here rather than clearing it**, which is
   * the other half of what the tap means. An account that reaches for this
   * has contacts, so a line left where it was would hand back a ladder whose
   * first rung was ticked before it was drawn — the free tick the whole
   * feature now refuses. Moved to the count at the tap, *Get somebody here*
   * asks for somebody more, which is the only honest reading of it on an
   * account that already has somebody.
   *
   * This replaced latching `alone`, which was what the same tap needed while
   * an arrival decided between a card and a ladder: clearing the arrival
   * re-derived it, `arrivalOf` answered *invited* for anybody with a contact,
   * and an established account got the one-line card whose five stored rungs
   * it had just cleared. There is one ladder now and no arrival to latch.
   *
   * The dismissals go with them. A rung put away by hand is the other way this
   * card ends, and a reset that left them standing would return somebody to a
   * ladder with holes in it — see `dismiss`.
   *
   * **Leave the channel first.** Nothing is drawn at all while `conversing`,
   * and `conversedAt` is written off it — so doing this in a channel with
   * somebody shows nothing and then re-ticks that rung within a frame. It no
   * longer re-retires the whole card, the four below `stepIn` having been
   * cleared too, but the first thing somebody would see is still not the thing
   * they tapped for. The caller says so; see `HomeSettingsView`.
   */
  forget: () => Promise<void>;
}

/**
 * When to put the introduction in front of somebody, and the state that
 * decides it.
 *
 * Held in `AppProvider` for the reason `useNotificationAsk` is: `conversing`
 * is computed there from every channel snapshot this client is watching, and
 * a component recomputing it would need the map of channel views, which is
 * deliberately not on the context.
 */
export function useIntroduction(state: {
  /**
   * Whether the keychain read that restores a sign-in has resolved —
   * `AppState.ready`, set whatever that read found.
   *
   * **It is here to tell two null tokens apart, and that distinction is a
   * bug fix.** `AppProvider` starts at `token: null` and restores the real one
   * in an effect, so every cold launch passes through a frame that looks
   * exactly like a sign-out — and the sign-out path below is the one place
   * that *deletes* these keys. The retirement was therefore wiped at every
   * launch, the arrival re-latched from the snapshot then in hand, and an
   * established account — which has contacts — latched `invited` and was shown
   * a card about an invitation nobody had sent, whose fallback sentence read
   * *You have not stepped in yet* on accounts that plainly had. The card has
   * since gone and the arrival with it; what a wiped key would cost now is the
   * starting line, re-latched from today's contact count, which is the same
   * bug wearing the other hat — a finished account handed a fresh ladder. See
   * `__tests__/introColdLaunch.test.tsx`.
   */
  ready: boolean;
  /** Null when signed out, and then this forgets everything it knew. */
  token: string | null;
  home: HomeView | null;
  /**
   * In a channel with somebody else. It draws nothing while it holds, and it
   * is what stamps `conversedAt` — it is no longer what retires the card.
   */
  conversing: boolean;
  /**
   * What this client can be installed as — `useInstall`, read in
   * `AppProvider` for the same reason `conversing` is computed there.
   *
   * **Nothing here remembers it**, unlike the two keys above. Whether this
   * browser is running an installed copy is a fact it answers by looking, and
   * one that is about the browser rather than about the account — so there is
   * nothing to write down, nothing to clear on sign-out, and nothing to get
   * wrong when the same person opens a tab on a second machine.
   */
  install: Install;
}): IntroductionState {
  const { ready, token, home, conversing, install } = state;

  const [loaded, setLoaded] = useState(false);
  const [conversedAt, setConversedAt] = useState<number | null>(null);
  /** The rungs put away by hand — `dismiss`. Read once, with the two above. */
  const [dismissed, setDismissed] = useState<readonly StepId[]>([]);
  /**
   * The contact count the ladder started from — `CONTACTS_BASE_KEY`. Null
   * until the keychain has been read *and* until the latch below has run.
   * Nothing at all is drawn while it is null — it is the latch the arrival
   * used to be, and it means what that null meant: nothing may be concluded
   * yet.
   */
  const [contactsBase, setContactsBase] = useState<number | null>(null);
  /**
   * The four *try* rungs this session has just done, over and above whatever
   * the snapshot in hand says.
   *
   * **The snapshot is the truth and this is the half-second before it
   * arrives.** Since 2026-09-13 the four belong to the account and come down
   * on Home — `core/tried.ts` — so there is nothing to remember here; but the
   * rung is ticked from a channel screen two screens away, and the write goes
   * to the server and comes back as a push. Without this, somebody who claimed
   * the floor and went straight to Home could find that rung still hollow.
   *
   * Emptied on sign-out along with the two keys below, for their reason
   * exactly: it is about the account, and the next one has done none of it.
   */
  const [marked, setMarked] = useState<readonly TriedId[]>([]);

  /**
   * What the account has behind it, which is the snapshot with this session's
   * own doings laid over the top. Never the other way round: the server is
   * allowed to be ahead of us — another device — and is never behind, these
   * being facts that are only ever set.
   */
  const tried = useMemo<Tried>(() => {
    const base = home?.tried ?? NOTHING_TRIED;
    if (marked.length === 0) return base;
    const merged = { ...base };
    for (const id of marked) merged[id] = true;
    return merged;
  }, [home?.tried, marked]);

  // Read once per signed-in session. Signing out clears both keys and puts
  // this back where it started, so the next account reads nothing rather than
  // the last one's answers.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoaded(false);
      setConversedAt(null);
      setDismissed([]);
      setMarked([]);
      setContactsBase(null);
      // **Forgetting in memory is right either way; forgetting on disk is
      // not.** Before the restore has resolved there is nothing to conclude
      // from a null token, so the state is cleared — nothing may be drawn from
      // it — and the keys are left exactly where they are. See `ready`.
      if (!ready) return;
      // TEMPORARY — see `introTrace` in `AppProvider`. This is the one path
      // that un-writes the flag, and it should appear only on a sign-out.
      recordEvent('intro cleared (no token)');
      void storage.remove(LEGACY_ARRIVAL_KEY);
      void storage.remove(CONVERSED_AT_KEY);
      void storage.remove(DISMISSED_KEY);
      void storage.remove(CONTACTS_BASE_KEY);
      return;
    }
    void (async () => {
      const [
        storedArrival,
        storedConversedAt,
        storedDismissed,
        storedContactsBase,
        ...storedTried
      ] = await Promise.all([
        storage.get(LEGACY_ARRIVAL_KEY),
        storage.get(CONVERSED_AT_KEY),
        storage.get(DISMISSED_KEY),
        storage.get(CONTACTS_BASE_KEY),
        ...TRIED_IDS.map((id) => storage.get(TRIED_KEYS[id])),
      ]);
      if (cancelled) return;
      // **The one-time hand-up.** These four were kept on the phone until
      // 2026-09-13 and are the account's now, so an install that ticked any of
      // them holds the only copy of that answer — the server has no way to
      // derive it and deliberately does not try. Offered once and the keys
      // cleared on success, so nothing can offer them twice; kept where they
      // are if the request fails, which is what makes a retry the next launch
      // rather than a fact lost to a dropped connection. Laid over the
      // snapshot immediately, so the rungs do not go hollow while it flies.
      // Deleted with the keys — planning/SHIMS.md.
      const handUp = legacyTried(storedTried);
      if (handUp.length > 0) {
        setMarked(handUp);
        recordEvent(`intro handing up tried=${handUp.join(',')}`);
        void api
          .markTried(token, handUp)
          .then(() =>
            Promise.all(handUp.map((id) => storage.remove(TRIED_KEYS[id])))
          )
          .catch(() => {});
      }
      const stamp = Number(storedConversedAt);
      setConversedAt(Number.isFinite(stamp) && stamp > 0 ? stamp : null);
      setDismissed(parseDismissed(storedDismissed));
      // **Three cases, and the middle one is a one-time migration.** A stored
      // line is the line. No stored line but a stored *arrival* is an install
      // that was climbing this ladder before the line existed: its starting
      // point was nought whatever it holds today, and writing anything else
      // would un-tick a rung somebody earned. Neither is an install that has
      // never seen a snapshot, and it latches below.
      const base = Number(storedContactsBase);
      if (storedContactsBase !== null && Number.isFinite(base) && base >= 0) {
        setContactsBase(base);
      } else if (storedArrival !== null) {
        setContactsBase(0);
        void storage.set(CONTACTS_BASE_KEY, '0');
        void storage.remove(LEGACY_ARRIVAL_KEY);
      }
      setLoaded(true);
      // TEMPORARY — see `introTrace` in `AppProvider`. What the keychain had
      // when this account signed in, which is the other half of the question.
      recordEvent(
        `intro loaded arrival=${storedArrival ?? 'none'} doneAt=${
          storedConversedAt ?? 'none'
        }`
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  /**
   * The latch, and the only moment it can be set: the first snapshot this
   * account's install ever saw.
   *
   * Written before anything is drawn from it, so the starting line is what
   * was true on arrival rather than what is true when somebody first scrolls.
   * See `contactsBase` in `introduction.ts` for what asking this question
   * twice would do.
   */
  useEffect(() => {
    if (!loaded || !home || contactsBase !== null) return;
    // **Latched rather than recomputed, and that is load-bearing** — it was
    // the arrival's rule and it is this value's now. The question is what this
    // account had when it got here, and it gives a different answer an hour
    // later: recomputed continuously the rung would be unticked for ever,
    // since the line would follow the count up.
    //
    // An invited account arrives holding a contact, so its line is one and
    // *Get somebody here* asks it for somebody of its own. An uninvited one
    // arrives at nought and its first contact ticks the rung.
    const base = home.contacts.length;
    setContactsBase(base);
    void storage.set(CONTACTS_BASE_KEY, String(base));
  }, [loaded, home, contactsBase]);

  /**
   * The first conversation, written once and never unwritten. It records that
   * a conversation happened, not that one is happening — which is what makes
   * it survive the conversation ending, and a reinstall.
   *
   * **This is no longer the retirement**, though it is the same write at the
   * same instant: since 2026-09-13 the checklist retires when the last rung is
   * done, and this ticks `stepIn` and nothing else.
   * See `introduction`.
   */
  useEffect(() => {
    if (!conversing || conversedAt !== null) return;
    const now = Date.now();
    setConversedAt(now);
    // TEMPORARY — see `introTrace` in `AppProvider`. The write itself, so that
    // a stamp that happens and does not stick is told apart from one that
    // never happens.
    recordEvent(`intro retiring at=${now}`);
    void storage.set(CONVERSED_AT_KEY, String(now));
  }, [conversing, conversedAt]);

  /**
   * **This feature makes no request of its own, since 2026-09-13.** It used to
   * fetch the account's username for one cohort, because the *choose a
   * username* rung was the only reader of one outside `ProfileView`. That rung
   * went when usernames became derived at signup, and the fetch went with it —
   * along with the beat of silence it cost, during which the whole ladder was
   * withheld rather than drawn a rung short.
   */

  /**
   * One of the four, done for the first time.
   *
   * **Idempotent and fire-and-forget**, which is what lets the call sites be a
   * single line beside an action that has its own job to do — see
   * `ChannelView`. Nothing waits on the write and nothing reports its failure:
   * the cost of losing one is a rung that stays hollow until the next time
   * somebody does the same thing, which is a checklist being slightly wrong
   * rather than anything being broken.
   */
  const markTried = useCallback(
    (id: TriedId) => {
      setMarked((current) =>
        current.includes(id) ? current : [...current, id]
      );
      if (!token) return;
      // Sent on every claim of the floor rather than only the first: this
      // client cannot know whether another device got there first, and the
      // server declines the write and the push when it was not news. Cheaper
      // than asking.
      void api.markTried(token, [id]).catch(() => {});
    },
    [token]
  );

  /**
   * One rung put away, from the card.
   *
   * Idempotent, and it writes through rather than waiting on the write: the
   * row has to go on the tap, and the cost of losing the key is a row that
   * comes back on the next launch — the same trade `markTried` makes about
   * the opposite fact.
   */
  const dismiss = useCallback((id: StepId) => {
    setDismissed((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      void storage.set(DISMISSED_KEY, next.join(','));
      return next;
    });
  }, []);

  const forget = useCallback(async () => {
    setConversedAt(null);
    setDismissed([]);
    setMarked([]);
    // **The starting line moves to here, which is what the tap means.** An
    // account that taps this has contacts, and a ladder whose first rung was
    // ticked before it was drawn is the theatre the whole card avoids. Taking
    // the count now asks for one *more*, which is the only honest reading of
    // *Get somebody here* on an account that already has somebody.
    const base = home?.contacts.length ?? 0;
    setContactsBase(base);
    // The four stamps are the server's now, so this is the one part of
    // forgetting that has to travel. Refused for an account without `debug`,
    // which is every account that cannot reach the button — so a failure here
    // is the ordinary answer for everybody else and not something to report.
    if (token) await api.forgetTried(token).catch(() => undefined);
    await Promise.all([
      storage.set(CONTACTS_BASE_KEY, String(base)),
      storage.remove(CONVERSED_AT_KEY),
      storage.remove(DISMISSED_KEY),
      // Only still here for the hand-up above, and only reachable at all by an
      // install that has never managed one. Cleared anyway, so that forgetting
      // means forgetting rather than forgetting until the next launch.
      ...TRIED_IDS.map((id) => storage.remove(TRIED_KEYS[id])),
    ]);
  }, [token, home?.contacts.length]);

  return {
    introduction: introduction({
      loaded,
      home,
      conversedAt,
      tried,
      conversing,
      install,
      dismissed,
      contactsBase,
    }),
    markTried,
    dismiss,
    forget,
  };
}
