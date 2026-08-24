import { AppState } from 'react-native';
import { drainEvents, returnEvents } from './diagnostics';

/**
 * Sends the audio log to the server, so that a fault seen once is still
 * readable tomorrow.
 *
 * **The log used to live and die in the app**, a ring of two hundred lines
 * copied out by hand. That is the right container for a fault somebody is
 * watching happen and the wrong one for a fault that appears once in ten
 * minutes of stepping in and out: it does not survive a force-quit, a crash or
 * an update, and those are the three things a person does when the audio has
 * stopped and they want it back. If the point is to collect and compare across
 * days, it has to persist somewhere that is not the thing being debugged.
 *
 * **It ships to the server's journal**, which is where every other question
 * about this system is already answered, and it is refused for any account
 * without the `debug` column — the same gate as the panel that writes these
 * lines. See `POST /diagnostics`.
 */

/**
 * How often the backlog is drained.
 *
 * Slow on purpose. Nothing here is read live — it is read the next day, against
 * a report — so the only thing latency costs is how much is lost when an app is
 * killed, and thirty seconds of that is a line or two. A faster timer would
 * spend a phone's radio to be no more useful.
 */
export const SHIP_INTERVAL_MS = 30_000;

/**
 * Starts shipping until the returned function is called.
 *
 * **A failure returns the batch rather than dropping it**, so a tunnel costs
 * nothing but delay. The one exception is a refusal: a server that says no —
 * a `debug` column turned off, a revoked token, a build the server predates —
 * will say no to the same lines for ever, and a batch that comes back after
 * every attempt is a loop that grows the backlog until the cap eats it.
 *
 * So `send` reports whether the batch is **finished with**: `true` when it was
 * delivered *or* permanently refused, `false` or a throw when it is worth
 * another attempt. That distinction belongs to whoever knows what the server
 * said, which is not this file.
 *
 * Flushed on the way to the background as well as on the timer, because
 * backgrounding is what precedes most of the ways an app stops existing.
 */
export function startShippingDiagnostics(
  send: (lines: Array<{ at: number; text: string }>) => Promise<boolean>
): () => void {
  let stopped = false;
  let inFlight = false;

  const flush = async () => {
    if (stopped || inFlight) return;
    const lines = drainEvents();
    if (lines.length === 0) return;
    inFlight = true;
    try {
      const finished = await send(lines);
      // Only what is worth another attempt comes back. A refusal is dropped
      // deliberately: the alternative is retrying it every thirty seconds for
      // the life of the process.
      if (!finished) returnEvents(lines);
    } catch {
      returnEvents(lines);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void flush(), SHIP_INTERVAL_MS);
  const subscription = AppState.addEventListener('change', (next) => {
    if (next !== 'active') void flush();
  });

  return () => {
    stopped = true;
    clearInterval(timer);
    subscription.remove();
  };
}
