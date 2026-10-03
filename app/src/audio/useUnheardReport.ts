import { useEffect, useRef } from 'react';
import type { ChannelState, UserId } from '../../../core/types';
import { recordEvent } from './diagnostics';
import { unheardSpeakers, type Hearing } from './unheard';

/**
 * How long somebody may go unheard before it is reported.
 *
 * Comfortably past the ordinary gaps: a subscription after joining waits out
 * `SUBSCRIBE_SETTLE_MS` and has been seen to land about a second and a half
 * after the room connects, and a release is restored by the server in one
 * call plus, if that missed, one 500ms tick. Five seconds of a speaker the
 * room says you can hear, and cannot, is not a gap.
 */
export const UNHEARD_REPORT_MS = 5_000;

/**
 * Tells the server, and this device's log, when somebody it should be hearing
 * has gone `UNHEARD_REPORT_MS` without a subscription.
 *
 * **The one check on whether LiveKit did what it was asked.** The server
 * withholds and restores by stating subscriptions, and has no way to read one
 * back — see `Hearing`. Without this, a statement accepted and not applied
 * is somebody silent under a screen that says the room is open, and nobody
 * would know it had happened unless they said so.
 *
 * **Reported once per episode**, with a second log line when it ends, so a
 * phone's timeline says how long it lasted. Only while the room is connected:
 * during a reconnection everybody is unheard and that is not this fault.
 *
 * Held in `App.tsx` beside `useSpeakingReport`, for its reason — the audio
 * follows the channel you are present in, not the one on screen.
 */
export function useUnheardReport(
  channel: ChannelState | null,
  me: UserId,
  connected: boolean,
  hearing: Hearing,
  report: (channelId: string, speaker: string, forMs: number) => void
): void {
  const channelId = channel?.id ?? null;
  const unheard = connected ? unheardSpeakers(channel, me, hearing) : [];
  const key = channelId ? unheard.map((id) => `${channelId} ${id}`).join('\n') : '';

  // Held for `useSpeakingReport`'s reason: the sender is rebuilt on every
  // provider change, and must not re-run the effect.
  const send = useRef(report);
  send.current = report;

  const episodes = useRef(
    new Map<string, { at: number; told: boolean; timer: ReturnType<typeof setTimeout> }>()
  );

  useEffect(() => {
    const now = Date.now();
    const current = new Set(key ? key.split('\n') : []);
    for (const [episode, entry] of episodes.current) {
      if (current.has(episode)) continue;
      clearTimeout(entry.timer);
      if (entry.told) {
        recordEvent(`heard again ${episode.split(' ')[1]} after ${now - entry.at}ms`);
      }
      episodes.current.delete(episode);
    }
    for (const episode of current) {
      if (episodes.current.has(episode)) continue;
      const [room, speaker] = episode.split(' ');
      const entry = {
        at: now,
        told: false,
        timer: setTimeout(() => {
          entry.told = true;
          recordEvent(`unheard ${speaker} for ${UNHEARD_REPORT_MS}ms`);
          send.current(room, speaker, UNHEARD_REPORT_MS);
        }, UNHEARD_REPORT_MS),
      };
      episodes.current.set(episode, entry);
    }
  }, [key]);

  // Going away ends every episode without a word: nothing is owed by a device
  // that is no longer listening.
  useEffect(() => {
    const open = episodes.current;
    return () => {
      for (const entry of open.values()) clearTimeout(entry.timer);
      open.clear();
    };
  }, []);
}
