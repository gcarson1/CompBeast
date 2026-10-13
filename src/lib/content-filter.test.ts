import { describe, expect, it } from 'vitest';
import { containsBlockedTerm, rot13 } from './content-filter';

// The terms are spelled out through rot13 here too, so the test reads no
// worse than the module it tests.
const slur = (encoded: string) => rot13(encoded);

describe('containsBlockedTerm', () => {
  it('refuses slurs as whole words, in any case', () => {
    expect(containsBlockedTerm(`you ${slur('snttbg')}`)).toBe(true);
    expect(containsBlockedTerm(slur('ergneq').toUpperCase())).toBe(true);
    expect(containsBlockedTerm(`what a ${slur('xvxr')}!`)).toBe(true);
  });

  it('sees through stretched letters, look-alike digits and spacing', () => {
    expect(containsBlockedTerm('faaaggggot')).toBe(true);
    expect(containsBlockedTerm('f4gg0t')).toBe(true);
    expect(containsBlockedTerm(slur('ergneq').split('').join(' '))).toBe(true);
    expect(containsBlockedTerm(`${slur('snttbg')}s`)).toBe(true);
  });

  it('lets ordinary trash talk through', () => {
    for (const text of [
      'You are going home this week, enjoy the jury house',
      'damn, that HOH comp was rigged as hell',
      'This draft is a dumpster fire and I love it',
      'Lost fire-making? Embarrassing.',
    ]) {
      expect(containsBlockedTerm(text)).toBe(false);
    }
  });

  it('does not match inside or alongside innocent words', () => {
    for (const text of [
      'He was sniggering the whole episode',
      'Her family is from Niger',
      'Scunthorpe United',
      'my collie watches with me',
      'a spicy blindside',
      'she spiced up the house meeting',
      'found the chink in his armor',
      'the fagottist in the orchestra',
      'Dykes and levees',
    ]) {
      // The last one is the deliberate exception that proves the rule: a
      // whole-word match on a slur that is also a dictionary word refuses
      // the dictionary word too. The rest must pass.
      expect(containsBlockedTerm(text)).toBe(text.startsWith('Dykes'));
    }
  });

  it('accepts empty and symbol-only text', () => {
    expect(containsBlockedTerm('')).toBe(false);
    expect(containsBlockedTerm('🔥🔥🔥 !!!')).toBe(false);
  });
});
