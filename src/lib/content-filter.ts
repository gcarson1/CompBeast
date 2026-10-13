/**
 * The words nothing on Comp Beast may say: not a league chat post, not a
 * league name, not a team name.
 *
 * Trash talk is what the league feed is for, so ordinary swearing is
 * allowed; what is refused is the hateful vocabulary — racial, ethnic,
 * homophobic, transphobic and ableist slurs. Everything else that crosses
 * a line is handled after the fact, by reporting and blocking (see
 * src/server/moderation.ts); a filter is only ever the first net.
 *
 * Matching is by whole word, never by substring, so "snigger", "Niger",
 * "Scunthorpe" and "collie" pass — and a slur that is also an everyday word
 * ("a chink in the armour") is left to reports, since refusing it would
 * refuse the everyday word too. A word still matches when its letters are
 * stretched ("faaaggot"), dressed in look-alike digits and symbols ("f4gg0t"),
 * spaced out one letter at a time, or given a plural or common suffix.
 *
 * Client-safe and dependency-free: the forms use it through the schemas in
 * validation.ts for instant feedback, and the server enforces it on write.
 */

/**
 * ROT13, so this file does not read as a list of slurs. Decode with
 * `rot13()` below to review or extend it.
 */
const ENCODED_TERMS = [
  'avttre',
  'avttn',
  'avttnu',
  'avtthu',
  'fnaqavttre',
  'cbepuzbaxrl',
  'whatyrohaal',
  'tbbx',
  'fcvp',
  'jrgonpx',
  'ornare',
  'xvxr',
  'urro',
  'enturnq',
  'gbjryurnq',
  'pnzryshpxre',
  'snttbg',
  'snt',
  'snttl',
  'qlxr',
  'genaal',
  'furznyr',
  'ergneq',
  'ergneqrq',
  'zbatbybvq',
  'tlcb',
  'cvxrl',
  'mvccreurnq',
  'tbyyvjbt',
  'qnexvr',
  'wvtnobb',
] as const;

/**
 * Endings a match may carry: plurals only. Wider endings started matching
 * ordinary words ("spicy", "spiced"); the adjective forms that matter are
 * listed as terms of their own.
 */
const SUFFIX = '(?:s|es|z)?';

/** Look-alikes people substitute for letters. */
const LOOKALIKES: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '6': 'g',
  '9': 'g',
  '7': 't',
};

export function rot13(text: string): string {
  return text.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
}

/**
 * One pattern per term, each letter allowed to repeat: "nigger" matches
 * "niggggerr" but never "niger" — a doubled letter in the term stays doubled.
 */
const PATTERNS = ENCODED_TERMS.map((encoded) => {
  const term = rot13(encoded);
  return new RegExp(`^${[...term].map((c) => `${c}+`).join('')}${SUFFIX}$`);
});

/**
 * The text as the words it contains, lowercased and de-disguised. Read twice
 * — once with look-alikes as letters ("f4gg0t"), once with them as the
 * punctuation they usually are ("what a ...!") — since the same character
 * is a letter in one post and an exclamation mark in the next.
 */
function words(text: string): string[] {
  // NFKD splits accented letters into letter + mark; the marks are dropped.
  const lower = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const disguised = lower.replace(/[0-9!@$]/g, (c) => LOOKALIKES[c] ?? c);
  return [...new Set([...tokensOf(disguised), ...tokensOf(lower)])];
}

function tokensOf(text: string): string[] {
  const plain = text.replace(/[^a-z]+/g, ' ').trim();
  if (!plain) return [];

  const tokens = plain.split(' ');
  // "n i g g e r": three or more single letters in a row read as one word.
  const joined: string[] = [];
  let run = '';
  for (const token of tokens) {
    if (token.length === 1) {
      run += token;
      continue;
    }
    if (run.length >= 3) joined.push(run);
    run = '';
  }
  if (run.length >= 3) joined.push(run);
  return [...tokens, ...joined];
}

/** Whether the text uses a refused word. */
export function containsBlockedTerm(text: string): boolean {
  return words(text).some((word) => PATTERNS.some((pattern) => pattern.test(word)));
}

/** What a person is told when a post or a name is refused. */
export const BLOCKED_TERM_MESSAGE =
  'That uses language Comp Beast does not allow. Trash talk is fine — slurs are not.';
