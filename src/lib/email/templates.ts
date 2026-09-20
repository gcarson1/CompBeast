import type { NotificationType } from '@prisma/client';
import { BRAND, renderShell, renderText } from './layout';

/**
 * One notification row, dressed for the inbox.
 *
 * The copy is deliberately *not* rewritten here. A notification already has a
 * title, a body and a destination, and those are what the person sees in the
 * app — so the email reuses them and this module only supplies presentation:
 * which label sits above the headline, which colour the rule and button take,
 * what the button says, and why the message was sent at all.
 *
 * That split is the whole design. Rewriting the words per channel is how you
 * end up with an email that promises something the app does not show, and a
 * template file that has to be edited every time a mutation changes its
 * wording.
 */

export type EmailCategory = 'draft' | 'league' | 'friends';

export interface EmailStyle {
  /** Small uppercase label above the headline. */
  eyebrow: string;
  accent: string;
  accentInk: string;
  /** Button label. Null for messages with nowhere useful to send anyone. */
  cta: string | null;
  /** Completes "You're getting this because …". */
  because: string;
  category: EmailCategory;
}

const GOLD = { accent: BRAND.gold, accentInk: BRAND.onGold };
const VELVET = { accent: BRAND.velvet, accentInk: '#FFFFFF' };
const DANGER = { accent: BRAND.danger, accentInk: '#FFFFFF' };
const NEUTRAL = { accent: BRAND.slate, accentInk: '#FFFFFF' };

export const EMAIL_STYLES: Record<NotificationType, EmailStyle> = {
  LEAGUE_DRAFT_PICK_DUE: {
    eyebrow: 'You are on the clock',
    ...GOLD,
    cta: 'Make your pick',
    because: 'a draft you are in is waiting on your pick',
    category: 'draft',
  },
  LEAGUE_DRAFT_STARTED: {
    eyebrow: 'Draft started',
    ...GOLD,
    cta: 'Go to the draft room',
    because: 'a league you are in started drafting',
    category: 'draft',
  },
  LEAGUE_DRAFT_COMPLETED: {
    eyebrow: 'Rosters set',
    ...GOLD,
    cta: 'See your roster',
    because: 'a draft you were in finished',
    category: 'draft',
  },
  LEAGUE_INVITE: {
    eyebrow: 'Invitation',
    ...GOLD,
    cta: 'Take your seat',
    because: 'someone invited you to their league',
    category: 'league',
  },
  LEAGUE_MEMBER_JOINED: {
    eyebrow: 'New manager',
    ...GOLD,
    cta: 'See the league',
    because: 'you run a league somebody just joined',
    category: 'league',
  },
  LEAGUE_UPDATED: {
    eyebrow: 'League settings',
    ...NEUTRAL,
    cta: 'Review the changes',
    because: 'a commissioner changed the rules of a league you are in',
    category: 'league',
  },
  LEAGUE_DELETED: {
    eyebrow: 'League closed',
    ...DANGER,
    // Nowhere to send anyone: the league it refers to no longer exists.
    cta: null,
    because: 'a league you were in was deleted',
    category: 'league',
  },
  FRIEND_REQUEST: {
    eyebrow: 'Friend request',
    ...VELVET,
    cta: 'See the request',
    because: 'somebody sent you a friend request',
    category: 'friends',
  },
  FRIEND_ACCEPTED: {
    eyebrow: 'Friends',
    ...VELVET,
    cta: 'View your friends',
    because: 'somebody accepted your friend request',
    category: 'friends',
  },
};

export const CATEGORIES: Record<
  EmailCategory,
  { label: string; description: string; types: NotificationType[] }
> = {
  draft: {
    label: 'Drafts',
    description: 'Your turn to pick, a draft starting, a draft finishing.',
    types: ['LEAGUE_DRAFT_STARTED', 'LEAGUE_DRAFT_PICK_DUE', 'LEAGUE_DRAFT_COMPLETED'],
  },
  league: {
    label: 'Leagues',
    description: 'Invitations, people joining, rule changes, a league closing.',
    types: ['LEAGUE_INVITE', 'LEAGUE_MEMBER_JOINED', 'LEAGUE_UPDATED', 'LEAGUE_DELETED'],
  },
  friends: {
    label: 'Friends',
    description: 'Friend requests and the people who accept yours.',
    types: ['FRIEND_REQUEST', 'FRIEND_ACCEPTED'],
  },
};

export function categoryOf(type: NotificationType): EmailCategory {
  return EMAIL_STYLES[type]?.category ?? 'league';
}

export interface RenderInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  /** Absolute origin, e.g. https://compbeast.vercel.app. */
  baseUrl: string;
  /** Opaque per-person key. Omitted when we do not have one yet. */
  emailToken?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * A notification's title is already a complete sentence — "You're on the clock
 * in Sunday Crew" — so it is the subject line verbatim. Prefixing it with the
 * product name would push the part that matters past where a phone truncates.
 */
export function renderNotificationEmail(input: RenderInput): RenderedEmail {
  const style = EMAIL_STYLES[input.type] ?? {
    eyebrow: 'Comp Beast',
    ...NEUTRAL,
    cta: 'Open Comp Beast',
    because: 'something happened in a league you are in',
    category: 'league' as const,
  };

  const body = input.body?.trim() || 'Open Comp Beast to see what changed.';
  const url = absolute(input.baseUrl, input.href ?? '/notifications');
  const settingsUrl = absolute(input.baseUrl, '/account#email');
  const unsubscribeUrl = input.emailToken
    ? `${absolute(input.baseUrl, '/unsubscribe')}?t=${encodeURIComponent(input.emailToken)}&c=${style.category}`
    : undefined;

  const shared = {
    headline: input.title,
    body,
    cta: style.cta ? { label: style.cta, url } : undefined,
    footerReason: `You're getting this because ${style.because}.`,
    unsubscribeUrl,
    settingsUrl,
  };

  return {
    subject: input.title,
    html: renderShell({
      preheader: body,
      eyebrow: style.eyebrow,
      accent: style.accent,
      accentInk: style.accentInk,
      ...shared,
    }),
    text: renderText(shared),
  };
}

/** Relative hrefs are what the app stores; an inbox needs the whole thing. */
function absolute(baseUrl: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${baseUrl.replace(/\/+$/, '')}/${href.replace(/^\/+/, '')}`;
}
