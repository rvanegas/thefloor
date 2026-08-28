import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  diagnosticEvents,
  diagnosticSections,
  diagnosticText,
  readDiagnostic,
  recordEvent,
  startDiagnosticRecording,
  subscribeDiagnostics,
  type AudioDiagnostic,
} from '../audio/diagnostics';
import { appBuild } from '../api/build';
import { copyText } from '../clipboard';
import { PROBES, PROBE_GROUPS, restartAudioSession, runProbe } from '../audio/probe';
import type { AudioIntent } from '../audio/useSessionAudio';
import { colors, radius, spacing, type } from './theme';

/**
 * What the iOS audio stack is doing, on the phone, for the one account that
 * asked to see it.
 *
 * **It is here because the readings that matter cannot be taken at a desk.**
 * Every audio fault this project has had needed a Bluetooth headset and a
 * second person, which is a situation that happens away from a Mac — so a
 * console line in a development build puts the answer where the person holding
 * the evidence cannot reach it. That argument is why the panel this replaces
 * shipped to *everybody*, ungated, which was deliberate rather than an
 * oversight: at the time there was no way to show it to one person.
 *
 * The `debug` column on `accounts` is that way, and it is what makes this
 * permanent where the last one had to be temporary. The standing warning is
 * that a diagnostic left in place becomes furniture; furniture is
 * something every user can see and nobody can switch off. This is off for
 * every account in the database until somebody sets a flag, and turning it off
 * again is one `UPDATE` and a reconnect — no build, no submission, no wait.
 *
 * **What to read first: the two lines at the top.** `asked` is what this app
 * last requested of the audio session; `actual` is what `AVAudioSession`
 * currently reports. Three writers mutate the same process-wide configuration
 * and the last one wins, so those two lines disagreeing is not a symptom of
 * the bug class — it *is* the bug class. Anything the panel colours as an
 * alarm is a disagreement of that kind. Everything else is context for it.
 *
 * Larger than the rest of the app on purpose. It is read while doing something
 * else with a phone at arm's length, usually while talking to somebody.
 */
export function AudioDebugPanel({
  asked,
  steadyHeadset,
  onReconnect,
}: {
  asked: AudioIntent | null;
  /**
   * Which of the two audio-session rules this phone is on, passed in rather
   * than read here.
   *
   * The panel is the instrument and the setting is one of its readings, so it
   * comes from the same place every other reading does: the caller, which holds
   * the app state. Reading `useApp` inside a component whose whole design
   * principle is that it takes no readings of its own would be the wrong shape
   * even though this particular one costs nothing.
   */
  steadyHeadset: boolean;
  /** Tears the room down and builds a fresh one. See `SessionAudio.reconnect`. */
  onReconnect: () => void;
}) {
  /**
   * Collapsed by default.
   *
   * Even for the account that asked for it, this is not what the channel
   * screen is for — and an expanded panel polls once a second forever. The
   * recorder below starts either way, so nothing is missed by leaving it shut.
   */
  const [open, setOpen] = useState(false);
  /**
   * **Null until somebody asks, and that is the whole of the 2026-08-24 fix.**
   *
   * This was a lazy `useState` initializer calling `readDiagnostic`, plus a
   * once-a-second poll while open — so the panel read the audio engine on every
   * mount, and the panel mounts with `ChannelView`. Reading the engine is what
   * stops it: the audio cut the instant this was expanded, on a device, and
   * "walk to Home and back" is a remount and therefore a read. The instrument
   * was the fault, and every reading taken before this change is evidence about
   * an app that was observing itself to death.
   *
   * So nothing is read until *Read now* is pressed, and one press is one
   * reading. See `audio/probe.ts` for the bisection that says which of the nine
   * readers does it — none of which can be settled while something takes all
   * nine on a timer.
   */
  const [reading, setReading] = useState<AudioDiagnostic | null>(null);
  /** Bumped when a line lands in the log, which is not on the poll's clock. */
  const [, bump] = useState(0);

  // Started on mount rather than on opening, and never stopped: a route change
  // or a foregrounding that happened before somebody thought to look is
  // exactly the event worth having. See `startDiagnosticRecording`.
  useEffect(() => {
    startDiagnosticRecording();
    return subscribeDiagnostics(() => bump((n) => n + 1));
  }, []);

  /**
   * Once a second while open, and not at all while shut.
   *
   * A second is chosen against what a person can read rather than against what
   * the readers cost — they are blocking-synchronous native calls, so this
   * could run far faster and would only produce a blur. Anything faster than a
   * person can read is what the event log is for: it catches the transitions
   * that a poll would miss between two frames.
   */
  // Deliberately no polling effect. The one that was here is the bug; see the
  // note on `reading` above.

  /**
   * What the copy button last did, shown on the button itself.
   *
   * **A copy that silently failed would be the worst possible bug in this
   * particular panel** — the whole file is written against instruments that go
   * quiet, and a button that does nothing while looking like it worked sends
   * somebody away believing they have a reading they do not have.
   */
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    // **Copies the last reading rather than taking a new one**, which is the
    // opposite of what it did. Reading fresh here was right while a reading was
    // free; it is now a call that can stop the audio, and a *copy* button that
    // silently changes the thing being copied is the worst possible shape for
    // it. With no reading yet, the sections say so and the log — which costs
    // nothing and is the point — comes out regardless.
    const text = diagnosticText(
      reading ?? readingPlaceholder(asked),
      diagnosticEvents(),
      appBuild(),
      steadyHeadset
    );
    // `copyText` resolves false rather than throwing, and reports whether the
    // text actually landed — which is why the result is read instead of the
    // call merely being made. See src/clipboard.ts.
    void copyText(text).then((ok) => setCopied(ok ? 'done' : 'failed'));
  };

  const sections = reading ? diagnosticSections(reading, steadyHeadset) : [];
  const alarms = sections.reduce(
    (total, section) => total + section.rows.filter((r) => r.alarm).length,
    0
  );

  return (
    <View style={styles.panel}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        // Generous, because it is tapped one-handed while holding a
        // conversation, and because the thing under it is a diagnostic rather
        // than an action — a mis-tap should cost nothing either way.
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Audio diagnostics"
      >
        {/*
          **The build is on the header, not only in the paste.** It was in the
          copied text from the start and nowhere on the screen, so the one
          question asked before every reading — *which build am I holding?* —
          could only be answered after the reading was taken, or by asking the
          server what the socket last reported. During a run of one build every
          hour or two, that is the first thing a person needs and the last
          thing they could see.
        */}
        <Text style={styles.header}>
          {open ? '▾' : '▸'} Audio diagnostics · build {appBuild() ?? '?'}
          {alarms > 0 && open ? ` · ${alarms} disagreeing` : ''}
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {/*
            Above the readings rather than below them. The panel is longer than
            a screen, so a button at the end is one somebody has to go looking
            for — and the moment they want it is the moment they have just seen
            something, which is while the top is still in view.
          */}
          <Pressable
            onPress={copy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Copy diagnostics"
          >
            <Text style={copied === 'failed' ? styles.copyFailed : styles.copy}>
              {copied === 'done'
                ? '✓ copied'
                : copied === 'failed'
                  ? '✗ copy failed — screenshot instead'
                  : 'Copy all as text'}
            </Text>
          </Pressable>
          {/*
            The harness. Above the readings because it is now the reason to
            open this panel at all, and because the readings below are a single
            press rather than a live view.
          */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Probe — one native call each</Text>
            <Text style={styles.note}>
              Play something, alone, then press one. If the sound stops, that
              call is the fault. Groups first, then the members of whichever
              group cut it.
            </Text>
            <Tap label="Read now (all nine at once)" onPress={() => setReading(readDiagnostic(asked))} />
            {PROBE_GROUPS.map((group) => (
              <Tap
                key={group.name}
                label={`▸ ${group.name}`}
                onPress={() => {
                  for (const probe of group.probes) runProbe(probe, recordEvent);
                }}
              />
            ))}
            {PROBES.map((probe) => (
              <Tap
                key={probe.name}
                label={`· ${probe.name}`}
                onPress={() => runProbe(probe, recordEvent)}
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recover — so a kill costs no reinstall</Text>
            <Tap
              label="Restart audio session"
              onPress={() => void restartAudioSession(recordEvent)}
            />
            <Tap
              label="Rebuild the room"
              onPress={() => {
                recordEvent('rebuild room');
                onReconnect();
              }}
            />
          </View>

          {sections.length === 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Session — asked vs actual</Text>
              <Text style={styles.rowValue}>
                nothing read yet — press Read now
              </Text>
            </View>
          ) : null}

          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.rows.map((row, i) => (
                <View key={`${row.label}-${i}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text
                    style={row.alarm ? styles.rowValueAlarm : styles.rowValue}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Log — newest last</Text>
            {diagnosticEvents().length === 0 ? (
              // Said rather than left blank. An empty instrument that looks
              // like a quiet one is how five separate readings were misread on
              // 2026-08-20; see diagnostics.ts.
              <Text style={styles.rowValue}>nothing recorded yet</Text>
            ) : (
              diagnosticEvents().map((event, i) => (
                <Text key={`${event.at}-${i}`} style={styles.event}>
                  {clock(event.at)} {event.text}
                </Text>
              ))
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One button, sized for a thumb at arm's length like everything else here.
 *
 * **It acknowledges the press, and that is not decoration.** Asked for after a
 * session of probing: "I was never quite sure" whether a press had registered.
 * On a panel whose whole purpose is to correlate a tap against a sound, a tap
 * you are unsure of poisons the reading — you cannot tell a probe that did
 * nothing from a probe that never ran, which is precisely the distinction the
 * harness exists to make. The copy button has said `✓ copied` since it was
 * written, for the same reason and in the same words.
 *
 * Two and a half seconds, which is what the clipboard card and the copy button
 * already use: long enough to read while listening, short enough that a second
 * press is not mistaken for the first one's acknowledgement.
 */
function Tap({ label, onPress }: { label: string; onPress: () => void }) {
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => setPressed(false), 2500);
    return () => clearTimeout(timer);
  }, [pressed]);

  return (
    <Pressable
      onPress={() => {
        // Before the work, so a call that blocks the JS thread — which is what
        // every probe here does — still shows that it started. One that never
        // returns would otherwise look like a press that never landed.
        setPressed(true);
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={pressed ? styles.tapPressed : styles.tap}>
        {pressed ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

/**
 * A reading that took no readings, for a copy made before anybody pressed
 * *Read now*.
 *
 * `asked` is carried because it costs nothing — it is what this app last
 * requested, held in JavaScript, and reading it back touches no native audio
 * anything. The two that do are null, which every renderer here already
 * renders as `unreadable` rather than as false. That distinction is the oldest
 * rule in `diagnostics.ts` and it is exactly right for this case: nothing was
 * measured, which is not the same as measuring nothing.
 */
function readingPlaceholder(asked: AudioIntent | null): AudioDiagnostic {
  return { asked, engine: null, route: null, at: Date.now() };
}

/** hh:mm:ss, so a line in the log can be lined up against a memory of a sound. */
function clock(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Monospace throughout, and two points larger than `type.mono`.
 *
 * Monospace because the whole panel is values being compared down a column,
 * and proportional digits make two lines that differ look like two lines that
 * are the same length. Larger because it is read at arm's length by somebody
 * who is mid-conversation and cannot lean in.
 */
const monospace = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing(1),
    padding: spacing(1),
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  header: { ...type.heading, fontSize: 17 },
  body: { marginTop: spacing(1) },
  tap: {
    fontFamily: monospace,
    fontSize: 17,
    color: colors.floor,
    paddingVertical: spacing(0.5),
  },
  // Deliberately a colour change as well as a tick: the panel is read at arm's
  // length while listening for a sound, and a single character appearing at
  // the head of a line is easy to miss.
  tapPressed: {
    fontFamily: monospace,
    fontSize: 17,
    color: colors.text,
    paddingVertical: spacing(0.5),
  },
  note: {
    fontFamily: monospace,
    fontSize: 13,
    color: colors.textMuted,
    paddingBottom: spacing(0.5),
  },
  copy: {
    fontFamily: monospace,
    fontSize: 17,
    color: colors.floor,
    paddingVertical: spacing(0.5),
    marginBottom: spacing(0.5),
  },
  copyFailed: {
    fontFamily: monospace,
    fontSize: 17,
    color: colors.danger,
    paddingVertical: spacing(0.5),
    marginBottom: spacing(0.5),
  },
  section: { marginBottom: spacing(1.5) },
  sectionTitle: {
    ...type.label,
    fontSize: 13,
    marginBottom: spacing(0.5),
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  rowLabel: {
    fontFamily: monospace,
    fontSize: 17,
    color: colors.textMuted,
    // Fixed, so every value in the panel starts at the same x and a column can
    // be scanned rather than read.
    width: 132,
  },
  rowValue: {
    fontFamily: monospace,
    fontSize: 17,
    color: colors.text,
    flexShrink: 1,
  },
  rowValueAlarm: {
    fontFamily: monospace,
    fontSize: 17,
    // The one colour in this app reserved for something being wrong. Nothing
    // here is dangerous to touch; what it marks is a reading to act on.
    color: colors.danger,
    fontWeight: '700',
    flexShrink: 1,
  },
  event: {
    fontFamily: monospace,
    fontSize: 15,
    color: colors.textMuted,
  },
});
