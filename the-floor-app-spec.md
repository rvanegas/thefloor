# Two-User Audio Session App — "The Floor"

## Overview

An audio conferencing app (comparable in spirit to FaceTime Audio, but session-based like Zoom rather than call-based like a phone) with a deliberately minimal feature set, built around one distinguishing mechanic: either participant in a session may claim exclusive, uninterruptible speaking time — "the floor" — cutting the other party's microphone for up to three minutes, subject to a simple eligibility rule that guarantees fair, symmetric turns whenever both parties use the feature to its fullest, with no credit or budget tracking required.

Users have accounts and a contact list (general-purpose, not a fixed pair), and can hold audio sessions with any accepted contact. This document describes the target feature set, the three main UI views, and the intended purpose behind each rule, as the basis for a build in React Native.

## Platform

- React Native, targeting both iOS and Android from a single codebase.
- Real-time audio between the two peers in a session (e.g. via WebRTC).

## Accounts & Contacts

- Identity is established via phone number or email plus a one-time verification code — no password-based auth.
- Each account has a display name, set during signup.
- Users have a **contact list** of other users they can start sessions with. This is general-purpose: any user may have multiple contacts, and chooses who to session with at the time of initiation.
- **Adding a contact requires mutual acceptance.** A user searches for another account by phone number or email and sends a contact request; the recipient must accept before the two become mutual contacts. There is no one-directional add.
- Both outgoing (sent, awaiting response) and incoming (received, awaiting this user's response) contact requests exist as distinct pending states until resolved.

## Session Lifecycle

Sessions are Zoom-like: they exist independently of either user's momentary presence, rather than existing only while both parties are actively connected, as in a traditional phone call.

- A session is created when a user (the **initiator**) selects a contact and enters. This both creates the session and sends an **in-app live invite notification** to that contact — visible only if their app is open (foreground or backgrounded but running); there is no push notification / OS-level delivery to a closed app in this version.
- Entering is itself a persistent state, not a fire-and-forget action: the initiator lands in the **Session** view immediately, present and waiting, for as long as it takes the other party to join (see the empty-session timer rule below, which does not run while the initiator is present).
- The notified contact may **enter** the session at any time while it exists (has not been explicitly ended), by tapping the live invite.
- **While the session is empty (no users present)**, an auto-end timer of **one minute** runs; if no one re-enters within that minute, the session ends automatically. **While at least one user is present, this timer does not run** — an initiator waiting alone for the other party's first entry can wait indefinitely with no timeout.
- Either user may **leave** at any time. Leaving does not end the session — if the other party is still present, the session continues with just them; if the departing user was the last one present, the session becomes empty and the one-minute auto-end timer starts.
- A user may **re-enter** a session they've left, as long as it hasn't ended (auto or explicit). Re-entering while the empty-session timer is running cancels that timer.
- Either user may **end** the session explicitly at any time, regardless of who else is present. This terminates it immediately and permanently — re-entry is no longer possible; a new session would need to be initiated fresh.
- **If the current floor-holder leaves the session, their floor claim is force-released immediately**, exactly as if voluntarily released — the floor eligibility rule then applies normally to whoever remains or re-enters.
- **Recording is unaffected by users leaving.** An active recording continues running regardless of how many users are present, including during the empty-session window before an auto-end, and stops only when the session itself actually ends.
- **Reconnection / dropped connections are treated identically to a deliberate leave.** If a user's connection drops while they hold the floor, their claim is force-released immediately, same as a voluntary leave. If at least one user remains connected, the session and any active recording continue uninterrupted. If both users disconnect simultaneously, the standard one-minute empty-session timer applies — the session (and recording) ends automatically after that minute unless someone reconnects first. No separate reconnection mechanism exists beyond the ordinary leave/re-enter/auto-end rules already specified.

## Self-Mute

- An ordinary, familiar mute: either user can silence **their own** microphone at will, and unmute themselves at will.
- Fully unilateral, unlimited, and uncosted — no interaction with the floor mechanic in either direction.
- A self-muted user's floor eligibility is unaffected — behaves exactly as if they were speaking normally.
- This is the feature labeled "mute" in the UI, matching the term's familiar meaning from other calling apps. It must be visually and functionally distinct from claiming the floor, so a user cannot confuse silencing themselves with forcibly silencing the other party.

## The Floor (Forced-Mute Mechanic)

### Purpose

To let a speaker guarantee themselves uninterrupted speaking time by forcibly silencing the other party for a bounded interval, without either party being able to dominate the conversation indefinitely, and without requiring any ongoing budget or credit tracking.

### Mechanic

- Either user present in the session may **claim the floor**, silencing the other user's microphone outright. This is a hard cut at the transport/mic level — the silenced user's audio does not reach the other party at all. There is no buffering or delayed delivery.
- A claim lasts **up to three minutes**. It ends either **voluntarily**, at the holder's discretion at any point before three minutes, or **involuntarily**, automatically, at the three-minute mark.
- A user who does not currently hold the floor (i.e., who is currently silenced) **cannot** claim the floor themselves. Only a party with an open mic may initiate a claim. This makes it structurally impossible for both users to be silenced at the same time.
- **The floor-claim control is disabled while the user is alone in the session** (the other party has not yet entered, or has left). It becomes available only once both users are present.

### Eligibility Rule

A user may claim the floor if and only if **both** of the following hold:

1. **Neither user currently holds the floor** (no claim is in progress).
2. **Either:**
   - the most recent claim (if any) was made by the *other* user, **or**
   - **more than one minute** has elapsed since the floor was last released.

If the floor has never been claimed yet in the session, condition 2 is vacuously satisfied (there is no prior claimant to be identical to), so either user may make the first claim freely.

### Intended Emergent Behavior

Under maximal, immediate, alternating use — each party claiming the floor for the full three minutes and releasing only at the automatic three-minute mark, with each party re-claiming as soon as they're eligible — the eligibility rule forces **strict alternation with no gap**: the instant A's claim ends, B satisfies condition 2 immediately (A's claim was "the other user" relative to B) and may claim at once, while A does not become eligible again until either B's turn ends or a full minute of shared silence has passed. This produces exactly symmetric three-minute turns under fully maximal use by both parties.

**Fairness is scoped accordingly:** equal speaking time is guaranteed only when both users use the floor-claiming feature maximally. Outside of that — e.g. if one party never claims the floor — there is no guarantee of equal time, and the other party may repeatedly reclaim the floor (subject to the one-minute wait after their own release) with no obligation of balance.

### Deliberate Non-Goals

- **No voice activity or silence detection.** There is no requirement that a claim wait for a pause in the other party's speech. Claiming politely (not interrupting mid-sentence) is left to user discretion, not enforced by the app.
- **No anti-toggling protection beyond the eligibility rule itself.** The one-minute same-user cooldown limits (but does not fully police) rapid self-reclaiming; disruptive use in bad faith is treated as a matter of conversational conduct, not something the app is responsible for preventing.
- **No lifetime symmetry enforcement.** The app does not track or cap the cumulative difference in floor time between the two users over the life of a session. Fairness, as scoped here, is conditional: equal time only under maximal mutual use, plus the structural guarantee that simultaneous double-silence is impossible.

## Recording

- Recording is **not automatic**. It begins only when a user actively starts it, via an in-session control, after both users have connected.
- Either user can **initiate** a recording at any time during the session.
- Once started, recording can be **paused, resumed, or stopped independently of the session itself** — none of these actions end the session, and (per above) recording continues running even if one or both users leave, subject to the one-minute empty-session rule if both disconnect.
- **Recording control restriction:** a user who is currently silenced (does not hold the floor) **cannot** pause or stop the recording. Only the current floor-holder can. This prevents a silenced party from tampering with or cutting off the record during the interval when they have no voice in the session. Outside of an active floor claim, either user can pause, resume, or stop the recording freely.
- **Consent indicator:** a small persistent red dot plus a "Recording" text label, shown in a fixed position (e.g. top corner of the Session view), visible to both users whenever recording is active. (Note: a visual indicator provides notice but may not by itself satisfy legal consent requirements in all jurisdictions with two-party consent laws for recorded calls — this should be reviewed against applicable law before shipping, independent of the in-app UI.)
- **Storage:** recordings are stored on **AWS S3**, retained **indefinitely**, with **independent access for both users** in the session regardless of the other's cooperation.
- **Export:** recordings are exportable by either user after the session, in whatever audio format is most convenient to implement (e.g. a standard compressed audio container such as M4A/AAC) — the specific format is an implementation detail, not a fixed requirement. Past recordings are also browsable from the Home view, not only immediately after a session ends.

## UI Views

Three views, named for development purposes as follows.

### 1. Auth

Signed-out state.

- Sign up / sign in via phone number or email plus a one-time verification code (no password).
- Set display name (on signup).
- No other fields — no profile photo or additional onboarding content.

### 2. Home

Signed-in, not currently in a session. Content, roughly in priority order top to bottom:

- **Live session invites** — shown as a dismissable banner pinned to the top of the screen, persistent until acted on (or the underlying session ends/times out), displaying the inviting contact's name with a single tap-to-join action. Multiple simultaneous invites from different contacts are possible and should each appear as their own banner, stacked.
- **Contact list** — a single list containing both accepted contacts and pending contact requests. Accepted contacts are tappable to initiate a new session. Pending entries — both incoming (received, awaiting this user's response) and outgoing (sent, awaiting the other's response) — are marked inline as "Pending"; incoming pending entries show accept/decline actions in place of the tap-to-session action.
- **Add contact** — search by phone number or email, send a contact request.
- **Past recordings** — a single flat, reverse-chronological list of recordings across all contacts, shown below the contact list, available for export. Each entry should show at minimum the other party, date, and duration, with an export action.

### 3. Session

The active in-session screen. Content:

- **Presence/status** — the other party's name and whether they are currently present or have left; elapsed session time.
- **Floor mechanic** — indication of who currently holds the floor (if anyone); a claim control, disabled and grayed out while ineligible (either alone in the session, mid-claim by the other party, or within the one-minute same-user cooldown). A **countdown is always visible whenever it's meaningful**: it counts down remaining floor time during an active claim, and counts down remaining cooldown time when the control is grayed out due to the one-minute same-user restriction — visually tied to the claim control itself so its link to eligibility is unambiguous. Because the countdown is visible to both users throughout an active claim, no separate indicator is needed to distinguish an automatic three-minute timeout from an early voluntary release — both are visible as they happen.
- **Self-mute** — a separate, always-available toggle, visually and functionally distinct from the floor claim control.
- **Recording controls** — start (if not yet recording); pause/resume/stop once active, with pause/stop disabled for the currently silenced user; persistent visual indicator (red dot + "Recording" label) while recording is active.
- **Leave** and **End** — two distinct actions. Leave is reversible (re-entry possible while the session persists). End is irreversible and should require a confirmation step before executing, since it affects both parties permanently.

