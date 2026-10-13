import { describe, expect, it } from 'vitest';
import { inAppPath, isNativeApp } from './native';

describe('inAppPath', () => {
  it('turns one of our links into a page path, keeping the query and the hash', () => {
    expect(inAppPath('https://compbeast.app/leagues/join?code=SUND-4K2P')).toBe(
      '/leagues/join?code=SUND-4K2P',
    );
    expect(inAppPath('https://compbeast.app/account#email')).toBe('/account#email');
    expect(inAppPath('https://www.compbeast.app/seasons')).toBe('/seasons');
  });

  it('accepts the host a development build is running on', () => {
    expect(inAppPath('http://localhost:3000/rules', 'localhost:3000')).toBe('/rules');
  });

  it('refuses anyone else’s link and anything that is not a web link', () => {
    expect(inAppPath('https://evil.example/leagues')).toBeNull();
    expect(inAppPath('https://compbeast.app.evil.example/leagues')).toBeNull();
    expect(inAppPath('javascript:alert(1)')).toBeNull();
    expect(inAppPath('not a url')).toBeNull();
  });
});

describe('isNativeApp', () => {
  it('is false outside the app (no bridge, or no window at all)', () => {
    expect(isNativeApp()).toBe(false);
  });
});
