# The microphone card was a card about the audio

2026-09-15. *Your microphone* — the last of the four cards the channel
screen's footer made redundant, kept on 2026-09-13 because it still had a
sentence — is deleted. What stands where it stood is **Audio**, a card drawn
only when the audio is not working, and the debug panel has its own card
again. Nothing about the microphone is written on the members tab any more.

## Why the survivor stopped surviving

The rule adopted on 2026-09-13 was: if the card is a button and a sentence,
keep both; if the sentence goes, the card goes; if the button goes and the
sentence stays, it is a readout and it stays. *Your microphone* passed that
test on the day, having lost its Mute button and kept the sentence saying
*why* the microphone was in the state it was in — which the bar greys and
tints without ever saying.

What the rule did not say is that **the rest of the screen goes on changing
after the card is settled.** The sentence had six branches, and by this
afternoon they had drifted into three groups:

| Branch | Said elsewhere? |
| --- | --- |
| No microphone on this device | No. The footer greys Mute, and `FooterAction`'s `hint` is the accessibility label only. |
| Silenced by somebody's claim | No, in words. The footer tints Mute `silenced` and the holder's roster card says `· has the floor`. |
| Closed because nobody is here yet | No, and nobody was going to act on it. |
| You hold the floor | The roster says `· has the floor` with the clock; the footer says Release. |
| You muted yourself | The roster says `· muted`; the footer says Unmute, tinted. |
| Open | Nothing at all, said at length. |

So the card was the third place three of these were said, the only place for
two that nobody can act on, and the only place for one — a device with no
microphone — that is a genuine refusal with no reason given anywhere else.
Six sentences for one trap is the wrong shape. **The trap is real and the
card was not the way to hold it**: the footer needs a word for a microphone
it has greyed because the hardware is missing, and that is now the open
question left behind by this change.

## What could not be said anywhere else was never the microphone

It was the connection. `describeAudio` had eight cases, and the three healthy
ones were reassurance — *audio connected*, *waiting for anyone else to be
audible*, *microphone closed until somebody else is here*. The other five are
the conversation not arriving: connecting, dropped, refused, unconfigured,
failed. Nothing else on the screen has a word for any of them, and a
conversation that has silently stopped working is the one thing this screen
exists to prevent.

So `describeAudio` returns **null** when the status is `connected`, and the
card is drawn when it returns a string. The ordinary moment in a channel
draws nothing, which is the property to preserve: a new case earns a sentence
only if somebody who is not debugging this application would want it.

## The recording notice, which went on its own argument

The card also carried: *you are still being recorded — nobody can hear you,
but your microphone is captured; it is left out of the mix anybody can play
or share, not out of the capture.* Every word of that is true of the bytes.
A silenced participant goes on publishing (the floor is enforced by
withholding them from the other subscribers, not by closing their
microphone), so their track egress writes an ungated stem to the bucket.

And it is false of the situation. Every path out of that bucket applies the
floor, from one function, deliberately so that it cannot be got right in one
place and wrong in another: the mix, a single speaker's stem, and the
transcript all go through `buildStemGraph` in `server/src/export.ts`. Nobody can
hear the remark and nobody can obtain it. What the notice described was an
internal of the recorder, in words that read as a warning about being
overheard — the effect being to make somebody hold back a remark that in
fact goes nowhere.

The fact it was reaching for is about retention, not capture, and the
accurate version of it is already on the privacy page, which is where a
statement about what is kept belongs.

## The debug panel goes back to its own card

Third arrangement, and this one follows from what it is. It had a card while
`hideControlCards` could switch the microphone's card out from under it; it
was folded in when that stopped being possible; and it comes back out now,
because *Audio* is **absent whenever the audio is fine**. A panel for
diagnosing the audio session that appears only alongside a fault is no use to
the person working out why no fault is visible. It is drawn for the account
with `debug` set, not for a state — and the heading says which of the two it
is.

## What this costs, and the one thing to watch

A person alone in a channel with the audio connected now sees a roster, a
footer, and nothing else. That is the app working, and the screen has stopped
narrating it.

The thing to watch is the no-microphone device. Until the footer can say
something about a Mute it has greyed for missing hardware, that refusal is
unexplained — the one shape STYLE.md says a control may not have. It is
written down here rather than fixed here because the fix is a change to the
bar, and the bar's standing rule is that nothing in it changes shape with
state.
