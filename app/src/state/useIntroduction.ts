import { useCallback, useEffect, useState } from 'react';
import type { HomeView } from '../../../core/protocol';
import { recordEvent } from '../audio/diagnostics';
import type { Install } from './install';
import { storage } from './storage';
import {
  NOTHING_TRIED,
  TRIED_IDS,
  TRIED_KEYS,
  type Tried,
  type TriedId,
} from './tried';
import {
  arrivalOf,
  introduction,
  type Arrival,
  type Introduction,
} from './introduction';

/**
 * The two things this has to remember *about the account*, the rest of the
 * ladder being derived from the snapshot. The four `thefloor.intro.tried.*`
 * keys below are about the install and are governed differently — `tried.ts`.
 *
 * **Cleared on sign-out, unlike every other key here**, and the difference is
 * what they are about. `installNotice.ts` and the four `thefloor.notifications`
 * keys survive sign-out deliberately: they record what this *browser* or this
 * *install* has been shown, and iOS grants its one dialog per install however
 * many people sign in on the phone. These two record what an *account* has
 * done — how it arrived, and whether it has ever had a conversation — and a
 * second account signing in on the same phone has done neither. Left standing
 * they would tell a brand-new account it had finished.
 */
const ARRIVAL_KEY = 'thefloor.intro.arrival';
/**
 * **The name is historical and the key string must not change.** It is written
 * at exactly the moment it always was — the first conversation — and every
 * account already carrying one means precisely that. What changed on
 * 2026-09-13 is what is *concluded* from it: it used to retire the whole
 * checklist and now it ticks one rung and settles which of two things an
 * `invited` arrival is shown. Renaming the key would have discarded that
 * stamp on every install for no gain; the field it loads into is called
 * `conversedAt`, which is what it has always meant.
 */
const CONVERSED_AT_KEY = 'thefloor.intro.doneAt';

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
   * difference between these four and every other rung. See `tried.ts`.
   */
  markTried: (id: TriedId) => void;
  /**
   * Puts this account back where it started, for a debug account only.
   *
   * **There is nothing else that does this.** The two account keys are cleared
   * on sign-out, but signing in again re-latches the arrival from the same
   * snapshot and `conversedAt` is written off `conversing`, which by then is a
   * fact about an account that has conversed — so signing out and back in
   * returns somebody to exactly the silence they were in. The four *try* keys
   * are not cleared on sign-out at all, so that route would not touch them.
   * *Forget this phone* clears all six as part of `INSTALL_KEYS`, but it takes
   * the session with it and is aimed at the whole install; this is the
   * checklist alone, on an account that stays signed in.
   *
   * The state is reset alongside the keys rather than left to a relaunch,
   * which is what makes the ladder reappear on the tap: clearing `arrival`
   * re-arms the latch, and the next snapshot — the one already in hand —
   * decides the arrival again. Somebody with contacts is therefore returned
   * to the *invited* card and not to the ladder, which is honest: that is
   * what this account looks like to a first snapshot now.
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
   * that *deletes* both keys. The retirement was therefore wiped at every
   * launch, the arrival re-latched from the snapshot then in hand, and an
   * established account — which has contacts — latched `invited` and was shown
   * a card about an invitation nobody had sent. With no invitation pending
   * that card has no name to put in it, so what people actually saw was its
   * fallback sentence, *You have not stepped in yet*, on accounts that
   * plainly had. See `__tests__/introColdLaunch.test.tsx`.
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
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [conversedAt, setConversedAt] = useState<number | null>(null);
  /**
   * The four *try* rungs. Per install and not per account, so unlike the two
   * above these are **not** cleared on sign-out: they record what this device
   * has been shown a control for, which a second person signing in on the same
   * phone has equally been shown. See `tried.ts`.
   */
  const [tried, setTried] = useState<Tried>(NOTHING_TRIED);

  // Read once per signed-in session. Signing out clears both keys and puts
  // this back where it started, so the next account reads nothing rather than
  // the last one's answers.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoaded(false);
      setArrival(null);
      setConversedAt(null);
      // **Forgetting in memory is right either way; forgetting on disk is
      // not.** Before the restore has resolved there is nothing to conclude
      // from a null token, so the state is cleared — nothing may be drawn from
      // it — and the keys are left exactly where they are. See `ready`.
      if (!ready) return;
      // TEMPORARY — see `introTrace` in `AppProvider`. This is the one path
      // that un-writes the flag, and it should appear only on a sign-out.
      recordEvent('intro cleared (no token)');
      void storage.remove(ARRIVAL_KEY);
      void storage.remove(CONVERSED_AT_KEY);
      return;
    }
    void (async () => {
      const [storedArrival, storedConversedAt, ...storedTried] =
        await Promise.all([
          storage.get(ARRIVAL_KEY),
          storage.get(CONVERSED_AT_KEY),
          ...TRIED_IDS.map((id) => storage.get(TRIED_KEYS[id])),
        ]);
      if (cancelled) return;
      setTried(
        Object.fromEntries(
          TRIED_IDS.map((id, at) => [id, storedTried[at] === '1'])
        ) as unknown as Tried
      );
      setArrival(
        storedArrival === 'invited' || storedArrival === 'alone'
          ? storedArrival
          : null
      );
      const stamp = Number(storedConversedAt);
      setConversedAt(Number.isFinite(stamp) && stamp > 0 ? stamp : null);
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
   * Written before anything is drawn from it, so the arrival is decided by
   * what was true on arrival rather than by what is true when somebody first
   * scrolls. See `Arrival` for what asking this question twice would do.
   */
  useEffect(() => {
    if (!loaded || !home || arrival) return;
    const next = arrivalOf(home);
    setArrival(next);
    void storage.set(ARRIVAL_KEY, next);
  }, [loaded, home, arrival]);

  /**
   * The first conversation, written once and never unwritten. It records that
   * a conversation happened, not that one is happening — which is what makes
   * it survive the conversation ending, and a reinstall.
   *
   * **This is no longer the retirement**, though it is the same write at the
   * same instant: since 2026-09-13 the checklist retires when the last rung is
   * done, and this ticks `stepIn` and decides what an `invited` arrival sees.
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
  const markTried = useCallback((id: TriedId) => {
    setTried((current) => (current[id] ? current : { ...current, [id]: true }));
    void storage.set(TRIED_KEYS[id], '1');
  }, []);

  const forget = useCallback(async () => {
    setArrival(null);
    setConversedAt(null);
    setTried(NOTHING_TRIED);
    await Promise.all([
      storage.remove(ARRIVAL_KEY),
      storage.remove(CONVERSED_AT_KEY),
      ...TRIED_IDS.map((id) => storage.remove(TRIED_KEYS[id])),
    ]);
  }, []);

  return {
    introduction: introduction({
      loaded,
      home,
      arrival,
      conversedAt,
      tried,
      conversing,
      install,
    }),
    markTried,
    forget,
  };
}
