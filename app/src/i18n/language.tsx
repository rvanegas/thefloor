import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_ACCOUNT_SETTINGS,
  isLanguagePreference,
  type LanguagePreference,
} from '../../../core/settings';
import { deviceRegion } from '../api/region';
import { storage } from '../state/storage';
import { setRelativeTimeLocale } from '../ui/relativeTime';
import { TextProvider, stringsFor } from './index';

export type { LanguagePreference };

/**
 * Where the last-known language is cached on this device.
 *
 * **A cache of the account's answer, not the answer itself**, which is
 * `APPEARANCE_KEY`'s arrangement exactly: it exists for the frames between a
 * launch and the server's `hello`, so that somebody who reads Spanish does not
 * watch the first screen in English. Written whenever the server says
 * something and cleared at sign-out, so one person's Spanish cannot address
 * the next person.
 */
export const LANGUAGE_KEY = 'thefloor.language';

/**
 * The preference and the two ways it changes, for whoever is holding the
 * account's answer.
 *
 * **Deliberately not the setter a screen calls.** The settings card goes
 * through `app.setLanguage`, which is this `adopt` plus the write that makes it
 * the account's — one path to the server for every setting on that screen. What
 * is here is the half that has to live above `AppProvider`, because the
 * catalogue does: `AppProvider` itself reads words, so the provider that
 * chooses them cannot be inside it.
 */
interface LanguageValue {
  preference: LanguagePreference;
  /** Takes a value as given — a tap, the cache, or what the server said. */
  adopt: (preference: LanguagePreference) => void;
  /** Back to the phone's language, and the cache emptied with it. */
  forget: () => void;
}

const LanguageContext = createContext<LanguageValue | null>(null);

/**
 * Answers null outside the provider rather than throwing, unlike `useApp`.
 *
 * Every test that renders a screen bare is a caller of this by way of
 * `AppProvider`, and the language is the one thing on that screen with a
 * working default — the English catalogue, which is what those tests assert.
 * Throwing would make a language control the reason several hundred unrelated
 * assertions need a wrapper.
 */
export function useLanguagePreference(): LanguageValue | null {
  return useContext(LanguageContext);
}

/**
 * Chooses the catalogue, and provides it.
 *
 * **Above `TextProvider` and above `AppProvider`, in that order**, which is
 * what makes a language chosen in Floor Settings a value change that redraws
 * rather than a relaunch. `App.tsx` used to read the device once at launch and
 * hand the answer straight to `TextProvider`, on the grounds that changing a
 * phone's language relaunches the app anyway; that stops being the whole story
 * the moment the app has a language of its own, since nothing restarts when
 * somebody taps *Español* here.
 *
 * **The resolution is one line and is where `system` stops existing**: the
 * preference is a tag or it is the device's tag, and `stringsFor` is what turns
 * either into a catalogue. Nothing downstream of this knows there were three
 * choices.
 *
 * dayjs's locale is set in the same breath, because it is global and because
 * an app saying *hace 5 minutos* under an English sentence is the
 * half-translated build the shape of `Strings` exists to prevent. It is set on
 * every change rather than once at launch, which is why
 * `setRelativeTimeLocale` has to be able to go back to English.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  /**
   * The account's, once the account has said anything. Before that — the frames
   * between a cold start and `hello` — this device's cached copy of the last
   * thing it was told, which is the gap the cache exists for.
   */
  const [preference, setPreference] = useState<LanguagePreference>(
    DEFAULT_ACCOUNT_SETTINGS.language
  );
  useEffect(() => {
    void (async () => {
      const stored = await storage.get(LANGUAGE_KEY);
      if (isLanguagePreference(stored)) setPreference(stored);
    })();
  }, []);

  /**
   * Guarded, unlike the scheme's equivalent, because this one can be handed a
   * gap rather than a value: a server that predates the field says nothing
   * about the language while saying everything else, and `AccountSettings`
   * being complete on the wire is a promise the *current* server keeps. An
   * unrecognised answer reads as the phone's, which is what an account that
   * has never chosen gets — not as `undefined` written into the keychain.
   */
  const adopt = useCallback((next: LanguagePreference) => {
    const value = isLanguagePreference(next)
      ? next
      : DEFAULT_ACCOUNT_SETTINGS.language;
    setPreference(value);
    void storage.set(LANGUAGE_KEY, value);
  }, []);
  const forget = useCallback(() => {
    setPreference(DEFAULT_ACCOUNT_SETTINGS.language);
    void storage.remove(LANGUAGE_KEY);
  }, []);

  const strings = useMemo(() => {
    const locale =
      preference === 'system' ? deviceRegion().locale : preference;
    setRelativeTimeLocale(locale);
    return stringsFor(locale);
  }, [preference]);

  const value = useMemo(
    () => ({ preference, adopt, forget }),
    [preference, adopt, forget]
  );

  return (
    <LanguageContext.Provider value={value}>
      <TextProvider strings={strings}>{children}</TextProvider>
    </LanguageContext.Provider>
  );
}
