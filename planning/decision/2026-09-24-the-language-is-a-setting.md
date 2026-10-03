# The language is a setting

2026-09-24. Floor Settings gains a *Language* card — *Automatic*, *English*,
*Español* — and the choice is the account's. `AccountSettings.language` crosses
the wire, `accounts.language` stores it, and the catalogue becomes state above
everything else in the tree rather than a value read once at launch.

## What it was

The app learned Spanish on 2026-09-23 and had no way to be asked for it. `App`
read `Intl` through `deviceRegion` once, handed the tag to `stringsFor`, and
gave the answer to `TextProvider`; the comment there said the arrangement was
sound because changing a phone's language relaunches the app on iOS, so nothing
could change underneath it that did not also restart it. It also said what would
have to change if a language were ever chosen in Settings, which is what this is.

The consequence was that the app's language was whatever the handset's was. That
is right as a default and wrong as the whole story: a bilingual household shares
a phone, somebody reads Spanish on an English work handset, and neither can say
so.

## What it is

**An account setting, on the colour scheme's reasoning and more strongly.** A
scheme you dislike is still readable. So it is stored on the account, pushed to
every device that account holds the moment one of them changes it, and cached on
each device for the frames between a cold start and `hello` — the same three
parts the scheme has, in the same three places. `system` is a stored value
rather than a null, for the reason `ColorSchemePreference` gives.

**The provider moved rather than the catalogue becoming mutable.**
`LanguageProvider` holds the preference, resolves it — the preference, or the
device's tag — and provides `TextProvider` under itself. It has to sit above
`AppProvider`, which is the thing that hears `hello`, because `AppProvider`
reads words of its own; so the account's answer travels *down* into it instead,
`applySettings` calling `adopt`. The screen's setter is `app.setLanguage`, which
is that `adopt` plus the write, so every setting on Floor Settings still reaches
the server by one path.

**dayjs had to learn to go back.** `setRelativeTimeLocale` only ever set Spanish,
which was sufficient while it was called once at launch off the device's own
report and silently wrong the moment somebody could switch back — an app in
English counting *hace 5 minutos*. It now sets one or the other.

## Three things about the words

- **The two languages are named in themselves in both catalogues**, *English*
  and *Español*. The one person on that screen who cannot read the language it
  is drawn in is the person about to change it, and *Inglés* is no use to them.
  `extracted.test.ts` asserts that every Spanish message differs from its
  English one, so both are listed in its `SAME_ON_PURPOSE` set.
- **The third option is *Automatic*, not *System***, which is what Appearance
  calls the same idea one card below. Two buttons of one name on one screen are
  announced identically by a screen reader and cannot be told apart in a
  sentence about either.
- **And not *Phone's language***, which says it better and does not fit: a third
  of a card is about 93pt, `Button` sets no `numberOfLines`, and a label that
  wraps leaves one button in a row of three taller than its neighbours. The note
  under the row carries what the word gives up. See STYLE.md § *A choice of more
  than three goes down the page rather than across it*.

## Why this needs no shim

The field is additive in both directions, which is the one case the two-step
does not apply to. A server that predates it ignores `language` in a
`POST /me/settings` body, as that route ignores every field it does not know —
so a new build talking to an old box simply fails to persist the choice. An app
that predates it ignores the field in a `hello`, having never read it.

The one asymmetry is a new client against an old server, which says everything
*but* the language while `AccountSettings` promises to be complete: `adopt`
therefore reads an unrecognised answer as the default rather than writing
`undefined` into the keychain. Nothing goes in SHIMS.md, and the deploy order is
the ordinary one — server first, client after.

## What is not here

**Nothing is translated by this.** The catalogue is what it was; this is only
the choice of which one. Spanish is still the two files, and a third language is
a member added to `LanguagePreference` in the same commit as the catalogue —
which is the check a typed union buys and the reason the preference is not an
arbitrary BCP 47 tag.

**The server is still English to itself.** Emails, the privacy page and the
push notifications it composes take no notice of this column. That is the next
piece of work rather than an oversight, and a push arriving in English under an
app in Spanish is the visible half of it.
