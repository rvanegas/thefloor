# Golf's Bluetooth echo, 2026-09-13

**Temporary.** This is one unfinished investigation and it should be deleted
once the question is settled — either into a `decisions/` entry if something is
changed because of it, or outright if the next report contradicts it.

Reported ~23:35 UTC on 2026-09-13: Golf, in a car on VW hands-free, echoed. He
had opened the audio diagnostics panel at the start of the session, so the
route observer was recording — which is what `startDiagnosticRecording` asks
for and the only reason there is anything below.

Read off the box: `journalctl -u thefloor` filtered to `audio diagnostics`,
account `acct_4Zaq47i5C-AT`. Times are UTC.

## For Golf: what the next test needs from you

Two echoes so far, both in the car on VW hands-free, neither on the AirPods.
Everything below this section is us reading your phone's log off the server
afterwards, and it has taken us as far as it can: **the log records which
speaker the audio came out of and not which microphone it went into**, and that
missing half is now the one fact that decides between the two explanations we
have left.

So the next run is not about producing more log. It is about you reading three
lines off the screen while it is actually echoing.

**Before you start.** Open the audio diagnostics panel first, as you did last
time — the route observer only records from the moment the panel has been
opened once, and it keeps recording afterwards even when you navigate away. If
you can, get into the car and let the phone connect to VW PHONE *before* you
step into the channel, rather than after.

**While it is echoing**, open the panel again and look at the section headed
**Route**. It has three lines:

    out    <- which speaker
    in     <- which microphone      *** this is the one we need ***
    rate   <- 8000 Hz, 24000 Hz, etc.

Press **Copy all as text** at the bottom of the panel and send us whatever it
puts on your clipboard. If the copy button says it failed, a screenshot of the
panel is just as good.

The single thing we are trying to learn: **does `in` say the car, or does it
say the phone's own microphone?**

- If `in` names the car (something like `BluetoothHFP(VW PHONE)`), then the
  phone is doing the sensible thing and the fault is ours to fix in the app.
- If `in` names the built-in microphone while `out` names the car, that is the
  echo explained on the spot — the car's speakers are playing us into the
  phone's own microphone across the cabin, with a Bluetooth delay on top, which
  is more than any echo canceller will remove.

**One question that needs no app at all**, and is worth as much as the reading
above: **does an ordinary phone call echo in the same car?** A normal call, or
FaceTime, with the phone connected to VW PHONE as usual. If those echo too, the
problem is the car and this stops being our bug; if they are clean, it is ours.

**One more thing worth noting if it happens.** Whether the echo is *you*
hearing yourself come back, or the other people hearing themselves come back
through you. We have been assuming the second and have never actually asked.

Everything below here is the technical record and is not addressed to you.

## What his phone did

```
23:29:55.971  route BluetoothHFP(VW PHONE) sr=8000  playAndRecord/videoChat  why=newDeviceAvailable
23:31:59.264  app inactive
23:32:07.746  intro cleared (no token) / screen home     <- cold start, build 193 either side
23:32:11.933  connect capturing CALL
23:32:12.043  route BluetoothHFP(VW PHONE) sr=8000  why=categoryChange
23:32:13.279  room connected, 2 audio already published
23:32:14.950  engine start play=T rec=T                  <- voice-processing unit comes up on HFP @8k
23:32:17.268  subscribe deferred acct_sudUOdevBXfN, acct_r3z2BiUvFsd3
23:32:18.140  route Speaker(Speaker) sr=48000       why=override      <- ***
23:32:18.189  route BluetoothHFP(VW PHONE) sr=8000  why=newDeviceAvailable
23:32:18.466  sub + Rodrigo (1)
23:32:18.640  sub + Rochelle (2)
   ... nothing at all for twelve minutes ...
23:44:49.947  muted CALL
23:46:49      app inactive -> active
23:46:55.683  route BluetoothHFP(Arys's AirPods #2) sr=24000 why=newDeviceAvailable
```

Nothing shipped after 23:46:55, so the app was backgrounded or gone by 23:54.

## The second test, 00:00 on 2026-09-14, which killed the first hypothesis

Same phone, **same process** — there is no `intro cleared` and no fresh
`connect` anywhere in this window, so this is the engine that started at
23:32:14.950 still running.

```
23:46:55.683  route BluetoothHFP(Arys's AirPods #2) sr=24000  why=newDeviceAvailable
23:58:20      app inactive -> background
23:59:06.480  app active
23:59:17.643  capturing CALL
23:59:39.586  sub - Rodrigo (1) / sub - Rochelle (0)
23:59:48.474  sub + Rochelle (2) / sub + Rodrigo (1)
00:00:10.966  route BluetoothHFP(VW PHONE) sr=8000  playAndRecord/videoChat  why=newDeviceAvailable
00:00:30.708  muted CALL
00:00:31.682  capturing CALL
00:02:10.384  app inactive
```

It echoed. And **there is no `why=override` in it at all** — no flap to the
speaker, no engine start, no category change. The route simply moved from the
AirPods to the car, 24 kHz to 8 kHz, and that was enough.

So the `override` at 23:32:18.140 in the first episode is a red herring. What
it was and who called it is still unattributed and no longer worth chasing:
the echo does not need it.

## What the two episodes actually share

1. The route is **BluetoothHFP(VW PHONE) at 8 kHz**, `playAndRecord/videoChat`.
   Neither echo coincides with the AirPods route; both coincide with the car.
2. **The engine never rebuilds across the port change.** In episode two the
   voice-processing unit negotiated its format on AirPods at 24 kHz and the
   route dropped to 8 kHz underneath it with no restart. Nothing in this app
   responds to a route change unless the output is the *earpiece* —
   `routeRecovery` is scoped to `RECEIVER_PORT` and to nothing else — so a
   port-type change while `CALL` is held is observed, logged, and otherwise
   ignored.

Point 2 is the better hypothesis of the two and it is **not clean**: in episode
one the engine did start with the car already the route (23:32:12 categoryChange
on HFP, engine start at 23:32:14.950), so there was nothing stale about it
unless the 49 ms speaker flap three seconds later is what broke it. Either that
flap is doing the same damage a port change does, or there are two mechanisms,
or the real answer is point 1 on its own.

The rival that point 1 allows: **the VW hands-free route echoes on this phone
regardless of what we do.** HFP puts a long and variable transmission delay
between what iOS plays and what any microphone hears, and if the input is *not*
the car's own microphone the acoustic path is a cabin plus a Bluetooth hop —
routinely past what a voice-processing AEC can cancel.

## The gap that stops this being conclusive, now twice

`routeLine` (`app/modules/audio-route/index.ts:346`) prints **outputs only**.
The snapshot carries `inputs`, the panel shows them (`routeRows`: `out`, `in`,
`rate`), and the log line throws them away. Output on the car with input on the
built-in microphone is the single reading that would separate the two
hypotheses above, and it is the one thing that did not ship.

## What to do next, in order

1. **The two readings in § *For Golf* above, before writing any code** — the
   `in` line off the panel while it is echoing, and whether an ordinary phone
   call echoes in the same car. Between them they decide which of the two
   hypotheses is live, and neither costs a build.
2. **Log the inputs in `routeLine`.** One line, and no future report needs a
   person to read a screen.
3. **Restart the engine — not merely re-assert the configuration — when the
   route changes port *type* while `CALL` is held.** `routeRecovery`
   deliberately does not do this today, and its reasoning is about the earpiece
   rather than about an echo canceller that has been left behind by its own
   route. This is the fix if step 1 points at the engine; do not build it
   before it does.
