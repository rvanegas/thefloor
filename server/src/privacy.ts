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

import { escapeHtml, page } from './html';

/**
 * Changed when the substance changes, not when the wording does. It is the date
 * a reader uses to decide whether they have seen this version.
 */
export const PRIVACY_UPDATED = '19 August 2026';

/**
 * How long a deleted channel or recording survives the mark before the sweep
 * removes it. Mirrors DELETED_RETENTION_MS in core/constants.ts — stated in the
 * policy because "deleted" meaning "in a week" is exactly the sort of thing a
 * policy exists to say out loud.
 */
const RETENTION_DAYS = 7;

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

export function privacyPage(contactEmail?: string): string {
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : 'the support address on the app’s App Store listing';

  return page({
    title: 'Privacy — The Floor',
    heading: 'Privacy',
    standfirst: `The Floor · last updated ${PRIVACY_UPDATED}`,
    body: `
<p>The Floor is a small application for talking with people you know. This
page says what it stores, why, and for how long. It is short because the
application collects little.</p>

<h2>What is stored</h2>
<ul>
  <li><strong>Your email address.</strong> It is how you sign in — a six-digit
  code is sent to it — and it is how somebody who knows your address can send
  you a contact request. It is not shown to anyone who is not already your
  contact.</li>
  <li><strong>Your display name, and a description of yourself if you write
  one.</strong> Both are shown to people you share a channel or a contact
  relationship with.</li>
  <li><strong>Audio you record.</strong> Recording is deliberate: somebody in
  the channel starts it, and everybody in the channel can see that it is
  running. Recordings are stored in Amazon S3, in the United States. Everyone
  in the channel the recording was made in can play it, rename it, export it and
  delete it.</li>
  <li><strong>Your channels and who is in them</strong>, so that a conversation
  survives the app being closed.</li>
  <li><strong>A notification token</strong>, if you allow notifications, so the
  server can ask Apple to show you one. It identifies an installation, not a
  person, and it is discarded when you sign out or when Apple reports it as
  dead.</li>
  <li><strong>When you were last connected</strong>, shown to your contacts so
  they can tell whether it is a reasonable moment to talk.</li>
  <li><strong>How much the server carried for you</strong>: how many minutes
  your microphone was open, how many you spent listening, playing something or
  recording, how many you shared a channel with each other person, and how many
  bytes of recordings were downloaded. It is kept for ${USAGE_RETENTION_DAYS}
  days and then deleted, so there is no long-run history of anybody. It exists
  to size and pay for the server, it is never shown to another user, and nothing
  in the application behaves differently because of it.</li>
</ul>

<h2>Live audio is not recorded</h2>
<p>Ordinary conversation passes through the server as it happens and is not
written anywhere. Only a recording somebody deliberately started is stored.</p>

<h2>What is not collected</h2>
<p>There is no advertising, no third-party analytics, and no service anywhere
that receives your activity. Nothing about you is sold or shared for anyone
else’s purposes, and nothing is used to profile you or to decide what you are
shown. Your address book is never read — the contacts in The Floor are people
who have accepted a request inside it.</p>

<p>What is measured is the one thing above: how much of this server’s time and
bandwidth went on each account, kept for ${USAGE_RETENTION_DAYS} days. It records
durations and sizes, never content — not what was said, not what was played,
not what any recording contains. There is no record of which screens you
opened, what you tapped, or how long you spent looking at anything.</p>

<h2>Deleting things</h2>
<p>Deleting a recording or a channel marks it immediately: it disappears for
everyone at once and can no longer be played or exported. The underlying data
is removed about ${RETENTION_DAYS} days later, so that a deletion made by
mistake can be recovered by asking.</p>

<p><strong>Your account is deleted from inside the application</strong>, under
Settings, and it happens immediately. Your address, your name, what you wrote
about yourself, your contacts and every sign-in are removed. You are taken out
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

<h2>Who else can see any of it</h2>
<p>Amazon Web Services stores the recordings and sends the sign-in emails. Apple
delivers notifications. Ko-fi handles donations. None of them are given
anything beyond what their job requires, and none of them receive your
conversations — the recording storage key used by the media server can only add
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
