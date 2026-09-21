import { describe, expect, it } from 'vitest';
import { BADGES, earnedBadges, highestBadge, nextBadge } from './badges';

describe('badge ladder', () => {
  it('has at least five tiers, strictly ascending, with unique slugs', () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < BADGES.length; i += 1) {
      expect(BADGES[i].threshold).toBeGreaterThan(BADGES[i - 1].threshold);
    }
    expect(new Set(BADGES.map((b) => b.slug)).size).toBe(BADGES.length);
  });

  it('awards nothing at zero and the first badge on the first point', () => {
    expect(earnedBadges(0)).toEqual([]);
    expect(highestBadge(0)).toBeNull();
    expect(earnedBadges(1).map((b) => b.slug)).toEqual(['castmate']);
    // Fractional totals are real: point values carry two decimals.
    expect(earnedBadges(0.5)).toEqual([]);
  });

  it('awards every tier at or above its threshold and none below', () => {
    for (const badge of BADGES) {
      expect(earnedBadges(badge.threshold).at(-1)?.slug).toBe(badge.slug);
      expect(earnedBadges(badge.threshold - 0.01).at(-1)?.slug).not.toBe(badge.slug);
    }
    expect(highestBadge(10_000)?.slug).toBe(BADGES.at(-1)!.slug);
  });

  it('describes the next tier with the points still needed', () => {
    const progress = nextBadge(412);
    expect(progress?.badge.slug).toBe('jury-member');
    expect(progress?.remaining).toBe(88);
    // 250 → 500 is the span; 412 is 162/250 of the way.
    expect(progress?.fraction).toBeCloseTo(0.648, 3);
  });

  it('measures the first tier from zero and reports nothing past the last', () => {
    expect(nextBadge(0)).toMatchObject({ badge: { slug: 'castmate' }, remaining: 1, fraction: 0 });
    expect(nextBadge(BADGES.at(-1)!.threshold)).toBeNull();
  });
});
