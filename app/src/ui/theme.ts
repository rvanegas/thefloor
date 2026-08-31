import { DynamicColorIOS, Platform, type ColorValue } from 'react-native';

/**
 * The dark palette, and the place the tokens are documented — a comment here
 * says what a token *means*, which is the part that does not vary between
 * schemes.
 */
const dark = {
  bg: '#0E1013',
  surface: '#181B20',
  surfaceRaised: '#22262D',
  border: '#2E333B',
  text: '#F2F4F7',
  textMuted: '#98A2B3',
  textFaint: '#667085',
  /**
   * A field's placeholder, and nothing else.
   *
   * Its own token rather than `textFaint`, which also carries the 12px
   * semibold labels above these fields and has to stay legible at that size. A
   * placeholder is a hint about an empty field — it is read once and then
   * replaced by what somebody types — so it may sit below the threshold real
   * text is held to, and it should: a hint as dark as a label makes an empty
   * form look filled in.
   */
  placeholder: '#5F677A',
  /** The floor: the app's one distinguishing mechanic gets the accent. */
  floor: '#7C5CFF',
  floorDim: '#3A2F6B',
  /** Being force-muted by the other party. */
  silenced: '#F0824D',
  recording: '#F04438',
  danger: '#F04438',
  success: '#32D583',
  disabled: '#2A2E35',
};

/**
 * The light palette. **Not an inversion**, in two places that matter.
 *
 * `surface` is white and sits *above* the page, which is the opposite of the
 * dark arrangement where surfaces lighten as they come forward — so `bg` is a
 * tinted grey rather than white, white cards on a white page being invisible.
 * And `surfaceRaised`, which is the default Button fill, cannot follow
 * `surface` to white or every default button dissolves into the card behind
 * it; it goes the other way, to a grey that reads as a control.
 *
 * The rest are pinned by contrast rather than taste. Four of these are
 * saturated colours used as *text* — `silenced` for warnings, `success` and
 * `danger` on Home's status line — and each fails on a light background at its
 * dark value: `#32D583` on white is under 2:1.
 */
const light: Record<keyof typeof dark, string> = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceRaised: '#E9ECF1',
  border: '#D6DAE1',
  text: '#12151A',
  /** A naive inversion lands far too pale to read as body text. */
  textMuted: '#5A6474',
  /** Carries 12px semibold labels, so it needs 4.5:1 rather than 3:1. */
  textFaint: '#6B7484',
  /** ~3:1 on a white card, against `textFaint`'s 4.7:1. */
  placeholder: '#8A93A3',
  /** Darkened until the white button text on it passes. */
  floor: '#6338E8',
  /** A tinted fill sitting under *dark* text now, so it inverts rather than dims. */
  floorDim: '#EDE8FF',
  /** Orange on white is the classic contrast failure; this is nearly brown. */
  silenced: '#B24A11',
  recording: '#D92D20',
  danger: '#D92D20',
  success: '#067647',
  disabled: '#E4E7EC',
};

/**
 * One token, two values, resolved by UIKit rather than by us.
 *
 * `DynamicColorIOS` returns an opaque colour the platform resolves against the
 * current trait collection at *draw* time, every time. That is what lets the
 * eight module-scope `StyleSheet.create` blocks stay exactly as they are: they
 * capture these once at import and remain correct, because nothing in
 * JavaScript ever knew the colour. The idiomatic alternative — a context, a
 * `useTheme()`, and `useMemo(() => makeStyles(c), [c])` in every component —
 * would rewrite all eight blocks and their call sites to add a re-render path
 * for something the platform re-renders by itself.
 *
 * Built by mapping the keys rather than written out twice, so the palettes
 * cannot drift apart without the type failing.
 *
 * The `Platform.OS` guard is real: `DynamicColorIOS` throws on Android, which
 * `app.json` still configures even though nobody builds it.
 *
 * **Where no scheme can be resolved, the answer is light.** That is Android
 * and it is jest — platforms with no trait collection and no `var()` — and it
 * used to be dark, on no better reasoning than that dark was written first.
 * Light is the better default for a fallback because it is what a surface with
 * no opinion looks like everywhere else: an unstyled page, a print stylesheet,
 * a browser that has never heard of `prefers-color-scheme`. The web stylesheet
 * carries the same rule, with light on bare `:root` and dark arriving only by
 * preference or by choice.
 *
 * **The web has its own opaque value, and it is a CSS custom property.**
 * `var(--floor-text)` is resolved by the browser at paint time, every time,
 * from whatever the variable currently holds — which is the same property
 * `DynamicColorIOS` is used for here and the same reason the eight
 * module-scope `StyleSheet.create` blocks may capture these once at import and
 * stay correct. React-native-web passes it through untouched by design:
 * `modules/isWebColor` returns true for anything starting `var(`, ahead of the
 * normaliser that would otherwise turn a colour into `rgba(...)`.
 *
 * The variables themselves are written by `ui/cssVariables.web.ts`, generated
 * from `palettes` below so that the CSS and this map cannot drift — there is
 * one set of colours in this file and no second copy anywhere.
 */
export const colors = Object.fromEntries(
  (Object.keys(dark) as (keyof typeof dark)[]).map((key) => [
    key,
    Platform.OS === 'ios'
      ? DynamicColorIOS({ light: light[key], dark: dark[key] })
      : Platform.OS === 'web'
        ? `var(--floor-${key})`
        : light[key],
  ])
) as Record<keyof typeof dark, ColorValue>;

/** Exported for the test that pins the two palettes to one set of keys. */
export const palettes = { dark, light };

export const spacing = (n: number) => n * 8;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    color: colors.textFaint,
  },
  muted: { fontSize: 13, color: colors.textMuted },
  mono: {
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'] as const,
  },
};

/**
 * Seconds, for the two clocks on the floor card.
 *
 * Both are under a minute by construction — a claim runs FLOOR_CLAIM_MS and a
 * cooldown at most FLOOR_CLAIM_DELAY_STEP_MS × FLOOR_CLAIM_DELAY_MAX_STEPS —
 * so `mm:ss` spent its left-hand digit saying nothing but zero, and "0:47"
 * asks the reader to parse a clock to learn a number. "47s" is the number.
 *
 * Separate from `formatDuration` rather than a mode of it: what makes this
 * safe is that these two durations are bounded, and nothing else on screen is.
 * A recording or a track passes a minute routinely and must keep the clock.
 */
export function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

/** mm:ss, for recordings, playback, and elapsed time. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
