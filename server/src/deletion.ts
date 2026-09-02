/**
 * How to delete your account, as a page somebody can open without installing
 * anything.
 *
 * The third document this server serves, and the first one that is not Apple's
 * doing. **Google Play requires a URL where a user can request deletion of
 * their account and data without the app**, given in the Data safety form,
 * which has to be completed before a release to any track — internal and closed
 * testing included, not only production. So this is on the path to handing the
 * app to the first Android tester rather than to a public listing.
 *
 * **It documents a route that already exists rather than adding one, and that
 * is the whole design.** Deleting an account is `DELETE /me`, authenticated,
 * reached from Settings — and the web app at `/app` is the same application, so
 * a browser can already do it end to end: sign in with an address and a mailed
 * code, open Settings, delete. Nothing was missing except a page saying so at
 * an address that can be written into a form.
 *
 * The alternative was a signed-out deletion endpoint keyed on an email address,
 * and it was rejected. It would be **a second way to destroy an account**, with
 * its own proof-of-address handling, sitting on the most destructive operation
 * this server has — where the existing path is the ordinary sign-in everything
 * else is already trusted to. A requirement to publish a URL is not a
 * requirement to build a new trust surface, and reading it as one is how a
 * compliance item becomes an incident.
 *
 * What is *not* restated here is what deletion removes. `privacy.ts` says it,
 * at length and with the retention figures, and a second copy is a second thing
 * to keep true — the one drift this page can afford is none. It links there.
 */

import { escapeHtml, page } from './html';

export interface DeletionOptions {
  /**
   * Where somebody who cannot sign in should write. Optional on the same terms
   * as the privacy page's: absent, the page names the store listing instead,
   * which is always reachable even when this server's configuration is not.
   */
  contactEmail?: string;
}

export function deletionPage(options: DeletionOptions = {}): string {
  const { contactEmail } = options;
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : 'the support address on the app’s store listing';

  return page({
    title: 'Deleting your account — The Floor',
    heading: 'Deleting your account',
    standfirst: 'How to delete The Floor account for an address, and what it takes with it.',
    body: `
<p>You can delete your account yourself, at any time, and you do not need to
have the app installed to do it. It happens immediately and nobody has to
approve it.</p>

<h2>In a browser</h2>
<p>Open <a href="/app">The Floor in a browser</a> and sign in with the address
your account uses — you will be sent a six-digit code, which is the only way
this application signs anybody in. Then open <strong>Settings</strong> and
choose <strong>Delete account</strong>.</p>
<p>This is the whole path. There is nothing to install, and it works on a
phone, a tablet or a computer.</p>

<h2>In the app</h2>
<p>Exactly the same: <strong>Settings</strong>, then
<strong>Delete account</strong>.</p>

<h2>What is deleted</h2>
<p>Your address, your name, your contacts and every sign-in are removed, and you
are taken out of every channel you were in. Channels you shared with other
people carry on without you, because they are those people’s conversations too;
channels you were the last member of are deleted with everything recorded in
them.</p>
<p><a href="/privacy">The privacy policy</a> says the rest — what is kept, what
that means for recordings other people were part of, and how long the
underlying data survives the deletion before it is removed. It is the
authoritative account and this page deliberately does not repeat it.</p>

<h2>If you cannot sign in</h2>
<p>Deleting an account needs proof that it is yours, and a mailed code is the
only proof this application accepts. If you no longer have access to the address
you signed up with, write to ${contact} from whatever address you do have, say
which address the account uses, and it can be dealt with by hand.</p>
`,
  });
}
