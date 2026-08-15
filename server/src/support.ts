/**
 * The support page, served by the server it is about.
 *
 * App Store Connect requires a Support URL before an app can be submitted, and
 * it has to be a page a person can open — a `mailto:` is not a URL that field
 * accepts, and the App Store shows the link to anybody looking at the listing.
 * The same argument the privacy policy makes for living here applies: a page in
 * this repository cannot claim something the code stopped doing without
 * somebody walking past it.
 *
 * It is written for the person who has a question rather than for the reviewer
 * who has a checklist, which is the only way to write one that is any use. What
 * it must contain is a way to reach a human; everything else earns its place by
 * answering something people actually ask.
 *
 * Note that `/support` is deliberately this and not the app's donation route,
 * which lives at `/donations` — the human-facing name went to the human-facing
 * page.
 */

import { escapeHtml, page } from './html';

export function supportPage(contactEmail?: string): string {
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : 'the support address on the app’s App Store listing';

  return page({
    title: 'Support — The Floor',
    heading: 'Support',
    standfirst: 'The Floor · getting help, and how the app works',
    body: `
<p>The Floor is a small application for talking with people you know: one
person speaks at a time, by taking the floor, and a conversation lives in a
channel that stays there between calls.</p>

<h2>Getting in touch</h2>
<p><strong>Write to ${contact}.</strong> It is read by a person. There is no
support queue, no ticket number and no bot — say what happened and what you
expected, and if it is about a particular conversation, roughly when it was.</p>

<h2>Signing in</h2>
<p>There is no password. You give an email address, a six-digit code is sent to
it, and typing the code signs you in. If the code does not arrive, check the
spam folder first; codes expire after ten minutes, and asking for another is
free. Signing in on a second device signs you out on the first.</p>

<h2>Finding people</h2>
<p>Nobody can reach you unless you have both agreed. You send a contact request
to somebody’s email address — or to somebody you have met in a channel — and
nothing happens until they accept. There is no directory, no search for
strangers, and no way to be added to anything without saying yes.</p>

<h2>Recordings</h2>
<p>A recording only ever happens because somebody in the channel started one,
and everybody in the channel can see it while it is running. Ordinary
conversation is not recorded. Anyone in a channel can play, rename, export or
delete any recording made in it — including one somebody else started.</p>

<h2>Notifications</h2>
<p>You are told when somebody asks you into a conversation. If they stop
arriving, check that notifications are allowed for The Floor in the iOS
Settings app; the app asks once, and iOS remembers a refusal.</p>

<h2>Deleting your account</h2>
<p>In the app, under Settings, at the bottom of the Account section. It takes
effect immediately: your address, your name, what you wrote about yourself and
your contacts are removed. Channels you share with other people carry on
without you, and the recordings made in them stay with the channel — they are
other people’s copies of a conversation they were in. Channels you were the
only member of are deleted with everything in them.</p>

<h2>Donating</h2>
<p>Entirely optional, and it unlocks nothing — the application behaves
identically whether you give or not. It is a link out to Ko-fi, handled on their
site under their own terms.</p>

<h2>Privacy</h2>
<p>What is stored, why, and for how long is on the <a href="/privacy">privacy
page</a>.</p>
`,
  });
}
