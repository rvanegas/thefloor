import { isConversing } from '../conversing';

/**
 * What counts as a conversation, which decides when the introduction's *step
 * in with somebody* rung ticks and when notifications are asked for.
 *
 * The case worth guarding is the guest: it was not counted until 2026-09-13,
 * so somebody could hold a whole conversation through a guest link and be
 * told by the checklist that nobody had heard them — see
 * `decisions/2026-09-13-a-rung-says-what-ticks-it.md`.
 */

const ME = 'acct_me';

it('is false in a channel you are not in', () => {
  expect(isConversing({ present: ['acct_them'] }, ME)).toBe(false);
  // Not even with a room full of guests: the question is whether somebody can
  // hear *you*, and nobody can hear a room you are not in.
  expect(
    isConversing({ present: ['acct_them'], guests: { g1: {} } }, ME)
  ).toBe(false);
});

it('is false standing in a channel alone', () => {
  expect(isConversing({ present: [ME] }, ME)).toBe(false);
  expect(isConversing({ present: [ME], guests: {} }, ME)).toBe(false);
});

it('is true with another member present', () => {
  expect(isConversing({ present: [ME, 'acct_them'] }, ME)).toBe(true);
});

it('is true with a guest and no other member', () => {
  // The report this was written for. Membership of `guests` means present,
  // so one key is one person in the room.
  expect(isConversing({ present: [ME], guests: { g1: {} } }, ME)).toBe(true);
});

it('treats a missing guests field as no guests, not as a crash', () => {
  // Optional on the wire — an older server sends none at all.
  expect(isConversing({ present: [ME] }, ME)).toBe(false);
});
