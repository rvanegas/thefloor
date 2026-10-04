import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WATCH_DRIFT_MS } from '../../../core/constants';
import { RUNG_NAMES, type Rest, type Rung } from '../../../core/watch';
import { colors, spacing, type } from '../ui/theme';
import {
  DRIFT_REPORT_MS,
  readDrift,
  readOtherDrifts,
  subscribeDrift,
  type DriftReading,
  type OtherDrift,
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
 * **It carries no control.** Nobody's follower corrects drift since
 * 2026-10-03, and `debug` changes only what is drawn — the *Correct drift*
 * button went with the switch that held corrections back for it. See
 * planning/decision/2026-10-03-nobody-corrects-drift.md.
 *
 * **Then every other screen in the room, a line each**, as their own followers
 * reported them — see `ClientMessage.watch.drift`. Drift is a question about
 * the room being in step, and one device's answer to it was half the answer.
 * Drawn even where this device is not the screen, since a debug account
 * watching the room from its phone is exactly who wants the other lines.
 */
export function DriftReadout({
  channelId,
  nameOf,
}: {
  channelId: string;
  /** Who a screen belongs to, by account. */
  nameOf: (userId: string) => string;
}): React.ReactElement | null {
  const [reading, setReading] = useState<DriftReading | null>(() =>
    readDrift(channelId)
  );
  const [others, setOthers] = useState<OtherDrift[]>(() =>
    readOtherDrifts(channelId)
  );
  useEffect(() => {
    const read = () => {
      setReading(readDrift(channelId));
      setOthers(readOtherDrifts(channelId));
    };
    read();
    // Re-read on a clock as well as on news, since what retires a line that
    // nobody withdrew is time passing and nothing announces that.
    const timer = setInterval(read, DRIFT_REPORT_MS);
    const unsubscribe = subscribeDrift(read);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [channelId]);

  // Nothing to say before a player has been read, and nothing to say about a
  // dead one — `forgetDrift` is what makes the second of those true, and the
  // difference matters: a stale drift looks exactly like a settled one.
  if (!reading && others.length === 0) return null;

  return (
    <View style={styles.block}>
      {reading ? <OwnDrift reading={reading} /> : null}
      {others.map((other) => (
        <Row
          key={other.userId}
          label={nameOf(other.userId)}
          value={describeOther(other)}
          alert={
            outsideTolerance(other.reading.driftMs) ||
            other.reading.seeksThisRun > 0 ||
            struggling(other.reading.rung ?? null)
          }
        />
      ))}
    </View>
  );
}

/**
 * Another screen on one line: its drift, its player, its seeks, and the
 * buffering only while there is some. Red on the same two faults the own block
 * reddens for, since the line has room for one colour.
 */
function describeOther({ reading }: OtherDrift): string {
  const parts = [
    signed(reading.driftMs),
    reading.playerState,
    `${reading.seeksThisRun} seeks`,
  ];
  if (reading.bufferingForMs > 0) {
    parts.push(`buf ${(reading.bufferingForMs / 1000).toFixed(2)}s`);
  }
  // Only from a build that reports the ladder; an older one says nothing here.
  if (reading.rung != null) parts.push(`rung ${reading.rung}`);
  else if (reading.rest != null && reading.rest !== 'agreed') parts.push(reading.rest);
  return parts.join(' · ');
}

/**
 * Whether the ladder has had to go past telling the player twice, which is
 * the colour's one use on that row: the rescue, the rebuild and giving up are
 * each a player that has not done as it was told.
 */
function struggling(rung: Rung | null): boolean {
  return rung !== null && rung >= 2;
}

/**
 * The ladder on one line: the rung and how long it has been on it, or the
 * rest the follower is in when it is not climbing.
 */
function describeLadder(
  rung: Rung | null,
  rest: Rest | null,
  forMs: number
): string {
  if (rung === null) return rest === null ? 'acting' : rest;
  const parts = [`${rung} ${RUNG_NAMES[rung]}`, `${(forMs / 1000).toFixed(1)}s`];
  if (rest !== null) parts.push(rest);
  return parts.join(' · ');
}

function outsideTolerance(drift: number | null): boolean {
  return drift !== null && Math.abs(drift) > WATCH_DRIFT_MS;
}

function signed(drift: number | null): string {
  return drift === null
    ? '—'
    : `${drift >= 0 ? '+' : '−'}${(Math.abs(drift) / 1000).toFixed(2)}s`;
}

/** This device's own reading, in full. */
function OwnDrift({ reading }: { reading: DriftReading }): React.ReactElement {
  const drift = reading.driftMs;
  /*
    **Signed, and ahead is positive.** The sign is the whole reading on a resume:
    a player *ahead* of the room is the pause banking a position it had not
    reached, and a player *behind* is one that fell behind while playing —
    neither of which anything corrects since 2026-10-03. Two decimals because the question is a boundary — whole seconds
    leave a drift anywhere between 100ms and 1.9s, which is why build 305's
    alternating corrections could not be explained from the log at all.
  */
  const driftText = signed(drift);
  const outside = outsideTolerance(drift);

  return (
    <>
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
        **Where the follower is on its ladder**, since 2026-10-03: *agreed*
        when it is at rest in agreement, otherwise the rung, how long it has
        been on it, and what it is waiting out. A follower is never at rest any
        other way, so a stuck player shows here as a rung rather than as a
        number that has stopped moving. See `stepFollow` in core/watch.ts.
      */}
      <Row
        label="ladder"
        value={describeLadder(reading.rung, reading.rest, reading.rungForMs)}
        alert={struggling(reading.rung)}
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
    </>
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
});
