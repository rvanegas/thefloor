import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  configureSession,
  routeSnapshot,
  startInput,
  stopInput,
  type TrialResult,
} from '../../modules/audio-route';
import { recordEvent } from '../audio/diagnostics';
import { Button, Card, IconButton, Screen, SectionLabel } from './components';
import { CloseIcon } from './icons';
import { colors, spacing, type } from './theme';

/**
 * A bench for the audio session, where every other screen in this app is a
 * product.
 *
 * **It exists because the two configurations this app ships were chosen from
 * three builds of inference and one of them is probably misattributed.**
 * `WAITING` — `playAndRecord` with `mixWithOthers` — was deleted on 2026-09-06
 * on the conclusion that *the option bought nothing and the category cost
 * everything*. That experiment held `audioMode: 'videoChat'` fixed, so it
 * cannot separate the category from the mode; and Apple's own header for
 * `AVAudioSessionCategoryOptionMixWithOthers` says the combination is valid,
 * scoping its description to `AVAudioSessionModeDefault`. The voice-chat modes
 * are documented elsewhere as setting `duckOthers` behind your back. So the
 * cell nobody has run is `playAndRecord` + `mixWithOthers` + a **non-voice
 * mode**, and this screen is how it gets run.
 *
 * **Nothing here is a feature and nothing here is on a shipping path.** It
 * writes the session directly through `configureSession`, which `session.ts`
 * otherwise owns exclusively. It is reached only from Home, only for an account
 * with the `debug` column, and it is meant to be deleted with its answer.
 *
 * **Run it outside any channel.** Three writers mutate the same process-wide
 * configuration — this app, the SDK's policy observer, and WebRTC reapplying
 * its defaults — and the whole point of the first experiment is to ask what iOS
 * does with nobody else writing. A trial run while connected measures the
 * argument between the writers instead, which is a real question and a later
 * one.
 *
 * **Everything is logged through `recordEvent`**, which for a debug account
 * ships to the server's journal. That includes the observations, which are the
 * part that matters: the decisive readings here are made by ear, and a trial
 * whose result lives only in somebody's memory is the failure mode the audio
 * work in this repository has hit more than once.
 */

/** One row of the matrix, and why it is in it. */
interface Preset {
  name: string;
  category: string;
  mode: string;
  options: string[];
  /** What this row is for, shown above the switches once it is loaded. */
  why: string;
}

/**
 * The four rows, in the order they are worth running.
 *
 * The control is not optional and is not last by accident — a rig that cannot
 * reproduce the known failure cannot support a claim about the unknown one. If
 * row 3 lets a podcast play, the apparatus is wrong and rows 1 and 2 mean
 * nothing.
 */
const PRESETS: Preset[] = [
  {
    name: '1 · target',
    category: 'playAndRecord',
    mode: 'default',
    options: ['mixWithOthers', 'defaultToSpeaker'],
    why:
      'The cell nobody has run. Apple documents this as letting other apps ' +
      'play while we hold input and output. If it holds, the fork this app ' +
      'has been designed around may not be a fork at all.',
  },
  {
    name: '2 · non-default, non-voice',
    category: 'playAndRecord',
    mode: 'spokenAudio',
    options: ['mixWithOthers', 'defaultToSpeaker'],
    why:
      "Resolves an ambiguity in Apple's header: does the mixing description " +
      'bind only `default` mode, or any non-voice mode? IDLE already mixes ' +
      'under `spokenAudio`, but with `playback` rather than `playAndRecord`.',
  },
  {
    name: '3 · control (must fail)',
    category: 'playAndRecord',
    mode: 'videoChat',
    options: ['mixWithOthers', 'defaultToSpeaker'],
    why:
      'This is WAITING, the configuration deleted on 2026-09-06. It should ' +
      'stop or duck the other app. If it does not, this rig cannot detect ' +
      'failure and rows 1 and 2 prove nothing.',
  },
  {
    name: '4 · duck instead of stop',
    category: 'playAndRecord',
    mode: 'default',
    options: ['duckOthers', 'defaultToSpeaker'],
    why:
      'The middle position, never tried in this app. Ducking is not stopping ' +
      '— a quieter podcast under an open microphone may be an acceptable ' +
      'trade where silence is not.',
  },
];

const CATEGORIES = ['playAndRecord', 'playback', 'record', 'multiRoute'];
const MODES = [
  'default',
  'spokenAudio',
  'voicePrompt',
  'measurement',
  'voiceChat',
  'videoChat',
];
const OPTIONS = [
  'mixWithOthers',
  'duckOthers',
  'interruptSpokenAudioAndMixWithOthers',
  'allowBluetooth',
  'allowBluetoothA2DP',
  'allowAirPlay',
  'defaultToSpeaker',
];

/**
 * What the observer is asked after each trial.
 *
 * **Free text was tried in the head and does not survive the walk.** These are
 * the four outcomes the sources predict — kept playing, went quiet, moved to
 * the earpiece, stopped dead — and naming them in advance is what makes two
 * trials comparable. `moved to earpiece` is here because it is the documented
 * signature of voice-mode ducking and was recorded in build 147 without being
 * recognised as one.
 */
const OBSERVATIONS = [
  'other app kept playing',
  'other app went quieter',
  'other app moved to earpiece',
  'other app stopped',
];

export function AudioLabView({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState('playAndRecord');
  const [mode, setMode] = useState('default');
  const [options, setOptions] = useState<string[]>([
    'mixWithOthers',
    'defaultToSpeaker',
  ]);
  const [active, setActive] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<TrialResult | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);
  /**
   * Which transition the phone is sitting after, so an observation says *when*
   * as well as *what*.
   *
   * **Four listens per row, not one.** Activating a session and running an
   * input chain are two separate things that could interrupt another app, and
   * a row that produces one verdict cannot tell them apart. Stopping the input
   * while the session stays active is the third, and releasing is the fourth —
   * whether the other app comes back is as much a finding as whether it
   * stopped.
   */
  const [phase, setPhase] = useState('before');

  const styles = useMemo(() => makeStyles(), []);

  const toggleOption = (name: string) =>
    setOptions((current) =>
      current.includes(name)
        ? current.filter((o) => o !== name)
        : [...current, name]
    );

  const load = (p: Preset) => {
    setPreset(p);
    setCategory(p.category);
    setMode(p.mode);
    setOptions(p.options);
    recordEvent(`lab preset ${p.name}`);
  };

  /**
   * Applies the configuration and records both halves of the trial.
   *
   * The request and the readback go into one line deliberately. They are the
   * comparison, and two lines that have to be paired up afterwards is how a
   * log stops being evidence.
   */
  const apply = () => {
    const trial = configureSession(category, mode, options, active);
    setResult(trial);
    setPhase(active ? 'applied' : 'applied-inactive');
    if (!trial) {
      recordEvent('lab apply — no native module (rebuild required)');
      return;
    }
    recordEvent(
      `lab apply ${preset?.name ?? 'manual'} ` +
        `asked=${category}/${mode}[${options.join('+') || 'none'}] active=${active} ` +
        `got=${shortName(trial.category)}/${shortName(trial.mode)}` +
        `[${(trial.categoryOptions ?? ['unreadable']).join('+')}] ` +
        `out=${trial.outputs.join(',') || 'none'} sr=${Math.round(trial.sampleRate)} ` +
        `err=${trial.error ?? 'none'}`
    );
  };

  const toggleCapture = () => {
    const next = !capturing;
    const trial = next ? startInput() : stopInput();
    setCapturing(next);
    setResult(trial);
    setPhase(next ? 'capturing' : 'input-off');
    recordEvent(
      `lab input ${next ? 'on' : 'off'} ` +
        `out=${trial?.outputs.join(',') ?? '?'} sr=${Math.round(trial?.sampleRate ?? 0)} ` +
        `err=${trial?.error ?? 'none'}`
    );
  };

  /**
   * Releases the session, which is the step that lets the other app come back.
   *
   * Apple's own note on `duckOthers` and `interruptSpokenAudio…`: the other
   * app stays ducked or paused *for as long as this session is active*, so a
   * trial that never deactivates leaves the phone in the state the next trial
   * is trying to measure from.
   */
  const release = () => {
    if (capturing) {
      stopInput();
      setCapturing(false);
    }
    const trial = configureSession('playback', 'default', ['mixWithOthers'], false);
    setResult(trial);
    setPhase('released');
    recordEvent('lab release — session deactivated');
  };

  const observe = (what: string) => {
    recordEvent(
      `lab OBSERVED ${preset?.name ?? 'manual'} @${phase} · ${what} · ` +
        `out=${routeSnapshot()?.outputs.join(',') ?? '?'}`
    );
  };

  /**
   * Whether the session became something other than what the **last call**
   * asked for.
   *
   * **Against `result.asked`, not against the switches.** The switches are
   * what the next trial will ask for; the readback answers the previous one,
   * and after a Release — which writes `playback` on purpose — those differ by
   * design. Comparing them cried wolf on the first trial anybody ran, which is
   * the worst possible moment for a diagnostic to be wrong: it accused iOS of
   * refusing a configuration that had been applied exactly as asked, with
   * `error` reading none directly above it.
   *
   * The native side echoes `asked` back with the readback for this reason, so
   * the two halves of the comparison can never drift apart.
   */
  const asked = result?.asked;
  const mismatch =
    result != null &&
    asked != null &&
    result.categoryOptions != null &&
    (shortName(result.category) !== asked.category ||
      shortName(result.mode) !== asked.mode ||
      asked.options.some((o) => !result.categoryOptions?.includes(o)));

  return (
    <Screen
      header={
        <View style={styles.header}>
          <Text style={styles.title}>Audio lab</Text>
          <IconButton
            label="Close"
            icon={(color) => <CloseIcon color={color} />}
            onPress={onBack}
          />
        </View>
      }
    >
      <Card>
        <Text style={styles.body}>
          Testing whether a capturing session can let another app keep playing.
          Run this <Text style={styles.strong}>outside any channel</Text> — in a
          channel, LiveKit and WebRTC are also writing this session and you
          would be measuring the argument between them instead.
        </Text>
        <Text style={styles.step}>1 · Start music or a podcast in another app</Text>
        <Text style={styles.step}>2 · Come back here and load a row below</Text>
        <Text style={styles.step}>3 · Apply — then listen, and tap what happened</Text>
        <Text style={styles.step}>4 · Input on — listen again, tap again</Text>
        <Text style={styles.step}>5 · Input off — listen, tap</Text>
        <Text style={styles.step}>6 · Release — listen, tap. Did it come back?</Text>
        <Text style={styles.note}>
          Four listens, not one. Activating the session and running the
          microphone are separate things that could interrupt the other app,
          and a row with a single verdict cannot tell them apart. Each tap
          records which step you were on.
        </Text>
        <Text style={styles.note}>
          Run every row twice: once on the speaker, once on a Bluetooth headset.
          The headset is where the profile handover costs something.
        </Text>
      </Card>

      <SectionLabel>Rows</SectionLabel>
      <View style={styles.list}>
        {PRESETS.map((p) => (
          <Card key={p.name}>
            <Button
              label={p.name}
              variant={preset?.name === p.name ? 'primary' : 'ghost'}
              onPress={() => load(p)}
            />
          </Card>
        ))}
      </View>
      {preset ? <Text style={styles.why}>{preset.why}</Text> : null}

      <SectionLabel>Category</SectionLabel>
      <Choice values={CATEGORIES} selected={category} onSelect={setCategory} />

      <SectionLabel>Mode</SectionLabel>
      <Choice values={MODES} selected={mode} onSelect={setMode} />

      <SectionLabel>Options</SectionLabel>
      <View style={styles.list}>
        {OPTIONS.map((o) => (
          <View key={o} style={styles.row}>
            <Text style={styles.rowLabel}>{o}</Text>
            <Switch
              value={options.includes(o)}
              onValueChange={() => toggleOption(o)}
            />
          </View>
        ))}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>activate session</Text>
          <Switch value={active} onValueChange={setActive} />
        </View>
      </View>

      <SectionLabel>Run</SectionLabel>
      <View style={styles.list}>
        <Card>
          <Button label="Apply configuration" variant="primary" onPress={apply} />
        </Card>
        <Card>
          <Button
            label={capturing ? 'Input ON — tap to stop' : 'Input off — tap to capture'}
            variant={capturing ? 'floor' : 'default'}
            onPress={toggleCapture}
          />
        </Card>
        <Card>
          <Button label="Release session" variant="ghost" onPress={release} />
        </Card>
      </View>

      <SectionLabel>What happened</SectionLabel>
      <Text style={styles.note}>
        Tap one after listening. This is the reading that decides the row —
        everything above is only what was asked for.
      </Text>
      <View style={styles.list}>
        {OBSERVATIONS.map((o) => (
          <Card key={o}>
            <Button label={o} variant="ghost" onPress={() => observe(o)} />
          </Card>
        ))}
      </View>

      <SectionLabel>What the session became</SectionLabel>
      <Card>
        {result == null ? (
          <Text style={styles.body}>Nothing applied yet.</Text>
        ) : (
          <>
            <Reading
              label="asked for"
              value={
                asked
                  ? `${asked.category}/${asked.mode}` +
                    `[${asked.options.join('+') || 'none'}]`
                  : 'unknown'
              }
            />
            <Reading label="category" value={shortName(result.category)} />
            <Reading label="mode" value={shortName(result.mode)} />
            <Reading
              label="options"
              value={(result.categoryOptions ?? ['unreadable']).join(' + ') || 'none'}
            />
            <Reading label="output" value={result.outputs.join(', ') || 'none'} />
            <Reading
              label="sample rate"
              value={`${Math.round(result.sampleRate)} Hz${
                result.sampleRate <= 24000 ? '  ← HFP handover' : ''
              }`}
            />
            <Reading label="error" value={result.error ?? 'none'} />
            {mismatch ? (
              <Text style={styles.mismatch}>
                Readback disagrees with the request — something else wrote this
                session, or iOS refused part of it. That is a result, not a bug.
              </Text>
            ) : null}
          </>
        )}
      </Card>
      <Text style={styles.note}>
        Sample rate is the objective one: 16 kHz or 8 kHz is the hands-free
        profile, 44.1 or 48 means A2DP held.
      </Text>
    </Screen>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  const styles = useMemo(() => makeStyles(), []);
  return (
    <View style={styles.reading}>
      <Text style={styles.readingLabel}>{label}</Text>
      <Text style={styles.readingValue}>{value}</Text>
    </View>
  );
}

/** A row of mutually exclusive values, wrapping — there are too many for tabs. */
function Choice({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const styles = useMemo(() => makeStyles(), []);
  return (
    <View style={styles.choices}>
      {values.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="button"
          onPress={() => onSelect(v)}
          style={[styles.chip, v === selected && styles.chipOn]}
        >
          <Text style={[styles.chipText, v === selected && styles.chipTextOn]}>
            {v}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * `AVAudioSessionCategoryPlayAndRecord` → `playAndRecord`.
 *
 * The same trim `diagnostics.ts` does, and for the same reason: it is what
 * makes the comparison against what was asked for a string equality rather
 * than a judgement.
 */
function shortName(raw: string): string {
  const trimmed = raw
    .replace('AVAudioSessionCategory', '')
    .replace('AVAudioSessionMode', '');
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

const makeStyles = () =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing(2),
      paddingVertical: spacing(1),
    },
    title: { ...type.title, color: colors.text },
    body: { ...type.body, color: colors.text },
    strong: { ...type.body, color: colors.text, fontWeight: '700' },
    step: { ...type.body, color: colors.textMuted, marginTop: spacing(1) },
    note: {
      ...type.muted,
      color: colors.textMuted,
      marginTop: spacing(1),
      paddingHorizontal: spacing(2),
    },
    why: {
      ...type.muted,
      color: colors.textMuted,
      paddingHorizontal: spacing(2),
      marginTop: spacing(1),
    },
    list: { gap: spacing(1) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing(2),
      paddingVertical: spacing(0.5),
    },
    rowLabel: { ...type.body, color: colors.text, flexShrink: 1 },
    choices: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing(1),
      paddingHorizontal: spacing(2),
    },
    chip: {
      paddingHorizontal: spacing(1.5),
      paddingVertical: spacing(0.75),
      borderRadius: 999,
      backgroundColor: colors.surfaceRaised,
    },
    chipOn: { backgroundColor: colors.text },
    chipText: { ...type.muted, color: colors.textMuted },
    chipTextOn: { color: colors.bg },
    reading: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing(0.25),
    },
    readingLabel: { ...type.muted, color: colors.textMuted },
    readingValue: { ...type.muted, color: colors.text, flexShrink: 1 },
    mismatch: { ...type.muted, color: colors.danger, marginTop: spacing(1) },
  });
