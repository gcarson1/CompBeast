import { NotificationType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { BRAND } from './layout';
import { CATEGORIES, EMAIL_STYLES, categoryOf, renderNotificationEmail } from './templates';

const BASE = 'https://compbeast.example';

const render = (overrides: Partial<Parameters<typeof renderNotificationEmail>[0]> = {}) =>
  renderNotificationEmail({
    type: 'LEAGUE_DRAFT_PICK_DUE',
    title: "You're on the clock in Sunday Crew",
    body: 'Round 2, pick 9 of 40.',
    href: '/leagues/abc/draft',
    baseUrl: BASE,
    emailToken: 'tok_123',
    ...overrides,
  });

/**
 * The catalogue tests matter more than they look. Adding a notification type
 * is a schema edit plus a mutation edit, and forgetting the presentation for
 * it would not fail a build — it would send a real person an email with the
 * wrong label and no button.
 */
describe('the type catalogue', () => {
  const all = Object.values(NotificationType);

  it('styles every notification type', () => {
    for (const type of all) expect(EMAIL_STYLES[type], type).toBeDefined();
  });

  it('files every type into exactly one category', () => {
    const seen = new Map<string, string>();
    for (const [name, group] of Object.entries(CATEGORIES)) {
      for (const type of group.types) {
        expect(seen.has(type), `${type} is in two categories`).toBe(false);
        seen.set(type, name);
      }
    }
    expect([...seen.keys()].sort()).toEqual([...all].sort());
  });

  it('agrees with itself about which category a type is in', () => {
    for (const [name, group] of Object.entries(CATEGORIES)) {
      for (const type of group.types) expect(categoryOf(type)).toBe(name);
    }
  });
});

/**
 * Contrast, checked here rather than trusted.
 *
 * An email is the one surface nobody can file a bug about: it renders once, in
 * somebody's inbox, and if the label above the headline is illegible they
 * simply do not read it and we never find out. Three of these accents were
 * under the floor the first time they were written, all for the same reason —
 * one colour being asked to work as a band, as small text, and as a fill.
 */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe('accent contrast', () => {
  const SURFACE = BRAND.surface;
  const accents = [...new Set(Object.values(EMAIL_STYLES).map((style) => style.accent))];

  it('has an accent for every type that clears AA as small text', () => {
    // 11px uppercase is small text: the 4.5:1 floor, not the 3:1 large-text one.
    for (const accent of accents) {
      expect(contrast(accent.eyebrow, SURFACE), `eyebrow ${accent.eyebrow}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('puts readable ink on every button fill', () => {
    // 14px bold is still small text under WCAG — "large" starts at 18.66px bold.
    for (const accent of accents) {
      expect(contrast(accent.ink, accent.fill), `${accent.ink} on ${accent.fill}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps the accent rule visible against the card', () => {
    // Decorative, so the 3:1 non-text threshold applies rather than 4.5:1.
    for (const accent of accents) {
      expect(contrast(accent.rule, SURFACE), `rule ${accent.rule}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('reads body copy at AA against the card', () => {
    expect(contrast(BRAND.muted, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.ink, SURFACE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('rendering', () => {
  it('uses the notification title as the subject, unprefixed', () => {
    // Prefixing with a product name pushes the part that matters past where a
    // phone truncates the subject line.
    expect(render().subject).toBe("You're on the clock in Sunday Crew");
  });

  it('turns the stored relative href into an absolute link', () => {
    expect(render().html).toContain(`${BASE}/leagues/abc/draft`);
  });

  it('leaves an already absolute href alone', () => {
    expect(render({ href: 'https://elsewhere.example/x' }).html).toContain('https://elsewhere.example/x');
  });

  it('escapes names people chose themselves', () => {
    // League and team names are free text, and they reach the inbox verbatim.
    const html = render({ title: 'Ruth & <script>alert(1)</script> won' }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('carries an unsubscribe link scoped to the right category', () => {
    const { html, text } = render();
    // In an href the ampersand is escaped, which is correct HTML; the text
    // part carries the raw URL a mail client will linkify.
    expect(html).toContain(`${BASE}/unsubscribe?t=tok_123&amp;c=draft`);
    expect(text).toContain(`${BASE}/unsubscribe?t=tok_123&c=draft`);
  });

  it('omits the unsubscribe link rather than emitting a broken one', () => {
    const html = render({ emailToken: null }).html;
    expect(html).not.toContain('/unsubscribe');
    // The settings page is always reachable, so there is still a way out.
    expect(html).toContain('/account#email');
  });

  it('drops the button for a notification with nowhere to go', () => {
    // The league this one is about has just been deleted.
    const html = render({ type: 'LEAGUE_DELETED', title: 'Sunday Crew was deleted' }).html;
    expect(html).not.toContain('Review the changes');
    expect(html).not.toContain('Take your seat');
  });

  it('writes a plain-text part with the link spelled out', () => {
    const { text } = render();
    expect(text).toContain("You're on the clock in Sunday Crew");
    expect(text).toContain(`${BASE}/leagues/abc/draft`);
    // A message with no text part is scored as spam by most filters.
    expect(text.length).toBeGreaterThan(80);
  });

  it('falls back to a usable body when the notification had none', () => {
    const { html, text } = render({ body: null });
    expect(html).toContain('Open Comp Beast');
    expect(text).toContain('Open Comp Beast');
  });

  it('renders every type without throwing', () => {
    for (const type of Object.values(NotificationType)) {
      const { html, subject } = render({ type, title: `A ${type} happened` });
      expect(subject, type).toBe(`A ${type} happened`);
      expect(html, type).toContain('COMP');
    }
  });
});
