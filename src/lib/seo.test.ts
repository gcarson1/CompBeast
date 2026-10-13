import { afterEach, describe, expect, it } from 'vitest';
import { isSyntheticSeason, listsSyntheticSeasons } from './seo';

describe('synthetic seasons', () => {
  const saved = process.env.VERCEL_ENV;
  afterEach(() => {
    if (saved === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved;
  });

  it('are the seed’s demo- namespace and nothing else', () => {
    expect(isSyntheticSeason('demo-big-brother')).toBe(true);
    expect(isSyntheticSeason('big-brother-28')).toBe(false);
  });

  it('are listed everywhere but production, where they read as placeholders', () => {
    delete process.env.VERCEL_ENV;
    expect(listsSyntheticSeasons()).toBe(true);
    process.env.VERCEL_ENV = 'preview';
    expect(listsSyntheticSeasons()).toBe(true);
    process.env.VERCEL_ENV = 'production';
    expect(listsSyntheticSeasons()).toBe(false);
  });
});
