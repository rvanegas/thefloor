# Dial a Phone Number Into a Channel

A member places an ordinary phone call from inside a channel: the person they
call answers on their own phone, hears the room, and is pitched — by the member,
in person — on getting an account. **The point is growth**: the call is the demo,
and the invite link is the close.

**Mechanism.** LiveKit's self-hosted SIP service (`livekit/sip`, Docker beside
`livekit-egress`, uses the Redis already there) plus a carrier SIP trunk
(Telnyx or Twilio). `SipClient.createSipParticipant` from `livekit-server-sdk`
dials the number into the channel's room as an audio participant; the service
converts between the phone codecs and Opus. Its signalling and audio
ports must not overlap `livekit-server`'s UDP range — INFRASTRUCTURE.md.

**Why it does not break PROPOSITION.md.** The ring lands on the callee's own
dialer, under that dialer's rules (Focus, Silence Unknown Callers, decline), not
The Floor's. And it passes MARKETING.md's *no strangers*: the number is one the
member types or picks with the system contact picker — no address-book upload,
and **the dialled number is not stored** past the call.

**The callee is a guest with no account** (`decision/2026-09-16-three-asks-not-one.md`), arriving by phone
instead of a guest link: one of the two guest microphones, an always-open line
that any member can mute. The pitch is the first of *the three asks*: after the
call, one tap opens the member's own Messages with their `/i/<username>` link
prefilled, so the server sends no marketing SMS and leaderboard credit works
unchanged.

**Caller ID decides whether this works at all.** A call from an unfamiliar
Floor number gets marked as spam or silenced. The call must show **the member's
own verified number**, so this depends on `sms-authentication` (or a narrower
"verify your phone" step).

**Constraints from day one**
- No recorded pitch on the line. A live person calling someone they know is a
  normal call; a recorded message from the platform is a robocall in law.
- No recording or transcription while a phone guest is present — they can see
  no indicator and give no *speech consent*.
- A daily minute cap per member, an allowlist of countries, and a spending cap
  at the carrier. A leaked trunk credential is a toll-fraud bill; it goes in
  CREDENTIALS.md.
- A new guest kind is a wire change: check what older builds render for an
  unknown kind before deploying, and add a SHIMS.md entry.

**Order of work.** (1) Prototype: provision the SIP service and trunk, plus a
`bin/` script that dials your own phone into a test room; measure audio
quality, delay, how caller ID shows up, and the iOS audio session's echo with a
phone participant (POSTMORTEM-echo.md). (2) A verified phone number on
accounts. (3) Server: a members-only, rate-limited dial action, plus the phone
guest in `core/`. (4) App: *Call a phone number* on the People tab, the
contact picker, and the invite prompt after the call.

**Open questions.** Shared Floor number as a stopgap for caller ID, or not at
all? Should the call always land in an existing channel (recommended, since
hearing the group is the demo), or can it also be one-to-one? Legal check on
emergency calling and caller-ID rules for outbound-only VoIP. Not to be
confused with `phone-calls-during-watch` (incoming calls to the phone) or
`call-if-you-must` (a stub).
