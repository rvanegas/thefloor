/**
 * Where somebody can be reached outside this application: a phone number, and
 * the messaging apps they already use.
 *
 * The phone, since 2026-10-06, and three apps — WhatsApp, Telegram, Signal —
 * because those are the ones a person is plausibly already in, and because
 * each publishes a link format that opens the app on the handle without any
 * account of ours in the middle. The phone's link is `sms:`, which opens a
 * text to it — the one way of reaching a number every phone has, and the
 * least intrusive of the two it offers.
 * Nothing is sent through them and nothing is read from them: what this file
 * knows how to do is turn what somebody typed into a canonical handle, and a
 * canonical handle into a URL. There is no API here and there is not meant to
 * be one.
 *
 * In `core/` rather than in the app because both ends need it and for
 * different halves: the server normalises on the way in, so what is stored is
 * one shape rather than whatever a field happened to hold, and the app builds
 * the link on the way out. Two copies of a phone-number rule is two rules.
 *
 * **A handle is a fact about somebody, not an address this application owns.**
 * Three of the four are phone numbers, which is why entering one is treated as
 * publication to your contacts and nothing weaker — see `ProfileView.im`.
 */

/** The services, in the order they are drawn. */
export const IM_SERVICES = ['phone', 'whatsapp', 'telegram', 'signal'] as const;

export type ImService = (typeof IM_SERVICES)[number];

/**
 * Somebody's handles, one per service at most, and only the ones they have
 * given. An absent key and an empty string are the same thing on the way in;
 * on the way out only the absent key exists, so anything present is something
 * to draw.
 */
export type ImHandles = Partial<Record<ImService, string>>;

/**
 * What each is called on screen.
 *
 * **Not translated, and not translatable**: these are the services' own
 * names, which are the same word in every language the app will learn. The
 * phone is the exception, being an ordinary word: this English one is what the
 * server's refusals say, and the app draws its own translation instead.
 */
export const IM_SERVICE_NAMES: Record<ImService, string> = {
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  signal: 'Signal',
};

/**
 * What to say in an empty field, which has to carry the shape as well as the
 * example — a WhatsApp number without a country code produces a link that
 * silently reaches the wrong person, and there is nothing here that could
 * detect it.
 *
 * **Not translated either, and the reason is the shape rather than the
 * words.** What a placeholder has to teach here is *a country code, then the
 * number*, and `+1 555 …` is the reserved fictional range that says so without
 * being anybody. A Spanish example would say the same thing no more clearly,
 * and the sentence around the field — which *is* translated — is what carries
 * the instruction.
 */
export const IM_SERVICE_HINTS: Record<ImService, string> = {
  phone: '+1 555 123 4567',
  whatsapp: '+1 555 123 4567',
  telegram: '@username',
  signal: '+1 555 123 4567',
};

/**
 * The most digits an international number can have, and the fewest that could
 * be one. E.164 caps a number at fifteen digits including the country code;
 * the floor is a sanity check rather than a rule, since national numbering
 * plans start at around eight and a shorter string is a typo or a fragment.
 */
const PHONE_DIGITS = { min: 8, max: 15 };

/** Telegram's own rule, as far as it bears on what we can link to. */
const TELEGRAM = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/**
 * What somebody typed, turned into the one shape that is stored — or null when
 * it is not a handle at all.
 *
 * Lenient about what arrives and strict about what leaves. People paste the
 * link rather than the handle, write the number the way it is printed on a
 * card, and put an `@` in front of a Telegram username because that is how it
 * is written everywhere else. All three are the same handle, and refusing them
 * would be refusing the way the handle is actually written down.
 *
 * Null is the refusal, and the caller decides what it means: the server
 * answers 400 with the service named, the app draws nothing. **Blank is not a
 * refusal** — it is the way a handle is removed, and it is the caller's job to
 * tell the two apart, since only it knows whether an empty field was cleared
 * on purpose. See `updateProfile`.
 */
export function normaliseImHandle(
  service: ImService,
  raw: string
): string | null {
  const text = raw.trim();
  if (text === '') return null;

  if (service === 'telegram') {
    // A pasted link, an `@`, or the bare username — the last path segment of
    // the first is the handle, which is also what the other two already are.
    const username = text
      .replace(/^https?:\/\//i, '')
      .replace(/^(?:www\.)?(?:t(?:elegram)?\.me|telegram\.dog)\//i, '')
      .replace(/^@/, '')
      .replace(/[/?#].*$/, '');
    return TELEGRAM.test(username) ? username : null;
  }

  // All the others are phone numbers, and are stored in international form
  // with the plus — which is what `signal.me` and `sms:` want and what a
  // person reading it back recognises as a whole number rather than a local
  // one.
  // `wa.me` wants the digits alone and strips it at the link, that being a
  // property of the URL rather than of the handle.
  const digits = text.replace(/\D/g, '');
  if (digits.length < PHONE_DIGITS.min || digits.length > PHONE_DIGITS.max) {
    return null;
  }
  return `+${digits}`;
}

/**
 * Where to send somebody who taps the handle.
 *
 * `https` rather than each app's own scheme, deliberately, for the apps. The
 * phone is `sms:`, there being no app to fall back from. A universal link
 * opens the app when it is installed and a web page that explains itself when
 * it is not, where `whatsapp://` on a phone without WhatsApp fails with
 * nothing to read — and the same URL is the one that works from the browser
 * build, which a custom scheme is not.
 *
 * Returns null for a handle this cannot address, which is a stored handle from
 * a newer client or a corrupt row rather than anything a field can produce.
 */
export function imLink(service: ImService, handle: string): string | null {
  const value = normaliseImHandle(service, handle);
  if (!value) return null;
  if (service === 'phone') return `sms:${value}`;
  if (service === 'telegram') return `https://t.me/${value}`;
  if (service === 'whatsapp') return `https://wa.me/${value.slice(1)}`;
  // Signal addresses a number, and only a number: a Signal *username* has a
  // link too, but it is an opaque token the app mints rather than anything
  // derivable from the name, so there is nothing here that could build one.
  return `https://signal.me/#p/${value}`;
}
