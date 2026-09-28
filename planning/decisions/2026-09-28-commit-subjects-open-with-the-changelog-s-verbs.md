# Commit subjects open with the changelog's verbs

Adopted 2026-09-28. A commit subject now opens with one of **Fixed, Added,
Improved, Changed or Removed**, the verbs Claude Code's own `CHANGELOG.md`
uses. Across its 406 releases and about 6,500 entries, those five open 83% of
entries — Fixed 56%, Added 11%, Improved 10%, Changed 5%, Removed under 1% —
and about 95% of the most recent fifty releases. The long tail is a handful
of more exact verbs: Reduced, Updated, Deprecated, Renamed, Hardened,
Reverted. Those are allowed here where they are the more exact word, and not
as a way round choosing one of the five.

**What it replaces.** Until now a subject was a declarative sentence stating
what had become true — *The follower steers on the room's clock, and stops
seeking where the player is*. That read well, but it did not say what kind
of change it was. A fix, a feature and a refactor all looked the same in
`git log --oneline`, and the only way to tell was to read the diff. The verb
answers that before anything else is read. The same commit is now *Fixed the
follower steering on the device's clock instead of the room's*.

**Four more verbs, for commits a changelog never sees.** The changelog's five
describe changes to a product, and about a third of this repository's commits
are not that. Of the 600 most recent commits, about 20% bump a build number and
90 (15%) touch only `planning/` or `AGENTS.md`. History already had words for
these — *Bump*, *Record*, *New Task* — so they are kept, in past tense:

- **Bumped**: a build or version number.
- **Recorded**: history, meaning a decision in `decisions/` or an entry in
  `deploy-history.md`.
- **Filed**: outstanding work, meaning a new item in `tasks/` or `backlog/`.
  Closing one is **Removed**.
- **Documented**: standing guidance, such as AGENTS.md, STYLE.md, GLOSSARY.md
  or RELEASING.md.

The three `planning/` verbs follow the directory's own split: history,
outstanding work and standing guidance. So the verb says which of them was
touched. A commit that changes code and records its decision alongside is
named for the code change.

**The body is unchanged.** It stays prose, and it still carries the
reasoning, as `7a2d4a3d` does. The convention governs the first line only.

**`bin/upload-ios`'s build commit follows it too**: *Bumped build number to
N* instead of *Bump build number to N*. There are 297 commits in the old form,
and nothing rewrites history, so `git log --grep 'Bump'` still matches both.

Not adopted: the changelog's bracketed surface tags (`[VSCode]`,
`[Claude Code on the web]`). The nearest equivalent here would be
`[app]`/`[server]`/`[core]`, and most commits touch more than one of them, so
a tag would be wrong as often as right. It is not enforced by a hook either.
`core.hooksPath` is unset, so a hook would have to be installed per checkout,
and a rule that one checkout enforces and the next does not is worse than one
that is simply written down.
