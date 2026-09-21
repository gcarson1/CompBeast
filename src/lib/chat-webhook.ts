/**
 * League chat webhooks — the pure half.
 *
 * A league already lives in a group chat; this is how its draft and its
 * standings show up there without anyone copying them over. Only incoming
 * webhooks are supported, because a webhook URL is something a commissioner
 * can create in two taps and paste into a form, and posting to it needs no
 * OAuth, no bot token and nothing stored but the URL itself.
 *
 * Everything here is pure: recognising a URL, and turning one message into
 * the JSON each service wants. Sending lives in `src/server/league-chat.ts`.
 */

export type ChatService = 'discord' | 'slack';

/**
 * The hosts each service issues webhook URLs on. Anything else is refused at
 * validation time rather than posted to — a webhook URL is a place this
 * server will send league data, so it must be a place we recognise.
 */
const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com']);

export function parseWebhookUrl(url: string): { service: ChatService; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  if (DISCORD_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith('/api/webhooks/')) {
    return { service: 'discord', url: parsed.toString() };
  }
  if (parsed.hostname === 'hooks.slack.com' && parsed.pathname.startsWith('/services/')) {
    return { service: 'slack', url: parsed.toString() };
  }
  return null;
}

/** For the settings screen: which service a saved URL belongs to. */
export function describeWebhook(url: string | null | undefined): string | null {
  if (!url) return null;
  const parsed = parseWebhookUrl(url);
  if (!parsed) return null;
  return parsed.service === 'discord' ? 'Discord' : 'Slack';
}

/**
 * One message, service-agnostic. `lines` are plain text; the formatters add
 * each service's own markdown, so a team called `**Bold**` is not a problem
 * we have to solve twice.
 */
export interface ChatMessage {
  title: string;
  lines: string[];
  /** Where the title links. */
  url: string;
}

/** HOH gold, as Discord wants it: a decimal integer. */
const EMBED_COLOR = 0xf59e0b;

export function toDiscordPayload(message: ChatMessage, options: { avatarUrl?: string } = {}) {
  return {
    username: 'Comp Beast',
    ...(options.avatarUrl ? { avatar_url: options.avatarUrl } : {}),
    // Nothing outside the embed: a bare `content` renders as a plain chat
    // line and doubles the message.
    embeds: [
      {
        title: message.title,
        url: message.url,
        description: message.lines.join('\n'),
        color: EMBED_COLOR,
      },
    ],
  };
}

export function toSlackPayload(message: ChatMessage) {
  return {
    text: [`*${message.title}*`, ...message.lines, `<${message.url}|Open in Comp Beast>`].join('\n'),
  };
}

export function toPayload(service: ChatService, message: ChatMessage, options: { avatarUrl?: string } = {}) {
  return service === 'discord' ? toDiscordPayload(message, options) : toSlackPayload(message);
}

// --- Message builders --------------------------------------------------------

export function draftStartedMessage(input: {
  leagueName: string;
  teamCount: number;
  rosterSize: number;
  firstTeam: string | null;
  url: string;
}): ChatMessage {
  return {
    title: `The ${input.leagueName} draft has started`,
    lines: [
      `${input.teamCount} teams · ${input.rosterSize} rounds.`,
      ...(input.firstTeam ? [`${input.firstTeam} is on the clock.`] : []),
    ],
    url: input.url,
  };
}

export function draftPickMessage(input: {
  leagueName: string;
  teamName: string;
  contestantName: string;
  round: number;
  pickNumber: number;
  totalPicks: number;
  nextTeam: string | null;
  url: string;
}): ChatMessage {
  return {
    title: `${input.teamName} took ${input.contestantName}`,
    lines: [
      `Round ${input.round}, pick ${input.pickNumber} of ${input.totalPicks} in ${input.leagueName}.`,
      input.nextTeam ? `${input.nextTeam} is up next.` : 'That was the last pick — rosters are set.',
    ],
    url: input.url,
  };
}

export function standingsMessage(input: {
  leagueName: string;
  seasonName: string;
  rows: Array<{ rank: number; teamName: string; totalPoints: number; lastCyclePoints: number }>;
  url: string;
}): ChatMessage {
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const shown = input.rows.slice(0, 10);
  return {
    title: `${input.seasonName} results are in — ${input.leagueName} standings`,
    lines: [
      ...shown.map(
        (row) => `${row.rank}. ${row.teamName} — ${row.totalPoints} (${signed(row.lastCyclePoints)} this week)`,
      ),
      ...(input.rows.length > shown.length ? [`…and ${input.rows.length - shown.length} more.`] : []),
    ],
    url: input.url,
  };
}
