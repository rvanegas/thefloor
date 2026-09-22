# Internationalization

First replace all text with functions. Then Spanish.

**One collision to settle when the whole vocabulary is read against Spanish at
once.** *Invitado* is both *guest* and *invited*, and English draws three
distinctions where Spanish has the one word:

- *Guest* — somebody in the room through a link or an invitation
- *Invited* — the status line on a member who has never entered,
  `ChannelView.tsx`
- *Invitations* — the People tab's group of guest seats nobody has taken up

The third was named around it already — see
`decisions/2026-09-22-the-members-tab-is-the-people-tab.md`, which also carries
the Spanish for that tab's four labels. The first two are pre-existing and are
cheapest to settle during the extraction, while the English words are still
only in the UI and not yet load-bearing in tests and decision files.

**And the reason the tab was renamed twice belongs here**: *Members* beat
*Roster* on 2026-09-14 largely because it translates, which no write-up of that
rename recorded. Naming decisions in this app are made with this task in mind,
so a word that reads well in English and travels badly is not the better one.
