# Planning

Everything about The Floor that is not code and not AGENTS.md. Four
directories hold items, one file each; the files at this level are standing
documents, and nothing else belongs beside them.

**The rule for this level, since 2026-10-03:** a file here describes something
that holds for as long as the app does — a reference, a procedure, an argument,
a register. Anything with an end goes in a directory instead. A design for
unbuilt work lives in the `task/` file that asks for it; an investigation
still open, or behaviour nobody has tested, goes in `backlog/`; and when the
work ships, whatever survives moves to `decision/`. If a file here starts
describing work that will one day be done, it is in the wrong place.

**Keep this README current in the same commit** as adding, removing or moving a
file at this level. A list that lags is a list that authorises the wrong file.

## The directories

- **`task/`** — the roadmap: features, audits, open questions and things to go
  and find out, one file per item, named by the slug of its title. This is
  where work is picked up from, and a task large enough to need a design
  carries it inside. Finishing a task deletes its file.
  [task/README.md](task/README.md) is the convention.
- **`backlog/`** — what is known and not done: work deliberately deferred,
  defects found and left, behaviour nobody has tested, each with its evidence.
  `untested-behaviour.md` is the one list rather than an item.
  [backlog/README.md](backlog/README.md) is the convention.
- **`decision/`** — what was built and why, including what was considered and
  deliberately not built. History rather than work, one dated file per
  decision, and **archaeology**: read it when something in the code is
  inexplicable and knowing why would change what you do, matching filenames
  first. `decision/archive/` holds the eleven frozen volumes from before the
  one-file split. [decision/README.md](decision/README.md) is the convention.
- **`submissions/`** — the text of each App Store submission, as sent:
  `review-notes-<version>.txt`, written by `bin/set-review-notes`, and
  `whats-new-<version>.txt`, sent by `bin/submit-ios`. A record of what Apple
  was told, per version.

`bin/note` is the tool for the first three — `find`, `new`, `rename`, `list`,
`check` — and `bin/task "Some Title"` makes a task. AGENTS.md has the rule that
makes a quoted title a reference to one of these files.

## The files

**Read when the work calls for it, never as a matter of course** — except
GLOSSARY.md's one-line list, which is worth reading routinely.

| File | What it is | Read it |
| --- | --- | --- |
| [APPREVIEWSCRIPT.md](APPREVIEWSCRIPT.md) | The walk through the app in the order a stranger meets it, which found eight defects before 1.0.0; filming it is optional | Before every submission, and as the smoke test after a dependency upgrade |
| [ASSEMBLY_PROMPT.md](ASSEMBLY_PROMPT.md) | AssemblyAI's own guidance for coding agents, verbatim, with our header; a snapshot, and `llms.txt` is the live copy | Before touching `server/src/transcription.ts` |
| [CREDENTIALS.md](CREDENTIALS.md) | Every credential the project holds: where it lives, what it can do, what losing it costs | Before touching any credential, `bin/provision*`, `bin/env-*` or `server/.env` |
| [DEMO-ACCOUNT.md](DEMO-ACCOUNT.md) | The two accounts App Review signs in as, why two, and the order they are torn down in | Before a submission, and before touching `REVIEW_IDENTIFIER` / `REVIEW_CODE` |
| [EXPIRATIONS.md](EXPIRATIONS.md) | Every deadline measured in days, each with its own argument, and which are published promises | Before changing any retention or expiry constant, or "tidying" them into one |
| [GLOSSARY.md](GLOSSARY.md) | The source of truth for vocabulary — user words, code words, Spanish — with a one-line-per-term list at the top | The list routinely; an entry when a word is in doubt. Edit it in the same commit as a rename |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | The live box: instance, IP, DNS, TLS, services, ports, logs, and the two media settings that fail silently | Before touching, sizing or restarting the box |
| [MANUAL.md](MANUAL.md) | The introduction email for somebody who has just joined. Not yet sent, and its habit section predates stepping in nearby — `task/update-the-introduction-and-send-it-to-new-users.md` | Before writing anything that teaches a user how the app works |
| [MARKETING.md](MARKETING.md) | The acquisition argument: the group as the unit, the funnel's fourteen levels, measurement, paid, and what marketing may not do | Before spending money, adding measurement, or writing copy for strangers |
| [MIGRATION.md](MIGRATION.md) | The sizing argument in both directions, from the abandoned 2026-08-13 move to a smaller instance | Before sizing, rebuilding or re-hosting the server |
| [POSTMORTEM-echo.md](POSTMORTEM-echo.md) | The build 17 echo, start to finish: three components configuring one iOS audio session | Before touching the iOS audio session |
| [PROPOSITION.md](PROPOSITION.md) | What the app is for: the thesis that the ring is an alarm, its evidence, what it forbids, and the work it obliges, in order | Before any decision about what the app should be, and before writing copy |
| [RELEASING.md](RELEASING.md) | Everything for producing an iOS build: the five verbs, `app.json`, icons, entitlements | Before `bin/upload-ios`, `bin/submit-ios` or `bin/deploy` |
| [SHIMS.md](SHIMS.md) | Every shim kept for older installs, by the build that retires it | When `MIN_SUPPORTED_BUILD` moves, and in the commit that adds a shim |
| [STATES.md](STATES.md) | What each state is called in each layer, when it holds, and where two layers can differ | Before touching the floor, the microphone, presence or the audio session |
| [STYLE.md](STYLE.md) | What the app looks like and why: colour tokens, type roles, controls, cards, rows, icons | Before adding or changing a screen, a control or a colour; edit it in the same commit |

`MARKETING.pdf`, `PROPOSITION.pdf` and any other PDF here are renders for
reading offline. `.gitignore` excludes them, so they exist only in the checkout
that made them, and the Markdown is the source of truth.
