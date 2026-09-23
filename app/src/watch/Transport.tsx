import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClientAction } from '../../../core/protocol';
import type { WatchParty, WatchState } from '../../../core/types';
import { recordEvent } from '../audio/diagnostics';
import { Button } from '../ui/components';
import { useText } from '../i18n';
import { colors, formatDuration, radius, spacing, type } from '../ui/theme';

/**
 * **The transport, which is one row drawn in three places.**
 *
 * The watch card has it under the picture, a second device has it under the
 * readout, and the expanded picture has it over the bottom of itself. They are
 * one component rather than three that must be kept in step — a scrubber that
 * learnt a new trick in one of them and not the others is exactly the drift
 * this exists to prevent.
 *
 * **It became a component on 2026-09-23, and the reason is structural rather
 * than tidiness.** It was a closure inside `ChannelView`, which was fine while
 * both places it was drawn were inside that screen. The expanded picture is
 * not any more: the player is mounted above the route table so that expanding
 * it costs no reload, and the scrim that carries these controls has to be
 * drawn above the player, which means it is drawn by `Picture` — a component
 * that is `ChannelView`'s *ancestor*. A React element cannot be handed
 * upwards, so what travels instead is the handful of plain values below.
 *
 * Everything it needs is a prop. It holds no state but the width of its own
 * track, derives nothing, and asks nothing of any context — which is what lets
 * it be drawn on either side of the route table.
 */
export function WatchTransport({
  watch,
  party,
  watchAt,
  mayControl,
  mayPlay,
  withTitle,
  act,
}: {
  watch: WatchState;
  /** The film. Null draws nothing, there being no transport without one. */
  party: WatchParty | null;
  /** How far in the room is, which ticks and is the caller's to compute. */
  watchAt: number;
  /** Whether this person may drive the film at all. */
  mayControl: boolean;
  /**
   * Whether they may *start* it, which is the narrower of the two.
   *
   * Pause is the way out and is never refused for a run; play is. See
   * `canPlayWatch`.
   */
  mayPlay: boolean;
  /**
   * Whether the film's name is drawn under the bar.
   *
   * The card and a second device are a page somebody is reading and carry it;
   * the expanded picture's scrim carries the transport and the way out and
   * nothing else.
   */
  withTitle: boolean;
  act: (action: ClientAction) => boolean;
}): React.ReactElement | null {
  const t = useText().watch;
  /** How wide the track is, which the seek arithmetic is measured against. */
  const trackWidth = useRef(0);

  if (!party) return null;

  return (
    <>
      {party.durationMs ? (
        <>
          {/*
            **The scrubber, which is where dragging YouTube's bar went.**
            Taking the picture's own controls away leaves ±15s as the only way
            to reach a different part of a film, which is no way to cross two
            hours of one. A tap lands where it is put, in the one place that
            was already drawing where everybody is.

            A tap rather than a drag: a drag wants a gesture handler and a held
            position that does not follow the channel while a finger is down,
            and neither is worth having before somebody has used this one.
            `locationX` is measured against the track itself, so the arithmetic
            is the fill's in reverse.
          */}
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={t.seek()}
            disabled={!mayControl}
            onPress={(event) => {
              const width = trackWidth.current;
              if (!width || !party.durationMs) return;
              const at =
                (event.nativeEvent.locationX / width) * party.durationMs;
              act({
                type: 'WATCH_SEEK',
                positionMs: Math.max(
                  0,
                  Math.min(party.durationMs, Math.round(at))
                ),
              });
            }}
            onLayout={(event) => {
              trackWidth.current = event.nativeEvent.layout.width;
            }}
            style={styles.progressTrack}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(
                    100,
                    (watchAt / Math.max(1, party.durationMs)) * 100
                  )}%`,
                },
              ]}
            />
          </Pressable>
          <View style={styles.progressLabels}>
            <Text style={styles.progressTime}>{formatDuration(watchAt)}</Text>
            <Text style={styles.progressTime}>
              {formatDuration(party.durationMs)}
            </Text>
          </View>
        </>
      ) : (
        // No bar until a screen has said how long the video is — nothing here
        // asks YouTube anything, so until then the only honest thing to show
        // is how far in everybody is.
        <Text style={styles.progressTime}>{formatDuration(watchAt)} in</Text>
      )}

      {/*
        **What is on, said in words, under the bar that says how far in it
        is.**

        The card went without a name from 2026-09-18, when the URL was taken
        off it: a link is machine text, and fetching a title would have been
        the first request this application ever made to Google. Neither of
        those is what this is. The player already holds the name of the video
        it is showing, and says so in the report it was already making — the
        same path the duration takes, and the same rule, the channel keeping
        the first answer. See `WatchParty.title`.

        **Under the bar rather than over it**, which is where the *Listen* tab
        draws a track's name. A track's title is the whole subject of that
        card, there being nothing else on it; here the subject is the picture,
        and a heading between the two would come between somebody and the
        film. This is a caption on the transport, so it is drawn as one.

        Null for the first seconds of every party and for the whole of one that
        nobody is showing anywhere — a player is what names a film, and a room
        where nobody has one draws what it always drew.
      */}
      {withTitle && party.title ? (
        <Text style={type.body} numberOfLines={1}>
          {party.title}
        </Text>
      ) : null}

      {/*
        **The transport, and the film's own bar is the other way of reaching
        it.**

        This row came out earlier on 2026-09-18 and went back in the same day,
        which is worth recording because the reasoning changed underneath it
        rather than being reversed. What was wrong with two sets of controls
        was never that there were two: it was that *one of them did not work* —
        the app's row was governed by the floor while YouTube's bar sat above
        it ungoverned and visible, and which of them answered a finger depended
        on a claim somebody might make mid-scene.

        Both are live now and both produce the same three actions, so they are
        one transport with two surfaces rather than two transports. And the bar
        alone was not enough: it is on the picture, so **a device that is not
        showing the film had no controls at all** — which is most of a party
        most of the time, since a screen is one device per person. See
        planning/decisions/2026-09-18-the-bar-is-the-transport.md.
      */}
      <View style={styles.buttonRow}>
        <Button
          label={t.back15()}
          style={styles.flexButton}
          disabled={!mayControl}
          onPress={() =>
            act({ type: 'WATCH_SEEK', positionMs: watchAt - SKIP_MS })
          }
        />
        <Button
          label={watch.status === 'playing' ? t.pause() : t.play()}
          variant="primary"
          style={styles.flexButton}
          disabled={watch.status === 'playing' ? !mayControl : !mayPlay}
          onPress={() => {
            /*
              **The press, timestamped, and whether it left the device.**

              `app.act` already reports whether the socket wrote — see
              `socket.send`, and backlog § *A channel action that never lands
              says nothing* — and until now every caller dropped the answer.
              Written down here because this is the one control where a press
              that goes nowhere and a press that goes somewhere and is ignored
              look identical from the outside, and they are the two halves of
              the same complaint. The line lands in the same log as the audio
              session's, which is where the two are told apart.
            */
            const sent = act({
              type: watch.status === 'playing' ? 'WATCH_PAUSE' : 'WATCH_PLAY',
            });
            recordEvent(
              `watch press ${watch.status === 'playing' ? 'pause' : 'play'}` +
                (sent ? '' : ' (not sent)')
            );
          }}
        />
        <Button
          label={t.forward15()}
          style={styles.flexButton}
          disabled={!mayControl}
          onPress={() =>
            act({ type: 'WATCH_SEEK', positionMs: watchAt + SKIP_MS })
          }
        />
      </View>
    </>
  );
}

/** How far the two seek buttons move the film. */
const SKIP_MS = 15_000;

/**
 * The row's own styles.
 *
 * **Token-derived rather than shared with `ChannelView`'s sheet**, which has
 * rules of the same names for the *Listen* tab's playback card. That card is a
 * different feature that happens to look the same, and the two only ever
 * agreed because one person wrote both; keeping them apart means a change to
 * the film's bar cannot silently restyle a podcast's. See STYLE.md, which
 * governs the tokens rather than the rules.
 */
const styles = StyleSheet.create({
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.floor },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  buttonRow: { flexDirection: 'row', gap: spacing(1) },
  flexButton: { flex: 1 },
});
