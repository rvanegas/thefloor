# The harness

What Claude Code is configured to do in this repository, and what it should be
configured to do. Written 2026-10-11 from a survey of the repository and the
user-level settings on the main machine.

**Read it before adding a hook, a skill, an agent definition or a permission
rule, and before adding a rule to AGENTS.md that is really a prohibition** —
since a prohibition is what the harness can enforce and prose cannot.

## Where things stand

**Almost nothing is configured, and every hard rule is prose.**
`.claude/settings.json` enables the Expo plugin and nothing else. There are no
hooks, no project skills, no agent definitions and no permission rules. The
user-level settings add auto mode with a short allowlist and the classifier's
environment description.

The rules the project most needs kept are therefore held in two places, both
advisory:

- **AGENTS.md**, which is loaded in full every session and which the model
  follows *usually*. Compliance drops as the file grows, which is the whole
  argument of its § *Keeping this file small*.
- **Memory**, under `~/.claude/projects/…/memory/`, which is **local to one
  machine and one user**. A cloud session or a session on another machine
  never sees it. Whatever is in memory alone is a rule only some sessions know.

**The distinction to design around:**

| Mechanism | What it is | Guarantee |
| --- | --- | --- |
| AGENTS.md, memory, skill text | Words the model reads | None — compliance, usually |
| Permission rules in `settings.json` | The harness gates a tool call | Hard: a denied call does not run |
| Hooks | Our shell code, run by the harness on events | Hard, deterministic, and can explain itself to the model |

Judgement belongs in prose — *say which verb you mean*, *read the task file
first*. **A thing that must never happen belongs in a hook**, with the prose
kept as the reason. Today it is the other way round for the rules that have
actually been broken: landing unprompted (twice, 2026-08-22 and 08-24), a
branch switch in the main checkout (2026-09-30), and prettier rewriting
`ChannelView.tsx` (2026-09-20).

## Recommendations, in order

### 1. Make the four manual verbs user-only, mechanically

AGENTS.md § *Branches* says landing, deploying and uploading are "manually
triggered, every time". The harness has two ways to make that true rather than
requested, and they combine.

**`ask` permission rules**, committed in `.claude/settings.json`, so that a
human has to approve the call itself:

```json
"permissions": {
  "ask": [
    "Bash(bin/deploy:*)", "Bash(bin/deploy-all:*)", "Bash(bin/deploy-web:*)",
    "Bash(bin/restart-services:*)",
    "Bash(bin/upload-ios:*)", "Bash(bin/submit-ios:*)",
    "Bash(git push:*)"
  ]
}
```

Zero code. Prefix rules miss a command that is spelled differently, which is
what the hook below is for. Check that auto mode honours `ask` before relying
on it alone.

**A `PreToolUse` hook on `Bash`** as the backstop. It reads
`tool_input.command`, matches on the meaning rather than a prefix, and answers
`permissionDecision: "ask"` with a reason that cites the rule:

- any `git push` whose refspec reaches `master`, or a bare push from `master`;
- `git merge`, `git rebase` or `git fetch . <x>:master` that moves `master`;
- `git tag -f released` and any push of a `build/*` tag;
- `bin/deploy*`, `bin/upload-ios`, `bin/restart-services`, and `bin/submit-ios`
  without `--status`.

`ask` rather than `deny`, because when the work has been asked for, the
command should go through. The prompt is then the person at the keyboard
saying *yes, this one*, which is exactly the rule. A `deny` would just teach
sessions to ask in prose and then have the human paste the command.

### 2. Turn landing and the verbs into user-only slash commands

The landing mechanics in AGENTS.md: re-read `master` at the moment of merging,
rebase, re-run tests, `--ff-only`, worktree before branch, `git branch -d`'s
misleading refusal, `git log master..<branch>` checked for other sessions'
commits, folding pending `planning/task/` edits in. That is about sixty lines
paid for every session and needed only by sessions told to land.

**A skill at `.claude/skills/land/SKILL.md` with
`disable-model-invocation: true`** fixes both halves:

- It can be run only by somebody typing `/land`. The model cannot invoke it,
  so *who decides the work is finished* is enforced by the harness rather than
  asked of the model.
- Its body loads only when invoked. The procedure leaves AGENTS.md, which
  keeps one paragraph: *landing is `/land`, typed by a person; here is why*.

The same shape fits `/deploy`, `/upload` and `/submit`. Each is a user-only
skill that carries its verb's preconditions and points at the right section of
RELEASING.md, instead of AGENTS.md saying *read RELEASING.md before any of
these*. Together with § 1, AGENTS.md's § *Branches* and § *Getting a build to
users* could shrink to roughly a third, with nothing summarised away. This is
the thematic split the file already prescribes, using the harness's own
mechanism for it.

### 3. Hooks for the three known foot-guns

Each one blocks something that has already happened once and costs about a
dozen lines of shell. **`deny` with a reason**, since none of these is ever
right:

- **`prettier --write`** (or `npx prettier` with any write flag): deny and
  point to "no formatter in this repo; fix the lines by hand". Today this rule
  is in memory only.
- **A branch switch in the main checkout**: deny `git checkout -b`,
  `git switch` and `git checkout <branch>` when the working directory is
  `/Users/rodvandur/src/thefloor` itself rather than a worktree. Memory only
  today, and the cost was a commit nearly orphaned.
- **`npm test` or `npx` in a tree with no `node_modules`**: deny with "this is
  a fresh worktree; run `bin/worktree-setup`". That turns
  `jest: command not found` into the instruction it should have been. A
  `SessionStart` hook would miss it, because `EnterWorktree` happens mid-session.

### 4. Set `worktree.baseRef: "head"` and delete the memory that works around it

`EnterWorktree` branches from `origin/master` by default. Here that is
routinely many commits behind, because unpushed commits are normal. A memory
tells every session to rebase by hand afterwards, and its last line names the
setting that would make that unnecessary. Put it in `.claude/settings.json`,
where it is shared, and delete `worktrees-branch-from-local-master.md`.

### 5. Move rules that everyone needs out of memory

Memory is per machine. Of the nineteen memories today:

- **Already in AGENTS.md, so redundant**: `landing-is-never-a-script` (most of
  it), `decisions-rollover-is-mechanical` (`planning/decision/README.md` has
  it).
- **Replaced by a setting or hook above**: `worktrees-branch-from-local-master`
  (§ 4), `no-formatter-in-this-repo` and `never-switch-branches-in-the-main-checkout`
  (§ 3). Keep each one's *why* as the hook's message.
- **Superseded by the harness**: `finding-your-own-session-url`. Claude Code
  now injects the full `Claude-Session` trailer in a system reminder, so the
  transcript-directory archaeology it describes is no longer needed. Check
  that this holds in cloud sessions before deleting it.
- **A project rule that cloud sessions need**: `pushing-is-publication`. The
  background-job system prompt tells a session to push when the repo has a
  remote, and only this memory overrides that. A cloud session has no memory.
  One sentence in AGENTS.md, which outranks the system prompt's default, is the
  durable place for it.

What should stay in memory is what is genuinely about one person working with
the assistant — preferences, corrections, the reasons behind them — not facts
about the repository.

### 6. Decide what "read routinely" costs in GLOSSARY.md

AGENTS.md says GLOSSARY.md's § *Every term, in one line each* is "worth
reading routinely, and cheap to". **That section is 48KB, about 12,000
tokens**, more than AGENTS.md itself. It is the largest recurring read the
project authorises, and it grows by a line per term. The 2026-09-07 fix made
it cheaper than the whole file (311KB), not cheap.

This is a judgement call, not a mechanical fix. Three ways out:

- **Make the pointer conditional**: read the list before naming anything a
  user sees, renaming anything, or writing copy. Most backend and tooling
  sessions never need it.
- **Split the list by audience**: the user-facing words (§ one of the
  glossary's three parts) as the routine read, code-only words on demand.
- **A lookup instead of a read**: `bin/glossary <word>` printing the one line
  and the entry's heading, like `bin/note find`. Then a session pays for the
  terms it actually meets.

### 7. Resolve quoted task titles deterministically

AGENTS.md's rule that `Do task "Track Usage"` refers to
`planning/task/track-usage.md` is followed by the model and is already
executable as `bin/note find`. **A `UserPromptSubmit` hook** can run that on
each quoted string in the prompt and add one line of context per hit:
`"Track Usage" → planning/task/track-usage.md (read it first)`. It prints
nothing when there's no match. The rule then holds even on the turn the
model would have taken the title at face value, which is the failure the rule
exists for.

### 8. An agent for archaeology

`planning/decision/` is 2.7MB, and AGENTS.md tells sessions how to search it
sparingly: filenames first, then archive headings, never sweep the prose. **A
project agent at `.claude/agents/archaeologist.md`** (read-only tools, a cheap
model) carries those rules in its own prompt, does the search in its own
context, and returns the answer with the file it came from. The main session
pays for a paragraph instead of the eighty kilobytes a careless grep returns.
The same agent fits "why is this shim here" against SHIMS.md (51KB, no
contents table).

### 9. Smaller items

- **A `commit-msg` git hook** requiring `Claude-Session:` on any commit that
  carries a `Co-Authored-By: Claude` trailer. AGENTS.md notes that nothing can
  add it afterwards, so it is worth refusing the commit that lacks it. This
  belongs in git rather than Claude Code, so it also catches a commit made by
  hand from a session's suggestion.
- **Indexes for the two large documents without one**: ASSEMBLY_PROMPT.md
  (55KB) and SHIMS.md (51KB). This is the 20KB rule AGENTS.md already states.
- **Read-only allowlist entries** for `bin/health`, `bin/deploys`, `bin/note`,
  `bin/usage`, `npm test` and `npm run typecheck`. The `fewer-permission-prompts`
  skill will propose them from the transcripts. These are cosmetic under auto
  mode, but useful for any session not in it.

## What not to do

- **Do not put a hook where judgement is needed.** "Read RELEASING.md before
  deploying" is not checkable, and a hook that tries (by grepping the
  transcript, say) will be wrong in both directions. A hook enforces *what may
  run*. Prose and skills cover *how to think*.
- **Do not let hooks be slow or chatty.** A `PreToolUse` hook runs on every
  matching call, and a `UserPromptSubmit` hook on every prompt. Each should be
  a few milliseconds of shell, print nothing when it has nothing to say, and
  never touch the network.
- **Do not add rules here that AGENTS.md also states.** When a recommendation
  ships, the mechanism (the hook, the skill) is the record and AGENTS.md keeps
  the reason in a sentence. This file keeps only what has not shipped and why
  the shipped parts are shaped as they are.
