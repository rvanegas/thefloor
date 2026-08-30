import {
  IM_SERVICES,
  imLink,
  normaliseImHandle,
  type ImService,
} from '../im';

/**
 * Two questions, and the interesting one is the first. Normalisation is what
 * decides whether somebody's handle survives being typed the way they write it
 * down — with the spaces on the card, with the `@` everyone puts on a Telegram
 * name, as the link they pasted out of the other app — and a rule that only
 * accepted the canonical form would be a field most people fail.
 */
describe('reading a handle the way it is written', () => {
  it('takes a phone number however it is spaced or punctuated', () => {
    for (const written of [
      '+1 555 123 4567',
      '+1 (555) 123-4567',
      '+15551234567',
      ' +1-555-123-4567 ',
    ]) {
      expect(normaliseImHandle('whatsapp', written)).toBe('+15551234567');
    }
  });

  it('stores a number in international form whether or not the plus was typed', () => {
    // What it cannot do is *supply* a country code, which is why the field
    // says to include one — see `IM_SERVICE_HINTS`.
    expect(normaliseImHandle('signal', '15551234567')).toBe('+15551234567');
  });

  it('refuses a number too short to be one', () => {
    expect(normaliseImHandle('whatsapp', '5551234')).toBeNull();
    expect(normaliseImHandle('signal', '+44')).toBeNull();
  });

  it('refuses a number longer than any number is', () => {
    expect(normaliseImHandle('whatsapp', '+1234567890123456')).toBeNull();
  });

  it('takes a Telegram username with or without its at', () => {
    expect(normaliseImHandle('telegram', '@alice_smith')).toBe('alice_smith');
    expect(normaliseImHandle('telegram', ' alice_smith ')).toBe('alice_smith');
  });

  it('takes a pasted link as the handle it names', () => {
    for (const link of [
      'https://t.me/alice_smith',
      'http://t.me/alice_smith',
      't.me/alice_smith',
      'https://telegram.me/alice_smith?start=1',
    ]) {
      expect(normaliseImHandle('telegram', link)).toBe('alice_smith');
    }
  });

  it('refuses a Telegram username that Telegram would not have issued', () => {
    expect(normaliseImHandle('telegram', 'abc')).toBeNull();
    expect(normaliseImHandle('telegram', '1alice')).toBeNull();
    expect(normaliseImHandle('telegram', 'alice smith')).toBeNull();
    expect(normaliseImHandle('telegram', 'alice.smith')).toBeNull();
  });

  it('reads an empty field as no handle rather than as a bad one', () => {
    for (const service of IM_SERVICES) {
      expect(normaliseImHandle(service, '   ')).toBeNull();
    }
  });

  it('is settled: normalising twice changes nothing', () => {
    const written: Record<ImService, string> = {
      whatsapp: '+1 (555) 123-4567',
      telegram: '@alice_smith',
      signal: '+1 555 123 4567',
    };
    for (const service of IM_SERVICES) {
      const once = normaliseImHandle(service, written[service])!;
      expect(normaliseImHandle(service, once)).toBe(once);
    }
  });
});

describe('the link a handle opens', () => {
  it('addresses each service the way that service publishes', () => {
    // `wa.me` wants the digits alone; `signal.me` wants the plus. That is a
    // property of the two URLs rather than of the number, which is why both
    // are stored the same way.
    expect(imLink('whatsapp', '+15551234567')).toBe('https://wa.me/15551234567');
    expect(imLink('signal', '+15551234567')).toBe(
      'https://signal.me/#p/+15551234567'
    );
    expect(imLink('telegram', 'alice_smith')).toBe('https://t.me/alice_smith');
  });

  it('is https, so a phone without the app gets a page rather than nothing', () => {
    for (const service of IM_SERVICES) {
      const handle = service === 'telegram' ? 'alice_smith' : '+15551234567';
      expect(imLink(service, handle)!.startsWith('https://')).toBe(true);
    }
  });

  it('builds the same link from what somebody typed as from what is stored', () => {
    expect(imLink('whatsapp', '+1 (555) 123-4567')).toBe(
      imLink('whatsapp', '+15551234567')
    );
    expect(imLink('telegram', '@alice_smith')).toBe(
      imLink('telegram', 'alice_smith')
    );
  });

  it('has nothing to open for a handle it cannot read', () => {
    expect(imLink('telegram', 'no')).toBeNull();
    expect(imLink('whatsapp', '')).toBeNull();
  });
});
