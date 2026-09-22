import React from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MAX_RECORDING_NAME_LENGTH } from '../../../core/constants';
import type { RecordingView } from '../../../core/protocol';
import { shareRecording } from '../api/download';
import { api } from '../api/http';
import { useApp } from '../state/AppProvider';
import { CheckIcon } from './icons';
import { BodyHeightContext, segmentRowsFor, usePane } from './layout';
import { offsetToReveal } from './reveal';
import { colors, formatDuration, measure, radius, spacing, type } from './theme';

/**
 * The ordinary control: a filled rectangle with a word on it.
 *
 * **`icon` draws a glyph where the word would be, and the word does not
 * disappear — it stops being drawn.** `label` stays required and becomes the
 * `accessibilityLabel`, on exactly the reasoning `IconButton` below sets out:
 * a glyph with no name is a control only sighted users have, and the tests
 * that press these by name go on finding them. The callback is handed the
 * variant's foreground colour, so a glyph on `primary` comes out in `bg` and a
 * disabled one in `textFaint` without the caller knowing the palette — this
 * file decides the tone and `icons.tsx` decides the shape, as everywhere else.
 *
 * It is a glyph *instead of* the word rather than beside it: a row of icon
 * buttons is read as a group of shapes, and a shape with its own word next to
 * it is teaching what the shape already says.
 *
 * **Under it is the exception, and `sublabel` is how it is drawn** — the
 * recording transport since 2026-09-13, which is a glyph over its word in
 * the footer's shape. The argument above holds for a shape that can be
 * pressed and stops holding for one that is `disabled`, where the caption is
 * the only thing saying what is being refused; that transport is three
 * buttons of which two are usually grey. Note what this does to the
 * accessibility label below: a glyph is named by `label` whether or not a
 * `sublabel` is drawn, so the word on screen can be the short one and the
 * word a screen reader hears the fuller phrase.
 */
export function Button({
  label,
  onPress,
  disabled,
  variant = 'default',
  sublabel,
  icon,
  style,
}: {
  /** The word on the button — or, with `icon`, the word a screen reader says. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'floor' | 'danger';
  sublabel?: string;
  icon?: (color: ColorValue) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = {
    default: { bg: colors.surfaceRaised, fg: colors.text },
    primary: { bg: colors.text, fg: colors.bg },
    floor: { bg: colors.floor, fg: '#FFFFFF' },
    danger: { bg: colors.danger, fg: '#FFFFFF' },
  }[variant];

  const fg = disabled ? colors.textFaint : tone.fg;

  return (
    <Pressable
      accessibilityRole="button"
      // Only when the word is not on screen. A button that draws its label
      // reads it out along with any `sublabel` underneath, and naming it here
      // would silence that second line — which on *Play something together* is
      // the half that says what would happen. An `icon` button's `sublabel`
      // is silenced deliberately: `label` is the same act said in full, so
      // reading both would be a stutter.
      accessibilityLabel={icon ? label : undefined}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? colors.disabled : tone.bg },
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon ? (
        icon(fg)
      ) : (
        <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
      )}
      {sublabel ? (
        <Text
          style={[styles.buttonSublabel, { color: fg }]}
        >
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A header control that is a glyph rather than a word: *Close* and *Settings*,
 * which is the whole of what this is for as of 2026-09-02.
 *
 * **The label does not disappear, it stops being drawn.** It is still required,
 * and it is still the same word — it becomes the `accessibilityLabel`, so a
 * screen reader says "Close" exactly as before and the tests that press these
 * buttons by name go on finding them. A glyph with no name is a control only
 * sighted users have.
 *
 * **A glyph on nothing, which is the last of what `ghost` used to be.** These
 * two were the only controls that were ever ghost buttons in a header, and
 * when the variant was retired on 2026-09-21 they did not come with it: a
 * header control is chrome, and chrome in a filled rectangle is a second
 * button competing with the screen's own. So the tone lives here, on this
 * component, rather than as a variant of `Button` that one caller in the app
 * would still be reaching for. `Button` has no transparent fill any more; this
 * is not one of its variants and never was.
 *
 * It takes the icon as a function of the colour rather than as an element so
 * that this file, which knows the palette, keeps deciding the tone, and
 * `icons.tsx`, which knows the geometry, keeps deciding the shape — and so
 * that a pressed or disabled tint has somewhere to be applied. Nothing imports
 * the other.
 *
 * 44 square is the touch target, which is larger than the 40 the ghost button
 * it replaced stood at. The header is taller than either, so nothing moves;
 * what it buys is a target that does not need aiming at.
 */
export function IconButton({
  label,
  icon,
  onPress,
  disabled,
  style,
}: {
  /** What a screen reader says. The word this glyph replaced. */
  label: string;
  icon: (color: ColorValue) => React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon(disabled ? colors.textFaint : colors.textMuted)}
    </Pressable>
  );
}

/**
 * A square that is ticked or not, with its sentence beside it.
 *
 * The one control in this app whose whole job is to record that somebody said
 * yes on purpose, which is why it is a box rather than a `Segmented` of two or
 * a pair of buttons: an opt-in has to start clear and has to stay clear if
 * nobody touches it, and every other control here either has a value in force
 * already or is a commitment somebody presses once.
 *
 * The label is the touch target along with the square — a 22pt box is under
 * the 44 a finger is entitled to, and a sentence somebody has to aim past is
 * how a checkbox gets left unticked by accident rather than on purpose. The
 * whole row is one accessible element for the same reason, reporting itself
 * as a checkbox with `checked` on it, so a screen reader reads the sentence
 * and its state together rather than as a shape and a caption.
 *
 * Ticked fills with `text` and draws the tick in `bg`, which is the `primary`
 * button's tone and not a new one. It is deliberately not the violet: `floor`
 * is spent on the floor and on nothing else, and a box that borrowed it would
 * be the second thing on the screen claiming to be the mechanic. See STYLE.md
 * § *The economy of colour*.
 *
 * **`disabled` fades the words and leaves the square legible**, which is what
 * a `Segmented` does and for its reason: what is recorded here has to go on
 * being readable while it cannot be changed, and a box greyed along with its
 * sentence would take the answer away with the control. The caller says why
 * underneath, as § *Words on controls* requires of every disabled control.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Refuses the tap. The caller owes a sentence beside it saying why. */
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [
        styles.checkRow,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? <CheckIcon color={colors.bg} size={16} /> : null}
      </View>
      <Text
        style={[
          type.muted,
          styles.checkLabel,
          disabled && { color: colors.textFaint },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Keyboards with digits and no return key. */
function isKeypad(keyboardType?: string): boolean {
  return keyboardType === 'number-pad' || keyboardType === 'phone-pad';
}

export function Field({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  autoCapitalize = 'none',
  onSubmit,
  onBlur,
  submitLabel = 'done',
  multiline,
  editable = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  /** Return key submits the form this field belongs to. */
  onSubmit?: () => void;
  /**
   * Focus left the field. Where a screen saves as you go rather than behind a
   * button, this is the moment an edit is finished enough to keep.
   */
  onBlur?: () => void;
  submitLabel?: 'done' | 'go' | 'send' | 'next';
  /**
   * Grows to several lines, and the return key inserts a newline rather than
   * submitting — which is why `onSubmit` is ignored here: in prose a line
   * break is content.
   */
  multiline?: boolean;
  /**
   * Whether the field takes typing. False greys it and refuses focus, so it
   * reads like the disabled buttons beside it rather than like a field that
   * has stopped working — the caller is expected to say why underneath, which
   * is what every other disabled control here does.
   */
  editable?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      multiline={multiline}
      // Not on a number pad, which has no return key to label. Asking anyway
      // makes iOS float a detached "Go" pill above the keypad, over whatever
      // the screen was showing — on the sign-in screen it landed in the middle
      // of nothing, beside the button it duplicates. The form is submitted by
      // the button under the fields, which is where it has always been.
      returnKeyType={
        !multiline && onSubmit && !isKeypad(keyboardType)
          ? submitLabel
          : undefined
      }
      onSubmitEditing={multiline ? undefined : onSubmit}
      onBlur={onBlur}
      editable={editable}
      submitBehavior={multiline ? 'newline' : 'blurAndSubmit'}
      style={[
        styles.field,
        multiline && styles.fieldMultiline,
        !editable && styles.fieldDisabled,
      ]}
    />
  );
}

/**
 * A scrolling screen that the keyboard cannot sit on top of.
 *
 * Every screen here is a form somewhere down its length, and the button that
 * commits an edit is under the field it belongs to. A plain ScrollView does
 * not shrink when the keyboard opens, so that button ended up behind it, with
 * nothing to scroll into view because as far as the ScrollView is concerned
 * there is no more content — the space is there, the keyboard is merely
 * covering it. `padding` gives the ScrollView a real bottom to scroll to.
 *
 * `keyboardShouldPersistTaps="handled"` is the other half, and the part that
 * is easy to miss: by default the first tap outside a focused field only
 * dismisses the keyboard. Saving would take two taps — one swallowed, one
 * heard — which reads as the button not working.
 *
 * `keyboardDismissMode="on-drag"` because scrolling a long form is how you go
 * looking for something else, and arriving with the keyboard still up would
 * mean it covering whatever you scrolled to.
 */
export function Screen({
  children,
  contentStyle,
  header,
  footer,
  aside,
  asidePlace = 'above',
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * What stays put while the children scroll under it.
   *
   * A sibling above the ScrollView rather than an overlay on it, so it takes
   * its own height out of the viewport and nothing is ever hidden beneath it
   * — there is no inset to keep in step with a header whose height changes as
   * buttons appear and disappear. Omitted by every screen whose whole content
   * is meant to scroll, which is most of them.
   *
   * It sits inside the KeyboardAvoidingView, so a pinned header rises with the
   * keyboard rather than being pushed off the top of it.
   */
  header?: React.ReactNode;
  /**
   * The same thing at the other end, and the same reasoning: a sibling below
   * the ScrollView rather than an overlay on it, so it takes its own height
   * out of the viewport and nothing is ever hidden under it. A screen with a
   * footer therefore needs no bottom padding added to `contentStyle` to keep
   * its last card reachable, which is the bug an overlay would have.
   *
   * Inside the KeyboardAvoidingView too — and at the bottom that matters more
   * than it does at the top. A footer outside it would be covered by the
   * keyboard exactly when somebody is typing, which on the channel screen is
   * when they are pasting a link or naming a video and most likely to want to
   * mute themselves.
   *
   * The bottom safe-area inset is not this component's business: `App.tsx`
   * wraps everything in a `SafeAreaView` with `edges={['top', 'bottom']}`, so
   * the home indicator is already accounted for above this.
   */
  footer?: React.ReactNode;
  /**
   * Something that lives between the header and the body, or over the body,
   * and survives whatever the body does.
   *
   * **One slot at one depth, which is the whole point of it.** Its only
   * caller is the watch party's picture, and since 2026-09-19 what goes in
   * here is the *hole* the picture is drawn into rather than the picture
   * itself. The player hangs above the route table — `watch/Picture.tsx` —
   * because a `WebView` is rebuilt the instant it is reparented, and a player
   * mounted inside a screen is one that going Home tears down.
   *
   * **Above the scroll and outside the measured frame**, so that the row takes
   * its own height out of the body exactly as the header takes its own out of
   * the viewport, and nothing is ever hidden beneath it — the rule this
   * component exists to keep. Taking that height out is now the whole of the
   * slot's job: the picture is positioned over the application and can no
   * longer reserve anything. Before the scroll rather than after it so the row
   * reads as pinned under the header rather than as a footer, and outside the
   * frame because that one is what `reveal` measures against.
   *
   * **Above the scroll or beside it, since 2026-09-20.** See {@link asidePlace}
   * — a wide pane puts the film next to its transport rather than on top of
   * it, and every sentence above about taking height out of the body is the
   * `above` case.
   */
  aside?: React.ReactNode;
  /**
   * Which way the aside and the scroll are stacked.
   *
   * `above` is the original and the default: the aside takes its own height
   * out of the body, and the scroll gets what is left. `beside` puts the two
   * in a row, so the aside takes *width* and the scroll keeps the full height
   * — which is what a pane wide enough for both is for. `watchShapeFor` in
   * `layout.ts` decides which, and `ChannelView` passes the answer down.
   *
   * It changes nothing about `reveal`: the frame is measured in window
   * coordinates and only its top is read, which a row leaves alone.
   */
  asidePlace?: 'above' | 'beside';
}) {
  const scroll = React.useRef<ScrollView>(null);
  /** The room the aside and the scroll share; see the `onLayout` below. */
  const [bodyHeight, setBodyHeight] = React.useState(0);
  /**
   * The scroll view's own frame, which has to be measured rather than
   * inferred: `reveal` works in window coordinates, and this is what converts
   * them back into offsets within the content.
   */
  const frame = React.useRef<View>(null);
  /** Where the content currently sits under that frame. */
  const viewport = React.useRef({ offset: 0, height: 0 });

  /**
   * Brings a region of the content wholly into view, if it is not already.
   *
   * Offered rather than imposed: only the caller knows when something has
   * grown. A recording row expands twice — once into its actions, once into a
   * rename field with a Save button under it — and both used to appear below
   * the fold, the second under the keyboard, leaving the person to scroll to
   * the control they had just asked for.
   */
  const reveal = React.useCallback((node: React.RefObject<View | null>) => {
    const target = node.current;
    const container = frame.current;
    if (!target || !container) return;

    // Window coordinates, deliberately. `onLayout` reports a position relative
    // to the immediate parent, and a recording card sits inside the list's own
    // View — so its `y` is an offset within that list, not within the content.
    // Feeding that to the arithmetic scrolled almost to the top and took the
    // card off screen, which is how this was found.
    target.measureInWindow((_x, cardTop, _w, height) => {
      container.measureInWindow((_cx, frameTop) => {
        const top = cardTop - frameTop + viewport.current.offset;
        const to = offsetToReveal({ top, height }, viewport.current);
        if (to !== null) scroll.current?.scrollTo({ y: to, animated: true });
      });
    });
  }, []);

  /**
   * The list pane does not move for a keyboard that is not its own.
   *
   * iOS reports one keyboard frame for the window, not one per pane — so with
   * both panes avoiding it, typing into the composer on the right shortened
   * Home on the left as well, for a keyboard nothing on that side had asked
   * for. The detail pane is where every field in this application lives; the
   * list is names and a way in.
   *
   * Null outside a split, which is every phone, so this is inert there.
   */
  const pane = usePane();

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // Android resizes the window itself, so asking for padding as well
      // double-counts the keyboard and leaves a gap the height of it.
      behavior={
        Platform.OS === 'ios' && pane !== 'list' ? 'padding' : undefined
      }
    >
      <RevealContext.Provider value={reveal}>
        {header}
        {/*
          The body: whatever the `aside` is, and the scroll under or behind
          it. **The wrapper is what the aside is positioned against** — an
          `aside` that floats is `position: absolute` within this, so it
          covers the scroll and never the pinned rows above and below it.
        */}
        <View
          style={[
            styles.screen,
            asidePlace === 'beside' && styles.bodyBeside,
          ]}
          /*
            **The room the aside and the scroll share**, published so the
            picture can size itself against it. The body's own height, not the
            scroll's: the scroll is what is left after the aside, so sizing the
            aside from it would be sizing it from itself, and the picture would
            shrink towards nothing a frame at a time. This one is the pane less
            the header, the tabs and the footer, and no aside changes it.
          */
          onLayout={(event) => {
            const next = event.nativeEvent.layout.height;
            setBodyHeight((was) => (was === next ? was : next));
          }}
        >
        <BodyHeightContext.Provider value={bodyHeight}>
        {aside}
        {/* `collapsable={false}` keeps this view in the native tree, without
            which it cannot be measured. **And it is around the scroll alone,
            not around the aside**: `reveal` converts window coordinates into
            offsets within the content by subtracting this view's own top, so
            a pinned row inside it would put every reveal out by the height of
            that row. */}
        <View ref={frame} collapsable={false} style={styles.screen}>
        <ScrollView
          ref={scroll}
          style={styles.screen}
          // The measure, applied once for every screen in the app. Second, so
          // a screen that needs a narrower column of its own can still say so.
          contentContainerStyle={[contentStyle, styles.measure]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // The height shrinks when the keyboard opens, which is exactly the
          // measurement `reveal` needs and the reason it is read here rather
          // than from the window.
          onLayout={(e) => {
            viewport.current.height = e.nativeEvent.layout.height;
          }}
          scrollEventThrottle={16}
          onScroll={(e) => {
            viewport.current.offset = e.nativeEvent.contentOffset.y;
          }}
        >
          {children}
        </ScrollView>
        </View>
        </BodyHeightContext.Provider>
        </View>
        {footer}
      </RevealContext.Provider>
    </KeyboardAvoidingView>
  );
}

/**
 * How a card asks to be seen. Null outside a `Screen`, where there is nothing
 * to scroll and asking is a no-op rather than an error.
 *
 * **The provider is inside `Screen`'s own tree, which is the trap.** A
 * component that *renders* `<Screen>` sits above it and reads the default —
 * so `useReveal` there returns the no-op and every request it makes is
 * dropped in silence. Only a *child* of the screen can ask. The notepad card
 * shipped the wrong way round on 2026-09-13 and looked, from the outside,
 * exactly like a reveal that had been written and did not work: the wrapper
 * was in place, the keyboard listener fired, and the function it called did
 * nothing whatsoever. `Reveal` is the child for a card that has no component
 * of its own to be one; `useRevealOnKeyboard` says so when it is called from
 * the wrong side.
 */
const RevealContext = React.createContext<
  ((node: React.RefObject<View | null>) => void) | null
>(null);

export function useReveal(): (node: React.RefObject<View | null>) => void {
  const reveal = React.useContext(RevealContext);
  return reveal ?? (() => {});
}

/**
 * **Revealing the card**, which is the name for what this file had solved
 * twice without one: when a keyboard opens over a form, scroll the *card* into
 * view rather than the field.
 *
 * The unit is the point. A keyboard-aware scroll view brings the focused field
 * in and stops there, which leaves the button under it — Save, Send ping —
 * beneath the keyboard, and that is the control the person is reaching for.
 * The two halves of the technique are `Screen` (a viewport that shrinks, with
 * a real bottom to scroll to) and `offsetToReveal` (move by the least that
 * brings the whole region's bottom edge inside), and this hook is the trigger
 * that joins them.
 *
 * `keyboardDidShow` rather than the focus that preceded it, deliberately: the
 * keyboard arrives after the field does and is what shortens the viewport, so
 * a reveal measured at focus measures against a screen that is about to get
 * smaller and reveals into space the keyboard then takes back.
 *
 * Pass whether the form that would raise it is on screen — a rename in
 * progress, a composer showing — not whether the field has focus, which the
 * keyboard's own arrival already implies. Attach the returned ref to a View
 * around the whole card, with `collapsable={false}` so it survives into the
 * native tree and can be measured.
 *
 * **Call it from a component inside the screen, not from the one that renders
 * `<Screen>`** — see `RevealContext`. A card with no component of its own
 * wants `Reveal`, which is that component. Getting this wrong is silent, so
 * it is said out loud here instead: in a development build the first reveal
 * that has nowhere to go writes a line naming the component.
 */
export function useRevealOnKeyboard(
  active: boolean
): React.RefObject<View | null> {
  const reveal = React.useContext(RevealContext);
  const card = React.useRef<View>(null);

  React.useEffect(() => {
    if (!active) return;
    if (!reveal) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[reveal] asked for outside a Screen, so nothing will move. ' +
            'useRevealOnKeyboard has to be called from a component *inside* ' +
            'the screen — the one that renders <Screen> is above the ' +
            'provider. Wrap the card in <Reveal> instead.'
        );
      }
      return;
    }
    const shown = Keyboard.addListener('keyboardDidShow', () => reveal(card));
    return () => shown.remove();
  }, [active, reveal]);

  return card;
}

/**
 * A card that comes into view when the keyboard opens over it.
 *
 * The component form of `useRevealOnKeyboard`, and the one to reach for: it is
 * rendered among the screen's children, which is the side of `RevealContext`
 * the request has to be made from, so it cannot be wired up the way the
 * notepad and the ping card both were — from the component that renders the
 * screen, where the hook reads the default and the reveal goes nowhere.
 *
 * Wrap the whole card, label and all. The unit is what has to be visible: a
 * reveal that stopped at the field would leave the button that commits it
 * under the keyboard, which is the control being reached for.
 *
 * `when` is whether the form that would raise the keyboard is on screen — a
 * composer showing, a box open — not whether the field has focus.
 */
export function Reveal({
  when,
  children,
}: {
  when: boolean;
  children: React.ReactNode;
}) {
  const card = useRevealOnKeyboard(when);
  // `collapsable={false}` keeps the view in the native tree, without which it
  // cannot be measured.
  return (
    <View ref={card} collapsable={false}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={[type.label, styles.sectionLabel]}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * The rows a set of options is laid out in, which is one until it cannot be.
 *
 * **Balanced rather than filled.** Six options are three and three, not four
 * and two — a short row beside a full one reads as an afterthought stuck on
 * the end, and its segments come out half again as wide as the ones above for
 * no reason anybody can see. Five are three and two, which is the closest
 * balance an odd number has.
 *
 * Two rows at most, because the caller that wants more than one row wants six
 * tabs and a third row would be a menu. Exported for its own test: the
 * arithmetic is two lines and the shape it produces is the whole of how the
 * channel screen's tabs look.
 *
 * **Whether to split at all is a width now, and was a count until
 * 2026-09-20.** `MAX_PER_ROW = 4` is gone; it argued its own case in points —
 * "a fifth on a phone leaves each of them about forty points, which is not a
 * word" — with a phone's width assumed throughout, so on a 740-point iPad
 * pane it bought a second row nothing needed and the watch card paid for it in
 * fold. `segmentRowsFor` in `layout.ts` is that sentence with the assumption
 * taken out.
 */
export function segmentRows<T>(
  options: readonly T[],
  width: number
): T[][] {
  if (segmentRowsFor(options.length, width) === 1) return [options.slice()];
  const perRow = Math.ceil(options.length / 2);
  return [options.slice(0, perRow), options.slice(perRow)];
}

/**
 * A segmented control: one track, two or more halves, and the selected one
 * raised out of it rather than coloured.
 *
 * **A switch rather than buttons that navigate.** What it is for is a set of
 * peers — two views onto the same thing, neither of which is a child of the
 * other — and the accent is deliberately withheld: purple is what this app
 * spends on a room somebody is standing in, and a selected half competing
 * with that would be the quieter fact shouting louder.
 *
 * `accessibilityState` rather than a word in the label, so a screen reader
 * announces the selection itself — "Members, selected, button". Every segment
 * stays pressable when selected: a control that goes inert where you already
 * are is one people press twice wondering whether it registered.
 *
 * **One track or two, and never a scroller.** The channel screen carries six
 * of these, which is more than a phone's width will spell, and the answer is
 * a second row rather than a strip that drags sideways. A tab you have to find
 * by dragging is a tab most people never learn is there, and it breaks the
 * rule the footer on that same screen is built on: position is what a set of
 * fixed controls is for, and one that moves under a finger already on its way
 * is the wrong one pressed. Two rows keep every tab visible and every tab
 * still. See `segmentRows`.
 *
 * **A glyph above the word where a caller offers one, since 2026-09-12**, and
 * the construction is the channel footer's rather than a second one invented
 * here: same 22px Lucide glyph in a 24px box, same 11pt caption under it, same
 * reasoning about which of the two is doing the work. The label is what makes
 * the icon legible the first time and the icon is what makes it findable
 * after that, so neither half is ever dropped — an icon-only tab bar is one
 * where the third tab is a guess.
 *
 * `icon` is optional per option and absent for Home's two-way switch, which
 * has two halves of one question rather than six destinations; the labels
 * carry that on their own and a glyph over each would be decoration. A caller
 * gives every option one or none: a row with a gap in it draws two different
 * heights of segment.
 *
 * Extracted from HomeView's channels/contacts switch when the channel screen
 * needed the same thing, so the two cannot drift apart.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  role,
  disabled,
}: {
  options: readonly {
    value: T;
    label: string;
    /**
     * Drawn above the label, and handed the colour the label is about to take
     * so the two cannot disagree — which is the same contract `FooterAction`
     * has with its icons, for the same reason.
     */
    icon?: (color: ColorValue) => React.ReactNode;
    /**
     * That this tab has something waiting on it, in the words a screen reader
     * gets: draws the dab, and is appended to the label in the announcement.
     *
     * **A string rather than a boolean, so that a mark cannot exist without
     * words for it.** The dab carries a bare `!`, which is a shape rather than
     * a sentence — and a mark that says *something* while announcing nothing
     * is one that costs a screen reader the tab and gives it nothing back.
     * Presence is what draws it, so the two cannot come apart.
     *
     * **It says that something is waiting, never how much.** Home's two marks
     * are a request to answer and an answer come back; the first is already
     * enumerated by the *Requests* section one tap away, and the second cannot
     * be counted at all without the help screen gaining the unread marks it
     * says at length it does not have. What a tab owes is *go and look*.
     *
     * Only Home passes it. The channel screen's six tabs share this control and
     * hand it nothing, so nothing there changes.
     */
    badge?: string;
  }[];
  value: T;
  onChange: (value: T) => void;
  /**
   * What this set of segments *is*, which is two different things wearing one
   * shape.
   *
   * `tabs` — the default, and what both tab strips are — swaps the body of
   * the screen. `choice` answers a question that is on the screen already:
   * the watch card's *Watch on*, whose two segments are an answer to a
   * labelled question and not a way to somewhere else. A screen reader is
   * told which, because "tab" and "one of two answers" are not the same
   * announcement, and somebody who cannot see the track has nothing else to
   * tell them apart.
   *
   * **A `choice` is not a tab to the view harness either**: `findButton`
   * excludes anything inside a `tablist` so that an *Invite* tab and an
   * *Invite* button can share a screen, and a choice that claimed the role
   * would go missing from the tests of the card it belongs to.
   */
  role?: 'tabs' | 'choice';
  /**
   * Refuses every answer, the whole control at once.
   *
   * **Not per-option**, because a set with one answer left is not a choice
   * and should not be drawn as one. The track and the raised segment stay
   * exactly as they are and only the words fade: what is chosen has to go on
   * being legible while it cannot be changed, that being the whole of what a
   * refused switch has to say. `colors.disabled` behind it — what a `Button`
   * does — would take the answer with it.
   *
   * A caller says why in a sentence beside it, as every disabled control
   * here does. See STYLE.md § *Words on controls*.
   */
  disabled?: boolean;
}) {
  const tabs = role !== 'choice';
  /*
    **How wide this control is, which is what decides how many rows it takes.**
    Measured rather than assumed: the same six tabs are two rows on a phone and
    one on any iPad pane, and nothing but the width tells them apart.

    Measuring itself is safe here and would not be for the picture — the row
    count does not change how wide this is, so there is no answer feeding back
    into its own input. Zero until the first layout, which `segmentRowsFor`
    reads as *be cautious* and answers with two rows; a set that fits then
    settles into one on the frame after, which nobody sees.
  */
  const [width, setWidth] = React.useState(0);
  return (
    // `tablist`, so a screen reader announces the set as one switch rather
    // than as loose buttons — and so a test can tell a tab from a control on
    // the pane below it, which since 2026-09-12 can carry the same word: the
    // channel screen's *Invite* tab and the *Invite* button on it. See
    // `tabInstances` in the view harness.
    <View
      accessibilityRole={tabs ? 'tablist' : 'radiogroup'}
      style={styles.segmented}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setWidth((was) => (was === next ? was : next));
      }}
    >
      {segmentRows(options, width).map((row) => (
        // Keyed by the row's own first option rather than by its index, so a
        // set that gains or loses one does not hand a row's identity to a
        // different row. The channel screen's six tabs are fixed since the
        // watch tab left Labs, but the choice rows are not.
        <View key={row[0].value} style={styles.segmentRow}>
          {row.map((option) => {
            const on = value === option.value;
            const color = disabled
              ? colors.textFaint
              : on
                ? colors.text
                : colors.textMuted;
            return (
              <Pressable
                key={option.value}
                accessibilityRole={tabs ? 'button' : 'radio'}
                // `selected` is the word for a tab and `checked` the word for
                // one answer of several; a reader given the wrong one says
                // nothing about the state at all.
                // `disabled` only when it is, so the two tab strips — which
                // are never refused — announce exactly what they always did.
                accessibilityState={{
                  ...(tabs ? { selected: on } : { checked: on }),
                  ...(disabled ? { disabled: true } : {}),
                }}
                disabled={disabled}
                // Spelled out only when there is a dab, so the six tabs that
                // have none keep announcing their label and nothing else.
                accessibilityLabel={
                  option.badge ? `${option.label}, ${option.badge}` : undefined
                }
                onPress={() => onChange(option.value)}
                style={({ pressed }) => [
                  styles.segment,
                  on && styles.segmentOn,
                  pressed && !disabled && styles.segmentPressed,
                ]}
              >
                {option.icon ? (
                  <View style={styles.segmentIcon}>{option.icon(color)}</View>
                ) : null}
                {/*
                  The label wears its own box so the dab can be positioned
                  against the *word* rather than against the segment. A segment
                  is a third of the track and a label is as wide as it reads, so
                  anchoring to the segment would leave the mark floating in
                  whitespace on the short labels and touching the neighbour on
                  the long ones. This way it sits off the leading edge of the
                  text and needs nothing measured.
                */}
                <View style={styles.segmentLabelBox}>
                  <Text
                    style={[
                      styles.segmentLabel,
                      option.icon && styles.segmentLabelUnderIcon,
                      on && styles.segmentLabelOn,
                      disabled && styles.segmentLabelOff,
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  {option.badge ? (
                    <View style={styles.dab}>
                      {/*
                        `allowFontScaling={false}`: the disc is a fixed 18 and a
                        glyph that grows past it is a clipped mark rather than a
                        bigger one. What the setting is for is the label beside
                        it, which does scale.
                      */}
                      <Text style={styles.dabGlyph} allowFontScaling={false}>
                        !
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={[type.muted, styles.empty]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  /**
   * The aside beside the scroll rather than above it.
   *
   * A row, and nothing else: the aside sizes itself and the scroll takes the
   * slack, which is `flex: 1` on the frame around it and already true. The gap
   * belongs to the aside — `COLUMN_GAP` is inside the arithmetic that decided
   * this — so nothing here spends one and the two columns cannot disagree
   * about how far apart they are.
   */
  bodyBeside: { flexDirection: 'row' },
  measure,
  button: {
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(2),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(1),
    paddingVertical: spacing(1),
    minHeight: 44,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  // Lifted by a point so the first line of the sentence sits level with the
  // square rather than with the top of its box.
  checkLabel: { flex: 1, lineHeight: 20, marginTop: 1 },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  buttonSublabel: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.85,
    fontVariant: ['tabular-nums'],
  },
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.5),
    fontSize: 16,
    color: colors.text,
    minHeight: 48,
  },
  fieldDisabled: {
    backgroundColor: colors.disabled,
    color: colors.textMuted,
  },
  fieldMultiline: {
    minHeight: 108,
    paddingTop: spacing(1.5),
    textAlignVertical: 'top',
  },
  sectionLabel: {
    textTransform: 'uppercase',
    marginBottom: spacing(0.75),
    marginTop: spacing(2),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
  },
  segmented: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  // One row of segments. A control that fits on one track has exactly one of
  // these, and draws identically to the single flex row this was before it
  // could wrap.
  segmentRow: { flexDirection: 'row', gap: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(0.75),
    borderRadius: radius.sm,
  },
  segmentOn: { backgroundColor: colors.surfaceRaised },
  segmentPressed: { opacity: 0.7 },
  /**
   * A fixed box around a 22px glyph, so a row's icons sit on one line whatever
   * their own proportions are. The footer's `footerIcon` is the same box, and
   * they are two rather than one because this file may not import that screen.
   */
  segmentIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  /**
   * The box the dab is positioned against: the label's own bounds, which is
   * what makes the mark follow the word. `position: 'relative'` is the RN
   * default and is written out because the absolute child below depends on it.
   */
  segmentLabelBox: { position: 'relative' },
  /**
   * The dab: something is waiting on this tab.
   *
   * **A disc carrying an `!`, off the leading edge of the label and clear of
   * it.** It was a rose lozenge laid over the trailing end of the word until
   * 2026-09-15, on the argument that a shape slightly in the way of a label is
   * a thing asking where a dot beside it is a thing reporting. The argument
   * held; the execution did not. A mark over the word obscures the word, which
   * on *Contacts* and *Support* clipped the letter that distinguishes them,
   * and a blank lozenge still had to be read as a shape and guessed at. The
   * `!` says *asking* outright, so the mark no longer has to say it by being
   * in the way, and can go where nothing is lost: up and to the left, where
   * the eye reaches the tab before the word rather than after it.
   *
   * 18 across at `radius.pill`, which is larger than every mark in STYLE.md
   * § *Dots, pills and rules* and deliberately so — those are all 8 to 10, and
   * all of them are dots rather than a glyph in a disc.
   *
   * `left: -19` clears the 18pt disc of the first glyph with a point in hand;
   * `top: -9` lifts it to sit above the cap height. On a 375pt screen a
   * segment is ~110 and a 14pt semibold label ~62, so the ~24pt of whitespace
   * on the leading side of the word takes the disc without reaching the 3pt
   * gap or the track's edge. Nothing in this control sets `overflow: 'hidden'`,
   * which is what lets it draw outside the label's box at all.
   *
   * The same on a selected segment as an unselected one: the dab is about what
   * the tab holds, not about where you are standing.
   */
  dab: {
    position: 'absolute',
    top: -9,
    left: -19,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.waiting,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The `!`, in the one place in the app that draws a white glyph on `waiting`.
   * 12 bold in an 18pt disc, with the line height pinned to the disc so that
   * the platform's own leading cannot push it off centre.
   */
  dabGlyph: {
    color: colors.surface,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  segmentLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  /**
   * 11px under a glyph, which is the footer's caption size and is right here
   * for the footer's reason: the glyph has already said it, and the pair is
   * what gets read. A segment with no icon keeps the 14px above, that being
   * the whole of what it has to say.
   */
  segmentLabelUnderIcon: { fontSize: 11 },
  segmentLabelOn: { color: colors.text },
  // Last in the list, so it wins over `segmentLabelOn`: a refused switch
  // fades both of its words and keeps the raised segment to say which is
  // which.
  segmentLabelOff: { color: colors.textFaint },
  empty: { paddingVertical: spacing(2) },
});

/**
 * A finished recording, with the control that turns it into a file.
 *
 * Here rather than in `ChannelView.tsx`, which is now its only production
 * consumer, because it shares `recordingStyles` with `TranscriptSearch` below
 * it. It was shared for a second reason until the floor passed 21: Home drew
 * recordings too, and a recording must not be called one thing on one screen
 * and something else on the other.
 */
export function RecordingRow({
  recording,
  playable = false,
  playDisabled = false,
  playDisabledReason,
  manageable = true,
  onOpenTranscript,
}: {
  recording: RecordingView;
  /** Whether this row can be played into the room. */
  playable?: boolean;
  /** Whoever holds the floor decides what plays, and this says when that is not you. */
  playDisabled?: boolean;
  playDisabledReason?: string;
  /**
   * Whether renaming and deleting are yours to do — `hasTheRoom` at the
   * channel this was recorded in. Both change what everybody else's list says,
   * and one of them cannot be undone, so neither is for a member standing
   * outside a conversation in progress.
   *
   * Defaults to true, which is what a row outside a live channel wants: a
   * recording whose channel has ended has nobody in it to interrupt, and the
   * server says the same thing by way of `hasTheRoomIn`.
   *
   * Sharing is deliberately not covered. It is a read, it changes nothing
   * anybody in the room can see, and refusing somebody their own conversation
   * because two other people are talking would be a rule with no injury behind
   * it.
   */
  manageable?: boolean;
  /**
   * Opens this recording's transcript, when there is a screen to open it on.
   *
   * Absent leaves the row able to *start* one and not to read it, which is not
   * a state worth having — so the button is withheld entirely without this.
   */
  onOpenTranscript?: () => void;
}) {
  /**
   * Closed until asked. A recording is a thing you mostly scan past — the list
   * is the point, and three buttons per row turned a list of what was said
   * into a wall of controls. Tapping one opens it, and only one row's worth of
   * actions is ever on screen at a time.
   *
   * It also puts delete somewhere that takes a deliberate act to reach, which
   * matters more than the tidiness: it is the one action here that cannot be
   * undone from inside the app.
   */
  const [open, setOpen] = React.useState(false);
  /**
   * The rename field takes the place of the actions rather than joining them,
   * so a row is either offering things to do or asking for a name — never a
   * text box wedged between Share and Delete, with Delete a thumb's width
   * from a keyboard somebody is typing into.
   */
  const [renaming, setRenaming] = React.useState(false);

  const reveal = useReveal();
  /**
   * Measured, not laid out — see `Screen`'s `reveal`. The rename field is the
   * keyboard half, and `useRevealOnKeyboard` owns it; this ref is shared with
   * the growth half below, which has nothing to do with a keyboard.
   */
  const row = useRevealOnKeyboard(renaming);
  /** Set when something has grown, cleared by the layout that follows it. */
  const wants = React.useRef(false);

  return (
    <View
      ref={row}
      // Kept in the native tree so it can be measured.
      collapsable={false}
      onLayout={() => {
        if (!wants.current) return;
        wants.current = false;
        reveal(row);
      }}
    >
    <Card style={recordingStyles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${recording.name}, ${formatDuration(
          recording.durationMs
        )}. ${open ? 'Hide actions' : 'Show actions'}.`}
        onPress={() => {
          // Collapsing abandons a rename in progress, so reopening the row
          // offers the actions again rather than the half-typed name of
          // whatever the person had changed their mind about.
          setRenaming(false);
          setOpen((current) => {
            // Only opening needs revealing. Closing can only make the card
            // smaller, and scrolling after it would move the list under a
            // finger that asked for nothing of the sort.
            if (!current) wants.current = true;
            return !current;
          });
        }}
        style={({ pressed }) => (pressed ? recordingStyles.pressed : undefined)}
      >
        <View style={recordingStyles.main}>
          {/*
            Decided when the run stopped and the same for everybody who was in
            it, so two people can talk about one recording by one name.
          */}
          <Text style={recordingStyles.name} numberOfLines={1}>
            {recording.name}
          </Text>
          <Text style={type.muted}>
            {new Date(recording.startedAt).toLocaleString()} ·{' '}
            {formatDuration(recording.durationMs)}
          </Text>
        </View>
      </Pressable>

      {open && renaming ? (
        <RenameEditor recording={recording} onDone={() => setRenaming(false)} />
      ) : null}

      {open && !renaming ? (
        <View style={recordingStyles.actions}>
          {playable ? (
            <PlayButton
              recording={recording}
              disabled={playDisabled || !!recording.mixing}
            />
          ) : null}
          <ShareButton recording={recording} disabled={!!recording.mixing} />
          <Button
            label="Rename"
            disabled={!manageable}
            onPress={() => {
              // The field is taller than the actions it replaces, and the
              // keyboard takes the bottom of the screen as it arrives — so the
              // card has to be brought in against a viewport that is about to
              // shrink. `Screen` reads that height from its own layout, which
              // changes for the same reason and at the same time.
              wants.current = true;
              setRenaming(true);
            }}
          />
          <TranscriptButton
            recording={recording}
            manageable={manageable}
            onOpen={onOpenTranscript}
          />
          <DeleteButton recording={recording} disabled={!manageable} />
          {/*
            Only on a channel that has declared itself public — the server
            sends this field only then, so an ordinary channel's rows are
            untouched. Below Delete because it is the rarer act and the one
            that wants a deliberate reach.
          */}
          <PublishControl recording={recording} />
          {/*
            Said once, beside the two controls it applies to. Renaming and
            deleting are unaffected — they are about the row rather than the
            audio — so a recording that has only just stopped is not a card you
            can do nothing with.
          */}
          {recording.mixing ? (
            <Text style={type.muted}>
              Still being prepared — playing and sharing will be available in
              a moment.
            </Text>
          ) : null}
          {/*
            Beside the disabled button rather than up in the summary line,
            where it was explaining a control that is no longer visible until
            somebody asks for it.
          */}
          {playable && playDisabled && playDisabledReason ? (
            <Text style={type.muted}>Play is unavailable — {playDisabledReason}.</Text>
          ) : null}
          {/*
            Share is missing from this sentence on purpose, and it is the one
            button on the row still working — see `manageable`.
          */}
          {manageable ? null : (
            <Text style={type.muted}>
              Step in to rename or delete. The name is everybody's, and
              deleting takes it out of their lists too.
            </Text>
          )}
        </View>
      ) : null}
    </Card>
    </View>
  );
}

/**
 * Renames a recording, in place of the row's actions.
 *
 * Inline rather than an `Alert.prompt`, which would have been three lines:
 * that is iOS-only, and every other confirmation in this app is an
 * `Alert.alert` that the tests drive by pulling its buttons out of a spy —
 * a prompt is the one shape that has neither an Android answer nor a way to
 * be exercised. A field in the row is also what naming a *channel* looks
 * like, one screen away.
 *
 * Starts on the current name rather than empty, because renaming is usually
 * amending: "Standup" becomes "Standup, Tuesday". Nothing is done locally on
 * success — the server pushes a snapshot carrying the new name, and it
 * carries it to everybody else in the channel at the same moment.
 */
function RenameEditor({
  recording,
  onDone,
}: {
  recording: RecordingView;
  onDone: () => void;
}) {
  const app = useApp();
  const [name, setName] = React.useState(recording.name);
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    if (!app.token || name.trim() === '') return;
    setBusy(true);
    try {
      await api.renameRecording(app.token, recording.id, name);
      onDone();
    } catch (e) {
      Alert.alert(
        'Could not rename',
        e instanceof Error ? e.message : String(e)
      );
      // Left open on failure, with what was typed still in it, so a name that
      // was refused can be fixed rather than retyped.
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={recordingStyles.actions}>
      <Field
        value={name}
        onChangeText={(v) => setName(v.slice(0, MAX_RECORDING_NAME_LENGTH))}
        placeholder="What was this conversation?"
        autoCapitalize="sentences"
        autoFocus
        onSubmit={() => void save()}
      />
      {/*
        Said before the tap rather than after it: everyone in the channel
        reads this name, and the person retitling their own recording has no
        other reason to expect that.
      */}
      <Text style={type.muted}>Everyone in this channel sees the new name.</Text>
      <Button
        label={busy ? 'Renaming…' : 'Save'}
        variant="primary"
        disabled={busy || name.trim() === ''}
        onPress={() => void save()}
      />
      <Button label="Cancel" disabled={busy} onPress={onDone} />
    </View>
  );
}

/**
 * Marks a recording for deletion, which is what deleting one means here: it
 * leaves every list at once, and the sweep removes the audio a week later.
 *
 * Confirmed first, and the confirmation says what the week is for. This is the
 * only action in the app that destroys somebody else's copy of something —
 * a recording belongs to the channel, so every member loses it, not just
 * whoever tapped.
 */
function DeleteButton({
  recording,
  disabled = false,
}: {
  recording: RecordingView;
  disabled?: boolean;
}) {
  const app = useApp();
  const [busy, setBusy] = React.useState(false);

  const remove = async () => {
    if (!app.token) return;
    setBusy(true);
    try {
      await api.deleteRecording(app.token, recording.id);
      // Nothing to do on success: the server pushes a fresh snapshot without
      // this recording in it, and the row goes with it.
    } catch (e) {
      Alert.alert(
        'Could not delete',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      label={busy ? 'Deleting…' : 'Delete'}
      variant="danger"
      disabled={busy || disabled}
      onPress={() =>
        Alert.alert(
          `Delete ${recording.name}?`,
          'Everyone in this channel loses it. The audio is removed a week from now, and nothing in the app can bring it back.',
          [
            { text: 'Keep', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void remove() },
          ]
        )
      }
    />
  );
}

/**
 * The viewer's own agreement that this recording may be published, and the
 * state of everybody else's.
 *
 * **Not a publish button, and the difference is the whole design.** Nobody
 * here can publish a recording; a recording publishes itself once every
 * participant has agreed, which is why the control is a checkbox about you
 * and the line beneath it is about everybody. The alternative — a Publish
 * button that refuses until the others catch up — would offer an act that is
 * not yours to perform and then decline to perform it.
 *
 * **The warning is on the way in, not the way out.** Withdrawing takes the
 * episode off the page and out of the feed and reaches no copy anybody has
 * already downloaded, and that asymmetry is the one fact somebody needs
 * *before* they agree rather than after. So it is in the confirmation, in
 * those words, and agreeing is the tap that carries it.
 *
 * Absent entirely on a channel that has not declared itself public: the
 * server sends the field only then, and a consent control on a channel with
 * no page would be asking somebody to agree to something that cannot happen.
 * Absent for the same reason for a member who was not in this recording —
 * `required` is recomputed from who took part, so theirs is an agreement
 * nothing counts. See `asked` below.
 */
function PublishControl({ recording }: { recording: RecordingView }) {
  const app = useApp();
  const [busy, setBusy] = React.useState(false);
  const publication = recording.publication;
  if (!publication) return null;

  // Somebody spoke here as a guest with no account, so there is nobody to
  // ask and no amount of agreeing will change it. Said here rather than left
  // as a refusal after the tap, because it is a fact about the conversation.
  //
  // Narrow on purpose: a guest who only listened is not in the audio, and a
  // guest who was signed in is asked like anybody else. See `blockedByGuest`.
  if (publication.blockedByGuest) {
    return (
      <Text style={type.muted}>
        Somebody spoke here as a guest without an account, so this one cannot
        be published — there is nobody to ask.
      </Text>
    );
  }

  const outstanding = publication.required.filter(
    (person) => !publication.consented.some((agreed) => agreed.id === person.id)
  );

  // Somebody in the channel who was not in *this* recording: they joined
  // afterwards, or they were here and never opened their microphone. None of
  // their voice is in the audio, so `required` does not name them and their
  // agreement is not one the server can count — `stateOf` recomputes the set
  // from who took part and drops a consent from anybody else.
  //
  // **The control used to be offered to them anyway**, which is how this was
  // found: the tick wrote a row that `mine` then refused to read back, so the
  // checkbox came back empty on the next snapshot and looked like a save that
  // had not saved. The state below is the honest one — the recording's
  // progress, and no offer to take part in a decision that is not theirs.
  const asked = publication.required.some(
    (person) => person.id === app.me?.id
  );

  const status = publication.publishedAt
    ? publication.preparing
      ? 'Published — the audio is still being prepared.'
      : 'Published. Anybody with the address can listen.'
    : outstanding.length === 0
      ? 'Everybody has agreed — this is going up now.'
      : `Waiting on ${outstanding
          .map((person) => person.displayName)
          .join(', ')}. It goes up when everybody has agreed.`;

  if (!asked) {
    return (
      <Text style={type.muted}>
        None of your voice is in this one, so it does not need your agreement.{' '}
        {status}
      </Text>
    );
  }

  const set = async (agreed: boolean) => {
    setBusy(true);
    try {
      await app.setPublishConsent(recording.id, agreed);
      // Nothing locally: the server announces the channel either way, so
      // every member's card moves together rather than only this one.
    } catch (e) {
      Alert.alert(
        'Could not change that',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Checkbox
        label={busy ? 'Saving…' : 'I agree this can be published'}
        checked={publication.mine}
        onChange={(next) => {
          if (busy) return;
          if (!next) return void set(false);
          Alert.alert(
            'Publish this conversation?',
            'It goes on this channel’s public page, where anyone with the ' +
              'address can listen — and into its feed, where podcast apps can ' +
              'subscribe. It goes up once everybody in it has agreed.\n\n' +
              'You can take your agreement back at any time, and that removes ' +
              'it from the page and the feed. It cannot reach a copy somebody ' +
              'has already downloaded.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'I agree', onPress: () => void set(true) },
            ]
          );
        }}
      />
      <Text style={type.muted}>{status}</Text>
    </>
  );
}

/**
 * Loads a recording as the channel's shared track, which is how it is played:
 * there is no second playback mechanism, and once it is loaded the controls
 * already on the screen are the ones that run it.
 *
 * Its own component for the same reason as the export button — the mix is
 * encoded on demand, so this is a wait of seconds and the row that was tapped
 * is the one that should say so.
 */
function PlayButton({
  recording,
  disabled,
}: {
  recording: RecordingView;
  disabled: boolean;
}) {
  const app = useApp();
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      label={busy ? 'Loading…' : 'Play'}
      disabled={busy || disabled}
      onPress={async () => {
        if (!app.token) return;
        setBusy(true);
        try {
          await api.playRecording(app.token, recording.id);
        } catch (e) {
          Alert.alert(
            'Could not play',
            e instanceof Error ? e.message : String(e)
          );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

/**
 * Its own component so each row keeps its own progress state — the mix is
 * encoded on demand, so this is a wait of seconds rather than an instant
 * download, and a shared flag would show every row as busy.
 */
/**
 * Searching every transcript in one channel.
 *
 * Above the recordings list rather than inside a recording, because the
 * question it answers is "which conversation was that in" — the one thing a
 * per-recording filter cannot do. A request rather than a local filter for the
 * obvious reason: the text of a year of conversation is not something a phone
 * holds.
 *
 * Debounced, because a keystroke is not a question. Nothing is asked until
 * somebody stops typing, which is also what keeps a common word from running
 * a query per letter on the way to a specific one.
 *
 * Withheld entirely when the channel holds no transcript, so the field appears
 * once there is something to find and not before.
 */
export function TranscriptSearch({
  channelId,
  onOpen,
}: {
  channelId: string;
  /** Opens the recording a hit came from. */
  onOpen: (recordingId: string) => void;
}) {
  const app = useApp();
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<Hit[] | null>(null);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    const needle = query.trim();
    if (!app.token || !needle) {
      setHits(null);
      return;
    }
    setSearching(true);
    const token = app.token;
    const timer = setTimeout(() => {
      api
        .searchTranscripts(token, channelId, needle)
        .then((body) => setHits(body.hits))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      setSearching(false);
    };
  }, [app.token, channelId, query]);

  return (
    <View style={recordingStyles.search}>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search what was said"
        autoCapitalize="none"
      />
      {searching ? <Text style={type.muted}>Searching…</Text> : null}
      {hits !== null && hits.length === 0 && !searching ? (
        <Text style={type.muted}>Nothing matches.</Text>
      ) : null}
      {hits?.map((hit, n) => (
        <Pressable
          key={`${hit.recordingId}-${hit.startMs}-${n}`}
          accessibilityRole="button"
          accessibilityLabel={`${hit.recordingName ?? 'A recording'}, ${
            hit.displayName ?? 'someone'
          } at ${formatDuration(hit.startMs)}: ${hit.text}`}
          onPress={() => onOpen(hit.recordingId)}
          style={({ pressed }) => (pressed ? recordingStyles.pressed : undefined)}
        >
          <Card style={recordingStyles.hit}>
            <Text style={type.muted} numberOfLines={1}>
              {hit.recordingName ?? 'A recording'} ·{' '}
              {hit.displayName ?? 'Someone'} · {formatDuration(hit.startMs)}
            </Text>
            <Text style={type.body}>{hit.text}</Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

interface Hit {
  recordingId: string;
  recordingName: string | null;
  displayName: string | null;
  startMs: number;
  text: string;
}

/**
 * Starts a transcript, or opens the one there is.
 *
 * Four labels for four states, and the one that matters is the first: asking
 * costs money and sends everybody's audio to a third party, so it asks first
 * and names the company while doing it. That confirmation is not a formality —
 * whoever taps is deciding for everybody who was in the room, and the privacy
 * policy names the same provider in the same words.
 *
 * Withheld entirely when the server sends no `transcript` field, which is how
 * a server with no credential says it cannot do this at all.
 */
function TranscriptButton({
  recording,
  manageable,
  onOpen,
}: {
  recording: RecordingView;
  manageable: boolean;
  onOpen?: () => void;
}) {
  const app = useApp();
  const [busy, setBusy] = React.useState(false);
  const transcript = recording.transcript;
  if (!transcript || !onOpen) return null;
  // Everybody gets one free transcript, so a refusal here is usually "you have
  // had yours" or "this one is too long for a free use" — temporary, personal,
  // and worth a sentence. Reading is never limited, so the row still opens a
  // transcript that exists; what goes is the ability to spend.
  const mayRequest = transcript.mayRequest !== false;
  const limit = transcript.requestLimit;

  if (transcript.state === 'pending') {
    // Not disabled-with-a-reason: there is nothing to do and nothing to wait
    // for on this screen, and the snapshot will move it when it moves.
    return <Button label="Transcribing…" disabled onPress={() => {}} />;
  }
  if (transcript.state === 'ready' || transcript.state === 'failed') {
    return (
      <Button
        label={transcript.state === 'failed' ? 'Transcript failed' : 'Transcript'}
        onPress={onOpen}
      />
    );
  }

  // A disabled button with the reason beside it, which is what a disabled
  // control means everywhere else on this card. Without a sentence there is
  // nothing at all — an old server that limited transcribing to one account
  // sends no reason, and "not you, ever, on this server" was never worth
  // putting on every recording in the list.
  if (!mayRequest) {
    if (!limit) return null;
    return (
      <>
        <Button label="Transcribe" disabled onPress={() => {}} />
        <Text style={type.muted}>{limit}</Text>
      </>
    );
  }

  return (
    <Button
      label={busy ? 'Starting…' : 'Transcribe'}
      // The mix has nothing to do with it — a transcript is made from the
      // stems — but a recording still being prepared is one whose stems may
      // not all have landed, and waiting a moment beats a job that fails.
      disabled={busy || !manageable || !!recording.mixing}
      onPress={() => {
        // Two confirmations, because there are two different stakes. The
        // ordinary one is about where the audio goes; the other is about
        // something that can be done exactly once, which somebody should not
        // discover afterwards — so the title asks about the free use rather
        // than about the recording, and Cancel is the way out of both.
        const spends = transcript.spendsFreeUse === true;
        Alert.alert(
          spends ? 'Use your one free transcript?' : 'Transcribe this recording?',
          `The audio is sent to ${transcript.provider} to be turned into text, ` +
            'and everybody in the channel will see the result. It costs a little, ' +
            'and it can only be done once per recording.' +
            (spends
              ? '\n\nThis is the one free transcript your account gets. Once ' +
                'it is used no other recording can be transcribed, and ' +
                'deleting this transcript does not give it back.'
              : ''),
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: spends ? 'Use it' : 'Transcribe',
              onPress: async () => {
                if (!app.token) return;
                setBusy(true);
                try {
                  await api.startTranscript(app.token, recording.id);
                } catch (e) {
                  Alert.alert(
                    'Could not transcribe',
                    e instanceof Error ? e.message : String(e)
                  );
                } finally {
                  setBusy(false);
                }
              },
            },
          ]
        );
      }}
    />
  );
}

export function ShareButton({
  recording,
  disabled = false,
}: {
  recording: RecordingView;
  /** The mix is not made yet, so there is nothing to encode from. */
  disabled?: boolean;
}) {
  const app = useApp();
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      label={busy ? 'Preparing…' : 'Share'}
      disabled={busy || disabled}
      onPress={async () => {
        if (!app.token) return;
        setBusy(true);
        try {
          await shareRecording(
            app.token,
            recording.id,
            // Same label as the row it came from, so the file that lands in
            // the share sheet is recognisable as the thing that was tapped.
            recording.name,
            recording.endedAt
          );
        } catch (e) {
          Alert.alert(
            'Could not share',
            e instanceof Error ? e.message : String(e)
          );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

const recordingStyles = StyleSheet.create({
  // The margin is what separates the field from the list underneath it: the
  // screen's children are flush, so without it the search box and the first
  // recording card sit edge to edge and read as one control.
  search: { gap: spacing(1), marginBottom: spacing(1) },
  hit: { gap: spacing(0.5) },
  // A column now, because the actions open *below* the name rather than
  // sitting beside it.
  row: { gap: spacing(1.5) },
  main: { gap: spacing(0.25) },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  actions: { gap: spacing(1) },
});
