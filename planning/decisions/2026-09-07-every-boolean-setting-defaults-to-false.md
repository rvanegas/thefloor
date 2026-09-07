# Every boolean setting defaults to false — 2026-09-07

Three booleans follow the account: whether a tap on Home arrives, whether the
channel screen repeats its footer as cards, and Labs. Two of them defaulted
*on* and were named for the behaviour they switched off, so the screen said
"the untouched case is true" twice and "the untouched case is false" once.
They are now `tapToLook`, `hideControlCards` and `labs`, each named for the
departure from what an account that has never opened the screen gets, and each
false by default.

**Nothing anybody sees changed.** A tap still steps in, the cards are still
drawn, Labs is still off. What changed is which way round every layer stores
and reads that, and the layers are not few: the column, the null that stands
for never having said, the read that fills the default in, the fixture in the
test harness, the sentence on the settings card, and the wire. A default that
points one way in some of those and the other way in others is a bug you find
by having it, and it had already been written down twice — the row type in
`db.ts` and the Labs entry below both carried a paragraph explaining that this
one reads the other way round.

That paragraph is the cost this removes. `2026-09-06-labs-hides-two-features.md`
opens by saying Labs reads the other way round from every setting beside it,
and *that is the whole design*; the design survives, but the sentence no longer
describes the code. What made Labs different was never its default — it is a
gate rather than a preference, which is a claim about what the setting decides
and not about which value is the quiet one.

### The rule, which is the point of doing it at all

**A boolean account setting is named for the departure from the default, and
its default is false.** Then null, 0, absent, "a value nobody recognises" and
"never opened the screen" are one answer everywhere, in every layer, for every
setting, and there is nothing to remember per setting. The alternative is what
was there: correct, and requiring a sentence at each site saying which way this
particular one goes.

It is a rule about the storage and the vocabulary rather than about the
screens. The card headings had to be rewritten to match — *Tap a channel to
look, not step in*, *Hide the repeated channel controls* — and both now read
"Off, which is where everybody starts", which is what the Labs card already
said.

### The migration, which had something to lose

`tap_to_step_in` and `control_cards` became `tap_to_look` and
`hide_control_cards`, renamed **and** inverted in one pass in `openDb`:

    ALTER TABLE accounts RENAME COLUMN tap_to_step_in TO tap_to_look;
    UPDATE accounts SET tap_to_look = 1 - tap_to_look WHERE tap_to_look IS NOT NULL;

The two halves cannot be separated. A column called `tap_to_look` holding what
`tap_to_step_in` held is backwards for every account that had chosen, and
afterwards there is nothing to tell the two states apart — the name is the only
evidence of which way the number means. Nulls are left null: never having said
is not a choice to invert, and it is the same answer under either name.

The guard is the presence of the *old* name, so a second boot finds nothing to
do rather than turning everybody back. `migration.test.ts` asserts exactly
that, on a fixture built by hand — a single `openDb` now runs the column-adding
pass and this one together, so there is no moment in between to seed.

### The wire, which is why this is not just a rename

The settings cross the wire three times — the hello, the `settings` event, and
the answer to `POST /me/settings` — and every build in anybody's hands reads
`tapToStepIn` and `controlCards`. A server that simply stopped sending them
would hand every installed app a tap that no longer steps in and a channel
screen with no cards, one minute after a deploy, silently. This is the case
AGENTS.md § *Never ship a wire change to a server before the client can speak
it* exists for, and it is taken the ordinary way: `server/src/settings-wire.ts`
sends both names and accepts either, with the old one negated on the way in.

**It is one function each way, deliberately.** A client that learnt one shape
from the hello and another from the event would be the same bug in a harder
place to find, so all three emissions go through `settingsForWire`. When a body
carries both names — which nothing sends, but a body is whatever arrives — the
current name wins, on the grounds that it is the one the sender knew was
current.

The app's own cache is the same problem one layer down. It keeps the last
answer under `thefloor.tapToLook` and `thefloor.hideControlCards` to cover the
second between a cold start and the hello; a phone upgrading into this build
has only the old keys, so the read falls back to them and negates. That fallback
matters for exactly one of the two: the tap's cache exists to stop a cold start
entering a channel somebody meant only to open.

Both compatibilities are deletions waiting on the compatibility floor, and are
listed in BACKLOG.md § *The two renamed settings still answer to their old
names on the wire*.
