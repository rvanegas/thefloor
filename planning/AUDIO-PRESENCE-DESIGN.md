# Stepping in, and stepping in nearby

**Temporary. A design being decided**, not a record of one that was. Rodrigo's,
stated 2026-09-08, after the bench in `AudioLabView.tsx` measured what the
audio session will actually do — `AUDIO-LAB-FINDINGS.md` is the evidence half
and this is the intent half. When it ships, what survives moves to
`decisions/` and both of these go.

The UI is deliberately undefined here. This is the state machine and the
vocabulary.

---

## The shape

**Two ways to be in a room, and the difference is whether you claim the audio
system.**

- **Stepped in** — the phone takes `playAndRecord` immediately, **exclusive**:
  no `mixWithOthers`. Another app's audio stops. You publish and you subscribe.
- **Nearby** — no claim on audio at all, and no subscription to the media room.
  Another app plays untouched.

Nearby is reachable two ways: **declared** (step in nearby, or step in and then
declare nearby, which abandons the claim), or **inferred**, which is what the
word already means today.

## Why exclusive, which is the change

**So that an arriving voice is not competing with a podcast.** The point of
standing in a room is to hear somebody the moment they speak, and a voice mixed
under another app's audio is a voice you have to attend to rather than one you
simply hear.

**This reverses `core/micNeeded.ts`'s standing principle** — *being in an empty
channel should cost the speakers nothing* — and it is deliberate. The cost is
paid knowingly and **nearby is the escape hatch**: somebody who wants to be
reachable without their music stopping steps in nearby instead. The old rule
tried to serve both intentions with one state and had to guess which was meant.

**The mixing question was worth answering even though the answer is not being
used.** `playAndRecord` turns out not to be exclusive — `AUDIO-LAB-FINDINGS.md`
— so exclusivity is now a *choice* rather than a constraint inherited from a
misattribution.

## Promotion

Nearby, **foreground**, other occupants begin to publish → the phone takes the
exclusive `playAndRecord` and **the user becomes audible.** Not listen-only.

Nearby, **background** → others see *Nearby* and may ping. On foreground, the
same promotion.

**iOS permits this and would not permit the reverse.** A backgrounded app is
refused a *new* microphone — measured on build 146, four minutes with no engine
start — so promotion has to happen in the foreground, and this design only ever
asks for it there.

## Bluetooth

**Mono whenever there is an audio claim at all.** `videoChat` with
`allowBluetooth`, which is today's `CALL`: the echo canceller on, and a headset
on the hands-free profile for as long as the claim lasts.

**The A2DP split is not being taken**, though it was measured to work — row 8
of the findings kept a headset in stereo at 48 kHz by capturing from the phone.
It is declined rather than unavailable: it costs the echo canceller, and it is
unsafe with a mic-less Bluetooth speaker, where the far end comes out of a
loudspeaker into an open microphone in the same room. **Being nearby is how you
keep stereo**, because being nearby claims nothing.

## Vocabulary

**One word, made more inclusive.** *Nearby* keeps its meaning — within reach,
one notification away, ping rather than give up — and stops being only what
happens *to* somebody. It is now also something you can declare.

**Nothing else about it changes**, and that is the point: nearby is not kept
alive, it lapses to *Stepped out* after `WAITING_WINDOW_MS`, and that machinery
already exists. This design adds a way in, not a lifetime.

`GLOSSARY.md` § *Nearby / Stepped out* needs its first line widened when this
lands; the rest of the entry stands.

## Occupancy

**An occupant publishes or subscribes, at least one.** A nearby person does
neither and is therefore not an occupant.

Which settles three predicates without further argument: a nearby person does
not open anybody's microphone, does not make anybody's session a call, and does
not make a recording legal. Somebody alone in a room with three nearby people
is alone.

## Notifications

**Suppress an arrival notification only when the recipient holds the audio
claim** — where today it is suppressed whenever they are in the app.

That is the whole point of the pair. Somebody nearby with the app open is
*asking* to be told, and is exactly the person the current rule silences.

**No new signal is needed on the wire**, if the equivalence holds: under this
design an occupant is precisely somebody who has claimed the audio, so
*suppress for occupants* is the same rule and the server already knows it.
**Confirm before building on it** — it is the difference between a one-line
change and a protocol change.

---

## Open, and blocking nothing yet

- **Promotion is a media reconnect**, and that is the operation with the
  history. Nearby holds no subscription, so promoting means connecting to the
  room and opening the microphone — the re-entry that froze playout for weeks
  and that `deferSubscribe` and `holdForPlayout` exist to survive. Under this
  design it stops being something a person does occasionally and becomes
  something that happens automatically, mid-conversation, the moment somebody
  speaks. **The riskiest operation in the stack becomes the most frequent.**
- **How a declared nearby reaches other clients.** The inferred kind is derived
  from an expiry the server can see. A declared one is a statement, made by
  somebody whose websocket is alive and well, and it has to be distinguishable
  from stepping out — `Exit` in `core/channel.ts` has three reasons and this
  may want a fourth. Any wire change here is subject to the standing rule:
  teach the server first, deploy, then the client.
- **The UI.** Undefined on purpose. How somebody steps in nearby, and how they
  declare it after the fact, are not decided.
