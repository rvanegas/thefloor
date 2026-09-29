import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WATCH_DRIFT_MS } from '../../../core/constants';
import { Button } from '../ui/components';
import { colors, spacing, type } from '../ui/theme';
import {
  readDrift,
  requestCorrection,
  subscribeDrift,
  type DriftReading,
} from './drift';

/**
 * What the follower is steering on, drawn for an account with `debug` set.
 *
 * **It draws the follower's own number rather than its own.** Everything else
 * that shows a position recomputes it — the scrubber does, the expanded picture
 * does — and a readout that recomputed would be a second answer to the question
 * it exists to settle. `drive.ts` publishes what it decided from; this subscribes
 * and draws it. See `drift.ts` for why it arrives through a module rather than
 * through the context or the hook.
 *
 * **Not translated**, following `AudioDebugPanel`, which imports no i18n at all.
 * These are field names for whoever is reading a log beside them, not words a
 * user meets — GLOSSARY.md Part One is the vocabulary that gets translated and
 * none of this is in it.
 *
 * It re-renders twice a second, which is why it is its own component drawn as a
 * sibling of the transport rather than a row inside it: `Transport.tsx` is drawn
 * in three places from one definition and must not be re-rendered on a tick for
 * a readout that only one account can see.
 *
 * **And it carries the one control drift has.** Under `debug` the follower
 * corrects nothing of its own accord — see `useFollow`'s `byHand` — so a
 * correction it would have made waits here for somebody to press for it. Drawn
 * with the numbers it is judged by rather than in the transport, which is one
 * row in three places and has no business learning about an account flag.
 */
export function DriftReadout({
  channelId,
}: {
  channelId: string;
}): React.ReactElement | null {
  const [reading, setReading] = useState<DriftReading | null>(() =>
    readDrift(channelId)
  );
  useEffect(
    () => subscribeDrift(() => setReading(readDrift(channelId))),
    [channelId]
  );

  // Nothing to say before a player has been read, and nothing to say about a
  // dead one — `forgetDrift` is what makes the second of those true, and the
  // difference matters: a stale drift looks exactly like a settled one.
  if (!reading) return null;

  const drift = reading.driftMs;
  /*
    **Signed, and ahead is positive.** The sign is the whole reading on a resume:
    a player *ahead* of the room is the pause banking a position it had not
    reached, which nothing corrects, and a player *behind* is drift a seek can
    still close. Two decimals because the question is a boundary — whole seconds
    leave a drift anywhere between 100ms and 1.9s, which is why build 305's
    alternating corrections could not be explained from the log at all.
  */
  const driftText =
    drift === null
      ? '—'
      : `${drift >= 0 ? '+' : '−'}${(Math.abs(drift) / 1000).toFixed(2)}s`;
  const outside = drift !== null && Math.abs(drift) > WATCH_DRIFT_MS;

  return (
    <View style={styles.block}>
      <Row label="drift" value={driftText} alert={outside} />
      {/*
        **The headline, and the success criterion for the whole correction
        machinery: nought.** A number climbing while a film plays normally is the
        seek storm. Red when it is not nought because that is what `danger` means
        and this genuinely is a fault — no hue is spent on anything new here, per
        STYLE.md § *The rules that are actually load-bearing*, rule 1.
      */}
      <Row
        label="seeks this run"
        value={String(reading.seeksThisRun)}
        alert={reading.seeksThisRun > 0}
      />
      <Row
        label="player / want"
        value={`${reading.playerState} / ${reading.wantStatus}`}
      />
      {/*
        The stall is the one case a recovered drift is not corrected out of, so
        it is worth being able to watch one happen rather than inferring it from
        a drift that grew.
      */}
      <Row
        label="buffering for"
        value={
          reading.bufferingForMs === 0
            ? '—'
            : `${(reading.bufferingForMs / 1000).toFixed(2)}s`
        }
      />
      {/*
        What a correction's lead is spent from, and therefore whether a
        correction can converge at all. Null until this player has demonstrated
        one — `drive.ts` guesses nothing.
      */}
      <Row
        label="lag play / seek"
        value={`${ms(reading.lagPlayMs)} / ${ms(reading.lagSeekMs)}`}
      />
      {/*
        Enabled by `withheld` rather than by the drift passing the tolerance:
        the rule has more to say than the tolerance does — a player ahead by its
        own lead is outside it and is left alone — and a button enabled on a
        second opinion would be pressed and do nothing.
      */}
      <Button
        label="Correct drift"
        onPress={requestCorrection}
        disabled={!reading.withheld}
        style={styles.correct}
      />
    </View>
  );
}

function ms(value: number | null): string {
  return value === null ? '—' : `${value}ms`;
}

function Row({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, alert ? styles.alert : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: spacing(1), gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...type.muted, color: colors.textFaint },
  // `tabular-nums`, which is the reason `type.mono` exists: a column of figures
  // that changes twice a second must not shift under the eye reading it. Taken
  // at the role's own size rather than shrunk, so this is not a departure
  // STYLE.md would have to carry — and it is `type.mono` rather than a
  // monospace family, which is still the two places that file names.
  /*
    **`type.mono`'s `fontVariant` is a readonly tuple and `StyleSheet.create`
    wants a mutable array**, so the role cannot be spread in as it stands — the
    tuple's readonly-ness survives a spread. Copied element by element rather
    than cast, because a cast here would silently accept a role whose shape had
    changed.

    This is the first stylesheet in the app to use the role at all: everywhere
    else names it only in a comment, which is why the friction had not been met
    before.
  */
  value: { ...type.mono, fontVariant: [...type.mono.fontVariant] },
  alert: { color: colors.danger },
  correct: { marginTop: spacing(1) },
});
