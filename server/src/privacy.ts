/**
 * The privacy policy, served by the server it describes.
 *
 * App Store Connect requires a URL for one before an app can be submitted, and
 * there was nowhere to put it. A route here deploys with the code, needs no
 * Caddy site block, no DNS record and no second host, and — more usefully —
 * cannot drift from the software: it is in the same repository as the thing it
 * makes claims about, and a change to what is stored has to walk past it.
 *
 * Written as claims that are true of this codebase rather than as boilerplate.
 * Every paragraph below is checkable against the source, which is the only
 * version of this document worth having.
 */

import { escapeHtml, page, socialCard } from './html';

/**
 * Changed when the substance changes, not when the wording does. It is the date
 * a reader uses to decide whether they have seen this version.
 */
export const PRIVACY_UPDATED = '18 September 2026';

/**
 * How long a deleted channel or recording survives the mark before the sweep
 * removes it. Mirrors DELETED_RETENTION_MS in core/constants.ts — stated in the
 * policy because "deleted" meaning "in a week" is exactly the sort of thing a
 * policy exists to say out loud.
 */
const RETENTION_DAYS = 7;

/**
 * How long a transcript deleted on its own survives the mark. Mirrors
 * TRANSCRIPT_DELETED_RETENTION_MS in core/constants.ts.
 *
 * Restated rather than interpolated, on the same reasoning as
 * USAGE_RETENTION_DAYS below: lengthening a retention must not silently
 * lengthen what this page claims. `privacy.test.ts` reads the constant and
 * fails if the two come apart.
 */
const TRANSCRIPT_RETENTION_DAYS = 30;

/**
 * How long the operational record of minutes and bytes is kept. Mirrors
 * USAGE_RETENTION_MS in core/constants.ts.
 *
 * A separate number from RETENTION_DAYS, and separately stated below, because
 * they expire different things for different reasons. They were the same seven
 * days until 2026-08-19 and are not any more — which is exactly why one
 * constant could not go on serving both: a reader who inferred that the two
 * agreed would now be wrong about a published promise, and the file would have
 * moved the second one by moving the first.
 *
 * Restated here rather than imported from core/, so that lengthening a
 * retention cannot silently lengthen what this page claims — the prose around
 * it has to be re-read by somebody deciding whether the promise still sounds
 * honest at the new number, which is not a thing an interpolation can do. What
 * stops the two drifting is privacy.test.ts, which reads USAGE_RETENTION_MS and
 * fails if the page has not been moved with it.
 */
const USAGE_RETENTION_DAYS = 30;

export interface PolicyOptions {
  contactEmail?: string;
  /** Where this server is reachable, for the link preview. See socialCard. */
  origin?: string;
  /**
   * The name of the transcription provider, when this server has one — and
   * nothing when it does not, which withdraws the whole section below.
   *
   * Conditional because the claim is only true where the credential is. A page
   * that named a processor a server cannot reach would be describing something
   * that cannot happen to the reader, which is a worse failing on this page
   * than on any other: everything else here is written as claims checkable
   * against the source, and this one is checkable against the configuration.
   *
   * It is also the withdrawal switch, on `KOFI_URL`'s pattern: unsetting the
   * key retracts the disclosure in the same restart that turns off the
   * feature, without a deploy.
   *
   * **Do not extend this gate to cover stored transcripts.** It is right for
   * what *leaves* and wrong for what is *kept* — text held here outlives the
   * provider being dropped, and a page that falls silent about it while it is
   * still on people's screens fails worse than the case this gate prevents.
   * TRANSCRIPTS.md § *Order of work*, phase 5, specifies that split.
   */
  transcription?: string;
  /**
   * Whether this server puts new accounts into *getting-started channels*, or
   * still holds any it made — and nothing when neither, which withdraws the
   * whole section below.
   *
   * Conditional on `transcription`'s reasoning: the claim is only true where
   * the feature is, and a page describing something that cannot happen to the
   * reader is a worse failing here than anywhere else. It is the withdrawal
   * switch too — emptying `COHORT_HOST_IDENTIFIERS` retracts the disclosure in
   * the same restart that stops the placements, with no deploy.
   *
   * **Two conditions rather than one, and the second is the one that matters.**
   * Switching the hosts off does not delete the cohorts people are already in.
   * Gating on the setting alone would take the description off the page while
   * the channels were still on their screens, which is the transcripts trap
   * exactly — see the comment on `transcriptionSending` for the same mistake
   * avoided in the other direction.
   */
  cohorts?: boolean;
}

export function privacyPage(options: PolicyOptions = {}): string {
  const { contactEmail, transcription, cohorts } = options;
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : 'the support address on the app’s App Store listing';
  const provider = transcription ? escapeHtml(transcription) : null;

  // Two claims with different conditions, split when the feature reached the
  // app. The *sending* is gated on a provider being configured: it is only
  // true where the credential is, and unsetting the key has to retract the
  // sentence in the same restart that withdraws the feature — the `KOFI_URL`
  // property, deliberately.
  //
  // The *storage* is not gated, and that is the half that would go quietly
  // wrong. Text kept here outlives the provider being dropped, so a page that
  // fell silent about transcripts still on people's screens would fail worse
  // than the case the gate was built to prevent.
  //
  // **Nothing is claimed about what the provider does with its copy.** The
  // server does ask it to delete — `Transcripts.forget` — but what that
  // achieves at their end is not established, and a page written as checkable
  // claims may only describe what this server does. It said "removed within
  // about 30 days" for a few hours on no source at all, which is the reason
  // the rule is written down rather than assumed. See BACKLOG.md § *What
  // AssemblyAI does with the audio after we ask it to delete it*.
  const transcriptionSending = provider
    ? `
<p>The audio is sent to ${provider}, in the United States, which returns the
words in it and nothing else. It is sent the recording as you would hear it: the
parts a silenced person spoke while they did not hold the floor are removed
before anything leaves, exactly as they are removed from what the recording
plays. ${provider} is not asked to tell voices apart between people — The Floor
already knows whose microphone each part came from — and is told nothing about
who is speaking, what the channel is, or who is in it.</p>

`
    : '';

  /*
    The one place this application introduces somebody to people they have not
    met, and so the one claim on this page that the opening sentence does not
    already cover.

    **Written as the exception it is, and as a temporary one.** The Floor is
    for talking with people you already know; that is what it is for and it is
    what the listing, the manual and both invitation emails say. This is
    scaffolding for a young application that cannot demonstrate itself to
    somebody who arrives alone, and it goes when it is no longer needed. Saying
    so is not a flourish — a reader who is told what a thing is *for* can
    judge whether what it does matches, and "we will stop" is a checkable claim
    about intent in a way that a permanent qualification of the opening
    sentence would not be.

    What it must be honest about is the shape of the exposure, which is small
    and worth stating precisely: a display name, to four people, in one
    channel, once. Not the address, not the handles, and no contact — which is
    the thing somebody would reasonably assume and the thing this does not do.
  */
  const cohortSection = cohorts
    ? `
<h2>Getting started</h2>
<p>The Floor is no use to somebody who arrives with nobody here, so a new
account that signs up without an invitation is put into one channel — <em>Getting
Started</em> — with up to three other people who joined around the same time,
and one of the people who run The Floor. It happens once
and it never happens again. Somebody who arrives on an invitation from people
who are already here is not put in one.</p>
<p><strong>It happens when you turn notifications on, and not before.</strong>
The whole of what that channel offers is that somebody may speak into it later,
which is no use to a phone that cannot be told it happened — so the place is
held until there is somewhere to reach you. If you never turn them on you are
never put in one, and nothing else about your account changes.</p>
<p>The people in that channel see your display name, which is what anybody in
a channel with you sees. They are not shown your email address, they are not
shown any handle on your profile, and <strong>none of them become your
contacts</strong> — being in a channel together is not a contact here, and who
your contacts are stays entirely something you choose. Nobody can find you this
way: there is no directory, no search for people, and no suggestion of anyone
to anybody.</p>
<p>You can leave that channel whenever you like, from its settings screen, and
it disappears from your home screen for good. It stays where it is for everyone
else.</p>
<p>This is something The Floor does while it is new, to give people something
to try. It will stop, and when it does this section goes with it.</p>

`
    : '';

  const transcriptionSection = `
<h2>Transcripts</h2>
<p>A recording can be turned into text. It never happens on its own: somebody in
the channel asks for it, once per recording, and their name is shown beside the
result — because asking sends everybody\u2019s audio, not just theirs.</p>
${transcriptionSending}
<p>A transcript is kept here, with the recording it came from, is visible to
exactly the people who can play that recording, and is deleted when the
recording is —
immediately for everyone, and about ${RETENTION_DAYS} days later underneath,
like everything else.</p>

<p>A transcript can also be deleted on its own, leaving the recording. That
works the same way: it disappears for everyone at once, and the text is removed
about ${TRANSCRIPT_RETENTION_DAYS} days later. Longer than the week a deleted
recording gets, and for a reason worth saying: deleting a recording by mistake
is obvious, because the conversation goes from everybody's list, while deleting
a transcript by mistake leaves everything else exactly where it was and can go
unnoticed for far longer.</p>
`;

  return page({
    title: 'Privacy — The Floor',
    heading: 'Privacy',
    social: socialCard(options.origin, {
      title: 'Privacy — The Floor',
      description:
        'What The Floor stores, why, and for how long. It is short because ' +
        'the application collects little.',
      path: '/privacy',
    }),
    standfirst: `The Floor · last updated ${PRIVACY_UPDATED}`,
    body: `
<p>The Floor is for talking with people you already know. This
page says what it stores, why, and for how long. It is short because the
application collects little.</p>

<h2>What is stored</h2>
<ul>
  <li><strong>Your email address.</strong> It is how you sign in — a six-digit
  code is sent to it — and it is how somebody who knows your address can send
  you a contact request. It is shown to nobody unless you choose to show it,
  which you can do only for a contact, one person at a time, from their profile.
  You can stop showing it at any time; that removes it from their screen, and it
  cannot recover a copy they have already written down. You can change it from
  your own profile: a code is sent to the new address, and nothing changes
  until that code comes back, so the address this account signs in with is
  always one somebody has proved they can read.</li>
  <li><strong>Your display name.</strong> It is shown to people you share a
  channel or a contact relationship with.</li>
  <li><strong>A WhatsApp, Telegram or Signal handle, if you put one on your
  profile.</strong> Two of those are phone numbers. Nothing here asks your
  phone for them and nothing is sent through them — they are stored because
  you typed them, and they are shown to your contacts, who can tap one to open
  the conversation in that app. They are shown to nobody else, not even to
  somebody you share a channel with. Clearing the field removes it.</li>
  <li><strong>Audio you record.</strong> Recording is deliberate: somebody in
  the channel starts it, and everybody in the channel can see that it is
  running. Recordings are stored in Amazon S3, in the United States. Everyone
  in the channel the recording was made in can play it, rename it, share it and
  delete it.
  <br><br>
  A recording can also be <strong>published</strong>, which is the one thing
  that puts it in front of people who were never in the channel: it then has a
  page on this site that anybody holding the address can listen to, and a feed
  a podcast app can subscribe to. That never happens without you. It requires
  that everybody who was in that recording has separately agreed to publish it
  — one refusal is enough to stop it, and taking your agreement back at any
  time removes it from the page and the feed. What taking it back cannot do is
  reach a copy somebody has already downloaded, and nothing here ever will.
  Somebody who joined as a guest has no account to agree with, so a recording
  a guest spoke in cannot be published at all. A published page names the
  channel and whatever its members wrote about it, and never names a
  member.</li>
  <li><strong>Your channels and who is in them</strong>, so that a conversation
  survives the app being closed.</li>
  <li><strong>A notification token</strong>, if you allow notifications, so the
  server can ask your device’s notification service to show you one. It
  identifies an installation, not a person, and it is discarded when you sign
  out or when that service reports it as dead.</li>
  <li><strong>Whether you have allowed notifications</strong> — allowed,
  refused, or not yet asked — and when that last changed. One word, kept
  because this application is people reaching each other and an app that
  cannot reach you barely works; knowing how often that is the case is the
  only way to tell a product that is being ignored from one that is being
  silenced. It is never shown to another user, and nothing in the application
  behaves differently because of it.</li>
  <li><strong>When you were last connected</strong>, shown to your contacts so
  they can tell whether it is a reasonable moment to talk.</li>
  <li><strong>Questions you ask from the Help screen</strong>, and the answers
  written back to them. They are read by a person in order to answer them, and
  they are shown to nobody else. Deleting your account deletes them, question
  and answer alike.</li>
  <li><strong>How much the server carried for you</strong>: how many minutes
  your microphone was open, how many you spent listening, playing something or
  recording, how many you shared a channel with each other person, and how many
  bytes of recordings were downloaded. It is kept for ${USAGE_RETENTION_DAYS}
  days and then deleted, so there is no long-run history of anybody. It exists
  to size and pay for the server, it is never shown to another user, and nothing
  in the application behaves differently because of it.</li>
  <li><strong>That somebody asked you to come to a channel, and whether you
  came.</strong> When one person pings another, the server keeps who asked,
  who was asked, which channel, when, and whether there were words with it —
  <em>never the words themselves</em>. It is kept for ${USAGE_RETENTION_DAYS}
  days and then deleted, alongside the line above and for the same reason:
  asking somebody to come is the thing this application is for, and whether it
  works is the one thing worth knowing about it. It is never shown to another
  user, and it changes nothing about what anybody sees.</li>
</ul>

<h2>Live audio is not recorded</h2>
<p>Ordinary conversation passes through the server as it happens and is not
written anywhere. Only a recording somebody deliberately started is stored.</p>

${transcriptionSection}
<h2>What is not collected</h2>
<p>There is no advertising, no third-party analytics${
      provider
        ? `, and no service anywhere that receives your activity — ${provider}, above, is sent audio you asked to have transcribed and nothing else: not who you talked to, not when you were connected, not what you did in the application`
        : ', and no service anywhere\nthat receives your activity'
    }. Nothing about you is sold or shared for anyone
else’s purposes, and nothing is used to profile you or to decide what you are
shown. Your address book is never read — the contacts in The Floor are people
who have accepted a request inside it.</p>

<p>What is measured is the three things listed above, all of them counted by
this server and sent nowhere: how much of its time and bandwidth went on each
account, whether you have allowed notifications, and whether a ping brought
somebody. The first and the last are kept for ${USAGE_RETENTION_DAYS} days and
then deleted. All of it records durations, sizes and outcomes, never content —
not what was said, not what was played, not the words written with a ping, not
what any recording contains. There is no record of which screens you opened or
how long you spent looking at anything.</p>

<p>There is one more thing counted, and it is the only measurement here that
is attached to nobody at all. There are two ways to leave a conversation — the
house at the top of the screen, and swiping it away to the right — and two ways
back into the one you are in: the line pinned at the top of your home screen,
and swiping in from the left. This server keeps a running tally of how many
times each of those four was used in a day, and that is the whole of it: no
account, no time of day, no order, nothing that could be taken apart afterwards
into what any one person did. It is kept so that we can tell which of two ways
of doing the same thing people actually use, and stop building the one nobody
reaches for. It is never shown to another user, it goes nowhere, and nothing in
the application behaves differently because of it.</p>

<h2>Deleting things</h2>
<p>Deleting a recording or a channel marks it immediately: it disappears for
everyone at once and can no longer be played or shared. The underlying data
is removed about ${RETENTION_DAYS} days later, so that a deletion made by
mistake can be recovered by asking.</p>

<p><strong>Your account is deleted under Settings</strong>, in the app or
<a href="/delete-account">in a browser</a> — you do not need anything
installed — and it happens immediately. Your address, your name, your contacts
and every sign-in are removed. You are taken out
of every channel you were in: channels you shared with other people carry on
without you, since they are those people’s conversations too, and channels you
were the last member of are deleted with everything recorded in them. Recordings
made in a channel that other people are still in stay with that channel, along
with the name you had when each one was made — they are other people’s copies of
a conversation they were in, and they are not ours to take away. Nothing that
remains identifies you or can be signed in to.</p>

<h2>Donations</h2>
<p>Donating is entirely optional and unlocks nothing — the application behaves
identically whether you give or not. Donations are handled by Ko-fi, on their
own site, under their own privacy policy; The Floor never sees your card. Ko-fi
tells this server the email address, name and amount of each donation, which is
recorded so that a donation can be attributed to your account. If you pay with a
different address than you signed in with, the donation is simply not connected
to you. Deleting your account disconnects any donation from it; the record of
the payment itself stays, with Ko-fi and here, because it is money that changed
hands rather than something about you.</p>

${cohortSection}<h2>Who else can see any of it</h2>
<p>Amazon Web Services stores the recordings and sends the sign-in emails. Apple
and Google deliver notifications, each to their own phones. Ko-fi handles
donations.${
      provider ? ` ${provider} transcribes a recording when somebody asks it to.` : ''
    } None of them are given
anything beyond what their job requires${
      provider
        ? `, none of them but ${provider} receive your conversations, and that
one receives only the recording it was asked to transcribe`
        : ', and none of them receive your\nconversations'
    } — the recording storage key used by the media server can only add
files, not read them back.</p>

<h2>Security</h2>
<p>All traffic is encrypted in transit. Sign-in codes and session tokens are
stored only as hashes, so a copy of the database does not let anybody sign in as
you. Live audio is carried over WebRTC, which is encrypted end to end in
transit.</p>

<h2>Children</h2>
<p>The Floor is not directed at children and is not intended for use by anyone
under 13.</p>

<h2>Changes</h2>
<p>If what is stored changes, this page changes with it, and the date at the top
changes too.</p>

<h2>Getting in touch</h2>
<p>Questions, or anything deleting your account in Settings did not settle:
${contact}. There is a <a href="/support">support page</a> too.</p>
`,
  });
}
