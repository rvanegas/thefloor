import { useEffect, useRef } from 'react';
import type { ChannelState } from '../../../core/types';
import { chime, warmChimes, type ChimeKind } from './chime';

/**
 * Sounds a chime in the room this device is standing in when a recording
 * somebody started begins.
 *
 * **What this is for is notice, not feedback.** Until now a run announced
 * itself with a red dot and the word *Recording* in the channel view, which is
 * notice to whoever happens to be looking at a screen — and the whole point of
 * a conversation on The Floor is that people are talking rather than watching.
 * `backlog/two-party-consent-has-not-been-reviewed.md` is the standing
 * question this is an installment on: it does not answer whether notice is
 * consent anywhere, and nothing here should be read as claiming it does. What
 * it changes is that the notice now reaches an ear.
 *
 * **Above the channel screen, like `usePresenceChime`, and for the same
 * reason**: walking back to Home leaves you in the conversation, and somebody
 * not looking at the channel is exactly the person the dot never reached.
 *
 * **Only runs that were started by hand.** A channel with `autoRecord` on
 * begins recording by itself, and `recording.automatic` is the server's own
 * account of which happened — see `autoRecord` in `server/src/channels.ts`,
 * the one place that sets it. The wire's `START_RECORDING` carries no such
 * field, so the bit cannot be forged from a client to silence a start on
 * somebody else's phone. Note what this leaves standing, because it is the
 * uncomfortable half: the runs with no audible notice are precisely the ones
 * nobody pressed anything for. That is a deliberate scope, not an oversight,
 * and it belongs in front of whoever reviews the consent question.
 *
 * **It is local, and it is not in the media room**, on the reasoning
 * `usePresenceChime` carries in full: publishing a chime into LiveKit would
 * land it in the stem and therefore in transcripts, and would need the media
 * participant open at moments it is not. Each device makes its own sound.
 *
 * **Everybody present hears it, the starter included**, which is the one place
 * this departs from the presence chimes. Those withhold your own arrival from
 * you because you already know you arrived; here the sound is not information
 * for the starter but the event by which both parties were told, and a notice
 * one party is exempt from is a weaker thing to have given.
 *
 * **Takes `live`**, the channel this device is present in, so "only the people
 * in the room hear it" needs no guard.
 */
export function useRecordingChime(
  channel: ChannelState | null,
  fire: (kind: ChimeKind) => void = chime
): void {
  /**
   * The run this hook has already seen, or null before the first look.
   *
   * **Keyed on the run id rather than the status**, which is what makes pause
   * and resume silent: a resumed run is the same run, and its id does not
   * change across either edge. Only a new id is a new recording.
   *
   * Null is the "taken as read" state, as in `usePresenceChime`: stepping into
   * a channel that is already recording is not the moment that recording
   * started, and chiming for it would be announcing the past — the dot and the
   * label are what tell you about a run already in progress.
   */
  const seen = useRef<{ channelId: string; runId: string | null } | null>(null);

  /**
   * Renders the sound before it is wanted, for the reason `usePresenceChime`
   * warms the other three: the first play of a given kind writes a WAV and
   * creates a `SystemSoundID` in the same breath as playing it, which is how a
   * cue arrives half-formed. Warming all four here rather than only this one
   * costs a few milliseconds and keeps the two hooks independent — neither is
   * mounted on the other's account, and a chime that only worked while the
   * presence hook happened to be mounted would be a coupling nothing states.
   */
  useEffect(() => {
    warmChimes();
  }, []);

  const channelId = channel?.id ?? null;
  const runId = channel?.recording.runId ?? null;
  const status = channel?.recording.status ?? 'idle';
  const automatic = channel?.recording.automatic ?? false;

  useEffect(() => {
    if (channelId === null) {
      seen.current = null;
      return;
    }

    const before = seen.current;
    seen.current = { channelId, runId };

    // A different channel starts a fresh memory. Nothing that was already
    // running in the room you have just walked into began while you were in
    // it.
    if (!before || before.channelId !== channelId) return;
    if (runId === null || runId === before.runId) return;
    // `paused` cannot be a beginning, and a run that failed at the first
    // breath is not one either: what is being announced is capture actually
    // running.
    if (status !== 'recording') return;
    if (automatic) return;

    fire('recording');
  }, [channelId, runId, status, automatic, fire]);
}
