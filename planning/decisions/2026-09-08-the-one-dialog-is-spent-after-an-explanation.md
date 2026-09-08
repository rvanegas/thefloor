# 2026-09-08-the-one-dialog-is-spent-after-an-explanation

What the app did until today: `registerForPush` ran from an effect on
`state.token`, so the iOS notification dialog appeared within seconds of
signing in, before anything on screen had said what notifications were for. A
refusal returned `null`, no device token was fetched, no row was written to
`device_tokens`, and every push aimed at that person was skipped thereafter
with `why: 'no registered devices'`. Nothing in the app ever said so — and the
per-channel notification level picker went on rendering, still saving levels to
the server, for somebody whose phone would never show one.

**iOS grants that dialog once per install and keeps the answer for ever.** It
is two words and a bundle name; it cannot say what refusing costs. Spending it
in the first ten seconds of a new account, against a screen that has said
nothing, is spending the only chance there is at the worst moment there is.

## Three parts, and the order matters

**An explanation first.** `ui/NotificationsView.tsx` — *Being reachable*. Why
it matters (this application is other people trying to reach you, and a phone
that cannot be reached is somebody quietly absent), the promise (every
notification is a person: `invited`, `arrived`, `pinged`, which is all three
kinds there are, and nothing the app sends on its own behalf), and that it is
not all-or-nothing (the three levels, per channel, in `describeLevel`'s own
words rather than a second copy of them). The system dialog is a button on this
screen and is raised nowhere else.

**It is shown to a refused install too, and that was a correction.** The first
cut fired it only while the dialog was unspent, which reads the screen as an
accessory to the system prompt. It is not: what it says is that this
application is people reaching each other, and the person most likely never to
have heard it is exactly the one who refused a two-word dialog that could not
tell them. So it fires once for `denied` as well — every install of the builds
before this one arrives in that state — and the button on it offers Settings.
A banner is too small a thing to carry that the first time.

**Then a delayed first ask.** `state/notificationAsk.ts` holds the policy,
pure. `worthAsking` needs somebody who could reach you — a contact, a channel,
or an unanswered invitation — and then either a conversation that has actually
happened or a second launch.

The conversation is the real signal: somebody who has been in a channel with
another person knows what they would be missing, and the question is then about
an experience rather than a word. **The launch count is a floor, and it is
there because waiting for the conversation alone is a trap** — the first
conversation is the one most likely to need a notification to happen at all, so
an install that is never reachable may never have one, and a criterion waiting
for it would wait for ever.

`ready` gates the explanation in both cases, but for different reasons: with
the dialog unspent it is protecting the dialog, and with it already refused it
is only the general one — a full screen about being unreachable, shown to
somebody who has been here ten seconds and has nobody in the app yet, is an
interruption about nothing. A refused install that is not ready gets the banner
in the meantime.

**Then a banner, once a day at most.** `NotificationNotice` on the tier, beside
`InstallNotice` and on the same argument one platform over: the cost of being
unreachable is not paid by the person choosing it. It offers the explanation
and asks the system for nothing, because after a refusal there is nothing left
to ask — see below. *Not now* takes it off the screen and tomorrow is the
earliest it can return; there is no *never*, on the grounds that an app that
offered one would be agreeing that somebody should be unreachable.

## What the banner cannot do

The request as posed had the banner lead to the OS prompt. **It cannot, after a
refusal.** `requestPermissionsAsync` returns the stored answer and shows
nothing; iOS has no second dialog and no API to ask for one. So the explanation
branches: with the dialog unspent its button raises it, and after a refusal the
only honest offer is `Linking.openSettings()`, said in those words. A button
labelled *Allow* that produced nothing visible is how an app teaches people its
buttons are decorative.

This is also the strongest argument for the delay. **Deferring the first ask is
what makes the dialog reachable at all** for somebody who would otherwise have
refused it blind in their first minute.

## The cadence is counted from being shown, not from being answered

`askDue` measures the day from `nudgedAt`, which is written when the banner or
the explanation *appears*. A cadence counted from a dismissal would return
every time until somebody formally answered — a banner that punished ignoring
it. It also means the banner has to hold itself up locally once raised, since
recording the day is what stops it being due: `ask` answers *may this be
raised*, not *is it up*.

## What is deliberately not done

- **No second surface.** The banner is on the tier and nowhere else, so a
  foreground that lands in a conversation waits until Home. A notice about
  notifications drawn over a live channel is the interruption it is warning
  about. `Root` refuses to open the explanation unbidden for the same reason:
  only when nothing is open and nobody is present.
- **Nothing on the settings screen.** The channel-level picker still says
  nothing about the system permission being off — it would need the same
  permission read, which is now in context and cheap, but it is a second
  message about the same fact and the banner is the one that reaches people who
  are not in Settings. Worth doing next; it is the screen the `AppProvider`
  comment about "anything on screen claiming notifications are on" was written
  against.
- **Permission withdrawn while the app runs is still not noticed.** Unchanged
  from before: APNs answers 200 rather than 410 for a live token belonging to a
  silenced app, so nothing goes stale and nothing is wrongly pruned. The
  foreground read now updates `permission`, so the banner will find its way
  back within a day.
- **No account-wide switch.** The levels are per channel and stay that way —
  see `core/notifications.ts`, which argues that one volume answer forced onto
  both the conversation you are waiting on and the one you keep for
  completeness is the wrong scope.

## Where the state lives, and why none of it is cleared on sign-out

Four keys under `thefloor.notifications.*`, in the device store that
`AppProvider` used to keep private and that is now `state/storage.ts`. All four
are about the *install*, not the account: the dialog is per install and is
spent for ever, so a second account signing in on the same phone has not earned
a fresh one, and clearing these would mean asking somebody who has already
refused as though they had not. Same reasoning as `installNotice.ts`, about a
stronger fact.

**And that is why *Forget this phone* exists**, under Diagnostics in Settings
and behind the server-granted `debug` flag rather than behind Labs — Labs is
opt-in and promises unfinished features, while this is an instrument that is
useless to anybody using the app, and *forget everything* does not belong one
tap from a switch people are invited to flip. It signs out first, because that
request carries the push address the server should drop and needs the token it
is about to delete, then clears every key in `INSTALL_KEYS`. It cannot clear
the notification permission, which is the system's: a genuinely new install is
forget, delete, install, in that order, and the alert says so.

**A browser and a simulator are asked nothing, ever.** Both read as `denied` —
correctly, there being no token to be had — and the daily cadence would
otherwise tell them about a permission neither can grant. `mayHoldToken` is
exported for exactly that third question: not *may we ask* and not *were we
granted*, but *is there anything to ask for*. The browser still gets the
install notice, which says the same thing in the one form that has an answer.
