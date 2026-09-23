import React, { createContext, useContext } from 'react';
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  type UsernameFault,
} from '../../../core/username';
import { en } from './en';
import { es } from './es';

/**
 * Every word the app says, as functions.
 *
 * **Functions rather than a key/value catalogue, and the reason is Spanish.**
 * A message with a number in it agrees with that number, and a message about a
 * person agrees with that person; English hides how much of that there is
 * because it only ever has the one plural rule and no gender. A catalogue of
 * format strings has to grow a message syntax to express the branching — ICU
 * plurals, selectors, and a runtime that parses them — and then every call
 * site passes a bag of untyped arguments into it. A function already is that
 * branching, in the language the rest of the app is written in, and the
 * arguments are typed.
 *
 * **`Strings` is derived from the English catalogue rather than declared.**
 * `en.ts` is the source of truth for what messages exist and what each one
 * takes; a second language is `const es: Strings = {...}`, so a message that
 * is missing, misnamed, or takes the wrong arguments is a typecheck failure
 * rather than a blank on somebody's screen. There is deliberately no runtime
 * fallback to English: a fallback turns that compile error into a silent
 * half-translated build, which is the failure mode this shape exists to
 * prevent.
 */
export type Strings = typeof en;

export { en, es };

/**
 * **English is the context's default, so nothing has to provide it.**
 * The test harness renders views bare, and every one of the several hundred
 * assertions that name English prose goes on working untouched; a test about
 * Spanish wraps in the provider and says so. It also means a view rendered
 * outside the tree — a screen reached before the provider mounts — says words
 * rather than throwing.
 */
const TextContext = createContext<Strings>(en);

export function useText(): Strings {
  return useContext(TextContext);
}

export function TextProvider({
  strings,
  children,
}: {
  strings: Strings;
  children: React.ReactNode;
}) {
  return React.createElement(TextContext.Provider, { value: strings }, children);
}

/**
 * The sentence for a username fault, which `core/username.ts` decides and
 * does not word.
 *
 * Here rather than in the view because two screens ask the same question and
 * a `switch` copied into both is how the two come to disagree about which
 * rule was broken.
 */
export function sayUsernameFault(
  fault: UsernameFault,
  words: Strings['usernameFault']
): string {
  if (fault === 'too-long') return words.tooLong(MAX_USERNAME_LENGTH);
  if (fault === 'too-short') return words.tooShort(MIN_USERNAME_LENGTH);
  return words.charset();
}

/**
 * Which catalogue a BCP 47 tag gets.
 *
 * The language subtag only: `es-MX`, `es-419` and `es` are one catalogue here,
 * because nothing the app says is a regionalism and inventing a second Spanish
 * to hold the difference costs a file per region and settles nothing. Anything
 * unrecognised is English, which is also what an absent tag gets — the same
 * reasoning as `deviceRegion`, which reports nothing rather than guessing.
 */
export function stringsFor(locale: string | undefined): Strings {
  const language = (locale ?? '').replace(/_/g, '-').split('-')[0].toLowerCase();
  return language === 'es' ? es : en;
}
