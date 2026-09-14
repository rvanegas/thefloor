# Decisions Do Not Obey The Convention They Document

`decisions/README.md` § *One decision, one file* says the filename is the date
and the title, "with the full title, date suffix and all, as the `#` heading
inside. That is the whole convention." **Of 73 decision files, 9 are written
that way.** Found 2026-09-14 by pointing `bin/note check` at the directory and
reading what came back.

The headings are in four shapes: 41 lead with a bare title and no date, 23 with
the date then the title (`2026-09-08 — Present is the media connection`), 9 with
the title then the date, and a handful are the filename slug repeated verbatim
as a heading (`# 2026-09-08-the-username-floor-is-four`). Only 21 of the 73 have
a heading that slugifies back to their own filename — several differ in
substance, not just in shape: `2026-09-12-derived-names-at-signup.md` is titled
*A new account is named, and has a username, before anybody types one*.

So `bin/note check` holds `tasks/` and `backlog/` to the strict rule and asks
only that a decision be dated and titled. **That is a checker describing
reality rather than the rule**, which is the state AGENTS.md warns about for the
glossary: a source of truth that lags authorises the wrong thing.

**The question is which end to move**, and it is genuinely open:

- **Move the README to the practice.** State that a decision's heading is its
  title in whatever form suits, and that the filename is what identifies it.
  Costs nothing, and admits that a decision is read by being opened rather than
  by being matched.
- **Move the files to the README.** 52 retitles, mechanical, and `bin/note
  rename` now does them one at a time. But these are history, cited by title
  from thirty-odd places in `planning/` and the source, and the citations match
  on the title — so retitling is the one edit that can break a reference that
  currently resolves.

**The second is probably wrong** for that last reason alone, which suggests the
first. Worth deciding rather than leaving the README overstating itself.
