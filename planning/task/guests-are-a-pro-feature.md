# Guests are a Pro feature

Rodrigo decided this on 2026-11-26, reviewing
`backlog/a-guest-does-not-hear-claude-read-aloud.md`, which it replaces. A
guest page has no voice of its own, so a guest heard *Ask Claude*'s reply only
where the room reader spoke it, in a *Pro channel*. Rather than give the page a
voice (`speechSynthesis`, with the reply's text sent to a seat for that alone)
or have the server speak in a channel nobody pays for, **a guest is only ever
in a Pro channel**, where the room reader is the one voice. Four rules:

1. **Guests are a paid feature.** Inviting a guest by any route — a *guest
   invitation*, the *guest link*, admitting a *knock* — requires the channel to
   be *Pro*. `canInviteGuest` (`core/channel.ts`) is pure and cannot see a
   subscription, so whether the channel is Pro is passed into the guard
   (`ChannelView.pro` on the app's side), or the Invite card and the server's
   refusal disagree. How a non-Pro member meets *Invite as guest* is a STYLE.md
   question.
2. **Once a room is Pro, it stays Pro until it ends.** `isProChannel` asks at
   each use whether any member is Pro, so today the grade changes if the only
   Pro member's subscription lapses or they leave. Latched instead for the
   *room* (the sitting, first step in to last step out): Pro at any moment of
   it, Pro for the rest of it. This covers every graded thing — transcription,
   the response model, read aloud — not guests alone.
3. **No Standard fallback in a Pro room.** A reply whose language AssemblyAI
   does not speak (`speechLanguage` returning null) is not read aloud at all;
   no phone reads it. A guest and a member hear the same thing, which is
   nothing. The glossary's *Read aloud* and *Standard voices / Pro voices*
   change with it.
4. **Guests expire when the channel stops being Pro.** At `ROOM_ENDED`, if no
   member is Pro, every *seat* expires and every outstanding guest offer —
   *guest invitations*, the guest link, knocks — is withdrawn, as *locking*
   withdraws them. Until the room ends rule 2 keeps it Pro, so nobody is cut
   off mid-sitting.

**Open, to settle before building:**

- **The other ways a Pro reply goes unspoken.** Rule 3 names language.
  `startSpeech` also hands a reply back to the phones when it is over
  `SPEECH_MAX_CHARACTERS`, AssemblyAI refuses it, no audio arrives within
  `SPEECH_FIRST_AUDIO_MS`, or the box has no AssemblyAI key. Each leaves a
  guest silent; whether they also lose the fallback is rule 3's question.
- **"Leaves the channel" in rule 4** is read here as *no member is Pro*, which
  covers a lapse as well as a departure.
- **A guest's own Pro** still makes no channel Pro (`isProChannel`: "A guest's
  Pro reaches no channel they are only seated in"). Unchanged unless said
  otherwise.
- **Seats already open in non-Pro channels on deploy**: expired at their
  room's next end under rule 4, or at once.

The browser page is the server's own, so its side ships with the deploy and
needs no shim. The app's Invite card does: an installed build draws *Invite as
guest* in a non-Pro channel and is refused (`CLIENTS.md`).
