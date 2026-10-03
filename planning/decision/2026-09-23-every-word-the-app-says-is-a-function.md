# Every word the app says is a function, and the second language is Spanish

The internationalization task, done in one pass: the extraction and the
translation, because the vocabulary questions the task named can only be
settled with both in front of you.

## What was decided

**One function per message, grouped by the screen that says it, and the type
is derived from the English catalogue rather than declared.** `en.ts` is the
source of truth for what messages exist and what each one takes; `es.ts` is
`const es: Strings = {…}`, so a message missing, misnamed, or taking the wrong
arguments is a typecheck failure. There is deliberately **no runtime fallback
to English** — a fallback turns that compile error back into a silent
half-translated build, which is the failure mode the shape exists to prevent.

**Functions rather than keys and format strings, because of what Spanish needs
and English hides.** A message with a number in it agrees with that number; a
message about a person agrees with that person. A catalogue of format strings
has to grow ICU to express the branching, plus a runtime that parses it, and
then every call site passes untyped arguments into a parser. A function
already *is* that branching, in the language the rest of this is written in,
and the arguments are typed. The task's own words were "replace all text with
functions", and this is why that was the right instruction rather than a
loose one.

**English is the context's default**, so nothing has to provide it: the
several hundred existing assertions that name English prose are untouched, and
a screen rendered outside the tree says words rather than throwing.

**The locale is read once at launch, from `deviceRegion`** — the same `Intl`
read the App Store region rule already makes, so there is one answer to what
the device says about itself and no new dependency for a second one. Changing
the phone's language relaunches the app on iOS, so nothing can change
underneath it that does not also restart it. A `TextProvider` rather than a
module singleton all the same, so that a language chosen in Settings, if there
is ever one, is a value change that redraws.

## The three prose sites in core, which got three different answers

`core/` imports nothing, so it cannot read a catalogue. Each site got the
treatment its *shape* deserved rather than one rule applied three times:

- **`describeChannel` keeps the structure and takes the words.** Two names
  then a count, where the cap falls, that the count is of people and not of
  names — that is decided once and must not be decided twice. The three
  phrases arrive as a `NamingWords` argument with an English default.
- **`describeLevel` was words and no structure, so it left core.** Nothing but
  the two settings screens ever read it. A note in `notifications.ts` says
  where it went.
- **`usernameProblem` split in half.** Core decides *which of the three rules
  broke*; the server still renders that in English, because an API error is
  English, and the app renders it from the catalogue. Keeping both halves in
  core is what stops the route and the field drifting apart about *what* is
  wrong while agreeing only about the words.

**`nameRecording` pins the English deliberately.** It is written into the row
once and read back by everybody who was there. A stored name rendered per
viewer would give two people two names for one artefact — which is the thing
that function's own comment says it exists to prevent — and one recomputed in
the reader's language would change every time they changed their phone.

The same split reaches out of core: `availability.ts`, `money.ts`,
`introduction.ts`, `install.ts` and the channel-card builders in
`ChannelsView` all take their words as an argument rather than reading a hook,
because none of them is a component and `nearbyChannels` is called from
`App.tsx` to decide which bar to draw.

## The *invitado* collision, which is the thing the task asked for

English draws three distinctions where Spanish has one word. The third was
settled in advance by
`2026-09-22-the-members-tab-is-the-people-tab.md` — *Invitaciones*, the noun
rather than the participle. The first keeps the word: a **guest** is an
*invitado*, that being the sense where it names a person rather than
describing a state.

**The second is new here.** *Invited*, the status line on a member who has
never entered, is ***Sin entrar*** — not *Invitado*, which would say that a
member of the channel is a guest of it, the one distinction that roster cannot
afford to blur. Naming the absence is true of exactly that state and collides
with neither of the other two.

It is in `planning/GLOSSARY.md` § *Part Three*, with the rest of the
vocabulary, because that is where the next person will look.

## What is deliberately not translated, and why each one is not an oversight

Each of these has the reason written beside it in the code as well as here.

- **The two developer screens**, `AudioLabView` and `AudioDebugPanel`. Sixty
  messages to make a diagnostic harder to correlate with the code it is
  diagnosing. The guard test names them, so it is a decision.
- **`nameRecording`**, above.
- **Apple's taxonomies.** The iTunes categories go into the feed verbatim and
  a directory matches them as written, so a translated *True Crime* is a feed
  Apple will not file. The channel's language tag is a BCP 47 tag for the same
  reason; the sentence around it is translated.
- **The numeral in `money.ts`.** `formatAmount` prints Ko-fi's payout
  currencies with a symbol table chosen for them. Moving to
  `Intl.NumberFormat` is a different decision with a different person to make
  it — whether somebody reading Spanish should see a gift they made in dollars
  as `5,00 €`.
- **`IM_SERVICE_NAMES` and `IM_SERVICE_HINTS`.** WhatsApp is WhatsApp; and
  what the placeholder has to teach is *country code, then number*, which the
  reserved `+1 555` range says without being anybody.
- **`alerts.web.ts`'s `OK`**, installed from `index.web.ts` before anything
  renders, with no provider above it, and React Native's own default word.
- **The Android notification channels**, for the same structural reason plus
  Android not being a platform this is released on. The honest fix when it is
  one is `strings.xml` per locale.
- **The guest page the server serves.** `SeatView`'s five microphone
  sentences are that page's verbatim, and the page is still English. That is a
  gap rather than a drift — the fact each sentence states is the same one —
  and it closes when the server learns a language.

## What the native side needed

**The lock-screen card's two words are sent from JS already resolved**, the
way the channel's name already was. The widget is a separate binary with no
catalogue in it and no way to reach one, and an `es.lproj` inside it would be
a second place this project's vocabulary lives and a second place it goes
stale. Two fields on `ContentState`, `micLabel` and `micState` — the second
because the iOS 16 card has no button and announces a state instead.

**The microphone prompt needed a config plugin, and it is worth one for a
single sentence.** It is the only thing the *system* says on this app's
behalf, and it is said at the worst moment: somebody handing over a
microphone, in a dialog they cannot reopen, ninety seconds after installing. A
hand-written `es.lproj` would survive exactly until the next
`prebuild --clean` and then vanish with nothing failing, the fallback being
the English already in `Info.plist`. `plugins/with-localizations.js` writes it
and adds it to the project; `CFBundleLocalizations` is what makes iOS look.

**dayjs holds one locale per module**, so `setRelativeTimeLocale` is called
once at launch beside `stringsFor`. The alternative was an app that says
*hace 5 minutos* and *5 minutes ago* in the same sentence.

## The guard, which is the half that decays

`app/src/i18n/__tests__/extracted.test.ts`, on
`core/__tests__/purity.test.ts`'s precedent: this repository has no linter, and
a constraint nothing enforces is one that lapses the week after it lands. The
decay here is invisible — a literal added to a view is a screen that silently
stays English in a Spanish build, with nothing failing anywhere.

It looks for **prose** rather than for strings, a string being how this
codebase writes an action type and a style token: a capital, a lower-case word
and a space, inside quotes, outside a comment. It also checks the two
catalogues hold the same keys at runtime, and that no Spanish message is still
its English self — with the handful that are the same on purpose listed by
name.

## What was deliberately not done

**No language switcher in Settings.** The task asked for functions and then
Spanish, and the device's own setting is the answer everywhere else in iOS.
The provider is there, so the day somebody wants one it is a value and a pair
of buttons rather than a refactor.

**Push notifications are still English**, and they are a project rather than
an omission: the server composes them, so it needs the recipient's locale
persisted on the device row — it reaches `/config` as a query parameter today
and is not stored — a catalogue of its own, and the two-step for a wire
change with an entry in `planning/SHIMS.md`. Worth doing; worth not doing in
the same breath as the app.

**The server's own pages and emails are English**, along with the App Store
listing. Same boundary as the push notifications: everything the *server*
says is one piece of work, and this was everything the *app* says.

**No length pass against `planning/STYLE.md`.** Spanish runs perhaps a fifth
longer and several control and row shapes are pinned. The short forms that
needed a decision got one — the footer's three rungs, and *Silenciar /
No silenciar*, which is Apple's own pair and therefore the one people already
know — but nobody has looked at a Spanish build on a small handset.
