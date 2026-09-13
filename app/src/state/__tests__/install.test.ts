import { installOffer, type Browser } from '../install';

/**
 * Which browsers are told they can install this, and what each is told to do.
 *
 * The cases worth guarding are the two silences. A rung offered to a browser
 * that cannot install anything is the one thing a checklist must never
 * contain — an item nobody can tick — and it is exactly what a generic *use
 * your browser's menu* produces on desktop Firefox and inside somebody else's
 * in-app browser.
 */

const browser: Browser = {
  standalone: false,
  apple: false,
  prompt: false,
  menu: true,
  embedded: false,
};

describe('when there is nothing to offer', () => {
  it('says nothing to a page already running as an installed app', () => {
    expect(installOffer({ ...browser, standalone: true }).offer).toBe(false);
  });

  it('says nothing inside somebody else`s in-app browser, which has no such menu', () => {
    expect(installOffer({ ...browser, embedded: true }).offer).toBe(false);
  });

  it('says nothing to a browser with no install command at all', () => {
    // Desktop Firefox. An instruction to go and find a menu item that does not
    // exist is worse than silence.
    expect(installOffer({ ...browser, menu: false }).offer).toBe(false);
  });

  it('prefers silence even when the browser is in two minds', () => {
    // Standalone wins over a stale prompt: the deed is done.
    expect(
      installOffer({ ...browser, standalone: true, prompt: true }).offer
    ).toBe(false);
  });
});

describe('what each browser is told', () => {
  it('offers a button of our own where one was volunteered', () => {
    const offer = installOffer({ ...browser, prompt: true });
    if (!offer.offer) throw new Error('expected an offer');
    expect(offer.prompt).toBe(true);
  });

  it('names Safari`s share sheet on iOS, where nothing can be volunteered', () => {
    const offer = installOffer({ ...browser, apple: true, menu: false });
    if (!offer.offer) throw new Error('expected an offer');
    expect(offer.prompt).toBe(false);
    expect(offer.how).toMatch(/Share/);
    expect(offer.how).toMatch(/Home Screen/);
  });

  it('falls back to the browser`s own menu, saying so without a button', () => {
    const offer = installOffer(browser);
    if (!offer.offer) throw new Error('expected an offer');
    expect(offer.prompt).toBe(false);
    expect(offer.how).toMatch(/menu/);
  });

  it('takes the prompt over the share sheet when a browser has both', () => {
    // An iPad reporting Chromium: the button is the shorter road.
    const offer = installOffer({ ...browser, apple: true, prompt: true });
    if (!offer.offer) throw new Error('expected an offer');
    expect(offer.prompt).toBe(true);
  });
});
