import { palettes } from './theme';

/**
 * The custom properties `theme.ts` points at on web, written from the same
 * palettes it defines.
 *
 * **Generated rather than written out, which is the whole point.** `theme.ts`
 * builds its colour map by mapping the palette keys precisely so the two
 * schemes cannot drift apart without a type error; a hand-written stylesheet
 * would reintroduce exactly that drift one layer down, in a file nobody reads
 * when changing a colour. There is one set of colours in this app and it is in
 * `theme.ts`.
 *
 * **Three states, not two**, which is what makes the setting work at all:
 *
 * - Bare `:root` carries the *light* palette, so a browser that has never been
 *   told anything gets light.
 * - `prefers-color-scheme: dark` swaps to the dark palette — but only when the
 *   reader has not explicitly chosen light, or "Light" in Settings would be
 *   overridden by the operating system, which is the bug this replaces.
 * - `[data-theme]` on the root element wins in both directions, and is what
 *   `applyPreference` writes.
 *
 * That is the browser's version of what `Appearance.setColorScheme` does on
 * iOS: an override on the thing the colours are resolved against, so nothing
 * else in the app has to know a scheme changed. No context, no re-render, no
 * second source of colour.
 */

const ELEMENT_ID = 'thefloor-theme';

/** `--floor-surfaceRaised: #E9ECF1;` for every token in a palette. */
function declarations(palette: Record<string, string>): string {
  return Object.entries(palette)
    .map(([token, value]) => `  --floor-${token}: ${value};`)
    .join('\n');
}

function stylesheet(): string {
  const light = declarations(palettes.light);
  const dark = declarations(palettes.dark);
  return `
:root {
  color-scheme: light dark;
${light}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${dark}
  }
}

:root[data-theme="dark"] {
${dark}
}

:root[data-theme="light"] {
${light}
}

/* The page behind the app. Without this the browser paints its own white
   under a dark palette, which shows as a flash on load and as a band under
   any content shorter than the viewport. */
html, body, #root {
  background-color: var(--floor-bg);
}
`;
}

/**
 * Puts the variables in the document, once.
 *
 * Called from `index.web.ts` before the app registers, so the first paint has
 * them — a stylesheet added after mount is a flash of the wrong colours, and
 * the wrong colours here are an entire inverted palette.
 *
 * Idempotent by id, because a Metro fast refresh re-runs module bodies and two
 * copies of this would be harmless but confusing to find.
 */
export function installThemeVariables(): void {
  try {
    if (document.getElementById(ELEMENT_ID)) return;
    const style = document.createElement('style');
    style.id = ELEMENT_ID;
    style.textContent = stylesheet();
    document.head.append(style);
  } catch {
    // No document. Nothing renders either, so there is nothing to colour.
  }
}
