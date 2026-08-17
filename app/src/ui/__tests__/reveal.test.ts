import { offsetToReveal } from '../reveal';

/**
 * The arithmetic behind bringing an expanded card into view. Kept apart from
 * the view because the two bugs it fixes were both arithmetic — the wrong unit
 * (the field rather than the card) and the wrong direction (none at all when
 * the card grew below the fold).
 */

const viewport = { offset: 0, height: 600 };

it('does nothing when the card is already wholly visible', () => {
  expect(offsetToReveal({ top: 100, height: 200 }, viewport)).toBeNull();
});

it('scrolls the least that brings the bottom edge in', () => {
  // Bottom at 750, plus 12 of air, against a viewport ending at 600.
  expect(offsetToReveal({ top: 500, height: 250 }, viewport)).toBe(162);
});

it('brings an over-tall card up from below rather than leaving it off screen', () => {
  // Exactly as tall as the viewport, so its bottom can never be brought in.
  // Returning null here left it entirely below the fold, which was the bug
  // this rule was written to avoid in the first place.
  expect(offsetToReveal({ top: 900, height: 600 }, viewport)).toBe(900);
});

it('shows a card taller than the screen from its top', () => {
  expect(offsetToReveal({ top: 400, height: 900 }, { offset: 800, height: 600 }))
    .toBe(400);
});

it('leaves an over-tall card alone once its top is in view', () => {
  expect(
    offsetToReveal({ top: 400, height: 900 }, { offset: 300, height: 600 })
  ).toBeNull();
});

it('scrolls back up for a card above the viewport', () => {
  expect(
    offsetToReveal({ top: 100, height: 200 }, { offset: 400, height: 600 })
  ).toBe(100);
});

/**
 * The keyboard case, which is the one that started this: the viewport is
 * shorter because `Screen` gives the scroll view a real bottom to scroll to,
 * and the card has grown a field and a Save button.
 */
it('accounts for the viewport the keyboard leaves behind', () => {
  const card = { top: 500, height: 260 };
  expect(offsetToReveal(card, { offset: 200, height: 600 })).toBeNull();
  // Same card, same offset, keyboard up: 300 tall instead of 600.
  expect(offsetToReveal(card, { offset: 200, height: 300 })).toBe(472);
});
