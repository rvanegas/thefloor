import React from 'react';
import { Alert, Linking, StyleSheet, Text, type TextStyle } from 'react-native';
import { colors } from './theme';

/**
 * Inline Markdown, rendered as nested `<Text>`.
 *
 * Written here rather than taken from a library on purpose. What a channel
 * description needs is bold, italic, code, strikethrough and links — five
 * things, all of which are spans inside a paragraph. A Markdown library brings
 * block layout, tables, images and HTML passthrough, none of which belong in a
 * header above a roster, and every dependency in this app is one more thing
 * pinned to an Expo version (see AGENTS.md).
 *
 * It is deliberately a *subset*, and unrecognised markup is left as the literal
 * characters somebody typed. A description is prose that happens to accept some
 * formatting, so text that does not parse should read as text rather than
 * vanish.
 */

/** Schemes a link may use. Everything else is rendered as inert text. */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

/**
 * Whether a URL is safe to hand to the OS.
 *
 * The check is a allowlist rather than a denylist because the interesting
 * attacks are the ones nobody thought of. A description is written by one
 * member of a channel and read by the others, so a link is untrusted input from
 * a person you may know only slightly — and `Linking.openURL` will hand
 * anything to the system, including schemes that open other apps with
 * arguments. `javascript:` is the famous one; it is not the only one.
 */
export function isSafeUrl(url: string): boolean {
  try {
    return SAFE_SCHEMES.includes(new URL(url).protocol);
  } catch {
    // Not a parseable absolute URL. A bare "example.com" is a plausible thing
    // to type, but resolving it would mean guessing a scheme on the reader's
    // behalf, so it stays text.
    return false;
  }
}

type Span =
  | { kind: 'text'; text: string; style: TextStyle[] }
  | { kind: 'link'; text: string; url: string; style: TextStyle[] };

/**
 * The markup this understands, longest delimiter first so `**` is matched
 * before `*` and never read as two emphases in a row.
 */
const EMPHASIS: Array<{ open: string; style: TextStyle }> = [
  { open: '***', style: { fontWeight: '700', fontStyle: 'italic' } },
  { open: '**', style: { fontWeight: '700' } },
  { open: '__', style: { fontWeight: '700' } },
  { open: '~~', style: { textDecorationLine: 'line-through' } },
  { open: '*', style: { fontStyle: 'italic' } },
  { open: '_', style: { fontStyle: 'italic' } },
];

/**
 * Splits `source` into styled spans.
 *
 * A hand-rolled scanner rather than a regex sweep, because emphasis nests and
 * links contain text that may itself be emphasised. Exported for its tests: the
 * parsing is the part with edge cases, and it is worth asserting without having
 * to render anything.
 */
export function parseInline(source: string, inherited: TextStyle[] = []): Span[] {
  const spans: Span[] = [];
  let plain = '';

  const flush = () => {
    if (plain !== '') {
      spans.push({ kind: 'text', text: plain, style: inherited });
      plain = '';
    }
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    // A backslash escapes the character after it, so a description can contain
    // a literal asterisk without becoming italic.
    if (rest[0] === '\\' && rest.length > 1) {
      plain += rest[1];
      i += 2;
      continue;
    }

    // `code` — first, and it does not recurse: the point of code is that its
    // contents are not markup.
    if (rest[0] === '`') {
      const close = rest.indexOf('`', 1);
      if (close > 1) {
        flush();
        spans.push({
          kind: 'text',
          text: rest.slice(1, close),
          style: [...inherited, styles.code],
        });
        i += close + 1;
        continue;
      }
    }

    // [label](url)
    if (rest[0] === '[') {
      const link = matchLink(rest);
      if (link) {
        flush();
        if (isSafeUrl(link.url)) {
          for (const span of parseInline(link.label, [
            ...inherited,
            styles.link,
          ])) {
            spans.push({ ...span, kind: 'link', url: link.url } as Span);
          }
        } else {
          // Refused, but not hidden: dropping it would leave a sentence with a
          // hole in it and no explanation.
          spans.push(...parseInline(link.label, inherited));
        }
        i += link.length;
        continue;
      }
    }

    const emphasis = EMPHASIS.find(
      (candidate) =>
        rest.startsWith(candidate.open) &&
        // An unclosed delimiter is literal text, not formatting that swallows
        // the rest of the description.
        rest.indexOf(candidate.open, candidate.open.length) > candidate.open.length
    );
    if (emphasis) {
      const close = rest.indexOf(emphasis.open, emphasis.open.length);
      flush();
      spans.push(
        ...parseInline(rest.slice(emphasis.open.length, close), [
          ...inherited,
          emphasis.style,
        ])
      );
      i += close + emphasis.open.length;
      continue;
    }

    plain += rest[0];
    i += 1;
  }

  flush();
  return spans;
}

/**
 * `[label](url)` at the start of `rest`, or null.
 *
 * The closing bracket is found by balancing parentheses rather than by taking
 * the first `)`, because URLs contain them — every Wikipedia article with a
 * disambiguation suffix, for one. Taking the first would truncate the target
 * and leave the remainder as a stray `)` in the prose.
 */
function matchLink(
  rest: string
): { label: string; url: string; length: number } | null {
  const closeLabel = rest.indexOf('](');
  if (closeLabel < 1) return null;

  let depth = 0;
  for (let i = closeLabel + 2; i < rest.length; i += 1) {
    if (rest[i] === '(') depth += 1;
    else if (rest[i] === ')') {
      if (depth === 0) {
        return {
          label: rest.slice(1, closeLabel),
          url: rest.slice(closeLabel + 2, i).trim(),
          length: i + 1,
        };
      }
      depth -= 1;
    }
  }
  return null;
}

async function open(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing in the app can fix this, and failing silently would look like a
    // dead link rather than a refusal by the OS.
    Alert.alert('Could not open link', url);
  }
}

/**
 * Renders inline Markdown. Links leave the app: they open in the system
 * browser rather than a web view, so what is shown carries the browser's own
 * address bar and the reader can see where a link from another member led.
 */
export function InlineMarkdown({
  text,
  style,
  numberOfLines,
}: {
  text: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}) {
  const spans = parseInline(text);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {spans.map((span, index) =>
        span.kind === 'link' ? (
          <Text
            key={index}
            style={span.style}
            accessibilityRole="link"
            onPress={() => void open(span.url)}
          >
            {span.text}
          </Text>
        ) : (
          <Text key={index} style={span.style}>
            {span.text}
          </Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  code: {
    fontFamily: 'Menlo',
    backgroundColor: colors.surfaceRaised,
  },
  link: {
    color: colors.floor,
    textDecorationLine: 'underline',
  },
});
