/**
 * `@livekit/rtc-node`, as the tests see it — mapped in by `moduleNameMapper`.
 *
 * **Why the real package is kept out.** Requiring it loads a native FFI
 * binding which starts a GC thread of its own, and that thread is a libuv
 * handle no JavaScript can close: it is not a timer, it has no `unref` and no
 * `close`. Nothing is wrong with it — a plain node process that loads the
 * package still exits in a tenth of a second — but `jest --detectOpenHandles`
 * reports it as "potentially keeping Jest from exiting" and blames whichever
 * test file happened to import `src/media.ts` first. That is a permanent false
 * positive in the one command anybody reaches for when the suite will not
 * exit, and on 2026-08-25 it cost most of an afternoon: the real culprit was a
 * ten-minute mix wait in `shared-audio.test.ts`, and this entry is what got
 * investigated first, twice.
 *
 * **Why a stub is safe here.** No test uses the real media plane. Every one of
 * them takes `MemoryMediaServer`, and the only code that touches these names
 * is `LiveKitMediaServer.openPlayback`, which nothing under `__tests__` calls.
 * The single reason the binding was ever loaded is that `src/media.ts` exports
 * the memory double from the same file as the real one.
 *
 * **So every member throws.** A stub that quietly returned something plausible
 * would turn "this test needs the real media plane" into a wrong answer
 * arrived at silently, which is the failure mode that makes stubs a bad idea.
 * If one of these throws, the message says what to do: the test wants the real
 * package, and the mapping below has to come off for it.
 *
 * The type declarations are untouched by any of this — `moduleNameMapper` is a
 * runtime resolution, so `tsc` still checks `src/media.ts` against the real
 * package's types.
 */
const refuse = (name: string): never => {
  throw new Error(
    `${name} came from the @livekit/rtc-node stub, which has no implementation. ` +
      'A test that needs the real media plane must drop the moduleNameMapper ' +
      "entry in server/package.json — and will then reintroduce the FFI GC " +
      'thread that jest reports as an open handle. See __stubs__/rtc-node.ts.'
  );
};

export class Room {
  constructor() {
    refuse('Room');
  }
}

export class AudioSource {
  constructor() {
    refuse('AudioSource');
  }
}

export class AudioFrame {
  constructor() {
    refuse('AudioFrame');
  }
}

export class TrackPublishOptions {
  constructor() {
    refuse('TrackPublishOptions');
  }
}

export const LocalAudioTrack = {
  createAudioTrack: () => refuse('LocalAudioTrack.createAudioTrack'),
};

/**
 * The two enums carry their real values rather than throwing.
 *
 * They are read, not constructed — `RoomEvent.Disconnected` is a string and
 * `TrackSource.SOURCE_MICROPHONE` a number — so a stub that threw on a
 * property read would break the import itself, and one that invented values
 * would be lying about a wire constant. These are what the package defines.
 */
export const RoomEvent = { Disconnected: 'disconnected' } as const;
export const TrackSource = { SOURCE_MICROPHONE: 2 } as const;
