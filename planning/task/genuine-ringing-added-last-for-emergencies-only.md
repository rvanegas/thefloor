# Genuine ringing, added last, for emergencies only

A real ring: a summons that sounds through a silenced phone, wakes a closed
app, and can be answered from the lock screen without unlocking. The Floor has
none of this and the absence is deliberate — PROPOSITION.md is forty lines of
argument that the ring is the thing wrong with telephony, and this would be
building the diagnosed error on purpose.

**So the question this task holds is not whether to ring. It is whether a
person who wants to use only this app can.** Somebody who has committed to The
Floor still keeps a dialer or a VoIP app installed for one case, and keeps it
for a case that almost never arrives. That residual install is the cost of the
thesis, and it is paid by exactly the users who accepted the thesis most fully.
This is the feature that lets them delete the other app.

**It is last, and being last is the whole design.** PROPOSITION.md § *Loudness
is the recipient's property* answers the emergency objection by pointing at the
dialer — *emergencies are rare and normal usage should not be patterned after
them; the dialer is still installed; this app takes the other ninety-five
percent* — and then concedes the shape of this task in its closing sentence:
*should The Floor ever need to cover that case itself, the constraint above is
what it has to satisfy.* That is a licence with a condition attached rather
than an opening. Ship it before the ordinary loop is habitual and the ring
becomes the loop instead — the expectation of answering comes back with it, and
the expectation is the product.

### What it has to satisfy, which is not negotiable and is already written

PROPOSITION.md § *What this proposition forbids* opens with this exact feature
— *no alarm that a sender can choose; loudness is granted by recipients, to
named people, scarcely* — and adds **this is the one that will be under
pressure.** A task proposing it is that pressure arriving, which is the reason
to write the constraints down as acceptance criteria rather than as cautions.
They come from § *Loudness is the recipient's property*:

- **A permission the recipient grants a specific person, never a mode the
  caller selects.** Not a checkbox on the composer. Alice may ring Bob because
  Bob said Alice may, and Bob can say so about one contact without saying it
  about the rest.
- **Scarce by construction rather than by etiquette.** Every urgent flag in
  messaging history was overclaimed by senders until it meant nothing; a limit
  that depends on people being restrained is a limit that has already failed.
  What enforces the scarcity is the open question here — a rate, a cooldown, a
  decaying budget the grantee spends — and it is the part to design first,
  because the rest is mechanism.
- **Normal usage is not patterned after it.** Emergencies are rare, and the
  proposition's diagnosis of telephony is precisely that it built the ordinary
  case out of the rare one. If ringing becomes a normal way to reach somebody
  here, it has failed regardless of how well it works.

**Time Sensitive is not this and must not be smuggled in as a first step.** The
`com.apple.developer.usernotifications.time-sensitive` entitlement lets a
notification pierce a Focus mode, and it is precisely the sender-declared
escalation the first constraint forbids — ROADMAP.md § *1. Make the
notification permission survivable* says so outright, calling its presence in a
backlog as a smaller thing left on the table *the pressure this document exists
to resist*. It was listed as a smaller thing left on the table in
It was listed as one in the entry this file replaces, and that listing does not
survive the move.

### The machinery, which is known and is the easy half

- **PushKit to wake a closed app, which requires CallKit.** Apple requires a
  VoIP push to be reported as an incoming call and terminates an app that takes
  one without doing so. CallKit was ruled out for background *audio* —
  decisions/archive/DECISIONS-2026-08-07-to-2026-08-13.md § *Backgrounded audio
  was ruled out, and CallKit with it* — and this is the other thing it is for,
  where it would be the right tool. That entry is the one to read before
  arguing with any of this.
- **`voip` in `UIBackgroundModes`**, removed before the first TestFlight build
  because it did nothing, becomes load-bearing again. `app/app.json` carries
  `["audio"]` today.
- **A second delivery path in `push.ts`, as a sibling class rather than a
  method.** A VoIP push is a different `apns-push-type` against a different
  topic (`<bundle id>.voip`) with a different device token. The shape to follow
  is `FcmPusher`, which push.ts argues at length is *a sibling of `ApnsPusher`
  rather than a generalisation of it* — the two share `Pusher` and
  `PushMessage` and nothing else. A `VoipPusher` is the third implementation of
  that interface. The entry this replaces said `Pusher` would gain a method;
  that predated the FCM split and is no longer the right shape.
- **Android has no equivalent and will need its own answer.** FCM high-priority
  delivery plus a full-screen intent is the rough counterpart, and it is not a
  port of the iOS design. ANDROID.md is where that goes.

None of the alert path is undone by any of this — the same server-side events
would drive both, and a recipient who has granted nobody the permission sees
exactly what they see now.

### Where the replaced entry was out of date

It was written against the notification set as it stood on 2026-08-10 and
reviewed on 2026-09-16. Three of its claims had gone stale and are not carried
forward: there are four notification kinds now rather than two (`invited`,
`arrived`, `pinged`, `accepted`); an accepted contact request and a ping into a
channel you already belong to both notify, where it said they reached you
in-app only; and Android delivery is no longer waiting on a Firebase project,
which exists. **An incoming contact request is still the one thing that
notifies nobody** — `accounts.ts` holds no notifier at all — and that is a
genuine gap, but it is an ordinary notification rather than anything to do with
ringing, and it belongs wherever the notification set is next revisited.
