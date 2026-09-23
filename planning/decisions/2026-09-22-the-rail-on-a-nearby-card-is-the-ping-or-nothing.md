# The rail on a nearby card is the ping or nothing

A member card on the channel screen ends in one slot, and two things compete for it:
the speaking dot, and the ping. The rule is now that a card reading *Nearby*
gives that slot to the ping and never to the dot — the action while there is
one to offer, a disabled *Pinged* while a window is spending, and empty where
there is neither.

**The dot cannot say anything true there.** It reports whether the room is
hearing somebody, and *Nearby* is precisely the word for somebody the room is
not hearing at all. Drawn on such a card it sits permanently hollow beside a
line explaining why — two marks that can never disagree, one of which says
nothing, which is the pairing `pingable` was already written to avoid. What was
missing is that it avoided it only for a reader who *may* send the ping.

**The guard that was wrong was `!here`, and it was wrong because a word
changed.** *Nearby* covers two rungs: somebody whose wait is running, and
somebody inside the disconnect grace — who is still `present` as far as the
roster is concerned. `showPing` kept the "Pinged" status alive with
`!here && windowOpen`, written when the grace still read *Present ·
reconnecting…*; 2026-09-08 changed the line to *Nearby* and left the guard
reading the old meaning. So on the grace rung a reader who may not ping —
not a contact of theirs, or out of the room themselves — watched the *Pinged*
somebody else had earned be replaced by a speaking dot. `callable` is the same
two rungs the word covers, so it answers both halves at once and the guard is
now `windowOpen && (callable || !here)`.

**Empty, deliberately, rather than a greyed *Ping*.** The case with neither
half is a non-contact, or a reader who has stepped out: both are refusals, and
STYLE.md § *Words on controls* requires a disabled control to carry a sentence
saying why. A roster card has no room for one, and a dead control is worse than
an absent one. The answer to *why not* is a tap away in either case — the card
opens a profile whose Contact section offers *Add contact* — which is the same
reasoning the profile's own ping card was given for drawing nothing in its
place.

`ChannelView`'s `ParticipantCard`; two tests in
`app/src/ui/__tests__/channelPeople.test.tsx`, one per half, and the dot is
counted rather than tested for absence because the reader's own card draws one
all the while.
