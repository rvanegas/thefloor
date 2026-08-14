import { donationsVisibleFor, regionOf } from '../src/region';

/**
 * Who may be shown the donate link.
 *
 * Worth testing more heavily than its size suggests: getting this wrong in one
 * direction shows an external payment link to somebody outside the United
 * States storefront, which is the thing App Review Guideline 3.1.1(a) forbids.
 * Getting it wrong the other way costs a donation. The tests are written to
 * hold that asymmetry in place.
 */

describe('regionOf', () => {
  it('reads the region from an ordinary tag', () => {
    expect(regionOf('en-US')).toBe('US');
    expect(regionOf('en-GB')).toBe('GB');
    // Language does not decide it: Spanish spoken in the United States is
    // still the United States, and English in Britain is still Britain.
    expect(regionOf('es-US')).toBe('US');
  });

  it('steps over a script subtag rather than mistaking it for a region', () => {
    expect(regionOf('zh-Hant-TW')).toBe('TW');
    expect(regionOf('sr-Latn-RS')).toBe('RS');
  });

  it('copes with the shapes devices actually send', () => {
    expect(regionOf('en_US')).toBe('US');
    expect(regionOf('en-US-u-ca-gregory')).toBe('US');
    expect(regionOf('en-us')).toBe('US');
  });

  it('has no answer when the tag carries no region', () => {
    expect(regionOf('en')).toBe(null);
    expect(regionOf('')).toBe(null);
    expect(regionOf(undefined)).toBe(null);
  });
});

describe('donationsVisibleFor', () => {
  it('shows the link to somebody plainly in the United States', () => {
    expect(donationsVisibleFor('en-US', 'America/Los_Angeles')).toBe(true);
    expect(donationsVisibleFor('en-US', 'America/New_York')).toBe(true);
    expect(donationsVisibleFor('es-US', 'America/Chicago')).toBe(true);
    // Hawaii and Alaska are not America/ zones and are easy to forget.
    expect(donationsVisibleFor('en-US', 'Pacific/Honolulu')).toBe(true);
    expect(donationsVisibleFor('en-US', 'America/Anchorage')).toBe(true);
  });

  it('includes the territories on the same storefront', () => {
    expect(donationsVisibleFor('es-US', 'America/Puerto_Rico')).toBe(true);
    expect(donationsVisibleFor('en-US', 'Pacific/Guam')).toBe(true);
  });

  it('hides it from everywhere else', () => {
    expect(donationsVisibleFor('en-GB', 'Europe/London')).toBe(false);
    expect(donationsVisibleFor('de-DE', 'Europe/Berlin')).toBe(false);
    expect(donationsVisibleFor('ja-JP', 'Asia/Tokyo')).toBe(false);
    expect(donationsVisibleFor('es-MX', 'America/Mexico_City')).toBe(false);
  });

  it('is not fooled by America/ meaning the continent', () => {
    // The whole reason the zones are a list rather than a prefix test.
    expect(donationsVisibleFor('en-CA', 'America/Toronto')).toBe(false);
    expect(donationsVisibleFor('pt-BR', 'America/Sao_Paulo')).toBe(false);
    expect(donationsVisibleFor('en-US', 'America/Toronto')).toBe(false);
  });

  it('needs both signals to agree', () => {
    // Somebody abroad who has set their phone to US formatting: the timezone
    // is where they actually are, and it is what refuses this.
    expect(donationsVisibleFor('en-US', 'Europe/Madrid')).toBe(false);
    // And a US resident whose language is set to something else still passes,
    // because the region subtag rather than the language is what is read.
    expect(donationsVisibleFor('fr-US', 'America/Denver')).toBe(true);
  });

  it('refuses when it is told nothing, rather than assuming', () => {
    expect(donationsVisibleFor(undefined, undefined)).toBe(false);
    expect(donationsVisibleFor('en-US', undefined)).toBe(false);
    expect(donationsVisibleFor(undefined, 'America/New_York')).toBe(false);
    expect(donationsVisibleFor('', '')).toBe(false);
    // An older build that does not send the hints at all gets no link, which
    // is the safe direction for a rule that cannot be enforced client-side.
    expect(donationsVisibleFor('garbage', 'nonsense')).toBe(false);
  });
});
