import React from 'react';
import {
  Alert,
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
import { colors, formatDuration, radius, spacing, type } from './theme';

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

export function Field({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  autoCapitalize = 'none',
  onSubmit,
  submitLabel = 'done',
  multiline,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  /** Return key submits the form this field belongs to. */
  onSubmit?: () => void;
  submitLabel?: 'done' | 'go' | 'send' | 'next';
  /**
   * Grows to several lines, and the return key inserts a newline rather than
   * submitting — which is why `onSubmit` is ignored here: in prose, and
   * especially in Markdown, a line break is content.
   */
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      multiline={multiline}
      returnKeyType={!multiline && onSubmit ? submitLabel : undefined}
      onSubmitEditing={multiline ? undefined : onSubmit}
      // A number-pad has no return key, so the form would otherwise be
      // unsubmittable from the keyboard alone.
      submitBehavior={multiline ? 'newline' : 'blurAndSubmit'}
      style={[styles.field, multiline && styles.fieldMultiline]}
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
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // Android resizes the window itself, so asking for padding as well
      // double-counts the keyboard and leaves a gap the height of it.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
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

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={[type.muted, styles.empty]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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

  return (
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
          setOpen((current) => !current);
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
            <PlayButton recording={recording} disabled={playDisabled} />
          ) : null}
          <ExportButton recording={recording} />
          <Button label="Rename" onPress={() => setRenaming(true)} />
          <DeleteButton recording={recording} />
          {/*
            Beside the disabled button rather than up in the summary line,
            where it was explaining a control that is no longer visible until
            somebody asks for it.
          */}
          {playable && playDisabled && playDisabledReason ? (
            <Text style={type.muted}>Play is unavailable — {playDisabledReason}.</Text>
          ) : null}
        </View>
      ) : null}
    </Card>
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
function DeleteButton({ recording }: { recording: RecordingView }) {
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
      disabled={busy}
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
export function ExportButton({ recording }: { recording: RecordingView }) {
  const app = useApp();
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      label={busy ? 'Preparing…' : 'Export'}
      disabled={busy}
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
  // A column now, because the actions open *below* the name rather than
  // sitting beside it.
  row: { gap: spacing(1.5) },
  main: { gap: spacing(0.25) },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  actions: { gap: spacing(1) },
});
