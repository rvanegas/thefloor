import type { LiveLine } from '../../../core/protocol';

/**
 * The live transcript's lines as they arrive over the socket, handed to
 * whichever Transcript tab is showing their channel.
 *
 * A module rather than state on the provider, for `watch/drift.ts`'s reason:
 * a line is an event a screen folds into what it already fetched, and nothing
 * else in the app has any business re-rendering because one arrived. Nothing
 * is held here — a tab that is not mounted fetches the history when it is.
 */
type Watcher = (line: LiveLine) => void;

const watchers = new Map<string, Set<Watcher>>();

/** One line, from the socket. */
export function receiveLiveLine(channelId: string, line: LiveLine): void {
  for (const watcher of watchers.get(channelId) ?? []) watcher(line);
}

/** Hears every line for one channel until the returned function is called. */
export function subscribeLiveLines(channelId: string, watcher: Watcher): () => void {
  let set = watchers.get(channelId);
  if (!set) watchers.set(channelId, (set = new Set()));
  set.add(watcher);
  return () => {
    set!.delete(watcher);
    if (set!.size === 0) watchers.delete(channelId);
  };
}
