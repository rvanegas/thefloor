import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../en';
import { es } from '../es';
import { stringsFor } from '../index';

/**
 * That the extraction stays done.
 *
 * **A test rather than a lint rule, because this repository has no linter**
 * and `core/__tests__/purity.test.ts` is the precedent: a constraint nothing
 * enforces is one that decays the week after it lands, and the decay here is
 * invisible — a literal added to a view is a screen that silently stays
 * English in a Spanish build, with nothing failing anywhere.
 *
 * It looks for prose rather than for strings. A string is how this codebase
 * writes an action type, a style token and a URL; what it must not write any
 * more is a sentence, and the difference a machine can see is a capital
 * letter, a lower-case word and a space.
 *
 * **Two searches, because prose arrives in two shapes**, and the first pass of
 * this test only had the first: a quoted literal, and a JSX text node, which
 * carries no quotes at all. `<SectionLabel>Members</SectionLabel>` survived an
 * entire extraction of `ChannelView.tsx` unnoticed for exactly that reason —
 * it is neither quoted nor a sentence, and both halves of that had to be
 * fixed rather than one.
 */
const APP = join(__dirname, '..', '..', '..');
const UI = join(APP, 'src', 'ui');
const WATCH = join(APP, 'src', 'watch');
/**
 * **`state/` is in scope too, and it is not a view.** `AppProvider` produces
 * three sentences that reach a screen — `lastError` is drawn on the sign-in
 * screen — and `introduction.ts` holds the whole activation ladder. Where a
 * module says words is not the same question as whether it renders them.
 */
const STATE = join(APP, 'src', 'state');

/**
 * **The two developer screens, by name.** They are instruments, read by
 * whoever is holding the phone and the source at once, and translating them
 * would cost sixty messages to make a diagnostic harder to correlate with the
 * code it is diagnosing. Named here so that it is a decision rather than an
 * oversight — see the head of `en.ts`, which says the same thing from the
 * other side.
 */
const NOT_TRANSLATED = [
  'AudioLabView.tsx',
  'AudioDebugPanel.tsx',
  /**
   * **The Android notification channels, by name.** They are user-facing —
   * they appear in Android's own settings — but `ensureChannels` runs at
   * registration, outside any React tree, with no provider above it, and
   * Android is not a platform this app is released on. The honest fix when it
   * is one is `strings.xml` per locale; see the comment in the file.
   */
  'push.ts',
];

/**
 * Prose, as a machine can recognise it: quoted, opening with a capital and a
 * lower-case letter, and containing a space.
 *
 * Deliberately not clever. Its job is to fail on a sentence somebody typed
 * into a view, and every way of making it cleverer is a way of making it
 * quieter.
 */
const QUOTED = /(['"])([A-Z][a-z]+(?: +[^'"\\\n]+)+)\1/g;

/**
 * Text between tags: what a view writes when it puts words on the screen
 * without quoting them.
 *
 * **A single capitalised word counts here where it does not in a quoted
 * literal**, and the asymmetry is the point: `'Members'` in code is as likely
 * to be a key or an enum as a label, while `>Members<` in a tree is on
 * somebody's screen.
 *
 * **It ends at a closing tag, `</`, and that is what tells it from a
 * generic.** TypeScript is full of `>` followed by an identifier followed by
 * `<` — `) => Promise<void>` above a line opening another type — and every
 * one of those was a false positive until the closing slash was required.
 * What it gives up is text with an element inside it, `Hello <b>you</b>`,
 * which this app does not write: its emphasis is a nested `Text` with the
 * words in the catalogue on both sides of it.
 */
const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)<\//g;

/** Characters no rendered label contains and every fragment of code does. */
const CODE = new Set('=;()[]|&');

function proseIn(source: string): string[] {
  const found = [...source.matchAll(QUOTED)].map((m) => m[2]);
  for (const match of source.matchAll(JSX_TEXT)) {
    const text = match[1].split(/\s+/).filter(Boolean).join(' ');
    if (!text) continue;
    if ([...text].some((c) => CODE.has(c))) continue;
    if (!/^[A-Za-z]/.test(text)) continue;
    // A bare lower-case word is a prop value or a type, never a label: the
    // labels this app writes are sentences or they are capitalised.
    if (/^[a-z]+$/.test(text)) continue;
    found.push(text);
  }
  return found;
}

/** Everything that is not a comment, which is where most of this project's prose is. */
function code(contents: string): string {
  let inBlock = false;
  return contents
    .split('\n')
    .filter((line) => {
      const bare = line.trim();
      if (bare.startsWith('/*') || bare.startsWith('{/*')) inBlock = true;
      if (inBlock) {
        if (bare.includes('*/')) inBlock = false;
        return false;
      }
      return !bare.startsWith('//') && !bare.startsWith('*');
    })
    .join('\n');
}

function sourcesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !NOT_TRANSLATED.includes(f))
    .filter((f) => statSync(join(dir, f)).isFile());
}

describe('the words stay in the catalogue', () => {
  const files = [
    ...sourcesIn(UI).map((f) => join(UI, f)),
    ...sourcesIn(WATCH).map((f) => join(WATCH, f)),
    ...sourcesIn(STATE).map((f) => join(STATE, f)),
    join(APP, 'App.tsx'),
  ];

  it('has screens to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(f.lastIndexOf('/') + 1), f]))(
    '%s writes no sentence of its own',
    (_name, path) => {
      expect(proseIn(code(readFileSync(path, 'utf8')))).toEqual([]);
    }
  );
});

describe('the two languages', () => {
  const shape = (o: Record<string, unknown>): string[] =>
    Object.entries(o)
      .flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? shape(v as Record<string, unknown>).map((n) => `${k}.${n}`)
          : [k]
      )
      .sort();

  /**
   * Structural rather than textual: `es` is typed as `Strings`, so a missing
   * message is already a typecheck failure. What a test adds is that the two
   * agree at runtime as well.
   */
  it('hold the same messages', () => {
    expect(shape(es)).toEqual(shape(en));
  });

  /**
   * The one thing a type cannot catch: a Spanish message left as the English
   * one because somebody copied the file and stopped. Proper nouns and a few
   * shapes are the same in both deliberately, and are listed.
   */
  it('say something different in Spanish', () => {
    const SAME_ON_PURPOSE = new Set([
      'auth.brand',
      'panes.brand',
      'shared.labelWithBadge',
      'channel.knockLead',
      'channel.audio',
      'channel.no',
      'home.podcasts',
      'transcript.data',
      // The two language names, which are each written in their own language
      // in both catalogues: the person who cannot read the language the screen
      // is drawn in is the one about to change it, and *Inglés* is no use to
      // them. See `homeSettings.english` in en.ts.
      'homeSettings.english',
      'homeSettings.spanish',
    ]);
    const differences: string[] = [];
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === 'function' && typeof b === 'function') {
        // Only the messages that take no argument can be called blind here;
        // the rest are covered by the shape test above and by reading.
        if (a.length > 0) return;
        if (a() === (b as () => unknown)() && !SAME_ON_PURPOSE.has(path)) {
          differences.push(path);
        }
        return;
      }
      if (typeof a !== 'object' || a === null) return;
      for (const key of Object.keys(a as object)) {
        walk(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key
        );
      }
    };
    walk(en, es, '');
    expect(differences).toEqual([]);
  });
});

describe('which catalogue a device gets', () => {
  it('reads the language and ignores the region', () => {
    expect(stringsFor('es')).toBe(es);
    expect(stringsFor('es-MX')).toBe(es);
    expect(stringsFor('es-419')).toBe(es);
    expect(stringsFor('ES_es')).toBe(es);
  });

  it('is English for everything else, and for nothing at all', () => {
    expect(stringsFor('en-GB')).toBe(en);
    expect(stringsFor('fr')).toBe(en);
    expect(stringsFor(undefined)).toBe(en);
    expect(stringsFor('')).toBe(en);
  });
});
