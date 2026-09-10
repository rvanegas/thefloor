# A reinstall is not an install that has been asked

The keychain outlives the app and the notification permission does not, so a
reinstalled iOS app came back believing it had already asked to be reachable on
a phone that had never been asked — and the screen that would have asked is the
one that belief suppresses. The install was unreachable for good.

## What it looked like

Nothing, on the device. The app simply did not appear in Settings →
Notifications, which is iOS saying `requestAuthorization` has never been
called; there is no error, no banner and nothing in a log to go looking for.

It was found from the other end. Every notification to one account had been
failing `BadDeviceToken` since 2026-09-08 16:49 UTC — forty-two of them,
against two different tokens, while every other iOS device on the same server,
key and topic was being delivered to normally. The device row's `last_seen_at`
was frozen at 2026-09-08 20:12 through a cold launch that provably happened two
days later: build 178 was committed at 06:44 UTC and the account's session
reported running it at 06:53. A launch had happened and `POST /devices` had
not, which leaves only `registerIfGranted` returning null, which leaves only an
absent permission.

## The mechanism, which is two correct decisions meeting

`SecureStore` is the iOS keychain, and keychain items survive the app being
deleted. `storage.ts` already said so in as many words — a reinstall "comes
back to a phone that is still signed in, still knows which palette was chosen,
and still remembers having been asked about notifications", noted there as the
thing that makes a fresh install hard to *test*. It is also the thing that
makes a fresh install broken.

The second half arrived on 2026-09-08, when asking moved out of `AppProvider`
and behind a button on a screen that explains itself. That was right: the
system dialog is spent once per install for ever, and spending it ten seconds
after an install is the worst moment there is. But it made the explanation the
only route to the dialog, and `askDue` offers the explanation unbidden only
when `!pitched`.

So: reinstall, keychain returns `pitched = true`, no explanation, no dialog, no
token, no notifications — and the daily nudge banner that is offered instead
says, in its own comment, that "iOS has already been asked and has kept the
answer" and routes to Settings, where the app does not appear. Every road back
led somewhere that did not exist.

Neither decision is wrong and neither is worth reversing. Their product was.

## Why a marker file rather than something cleverer

Nothing already on the device distinguishes the two cases. Refusing the system
dialog and never having seen it both leave the permission `undetermined`, so
the permission cannot testify; the keychain is the thing under suspicion and
cannot testify about itself. The container is the only part of an iOS
installation that dies with the app, so a file in it is the only available
witness — `isNewInstall` in `state/storage.ts`, which answers true exactly once
per install because it writes the marker on the way past.

Documents rather than cache, since the system empties the cache directory when
it likes and an install whose marker got swept would announce itself as new
every time the phone was short of space. It never throws, and a failure answers
false: being wrong that way leaves an install remembering what it remembers,
where a wrong true discards it on every launch.

## Three keys forgotten and one kept

`launches`, `pitched` and `nudgedAt` describe an install — what it has counted
and what it has put on screen — and between them `pitched` and `nudgedAt` are
the whole of what suppresses the asking.

`conversed` describes the person: you have been in a channel with somebody
else, so you know what it is you would be missing. Deleting an app does not
undo having had a conversation, and it is the signal `worthAsking` actually
wants. Keeping it is what puts the explanation in front of a returning user on
their first launch back rather than making them wait out a second one.

## The one-time cost, accepted

The first launch of the build carrying this finds no marker on every install in
existence, reinstalled or not, and forgets those three keys once. For anybody
whose permission is `granted` that is invisible — `askDue` returns `none`
before it reads any of them. For anybody who refused, or who was pitched and
tapped *Not now*, the explanation opens itself one more time.

The alternative was to stamp the marker on this build and act only on later
launches, which is precise and leaves every phone currently in this state
stranded until it is reinstalled again. Showing a screen once to people it was
written for is the smaller cost.

## What is still true underneath

The environment mismatch that produced the `BadDeviceToken` responses is a
separate matter and is not fixed here: a token minted by a locally built app is
a sandbox token, and the deployed server talks to production APNs. This change
gets an install asking again; it does not make a debug build reachable from
production. See AGENTS.md § *`APNS_ENV` is the setting that will cost you an
afternoon*.
