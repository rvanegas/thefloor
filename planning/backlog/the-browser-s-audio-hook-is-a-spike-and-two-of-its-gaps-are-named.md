# The browser's audio hook is a spike, and two of its gaps are named

`app/src/audio/useSessionAudio.web.ts` says so in its own header: it was
written to answer whether the iOS UI survives a browser, not to be the audio
layer. Most of what it lacks is instrumentation the native hook grew for
reasons a browser does not have — no playout polling, no speaking hold, no
route diagnostics, `asked` permanently null — and none of that is missed.

**It has since held a real room**: two browsers in one channel heard each other
on 2026-09-02, which the spike had never been asked to do, having been written
when there was no media server to ask it of. That is a reason to finish this
hook rather than replace it, and it is not evidence against either gap below —
a browser that grants the microphone and permits playback exercises exactly the
paths that work.

Two of them are not instrumentation. Both are things `server/web/guest.ts`
learnt the expensive way and paid for in a defect, and the web app has neither:

- **A refused autoplay has no way out.** `room.startAudio()` is attempted at
  `useSessionAudio.web.ts:241` and the `catch` is empty, with a comment saying
  the spike does not yet offer the button `guest.html` has. A browser is
  entitled to refuse, and the cure is a real gesture; without one the person
  hears nothing and the screen says *Audio connected*. `#unmute-page` in
  `guest.html:111` is the shape, and `allowPlayback()` in `guest.ts` is the
  wiring — `RoomEvent.AudioPlaybackStatusChanged` is what reveals it.
- **Nothing listens to what was published.** `guest.ts:315` watches the local
  track with an `AnalyserNode`, four samples a second, and raises `#mic-trouble`
  after eight seconds below the floor — because on the web every step of the
  audio path can succeed and still produce silence, and there is no event for
  it. decisions/archive/DECISIONS-2026-08-21-to-2026-08-23.md § *A granted microphone
  is not a working one, inside somebody else's browser* is why it exists. The
  web app opens the same microphone through the same library and has no
  equivalent, so the failure that motivated the guest page's detector is
  undetected on `/app` and `/beta`.

The second is the sharper one, and knowing why needs the entry above it: the
embedded-browser notice shipped for `/app` and `/beta` in the same change that
wrote this, and it is a **warning at the door, not a measurement**. It tests by
exclusion against a user-agent, so it is wrong in both directions — it will
miss an unnamed Android WebView, and it will accuse a browser that works. The
analyser is the half that is not a guess. Until it is there, the web app's only
account of a dead microphone is a sentence written before anybody spoke.

Neither is hard. Both are ports of code that exists, in a file whose comments
already name what it left out, and the reason they are here rather than done is
that the task that touched this file was about the door.
