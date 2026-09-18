import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  chime,
  CHIME_AMPLITUDE,
  CHIME_LEAD,
  chimeArity,
  chimeInfo,
  configureSession,
  prepareChime,
  routeSnapshot,
  startInput,
  stopInput,
  type ChimeCandidate,
  type ChimeKind,
  type ChimePath,
  type TrialResult,
} from '../../modules/audio-route';
import { chime as queuedChime } from '../audio/chime';
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

/**
 * The peaks the chime is compared at, as strings because the chips are.
 *
 * **The lab's own list again, as it was before 2026-09-15.** For one day these
 * five were `CHIME_AMPLITUDES` in core/settings.ts, because a setting on Floor
 * Settings offered them and the server had to refuse a sixth; the setting went
 * the same day and took the shared list with it. Nothing outside this file
 * needs them now — the app plays at `CHIME_AMPLITUDE` and this is where any
 * other number is heard. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 *
 * **Geometric rather than even, because loudness is**: 0.18 to 0.35 is the
 * same step to an ear as 0.35 to 0.7. 0.18 is what the app shipped at before
 * the chime was made louder, and it is on the row for that reason — a ladder
 * without the old value on it cannot say how much louder anything got. `1` is
 * full scale for a sine and the loudest this can be made; if that is still too
 * quiet the fault is the route or the ringer, not the file, which is what the
 * readout below the buttons is for.
 */
const PEAKS = ['0.18', '0.35', '0.5', '0.7', '1'];

/**
 * The lead-ins the chime is compared at, in seconds, as strings because the
 * chips are.
 *
 * **`0` is the control and is the whole point of the row.** It is the cue with
 * no silence in front of it at all — what shipped before 2026-09-15 and what
 * was reported as quiet on a first tap and normal on a second. Every other
 * value on this row means something only against it: if 0 and 0.18 sound the
 * same, the output route powering up is not the mechanism and the fix that
 * assumed it was should come out.
 *
 * **It goes past any plausible ramp on purpose.** 0.18 was a guess at a number
 * nobody has measured, and a Bluetooth route takes far longer to come up than a
 * loudspeaker — so the row runs to a full second, which is long enough to feel
 * broken as a cue and is therefore a good place for the effect to have plainly
 * stopped growing.
 */
const LEADS = ['0', '0.18', '0.35', '0.6', '1'];

/**
 * The four the app actually plays, as opposed to the candidates below.
 *
 * A combination is made of these and never of a candidate: what the
 * combinations section is auditioning is the spacing between two sounds, and
 * putting an unchosen note into one would be asking two questions with one
 * tap.
 */
const REAL_KINDS: ChimeKind[] = ['in', 'out', 'nearby', 'recording'];

/** Every kind the buttons below can ask for, so all of them can be warmed. */
const CHIME_KINDS: (ChimeKind | ChimeCandidate)[] = [
  ...REAL_KINDS,
  'nearby-a',
  'nearby-b',
  'nearby-c',
  'nearby-d',
];

/** One row of the combinations list, and the moment it is taken from. */
interface Combination {
  name: string;
  kinds: ChimeKind[];
  /** The snapshot that produces it, so the ear knows what it is judging. */
  why: string;
}

/**
 * The combinations the app can actually produce in one tick, in the order they
 * are worth hearing.
 *
 * **Every one of these is a real snapshot rather than an arrangement.** One
 * chime per kind is the rule, so no row repeats a kind, and the order within a
 * row is the order `usePresenceChime` narrates in — with the recording chime
 * last, that being the order the hooks are mounted in. A row that could not
 * happen would be a sound nobody needs an opinion about.
 *
 * **What is being judged is the gap, not the notes.** The notes are settled
 * one section up. The question here is whether two chimes a beat apart read as
 * two events, or as one longer sound — and whether three is too many to follow
 * at all, which is the row nobody has an answer for.
 */
const COMBINATIONS: Combination[] = [
  {
    name: 'In · out',
    kinds: ['in', 'out'],
    why: 'Somebody steps in as somebody else steps out. The commonest pair, and the one where rising-then-falling could be heard as a single shape.',
  },
  {
    name: 'Out · nearby',
    kinds: ['out', 'nearby'],
    why: 'Two people leave and a third steps back to nearby — two chimes, not three, since a kind sounds once however many moved.',
  },
  {
    name: 'In · out · nearby',
    kinds: ['in', 'out', 'nearby'],
    why: 'All three in one tick. Rare, and the row to listen to hardest: if three cannot be followed, the rule that plays all of them is wrong.',
  },
  {
    name: 'In · recording',
    kinds: ['in', 'recording'],
    why: 'Somebody arrives as a recording starts. Two hooks, neither aware of the other — the case a queue inside either one could not have spaced.',
  },
  {
    name: 'Out · recording',
    kinds: ['out', 'recording'],
    why: 'A departure against the one chime that is not about presence. Both fall and rise around the same notes, so it is the likeliest pair to blur.',
  },
];

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
  {
    name: '5 · headset, HFP eligible',
    category: 'playAndRecord',
    mode: 'default',
    options: ['mixWithOthers', 'allowBluetooth', 'defaultToSpeaker'],
    why:
      'Row 1 with a Bluetooth headset made eligible. `allowBluetooth` is the ' +
      'hands-free profile, which is the only Bluetooth profile that carries a ' +
      'microphone at all — A2DP is output-only. So the question is not whether ' +
      'the headset can capture but what iOS charges for it: 16 kHz here means ' +
      'the handover happened, 48 means it found another way.',
  },
  {
    name: '6 · headset, A2DP eligible',
    category: 'playAndRecord',
    mode: 'default',
    options: ['mixWithOthers', 'allowBluetoothA2DP', 'defaultToSpeaker'],
    why:
      'iOS can keep A2DP for output and take input from the *built-in* ' +
      'microphone. Whether that is a trap or the answer depends on what is on ' +
      'the far end of the route — see rows 8 and 9, which test it deliberately. ' +
      'Here it is the thing to notice: full rate with the headset still ' +
      'playing is not a win by itself. Read the input port before believing it.',
  },
  {
    name: '7 · headset control (must fail)',
    category: 'playAndRecord',
    mode: 'videoChat',
    options: ['mixWithOthers', 'allowBluetooth', 'defaultToSpeaker'],
    why:
      'Row 3 on a headset — the shipping CALL configuration plus ' +
      'mixWithOthers. Should duck the other app and drop to 16 kHz. This is ' +
      'the baseline every other headset row is a saving against.',
  },
  {
    name: '8 · split — headphones out, phone mic',
    category: 'playAndRecord',
    mode: 'default',
    options: ['mixWithOthers', 'allowBluetoothA2DP'],
    why:
      'The split, asked for on purpose. Output stays on A2DP at full rate and ' +
      'in stereo; capture comes from the phone. If it holds, a session can ' +
      'capture without ever charging the headset the hands-free handover — ' +
      'which is the cost every other row on a headset is paying.\n\n' +
      'session.ts forbids this option because of 2026-08-21, when a far end ' +
      'came out of a *mic-less Bluetooth speaker* into an open microphone in ' +
      'the same room. That is a loudspeaker argument. Headphones in somebody ' +
      "ears are not a loudspeaker, and the rule was never re-examined for " +
      'them. Confirm the ports: output BluetoothA2DP, input the built-in mic.\n\n' +
      '`defaultToSpeaker` is deliberately absent — it decides where to go when ' +
      'nothing else is connected, and leaving it out keeps this row about the ' +
      'route iOS picks rather than about a tiebreak.',
  },
  {
    name: '9 · does the split survive videoChat?',
    category: 'playAndRecord',
    mode: 'videoChat',
    options: ['mixWithOthers', 'allowBluetoothA2DP'],
    why:
      'The question row 8 raises immediately. A silent wait can afford a ' +
      'non-voice mode because nobody is being rendered, but the moment ' +
      'somebody arrives the echo canceller is wanted — and `videoChat` implies ' +
      'its own Bluetooth eligibility. If the route collapses to hands-free ' +
      'here, then the split is only available while nobody is talking, and ' +
      'arriving costs the handover after all. That is the whole design ' +
      'question in one row.',
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
 * What the other app sounds like *right now*, asked at every step.
 *
 * **States rather than transitions, since 2026-09-08.** These read
 * "kept playing", "went quieter", "moved to earpiece", "stopped" — which is
 * fine after Apply and wrong after Release, where the answer wanted is *did it
 * come back*. A protocol that listens four times per row is taking four state
 * readings; the transition is what two consecutive readings imply, and it is
 * not something the person listening should have to work out in their head
 * before they can pick a button.
 *
 * **Free text was tried in the head and does not survive the walk.** Naming the
 * outcomes in advance is what makes two rows comparable. `on the earpiece` is
 * here because it is the documented signature of voice-mode ducking and was
 * recorded in build 147 without being recognised as one.
 *
 * **`went mono` is the fidelity reading, and the first four could not express
 * it.** They describe the other app's presence, level and location; none of
 * them describes how it *sounds*, and on a Bluetooth headset that is the
 * change that matters — the A2DP to hands-free handover leaves a track playing
 * at the same volume in the same place, in mono at a third of the bandwidth.
 * It is also the cost this whole experiment is trying to price, so a rig that
 * could not record it was measuring the cheap half.
 *
 * **These are not mutually exclusive and the buttons do not pretend otherwise.**
 * Playing normally *and* mono is a real reading; so is ducked and mono. Each
 * tap is its own line, so tapping two is how two are said.
 */
const OBSERVATIONS = [
  'playing normally',
  'went mono — lower fidelity',
  'quieter — ducked',
  'on the earpiece',
  'silent',
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

  /**
   * The peak the next chime renders at, as the chip's own string.
   *
   * Starts at what the app ships, so the first tap is the sound somebody has
   * already heard and everything after it is a comparison against that rather
   * than against a memory.
   */
  const [peak, setPeak] = useState(String(CHIME_AMPLITUDE));

  /**
   * The silence the next chime opens with, as the chip's own string.
   *
   * Starts at what the app ships for the same reason the peak does — the first
   * tap should be the sound that is actually in somebody's hands.
   */
  const [lead, setLead] = useState(String(CHIME_LEAD));

  /**
   * Which path the next chime goes down, and the most important chip on the
   * screen until it is settled.
   *
   * Starts on `system`, which is what the app ships, so the first tap is the
   * sound that was reported rather than the candidate replacing it.
   */
  const [path, setPath] = useState<ChimePath>('system');

  /**
   * What the running binary's renderer holds, read once.
   *
   * **Read at mount rather than at each tap, because it cannot change without
   * the process restarting** — it is a property of the binary, not of the
   * session. Null means this bundle is newer than the app it is running in,
   * which is the single most likely explanation for a native fix that appears
   * to have done nothing.
   */
  const renderer = useMemo(() => chimeInfo(), []);

  /**
   * Warms every kind at the chosen peak and lead, whenever either chip moves.
   *
   * **Because the cache key includes the amplitude, every chip is a cold
   * sound**, and a cold first tap is the thing under suspicion. A sweep that
   * renders at the moment of the tap is not comparing amplitudes; it is
   * comparing five first plays. Warming on selection puts the render and the
   * load before the tap, so what the tap measures is the sound.
   *
   * The lab is the place this matters most and the place it is least obvious,
   * since the app only ever has three keys and hits them over and over.
   */
  useEffect(() => {
    for (const kind of CHIME_KINDS) {
      prepareChime(kind, Number(peak), Number(lead));
    }
    /**
     * And again at the shipping lead, for the combinations.
     *
     * Those go through `chime.ts` so that the queue is what is heard, and the
     * queue asks for `CHIME_LEAD` rather than for this screen's chip. A key
     * that is not warmed is a cold first play, which in a section about
     * *timing* would be the one artefact that ruins the reading.
     */
    if (Number(lead) !== CHIME_LEAD) {
      for (const kind of REAL_KINDS) {
        prepareChime(kind, Number(peak), CHIME_LEAD);
      }
    }
  }, [peak, lead]);

  /**
   * What the last chime did, which is the finding.
   *
   * **The route is captured at the moment of the tap** rather than rendered
   * from whatever `result` happens to hold: `result` answers the last
   * *configuration* call, and between that and the chime the route can have
   * moved — a headset connecting is enough. A reading that is not taken at the
   * sound is not evidence about the sound.
   */
  const [lastChime, setLastChime] = useState<{
    kind: string;
    peak: string;
    lead: string;
    path: string;
    arity: number | null;
    played: boolean;
    outputs: string;
    through: string;
  } | null>(null);

  /**
   * The last combination asked for, by name.
   *
   * Thinner than `lastChime` in one way and not in another: there is no route
   * readout worth taking, the route being whatever the section above already
   * established — but **what the queue did with each kind is not optional**,
   * because it is the one thing a room cannot tell you. A row that was dropped
   * for being stale and a row that played into a silent switch are the same
   * silence, and only this says which.
   */
  const [lastCombination, setLastCombination] = useState<{
    name: string;
    /** One `kind outcome` per kind, in the order they were asked for. */
    outcomes: string;
    peak: string;
  } | null>(null);

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
        `out=${trial.outputs.join(',') || 'none'} in=${trial.inputs.join(',') || 'none'} ` +
        `sr=${Math.round(trial.sampleRate)} ` +
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
        `out=${trial?.outputs.join(',') ?? '?'} in=${trial?.inputs.join(',') ?? '?'} ` +
        `sr=${Math.round(trial?.sampleRate ?? 0)} ` +
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

  /**
   * Plays one chime at the chosen peak and records where it went.
   *
   * **`played` is the native return and is not a claim about audibility.** It
   * says the file was rendered and handed to the system sound server; a phone
   * with the ringer down, or a session that has muted system sounds, answers
   * true and makes no noise. False is narrower and more useful: the binary is
   * older than this bundle and cannot play what was asked for, which during
   * development is a Metro reload against an unbuilt native half.
   *
   * **On the player path false means something else** — the player itself
   * would not start, which is a real failure rather than a stale binary, so
   * the readout says which. The two are worth telling apart here for the same
   * reason everything else on this screen is.
   */
  /**
   * Plays a combination through the app's own queue, which is the point of it.
   *
   * **Not `ring` in a loop.** `ring` calls the native module directly, which
   * is right for judging one sound at one peak on one path — and would play a
   * combination as a chord, since a system sound starts and returns. The queue
   * in `chime.ts` is the thing under test here, so these go through it.
   *
   * **Which means the path and lead chips do not apply**, the queue asking for
   * the shipping ones. The peak does, so a combination can be heard at
   * whatever the peak row is set to. Said on screen, because a dial that
   * silently stops applying is worse than one that is not offered.
   */
  const ringAll = (combination: Combination) => {
    const outcomes = combination.kinds.map(
      (kind) => `${kind} ${queuedChime(kind, Number(peak))}`
    );
    setLastCombination({
      name: combination.name,
      outcomes: outcomes.join(' · '),
      peak,
    });
    recordEvent(
      `lab COMBINATION ${combination.kinds.join('+')} peak=${peak} @${phase} · ` +
        `${outcomes.join(' · ')} via=system lead=0`
    );
  };

  const ring = (kind: ChimeKind | ChimeCandidate) => {
    const played = chime(kind, Number(peak), Number(lead), path);
    const here = routeSnapshot();
    const outputs = here?.outputs.join(', ') ?? 'unreadable';
    setLastChime({
      kind,
      peak,
      lead,
      path,
      arity: chimeArity(),
      played,
      outputs,
      through: through(here?.outputs),
    });
    recordEvent(
      `lab CHIME ${kind} peak=${peak} lead=${lead} via=${path} ` +
        `played=${played} @${phase} · ` +
        `out=${outputs} via=${through(here?.outputs)} ` +
        `cat=${shortName(here?.category ?? '?')}/${shortName(here?.mode ?? '?')} ` +
        `opts=${(here?.categoryOptions ?? ['unreadable']).join('+')} ` +
        `haptics=${here?.allowsHapticsDuringRecording ?? 'unreadable'}`
    );
  };

  const observe = (what: string) => {
    const here = routeSnapshot();
    recordEvent(
      `lab OBSERVED ${preset?.name ?? 'manual'} @${phase} · ${what} · ` +
        `out=${here?.outputs.join(',') ?? '?'} in=${here?.inputs.join(',') ?? '?'} ` +
        `sr=${Math.round(here?.sampleRate ?? 0)}`
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
          If it is still silent after Release, stop. Something is holding the
          audio system and the next row would measure that instead.
        </Text>
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
        Tap after every step, Release included — and tap more than one where
        more than one is true. Playing normally and mono is a real reading.
        This is how the other app sounds right now, not a verdict on the row;
        the row is what the readings say together. After Release it answers
        the question that matters for the next row: did it come back?
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
            {/*
              **The reading row 6 exists for.** A Bluetooth headset still
              playing at full rate looks like a win until you notice the
              microphone is the phone's — iOS keeping A2DP for output and
              taking input from the built-in mic. Showing only outputs is how
              that goes unnoticed, and it is a loudspeaker playing the far end
              into an open microphone in the same room.
            */}
            <Reading label="input" value={result.inputs.join(', ') || 'none'} />
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

      {/*
        The chimes, which are a second experiment and not a step of the first.

        They lived inside the `Run` list until 2026-09-15 and read as one —
        five more buttons under the same heading as `Apply` and `Release`,
        which made them look like part of the sweep rather than a separate
        question that happens to want a session underneath it. They are their
        own section now, below the readout, with their own dial and their own
        verdict.

        What they are still for: whether a system sound survives the session it
        is played under. Tap them with no session at all first — that is the
        cheap half and the one that proves the path works — then under an
        applied configuration, then capturing, which is the case iOS mutes
        system sounds for unless `setAllowHapticsDuringRecording` has been
        asserted.
      */}
      <SectionLabel>Chimes</SectionLabel>
      <Card>
        <Text style={styles.body}>
          A second experiment, not a step of the one above. It has two
          questions: <Text style={styles.strong}>how loud</Text>, and{' '}
          <Text style={styles.strong}>which note</Text> nearby gets.
        </Text>
        <Text style={styles.step}>
          1 · Check the renderer below is this bundle's, not an older build's
        </Text>
        <Text style={styles.step}>
          2 · Path system, tap · path player, tap — the one that matters
        </Text>
        <Text style={styles.step}>3 · Sweep the peak on whichever path is audible</Text>
        <Text style={styles.step}>
          4 · Lead 0 against lead 0.6, on Bluetooth, which nobody has tried
        </Text>
        <Text style={styles.step}>5 · Input ON, tap again — the silent case</Text>
        <Text style={styles.note}>
          Step 2 is the experiment now. The renderer has been compiled and run
          on its own, away from any phone: the file is well formed, the lead-in
          is really in it, and the peak sweep spans a genuine 15dB — −15.7 dBFS
          at 0.18 up to −0.8 dBFS at full scale. That measurement and an ear
          that hears no difference between the five cannot both be about the
          same signal path, so the path is what is under test.
        </Text>
        <Text style={styles.note}>
          The alert path takes no gain argument and plays at a level this app
          neither sets nor can read; the media path has a volume knob and is the
          session this app already holds. Two taps settle which one the quiet is
          coming from.
        </Text>
        <Text style={styles.note}>
          Step 4 is a settled question left open in one place. The cue works at
          0.18 with no lead at all once the sound is rendered and loaded before
          the tap rather than at it, so the lead earns nothing on a loudspeaker
          and the app asks for none. A Bluetooth route comes up far more slowly
          and nobody has listened on one, which is the only reason the row is
          still here.
        </Text>
        <Text style={styles.note}>
          Volume is baked into the sound, because a system sound has no gain
          knob — asking for louder means rendering louder samples. Sweep the
          peaks below and say which one is audible across a room without being
          a doorbell. They are geometric, so each step should be an obvious one;
          five rows that sound alike is the symptom of a cold route, not of a
          dial that does nothing.
        </Text>
        <Text style={styles.note}>
          Where it went is read back under the buttons. Speaker is the
          loudspeaker; Receiver is the earpiece, which is quiet by design and
          is the first thing to rule out when a cue sounds faint.
        </Text>
        <Text style={styles.note}>
          The four nearby rows are a comparison, not four features. One becomes
          the sound and the rest are deleted; they are judged on a phone because
          a phone speaker is the only room this cue plays in. D is what nearby
          plays today — the losers are still here to be compared against it
          rather than remembered.
        </Text>
      </Card>

      <SectionLabel>What this binary renders</SectionLabel>
      <Card>
        {renderer == null ? (
          <>
            <Text style={styles.mismatch}>
              This build has no renderer to ask.
            </Text>
            <Text style={styles.body}>
              The bundle is newer than the app it is running in — a Metro reload
              picks up every word of this screen and nothing in the Swift. Stop
              here and rebuild natively; nothing below this card is evidence
              about anything until you have.
            </Text>
          </>
        ) : (
          <View>
            <Reading
              label="lead"
              value={`${Math.round(renderer.leadSeconds * 1000)}ms`}
            />
            <Reading
              label="notes"
              value={`${Math.round(renderer.noteSeconds * 1000)}ms each`}
            />
            <Reading label="ships at" value={String(renderer.amplitude)} />
            <Reading label="kinds" value={renderer.kinds.join(', ')} />
          </View>
        )}
      </Card>
      <Text style={styles.note}>
        The default lead the binary holds, not the one the chips below are
        asking for. They disagree freely and that is the point — this is the
        app's setting, the chips are the experiment.
      </Text>

      <SectionLabel>Path</SectionLabel>
      <Choice
        values={['system', 'player']}
        selected={path}
        onSelect={(next) => setPath(next as ChimePath)}
      />
      <Text style={styles.why}>
        {path === 'system'
          ? 'The alert path, which the app ships on and which has no gain of any kind.'
          : 'AVAudioPlayer at full gain, on the media path, into the session already held.'}
      </Text>
      <Text style={styles.note}>
        This is the one to try first. The renderer was compiled and measured on
        its own and the peak sweep spans a real 15dB in the file — so a phone
        hearing all five as much the same is a finding about the path, not about
        anything rendered into it. If player is plainly louder, the samples were
        never the problem and the alert path is the whole story.
      </Text>

      <SectionLabel>Lead-in</SectionLabel>
      <Choice values={LEADS} selected={lead} onSelect={setLead} />
      <Text style={styles.why}>
        {lead === '0'
          ? 'No silence at all, which is what the app asks for and what works.'
          : `${lead}s of silence before the notes, for the route to power up on.`}
      </Text>

      <SectionLabel>Peak</SectionLabel>
      <Choice values={PEAKS} selected={peak} onSelect={setPeak} />
      <Text style={styles.why}>
        {peak === String(CHIME_AMPLITUDE)
          ? `${peak} is what the app ships at today — full scale, and the ceiling the renderer clamps to.`
          : `${peak} against the shipping ${CHIME_AMPLITUDE}. Full scale is 1.`}
      </Text>

      <View style={styles.list}>
        <Card>
          <Button
            label="Chime — stepped in"
            variant="ghost"
            onPress={() => ring('in')}
          />
        </Card>
        <Card>
          <Button
            label="Chime — stepped out"
            variant="ghost"
            onPress={() => ring('out')}
          />
        </Card>
        <Card>
          <Button
            label="Nearby A — one note (E5)"
            variant="ghost"
            onPress={() => ring('nearby-a')}
          />
        </Card>
        <Card>
          <Button
            label="Nearby B — flat pair (A5 A5)"
            variant="ghost"
            onPress={() => ring('nearby-b')}
          />
        </Card>
        <Card>
          <Button
            label="Nearby C — flat pair, lower (C#5)"
            variant="ghost"
            onPress={() => ring('nearby-c')}
          />
        </Card>
        <Card>
          <Button
            label="Nearby D — flat pair (E5 E5) · what nearby plays"
            variant="ghost"
            onPress={() => ring('nearby-d')}
          />
        </Card>
        <Card>
          <Button
            label="Chime — recording started (C#5 E5 A5)"
            variant="ghost"
            onPress={() => ring('recording')}
          />
        </Card>
      </View>

      {/*
        The combinations, which are a third experiment and the newest.

        Everything above this asks what one sound is like. This asks what two
        of them are like together, which until 2026-09-17 was not a question
        anybody could have answered by tapping: two chimes in one tick were
        played *simultaneously*, the alert path starting a sound and returning,
        so a pair was a chord and not a sequence. There is a beat between them
        now, and whether that beat is the right length is a thing only an ear
        in a room can say.

        These go through `chime.ts` rather than the native module, because the
        queue that holds the beat is the thing being listened to.
      */}
      <SectionLabel>Chimes together</SectionLabel>
      <Card>
        <Text style={styles.body}>
          A third experiment. Above:{' '}
          <Text style={styles.strong}>what one sound is like</Text>. Here:{' '}
          <Text style={styles.strong}>whether two read as two</Text>.
        </Text>
        <Text style={styles.step}>
          1 · Tap a pair. Two events, or one longer noise?
        </Text>
        <Text style={styles.step}>
          2 · Tap the three-kind row. Can it be followed at all?
        </Text>
        <Text style={styles.step}>
          3 · Let each finish before the next — a tap into a queue is a fourth
          sound
        </Text>
        <Text style={styles.note}>
          Until 2026-09-17 a pair like these was not spaced but simultaneous.
          The alert path starts a sound and returns, so two calls in one tick
          began together and what a room heard was a chord — from which neither
          event could be recovered, let alone both. The beat is one note long,
          matching the notes inside each chime.
        </Text>
        <Text style={styles.note}>
          These play through the app's queue rather than straight at the native
          module, that queue being what holds the beat.{' '}
          <Text style={styles.strong}>So the path and lead-in rows above do
          not apply here</Text> — the queue asks for the shipping ones. The peak
          does apply, so a combination can be compared at any row of it.
        </Text>
        <Text style={styles.note}>
          Every row is a snapshot the app can really produce. No row repeats a
          kind, because a kind sounds once however many people moved — two
          departures and one step to nearby is two chimes, which is the second
          row.
        </Text>
        <Text style={styles.note}>
          The last two rows cross the two hooks: `usePresenceChime` and
          `useRecordingChime` are mounted side by side and neither knows the
          other exists, so their order is their order in `App.tsx`. Spacing
          made that order audible, which is worth hearing before it is trusted.
        </Text>
      </Card>

      <View style={styles.list}>
        {COMBINATIONS.map((combination) => (
          <Card key={combination.name}>
            <Button
              label={
                combination.name +
                (lastCombination?.name === combination.name ? ' · last' : '')
              }
              variant="ghost"
              onPress={() => ringAll(combination)}
            />
            <Text style={styles.why}>{combination.why}</Text>
          </Card>
        ))}
      </View>

      {/*
        What the queue did, which is the half a room cannot report.

        A combination that makes no sound has four explanations and they are
        not the same bug: the peak is inaudible, the binary has no `chime`, the
        speaker was still busy and the sound is coming, or the queue threw the
        row away for being further behind than a second. The first is a dial;
        the last is this section's own instructions being disobeyed — tapping
        the next row before the previous has finished — and until this readout
        existed it looked exactly like a section that does not work.
      */}
      <Card>
        {lastCombination == null ? (
          <Text style={styles.body}>No combination played yet.</Text>
        ) : (
          <View>
            <Reading label="combination" value={lastCombination.name} />
            <Reading label="queue" value={lastCombination.outcomes} />
            <Reading label="peak" value={lastCombination.peak} />
            <Reading label="path" value="system · lead 0s (the shipping ones)" />
            <Text style={styles.note}>
              <Text style={styles.strong}>dropped</Text> means the queue threw
              it away: something was still sounding more than a second ahead of
              it, which here means the previous row had not finished.{' '}
              <Text style={styles.strong}>queued</Text> means it is coming, a
              beat behind. <Text style={styles.strong}>refused</Text> means the
              binary has no chime at all and nothing on this screen will sound.
            </Text>
          </View>
        )}
      </Card>

      <SectionLabel>Where the last chime went</SectionLabel>
      <Card>
        {lastChime == null ? (
          <Text style={styles.body}>Nothing played yet.</Text>
        ) : (
          <View>
            <Reading label="kind" value={lastChime.kind} />
            <Reading label="peak" value={lastChime.peak} />
            <Reading label="lead" value={`${lastChime.lead}s`} />
            <Reading label="path" value={lastChime.path} />
            <Reading
              label="signature"
              value={
                lastChime.arity == null
                  ? 'none accepted'
                  : lastChime.arity === 4
                    ? '4 args — this bundle'
                    : `${lastChime.arity} args — older binary`
              }
            />
            <Reading
              label="native"
              value={
                lastChime.played
                  ? 'played'
                  : lastChime.path === 'player'
                    ? 'refused — player would not start'
                    : 'refused — rebuild needed'
              }
            />
            <Reading label="output" value={lastChime.outputs} />
            <Reading label="through" value={lastChime.through} />
            {lastChime.through === 'earpiece' ? (
              <Text style={styles.mismatch}>
                The earpiece. That is the quiet one, and no amount of peak
                fixes it — the route is what has to move.
              </Text>
            ) : null}
          </View>
        )}
      </Card>
      <Text style={styles.note}>
        Read after the sound, not before: a system sound plays through the
        route the session is on at that moment, so the reading is only evidence
        if it is taken then.
      </Text>
      <Text style={styles.note}>
        Signature is the one to check when a change appears to have done
        nothing. Fewer than 4 args means the binary is older than this bundle
        and is playing the sound with the later arguments baked in — so the lead
        and path above are what these chips asked for and not what was heard.
        The call steps down rather than throwing, which it used to do, turning
        every signature change into a silence of its own.
      </Text>
    </Screen>
  );
}

/**
 * Which speaker a route reading means, in the two words that matter here.
 *
 * **`Receiver` is the earpiece** — the small speaker held against an ear — and
 * it is where `playAndRecord` puts the output when `defaultToSpeaker` is not
 * set. It is quiet on purpose, being inches from an eardrum, so a cue playing
 * through it is faint for a reason that has nothing to do with how loud the
 * file is. Distinguishing the two is the whole point of this readout.
 *
 * The port types are iOS's own raw values, which `describe` in the Swift
 * prefixes to the port name — so `Speaker(Speaker)` and
 * `Receiver(Receiver)` are what actually arrive.
 */
function through(outputs: string[] | undefined): string {
  if (outputs == null) return 'route unreadable';
  if (outputs.some((o) => o.startsWith('Speaker'))) return 'loudspeaker';
  if (outputs.some((o) => o.startsWith('Receiver'))) return 'earpiece';
  if (outputs.length === 0) return 'no output port';
  return outputs.join(', ');
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
