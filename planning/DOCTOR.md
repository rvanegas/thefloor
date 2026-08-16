# Claude Code setup assessment, 2026-08-15

**Temporary.** This is a snapshot of a `/doctor` run, not standing guidance —
delete it once the proposals below are either applied or rejected. Every check
was read-only and nothing was applied at the time; the `AGENTS.md` findings were
applied afterwards, on 2026-08-15, and are marked **done** below. What is left
is the `expo` plugin entry, and the two notes filed for later under
`## Permissions`.

The scan covered the 50 most-recent session transcripts, all but one from this
project, spanning 2026-08-11 to 2026-08-15 — about 4.3 days, against 1,088
lifetime startups. Token figures throughout are estimates at chars/4 and are
labelled est.

## The short of it

The setup is unusually clean: no plugins installed, no user skills, no MCP
servers of one's own, no hooks, no local memory files. There is essentially
nothing to declutter. Two things were worth doing, and both are about one file.

- ~~Claude Code was 9 patch versions behind — **2.1.224** installed against
  **2.1.233** latest.~~ **Wrong; there was nothing to update.** The native
  installer tracks the **stable** channel, whose head is 2.1.224 — which is what
  is installed. `latest` and `next` both point at 2.1.233, which is the
  pre-release channel. The check compared against `latest` and read a channel
  gap as being behind. `npm view @anthropic-ai/claude-code dist-tags` is the
  thing to read, and `stable` is the line that matters for this install.
- `AGENTS.md` costs **~8,480 est. tokens in every session**, and about a fifth
  of that is reference material only a deploy session needs.
- `expo@claude-plugins-official` is enabled in the checked-in
  `.claude/settings.json` and is not installed on this machine.

## What is loaded, and what it costs

| Component | Type | Scope | Uses (total since install) | Used in window? | Est. resident tokens | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `AGENTS.md` (via `CLAUDE.md` → `@AGENTS.md`) | memory file | project, checked in | n/a | always loaded | **~8,480** | trim and migrate |
| `CLAUDE.md` | memory file | project, checked in | n/a | always loaded | ~3 | keep — one `@` import line |
| `expo@claude-plugins-official` | plugin | project, checked in | 0, no `pluginUsage` record | no | 0 — **not installed** | see below |
| `claude-in-chrome` | MCP server, built-in extension | app | n/a, no counter | **no** — 0 tool calls | deferred, ~0 | declutter via `/mcp` |
| Google Drive connector | MCP server, claude.ai connector | account | n/a, no counter | **no** — 0 tool calls | deferred, ~0 | declutter via `/mcp` |
| Gmail connector | MCP server, claude.ai connector | account | n/a, no counter | **no** — 0 tool calls | deferred, ~0 | declutter via `/mcp` |
| Google Calendar connector | MCP server, claude.ai connector | account | n/a, no counter | **no** — 0 tool calls | deferred, ~0 | declutter via `/mcp` |

**The four MCP servers are connections to external tools** — the browser, Gmail,
Drive, Calendar. Their schemas are deferred, so only the tool *names* sit in
context and the schemas are fetched on demand: they cost nothing. Zero calls in
the window is therefore a decluttering signal and **not** a token argument, and
none of them lives in a settings file that can be edited here — the browser
extension and the claude.ai connectors are managed through `/mcp` and the
claude.ai connector settings. Chrome is worth keeping if the app is ever
screenshotted from a session; the three Google connectors look like carry-over.

## Installation health — clean

Native install at `~/.local/bin/claude` → `~/.local/share/claude/versions/…`,
matching `installMethod: "native"` in `~/.claude.json`. No npm-global leftovers
and no `~/.claude/local`. `~/.local/bin` is on `$PATH`. All five settings and
config files parse. There are no agent definition files at all, so no collisions.

## The `expo` plugin is enabled and absent

`.claude/settings.json` — checked in — carries
`{"expo@claude-plugins-official": true}`, but `installed_plugins.json` is empty
and there is no `plugins/expo` directory, so its Expo skills are not in any
session's skill listing and it does nothing. Not a context cost; a line that
promises something the machine does not have.

Two ways out, and it is a checked-in file so the choice is deliberate: install
it with `/plugin`, or drop the entry. No edit was proposed.

## `AGENTS.md`, which is the whole story — **done**

All three findings below were applied on 2026-08-15. The section is kept as
written so the reasoning is legible; the outcome was `AGENTS.md` at **512
lines**, not the ~485 predicted, because the split doctrine under `## Keeping
this file small` grew by a paragraph recording what stayed behind and why —
which is the kind of thing the next split will need and the estimate did not
allow for.

33,927 chars, 600 lines. That is under the ~40,000-char threshold at which a
single memory file is warned about, but it is the entire resident context
budget. Almost all of it passes the derivability test — gotchas, rationale,
credential locations, the `APNS_ENV` trap are none of them reconstructible from
the code. Two findings.

### Derivable: the test commands — **done**

`## Running the suite`, the command block only, ~96 est. tokens. These are the
literal `scripts` entries in the root `package.json` — `test` and `typecheck` —
which a session reads anyway:

```
From the repo root, across all three packages:

```bash
npm test           # core + app + server
npm run typecheck
```

Or one at a time: `npm test --prefix core`, `--prefix app`, `--prefix server`.
```

The paragraph below it — "The per-behaviour table … the tests are the record" —
stays. It explains an absence and stops somebody re-adding the table.

### Stale: the file's own line count — **done**

`AGENTS.md` line 87 reads "It is 546 now". The file is 600 lines. A
self-governing file whose self-report is 54 lines stale cannot do its job: it
says there are 104 lines of headroom under the 650 cap when there are 50.
Whatever else happens, that number should be corrected.

### Migration: `### Credentials` → `planning/CREDENTIALS.md` — **done**

6,993 chars, **~1,748 est. tokens saved in every session**. The seven-credential
inventory: the self-issued LiveKit key, `thefloor-egress`, `thefloor-server` and
the SES configuration-set trap, the APNs `.p8`, the App Store Connect key and
its Admin-role requirement, the Ko-fi verification token.

The seam is *who needs it*, which is `AGENTS.md`'s own stated rule for splitting
thematically rather than shaving. This section is read by somebody provisioning,
rotating a key, or debugging an auth failure, and by nobody writing app or core
code. It is the same split already made for `RELEASING.md`, and it is the larger
of the two.

Nothing would be summarised away — the section moves verbatim, and `AGENTS.md`
keeps a pointer stanza shaped like the existing "Releasing an iOS build" one,
naming what is in it and saying to read it before touching any credential,
`bin/provision-livekit`, or `server/.env`. The `.p8`-outside-the-synced-tree rule
— because `bin/deploy` rsyncs with `--delete` — would be quoted in the pointer
as well, since that one bites somebody who is merely deploying.

**Deliberately not migrated.** `### APNS_ENV` stays, per `AGENTS.md`'s own
doctrine: it reads like release material and costs an afternoon to somebody
testing push locally who would never open a credentials document. `### What is
where` stays too — it is half infra inventory and half the `rtc.use_external_ip`
trap, which should not be separated from it.

Together the two cuts take `AGENTS.md` from ~8,480 to ~6,640 est. resident
tokens, and from 600 lines to roughly 485, restoring the headroom the governance
section is asking for.

## Nothing else found

- **Local memory dedup.** There is no `~/.claude/CLAUDE.md` and no
  `CLAUDE.local.md` anywhere. Nothing to deduplicate, nothing to contradict.
- **Hooks.** None configured, at any scope. Nothing to time.
- **Resident context beyond `AGENTS.md`.** The built-in skill and command
  listing is ~1,100 est. tokens, well inside its ~1% budget; MCP schemas are 0,
  all deferred; plugins 0; hook output 0. `/context` gives the exact live
  figures — everything here is a disk-based estimate.

## Permissions

**No allow rules were proposed.** 28 denials in the window and not one of them a
repeated read-only command. 27 are `user-rejected` — 12 `AskUserQuestion`, 4
`Edit`, 3 `bin/release-ios`, 1 `bin/deploy`, and one-off `curl`, `ssh` and `cd`
calls. Those are a person deliberately declining a release, a deploy or an edit,
which is exactly what should keep prompting. The single `automode-blocked` call
contained `git reset --hard`, which is not read-only and must not be
pre-approved.

**Auto mode is not the default and was proposed.** `permissions.defaultMode` is
unset in every scope, there is no managed policy, and `disableAutoMode` appears
nowhere. Enabling it means adding `{"permissions": {"defaultMode": "auto"}}` to
`~/.claude/settings.json` — the only file permitted to grant it; the same key in
a project or local settings file is ignored as repo-controllable. It applies to
every project, and it cannot lock anybody out: if auto mode is unavailable at
startup, the CLI falls back to ordinary prompting with a notice. Declined for
now.

**Worth a separate look sometime.** `.claude/settings.local.json` already
carries ~80 allow rules, and a few grant more than read-only —
`Bash(ssh *)`, `Bash(node -e ' *)`, `Bash(python3 -c ' *)` and `Bash(npm run *)`
are arbitrary code execution. No change was proposed: they were added
deliberately and removing them costs prompts. Flagged only so that what they
grant is written down somewhere.
