import { prisma } from '../lib/db';
import {
  type ChatMessage,
  draftPickMessage,
  draftStartedMessage,
  parseWebhookUrl,
  standingsMessage,
  toPayload,
} from '../lib/chat-webhook';
import { appBaseUrl } from '../lib/site';
import { background } from './background';
import { getLeagueLeaderboard } from './queries';

/**
 * League chat webhooks — the sending half.
 *
 * Same rule as notifications: a chat post must never be able to fail the
 * thing it is reporting. Every function here swallows its own errors, runs
 * after the primary write has committed, and is handed to `background` so a
 * slow webhook costs nobody their turn.
 */

/** Long enough for Discord or Slack on a normal day; short enough to never own a request. */
const TIMEOUT_MS = 5_000;

/** Posts one message to a webhook. Resolves to whether the service accepted it. */
export async function postToChat(webhookUrl: string | null | undefined, message: ChatMessage): Promise<boolean> {
  if (!webhookUrl) return false;
  const target = parseWebhookUrl(webhookUrl);
  if (!target) return false;

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        toPayload(target.service, message, { avatarUrl: `${appBaseUrl()}/icons/icon-192.png` }),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[league-chat] ${target.service} answered ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[league-chat] post failed', error);
    return false;
  }
}

export function announceDraftStarted(league: {
  id: string;
  name: string;
  chatWebhookUrl: string | null;
  rosterSize: number;
  teamCount: number;
  firstTeam: string | null;
}): void {
  if (!league.chatWebhookUrl) return;
  background(
    postToChat(
      league.chatWebhookUrl,
      draftStartedMessage({
        leagueName: league.name,
        teamCount: league.teamCount,
        rosterSize: league.rosterSize,
        firstTeam: league.firstTeam,
        url: `${appBaseUrl()}/leagues/${league.id}/draft`,
      }),
    ),
  );
}

export function announceDraftPick(input: {
  leagueId: string;
  leagueName: string;
  chatWebhookUrl: string | null;
  teamName: string;
  contestantName: string;
  round: number;
  pickNumber: number;
  totalPicks: number;
  nextTeam: string | null;
}): void {
  if (!input.chatWebhookUrl) return;
  background(
    postToChat(
      input.chatWebhookUrl,
      draftPickMessage({
        ...input,
        url: `${appBaseUrl()}/leagues/${input.leagueId}/draft`,
      }),
    ),
  );
}

/**
 * Posts current standings to every league on a season that has a chat and a
 * finished draft (a league still drafting has no standings to speak of).
 * Called after a sync publishes new results. Awaited, not backgrounded: the
 * callers are the cron job and the admin sync button, which have nobody
 * waiting on them and *do* want to report how many chats were reached.
 */
export async function announceSeasonResults(seasonId: string): Promise<number> {
  const leagues = await prisma.league.findMany({
    where: { seasonId, chatWebhookUrl: { not: null }, draftStatus: 'COMPLETED' },
    select: { id: true, name: true, chatWebhookUrl: true, season: { select: { name: true } } },
  });

  let posted = 0;
  for (const league of leagues) {
    try {
      const { rows } = await getLeagueLeaderboard(league.id);
      if (rows.length === 0) continue;
      const ok = await postToChat(
        league.chatWebhookUrl,
        standingsMessage({
          leagueName: league.name,
          seasonName: league.season.name,
          rows: rows.map((row) => ({
            rank: row.rank,
            teamName: row.teamName,
            totalPoints: row.totalPoints,
            lastCyclePoints: row.lastCyclePoints,
          })),
          url: `${appBaseUrl()}/leagues/${league.id}`,
        }),
      );
      if (ok) posted += 1;
    } catch (error) {
      console.warn(`[league-chat] standings for ${league.id} failed`, error);
    }
  }
  return posted;
}
