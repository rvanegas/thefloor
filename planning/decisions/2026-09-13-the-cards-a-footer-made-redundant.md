# The cards a footer made redundant

2026-09-13. The channel screen's roster tab had four cards that repeated the
pinned footer — the floor, the microphone, Step in, Step out. Three of them are
now deleted and the fourth has lost its button. What is left of any of them is
a readout.

## What was actually duplicated

The bar carries five controls: Mute, Claim, In, Nearby, Out. Every act the four
cards offered was one of them; Step out's two copies had already been made to
call one shared function, and the microphone's two shared a guard written out
character for character in both places:

| Card | What it held | Where the act already was |
| --- | --- | --- |
| The floor | Claim/Release, the state, the countdown, why a claim was refused | the Claim slot |
| Your microphone | Mute/Unmute, why the microphone is shut, the audio line, the debug panel | the Mute slot |
| Step in | Step in, Be nearby *or* Step out, a sentence under each | the three rungs |
| Step out | Be nearby, Step out, one sentence | the Nearby and Out rungs |

The arrangement was defended, repeatedly and in the code, as a division of
labour: **the bar is where the act is quick, the card is where the state is
explained.** That was a real argument and it held for as long as the cards had
something to explain. What happened over the fortnight to 2026-09-13 is that
they stopped, one at a time and each for its own good reason:

- The floor's readouts moved to the roster — the countdown to the holder's card
  on 2026-09-12, and the rest on 2026-09-13, the roster having become the
  better place to read all of it.
- Step out's sublabel was deleted as saying twice what the label said, on the
  grounds that somebody reaching for it already knows what it does. True, and
  it left a heading over a bare button.
- Step in's four-branch sentence turned out to be two branches about another
  device — facts a snapshot cannot show you — and two that said which rung you
  are on, which the footer's accent says and your own roster card says in
  words.

## The rule that came out of it

Asked of any card that repeats a pinned control:

1. **Button plus sentence: keep both.** The sentence is the bar's explanation.
   An icon that greys with no reason given is the one shape a control may not
   have in this application.
2. **Sentence goes: the card goes.** A heading and a button are the footer at
   the wrong size, one scroll below the footer.
3. **Button goes, sentence stays: keep the card, drop the button.** It is a
   readout, and a readout is not a repetition of anything.

It is written into STYLE.md § *The cards a footer made redundant*, and as the
seventh load-bearing rule there.

## What survives, and why each

**Your microphone**, minus its button. The sentence under it says *why* the
microphone is in the state it is in — somebody else's floor claim, your own
hand, a device with no input, or a room with nobody in it to hear you. The bar
greys and tints and cannot say which. `iAmSilenced` is the sharpest case: it is
said nowhere else on the screen at all, a roster card's `· muted` reading
`selfMuted`, so somebody force-muted by a claim is drawn there as a plain
*Present*.

**The recording warning**, inside that card. Being unheard is not being
unrecorded, and it would be easy to assume otherwise.

**The other-device sentence**, under the roster. Stepping in from here closes a
microphone on another phone. It cannot live on the microphone card, that card
being drawn only for somebody who has already stepped in, and there is no other
card left — so it sits under the roster, unconditionally.

**The arrival offer** was never one of these and is untouched. It is the answer
to a question the app has just asked, and its *Stay nearby* is on no bar.

**The floor's four reasons for refusing a claim** are the one thing genuinely
lost, and were lost on 2026-09-13 when its card went. The icon greys without
saying which. The compensation is the clock and the cooldown on the roster,
which is what anybody claiming actually wants to know.

## The drift, which is the evidence rather than the argument

The Step out card's *Be nearby* had lost the `app.markTried('nearby')` its
footer twin still carried, so declaring nearby from the card never ticked the
onboarding checklist's rung. Nobody noticed, because the two controls are a
scroll apart and do the same thing.

This is exactly the failure the shared `stepOut` function was extracted to
prevent, one button over from where it happened. A duplicated control does not
stay duplicated; it stays duplicated until somebody edits one of the two. There
is now a test asserting the footer's rung ticks the rung.

## The setting that died with them

`hideControlCards` was the setting that switched these cards off, and its whole
subject has been deleted for everybody. **The Home settings toggle went with
them, in this change** — there was no honest wording left for it. Its copy said
that off, "the microphone and the ways in and out also have cards further down
the screen", and by the end of the afternoon that was false; a preference
between two identical screens is worse than a redundancy, because somebody will
set it and wonder what they changed.

**The field survives, unread.** It is still accepted on `PATCH /settings`,
still a column on `accounts`, still mirrored into the app's state — because
taking it out is a wire change and a migration, not a screen edit, and because
builds below the compatibility floor are still reading it off the hello. That
is a two-step for whoever gets there, and it is noted at SHIMS.md § *Gate 159*,
where the alias for the older `controlCards` spelling is already waiting on the
same floor. `core/settings.ts` carries the account of it at the field itself.

It is worth noticing how it died. The exceptions accumulated first: the
recording warning needed a second site to be drawn at, then the other-device
sentence needed one, then the audio diagnostic panel needed a whole card of its
own so that a preference about repetition could not take a diagnostic away from
the one account in a position to read it. **When the exceptions to a setting
outnumber what it governs, what it governs has gone.** All three of those
second sites are deleted by this change, being fallbacks for a case that no
longer exists.
