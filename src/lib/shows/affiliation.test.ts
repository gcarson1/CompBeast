import { describe, expect, it } from 'vitest';
import { affiliationOf, isTraitor } from './affiliation';

describe('affiliation', () => {
  it('reads the side the source wrote, and only a Traitor holds a cloak', () => {
    expect(affiliationOf({ affiliation: ' Traitor ' })).toBe('Traitor');
    expect(isTraitor({ affiliation: 'Traitor' })).toBe(true);
    expect(isTraitor({ affiliation: 'Faithful' })).toBe(false);
    expect(isTraitor({ affiliation: 'Accomplice' })).toBe(false);
  });

  it('says nothing for a show, or a player, without one', () => {
    expect(affiliationOf(null)).toBeNull();
    expect(affiliationOf({ occupation: 'Pilot' })).toBeNull();
    expect(isTraitor({ affiliation: '' })).toBe(false);
  });
});
