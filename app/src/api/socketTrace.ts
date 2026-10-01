/**
 * TEMPORARY, for planning/tasks/a-lock-screen-tap-during-a-reconnect-looks-dead.md,
 * and goes with whatever that task builds.
 *
 * The control socket's life — connecting, open, closed, suspended, resumed,
 * offline — and what became of a mute: sent at once, or queued, and how long
 * until the snapshot that answers it. That is the fact the 2026-09-30 log was
 * missing: `room reconnecting` is the media room, and a nine-second wait fits
 * a queued tap and an unanswered one equally.
 *
 * **Injected rather than imported**, so that socket.ts stays out of the audio
 * layer and its tests construct a `Realtime` with no native modules behind it.
 * `AppProvider` hands it `recordEvent`. **Its own module** because the
 * provider's tests mock `./socket` wholesale, and an export added there is one
 * every one of those mocks would have to grow.
 */
let tracer: ((text: string) => void) | null = null;

export function traceSocket(fn: ((text: string) => void) | null): void {
  tracer = fn;
}

export function trace(text: string): void {
  tracer?.(text);
}
