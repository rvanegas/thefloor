# The chrome fades after all

**This reverses point 3 of *The way out is the design*, written the day
before.** That entry listed four ways out of full screen and made one of them
*chrome that never hides*: every other player fades its bar after a few
seconds, and here that would hide the only way out behind a gesture nobody was
told about. The reasoning was sound and the conclusion was wrong, which is the
ordinary shape of a decision that has to be made before anybody has looked at
the thing.

**What settled it was a screenshot.** Full screen on a sideways phone, with the
transport, the *Exit full screen* button and the channel's own footer stacked
along the bottom: the three of them take about a fifth of the glass, the film is
then fitted into what is left, and because a 16:9 film in a 19.5:9 window is
already fitted by height, every point of height the bars take comes off the
*width* as well. The picture ended up in the middle sixty per cent of the
screen with black down both sides. A control whose entire purpose is a bigger
picture cannot be built on a layout that keeps a bar over it.

So the transport and the footer now fade together after three seconds of
nothing being pressed, and a touch anywhere brings them back. The countdown is
against inactivity rather than against the state — a row that vanished while
somebody was still reaching for the scrubber would be the fading control at its
worst — so any touch at all puts the clock back, including presses on the
transport itself, caught by a capture responder that declines every one of them.
The same move `Attending` makes in `App.tsx`.

**They start up rather than down**, which is the concession to the original
worry: somebody arriving in this state is shown the way out of it before it
goes, so the exit is learnt and then hidden rather than never seen.

**And the swipe is what makes the rest of the worry survivable.** It never
depended on the chrome being drawn, it is the gesture this phone uses for
dismissing everything else, and it is untouched. The film has no controls of its
own to compete with a touch — YouTube's bar went on 2026-09-18 — so there is no
ambiguity about what a tap on the picture means, and a tap is now a control:
it toggles the chrome. The touch surface therefore claims on the *start* rather
than only on a downward move, and the release decides which gesture it was, far
enough down being the way out and barely anywhere being the tap.

The footer moving over the picture is the second half of the win and reads as
the smaller one. It was a sibling below the stage, and being a sibling is what
made it cost height whether or not anybody wanted it; overlaid and fading, it is
one touch away rather than permanently there. The trade *The way out is the
design* made for it — that being able to reach your own microphone is not
something a film should cost you — is unchanged in substance. A bar a touch away
is reachable.

## Not cropped

The obvious other answer to black pillars is to fill the window by cropping, the
way a fit/fill toggle does. **That was considered and refused.** What is left at
the sides of a 16:9 film on a phone that is wider than 16:9 is the film's own
letterbox, and it belongs to the film; trimming the top and bottom off somebody
else's shot to make the glass look full is a decision about their film that this
application has no business making. The stage stays `#000` and the picture stays
fitted.

## The one thing this did not fix

`planning/tasks/real-full-screen.md` is still open and still empty. This entry
makes the picture as large as fitting it can make it, which is what the
screenshot was about; whether *real* full screen meant something further —
the system player, or the status bar and home indicator strips — is not
something an empty file can say.
