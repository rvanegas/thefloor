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

/**
 * Changed when the substance changes, not when the wording does. It is the date
 * a reader uses to decide whether they have seen this version.
 */
export const PRIVACY_UPDATED = '14 August 2026';

/**
 * How long a deleted channel or recording survives the mark before the sweep
 * removes it. Mirrors DELETED_RETENTION_MS in core/constants.ts — stated in the
 * policy because "deleted" meaning "in a week" is exactly the sort of thing a
 * policy exists to say out loud.
 */
const RETENTION_DAYS = 7;

export function privacyPage(contactEmail?: string): string {
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : 'the support address on the app’s App Store listing';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy — The Floor</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 38rem; margin: 0 auto; padding: 2rem 1.25rem 4rem;
  }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .updated { color: #6b7280; margin-top: 0; }
  ul { padding-left: 1.25rem; }
  li { margin: 0.4rem 0; }
</style>
</head>
<body>

<h1>Privacy</h1>
<p class="updated">The Floor · last updated ${PRIVACY_UPDATED}</p>

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
</ul>

<h2>Live audio is not recorded</h2>
<p>Ordinary conversation passes through the server as it happens and is not
written anywhere. Only a recording somebody deliberately started is stored.</p>

<h2>What is not collected</h2>
<p>There is no analytics, no advertising, no tracking of any kind, and no
third-party service that receives your activity. Nothing about you is sold or
shared for anyone else’s purposes. Your address book is never read — the
contacts in The Floor are people who have accepted a request inside it.</p>

<h2>Deleting things</h2>
<p>Deleting a recording or a channel marks it immediately: it disappears for
everyone at once and can no longer be played or exported. The underlying data
is removed about ${RETENTION_DAYS} days later, so that a deletion made by
mistake can be recovered by asking. To delete your account and everything in it,
write to ${contact}.</p>

<h2>Donations</h2>
<p>Donating is entirely optional and unlocks nothing — the application behaves
identically whether you give or not. Donations are handled by Ko-fi, on their
own site, under their own privacy policy; The Floor never sees your card. Ko-fi
tells this server the email address, name and amount of each donation, which is
recorded so that a donation can be attributed to your account. If you pay with a
different address than you signed in with, the donation is simply not connected
to you.</p>

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
<p>Questions, or a request to delete your account: ${contact}.</p>

</body>
</html>
`;
}

/**
 * Escapes the one value interpolated into the page above.
 *
 * It comes from this server's own configuration rather than from a user, so
 * this is belt-and-braces — but a contact address is exactly the kind of value
 * that gets moved to a database field later, and the escaping should already be
 * there when it does.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
