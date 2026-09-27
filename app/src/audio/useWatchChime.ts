import { useEffect, useRef } from 'react';
import type { ChannelState, WatchStatus } from '../../../core/types';
import { chime, warmChimes, type ChimeKind } from './chime';

/**
 * Sounds a chime in the room this device is standing in when the party's film
 * starts or stops.
 *
 * **What this is for is the ear that cannot see the transport**, which during a
 * watch party is most of the room. A film playing closes every microphone in
 * the channel — `isScreening` in core/micNeeded.ts, and the run is
 * enforced-muted for its length — so what somebody not looking at a screen
 * experiences is the conversation going silent, with nothing whatsoever to say
 * why. A phone in a pocket is the sharpest case and it is an ordinary one: the
 * app goes on running because the call keeps it alive, the room falls quiet,
 * and the person holding it has been told nothing. The pause is the same event
 * backwards and needs saying just as much, being the moment their voice is
 * worth using again.
 *
 * **Above the channel screen, like the other two chime hooks, and for the same
 * reason**: walking back to Home leaves you in the conversation, and somebody
 * not looking at the channel is exactly the person the picture never reached.
 *
 * **Everybody present hears it, whoever pressed the button included.** That is
 * `useRecordingChime`'s rule rather than the presence chimes', and for its
 * reason: the sound is not feedback for the presser but the moment at which the
 * room was told, and a notice one party is exempt from is a weaker thing to
 * have given. It does mean a chime over the first moment of the film for
 * whoever is watching it — accepted, at 180ms, because the alternative is a
 * per-device guard on *whether this screen can see the picture*, and the one
 * device that answers that wrongly is the backgrounded phone: it holds the
 * screen role while iOS has suspended its WebView, so gating on the role would
 * silence the cue for precisely the person it exists for.
 *
 * **It is local, and it is not in the media room**, on the reasoning
 * `usePresenceChime` carries in full: publishing a chime into LiveKit would
 * land it in the stem and therefore in transcripts. Each device makes its own
 * sound.
 *
 * **Takes `live`**, the channel this device is present in, so "only the people
 * in the room hear it" needs no guard.
 */
export function useWatchChime(
  channel: ChannelState | null,
  fire: (kind: ChimeKind) => void = chime
): void {
  /**
   * The status this hook last saw, or null before the first look.
   *
   * **Null is the "taken as read" state**, as in the other two hooks: stepping
   * into a channel with a film already running is not the moment that film
   * started, and chiming for it would be announcing the past. The picture and
   * the transport are what tell you about a run already in progress.
   *
   * Keyed with the channel so that walking from one room to another is a fresh
   * memory rather than a transition — nothing that was already playing where
   * you have just arrived began while you were there.
   */
  const seen = useRef<{ channelId: string; status: WatchStatus } | null>(null);

  /**
   * Renders the sounds before they are wanted, for the reason the other hooks
   * warm theirs: the first play of a given kind writes a WAV and creates a
   * `SystemSoundID` in the same breath as playing it, which is how a cue
   * arrives half-formed. `warmChimes` does all six, which keeps the hooks
   * independent of each other's mounting.
   */
  useEffect(() => {
    warmChimes();
  }, []);

  const channelId = channel?.id ?? null;
  const status = channel?.watch?.status ?? 'idle';

  useEffect(() => {
    if (channelId === null) {
      seen.current = null;
      return;
    }

    const before = seen.current;
    seen.current = { channelId, status };

    if (!before || before.channelId !== channelId) return;
    if (before.status === status) return;

    /*
      **Two sounds over three states, which is the whole of the mapping.**

      A film is `idle`, `paused` or `playing`, and what the room cares about is
      only whether it is the third: that is when the microphones are shut. So
      every edge into `playing` is the first sound and every edge out of it is
      the second, and the edges that do not touch `playing` — a link pasted, a
      film swapped, a paused party stopped — make no sound at all, having
      changed nothing anybody can hear.

      **That makes *Stop* and a film reaching its end sound like a pause**,
      deliberately, rather than acquiring a third chime. What the sound says is
      *the room has its voices back*, and all three ways out of a run say
      exactly that; a listener who cannot see the screen has no use for the
      difference between a film that was stopped and one that ran out, and
      would have to be taught a third cue to learn it.
    */
    if (status === 'playing') {
      fire('play');
      return;
    }
    if (before.status === 'playing') fire('pause');
  }, [channelId, status, fire]);
}
