import type { MetadataRoute } from 'next';
import { appBaseUrl } from '@/lib/site';

/**
 * What crawlers may read.
 *
 * Public: the home page, the scoring rules, and every season and player
 * page — the content that answers "what is this and how does it score". Kept
 * out: anything that is one person's — their account, their alerts, their
 * league's standings and trash-talk feed (`/leagues/<id>` and `/teams/<id>`
 * are viewable by link but are not for an index), the API, and the admin
 * screens. `/leagues/` with the slash blocks every league page while leaving
 * `/leagues` itself crawlable — robots rules are prefix matches.
 */
const PRIVATE_PATHS = [
  '/api/',
  '/admin/',
  '/account',
  '/notifications',
  '/unsubscribe',
  '/leagues/',
  '/teams/',
];

/**
 * Named explicitly, on top of the `*` rule, so the decision to admit them is
 * visible rather than implied by an absence — and so any one of them can be
 * turned away later by moving it to its own group. Each group has to repeat
 * the disallow list: a crawler that finds a group naming it reads *only* that
 * group, and an `Allow: /` on its own would open the private routes to it.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'DuckAssistBot',
  'meta-externalagent',
  'Amazonbot',
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  };
}
