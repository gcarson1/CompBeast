import { NotificationType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
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
    expect(render({ href: 'https://elsewhere.example/x' }).html).toContain(
      'https://elsewhere.example/x',
    );
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
