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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MAX_RECORDING_NAME_LENGTH } from '../../../core/constants';
import type { RecordingView } from '../../../core/protocol';
import { exportRecording } from '../api/download';
import { api } from '../api/http';
import { useApp } from '../state/AppProvider';
import { offsetToReveal } from './reveal';
import { colors, formatDuration, measure, radius, spacing, type } from './theme';

export function Button({
  label,
  onPress,
  disabled,
  variant = 'default',
  sublabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'floor' | 'danger' | 'ghost';
  sublabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = {
    default: { bg: colors.surfaceRaised, fg: colors.text },
    primary: { bg: colors.text, fg: colors.bg },
    floor: { bg: colors.floor, fg: '#FFFFFF' },
    danger: { bg: colors.danger, fg: '#FFFFFF' },
    ghost: { bg: 'transparent', fg: colors.textMuted },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? colors.disabled : tone.bg },
        variant === 'ghost' && styles.buttonGhost,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: disabled ? colors.textFaint : tone.fg },
        ]}
      >
        {label}
      </Text>
      {sublabel ? (
        <Text
          style={[
            styles.buttonSublabel,
            { color: disabled ? colors.textFaint : tone.fg },
          ]}
        >
          {sublabel}
        </Text>
      ) : null}
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
   * submitting — which is why `onSubmit` is ignored here: in prose, and
   * especially in Markdown, a line break is content.
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
}) {
  const scroll = React.useRef<ScrollView>(null);
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // Android resizes the window itself, so asking for padding as well
      // double-counts the keyboard and leaves a gap the height of it.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <RevealContext.Provider value={reveal}>
        {header}
        {/* `collapsable={false}` keeps this view in the native tree, without
            which it cannot be measured. */}
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
        {footer}
      </RevealContext.Provider>
    </KeyboardAvoidingView>
  );
}

/**
 * How a card asks to be seen. Null outside a `Screen`, where there is nothing
 * to scroll and asking is a no-op rather than an error.
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
 */
export function useRevealOnKeyboard(
  active: boolean
): React.RefObject<View | null> {
  const reveal = useReveal();
  const card = React.useRef<View>(null);

  React.useEffect(() => {
    if (!active) return;
    const shown = Keyboard.addListener('keyboardDidShow', () => reveal(card));
    return () => shown.remove();
  }, [active, reveal]);

  return card;
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

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={[type.muted, styles.empty]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  measure,
  button: {
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(2),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonGhost: { minHeight: 40 },
  pressed: { opacity: 0.7 },
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
  empty: { paddingVertical: spacing(2) },
});

/**
 * A finished recording, with the control that turns it into a file.
 *
 * Shared because recordings are shown on the channel they were made in and,
 * for as long as build 20 is out there, on Home — and a recording must not be
 * called one thing on one screen and something else on the other.
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
  /**
   * Whether this row can be played into the room. False on Home, where the
   * rows shown are the ones whose channel is gone — there is no room to play
   * them into.
   */
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
   * Exporting is deliberately not covered. It is a read, it changes nothing
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
   * text box wedged between Export and Delete, with Delete a thumb's width
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
          <ExportButton recording={recording} disabled={!!recording.mixing} />
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
            Said once, beside the two controls it applies to. Renaming and
            deleting are unaffected — they are about the row rather than the
            audio — so a recording that has only just stopped is not a card you
            can do nothing with.
          */}
          {recording.mixing ? (
            <Text style={type.muted}>
              Still being prepared — playing and exporting will be available in
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
            Export is missing from this sentence on purpose, and it is the one
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
      <Button label="Cancel" variant="ghost" disabled={busy} onPress={onDone} />
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

export function ExportButton({
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
      label={busy ? 'Preparing…' : 'Export'}
      disabled={busy || disabled}
      onPress={async () => {
        if (!app.token) return;
        setBusy(true);
        try {
          await exportRecording(
            app.token,
            recording.id,
            // Same label as the row it came from, so the file that lands in
            // the share sheet is recognisable as the thing that was tapped.
            recording.name,
            recording.endedAt
          );
        } catch (e) {
          Alert.alert(
            'Could not export',
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
  search: { gap: spacing(1) },
  hit: { gap: spacing(0.5) },
  // A column now, because the actions open *below* the name rather than
  // sitting beside it.
  row: { gap: spacing(1.5) },
  main: { gap: spacing(0.25) },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  actions: { gap: spacing(1) },
});
