/**
 * The vocabulary publishing shares between the two ends.
 *
 * In `core/` for the reason anything is: the server refuses a category it
 * does not recognise and the app offers the list to choose from, and those
 * two must be the same list or the app offers something the server rejects.
 * No I/O, no imports, nothing but the words.
 */

/**
 * Apple's top-level podcast categories, exactly as the directory spells them.
 *
 * The top level only. Apple's full list is these nineteen plus about ninety
 * subcategories, and a subcategory is a second attribute on the same element;
 * a feed carrying a top-level category alone is valid, listed and findable,
 * which is the whole of what this needs. The rest is a refinement somebody
 * can want later.
 *
 * **Exact strings, matched literally, and refused rather than corrected.**
 * The directory compares these character for character — the ampersands and
 * the spacing included — so storing something near one would fail at
 * submission rather than at the settings screen, which is the expensive place
 * to find out.
 */
export const ITUNES_CATEGORIES = [
  'Arts',
  'Business',
  'Comedy',
  'Education',
  'Fiction',
  'Government',
  'Health & Fitness',
  'History',
  'Kids & Family',
  'Leisure',
  'Music',
  'News',
  'Religion & Spirituality',
  'Science',
  'Society & Culture',
  'Sports',
  'Technology',
  'True Crime',
  'TV & Film',
] as const;

/** Whether a string is one of the categories a directory will accept. */
export function isItunesCategory(value: string): boolean {
  return (ITUNES_CATEGORIES as readonly string[]).includes(value);
}
