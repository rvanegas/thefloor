import { isSafeUrl } from '../links';

/*
  What is left of markdown.test.ts, which went with the parser on 2026-09-13
  when the notepad became plain text. The allowlist stayed because the
  clipboard still offers to open what is on it, and that is the assertion
  that was never about markup: a link on the clipboard is untrusted text one
  member of a channel put there for the others to tap.
*/
describe('isSafeUrl', () => {
  it('refuses a scheme that is not http, https or mailto', () => {
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>',
      'tel:+15550000000',
    ]) {
      expect([url, isSafeUrl(url)]).toEqual([url, false]);
    }
  });

  it('accepts the schemes somebody legitimately pastes', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('mailto:someone@example.com')).toBe(true);
  });

  it('refuses a bare domain rather than guessing a scheme', () => {
    expect(isSafeUrl('example.com')).toBe(false);
  });

  it('refuses text that is not a URL at all', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('see you at six')).toBe(false);
  });
});
