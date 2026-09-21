import { describe, expect, it } from 'vitest';
import {
  describeWebhook,
  draftPickMessage,
  parseWebhookUrl,
  standingsMessage,
  toDiscordPayload,
  toSlackPayload,
} from './chat-webhook';

describe('parseWebhookUrl', () => {
  it('recognises Discord and Slack incoming webhooks', () => {
    expect(parseWebhookUrl('https://discord.com/api/webhooks/123/abc')?.service).toBe('discord');
    expect(parseWebhookUrl(' https://discordapp.com/api/webhooks/123/abc ')?.service).toBe('discord');
    expect(parseWebhookUrl('https://hooks.slack.com/services/T0/B0/xyz')?.service).toBe('slack');
    expect(describeWebhook('https://hooks.slack.com/services/T0/B0/xyz')).toBe('Slack');
  });

  it('refuses anything that is not one of those', () => {
    for (const url of [
      'http://discord.com/api/webhooks/123/abc', // not https
      'https://discord.com/channels/123', // not a webhook path
      'https://evil.example/api/webhooks/123/abc',
      'https://hooks.slack.com/other/T0',
      'not a url',
      '',
    ]) {
      expect(parseWebhookUrl(url)).toBeNull();
    }
    expect(describeWebhook(null)).toBeNull();
  });
});

describe('payloads', () => {
  const message = draftPickMessage({
    leagueName: 'Block Party',
    teamName: 'Veto Villains',
    contestantName: 'Melody Park',
    round: 2,
    pickNumber: 7,
    totalPicks: 20,
    nextTeam: 'Jury Duty',
    url: 'https://compbeast.app/leagues/abc/draft',
  });

  it('puts everything inside a Discord embed with the gold accent', () => {
    const payload = toDiscordPayload(message, { avatarUrl: 'https://compbeast.app/icons/icon-192.png' });
    expect(payload).not.toHaveProperty('content');
    expect(payload.embeds[0]).toMatchObject({
      title: 'Veto Villains took Melody Park',
      url: message.url,
      color: 0xf59e0b,
    });
    expect(payload.embeds[0].description).toContain('Jury Duty is up next.');
  });

  it('renders Slack mrkdwn with a link back', () => {
    const { text } = toSlackPayload(message);
    expect(text.startsWith('*Veto Villains took Melody Park*')).toBe(true);
    expect(text).toContain('<https://compbeast.app/leagues/abc/draft|Open in Comp Beast>');
  });

  it('caps standings at ten rows and signs the weekly change', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      rank: i + 1,
      teamName: `Team ${i + 1}`,
      totalPoints: 100 - i,
      lastCyclePoints: i === 0 ? 12 : -2,
    }));
    const { lines } = standingsMessage({ leagueName: 'L', seasonName: 'Big Brother 28', rows, url: 'u' });
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe('1. Team 1 — 100 (+12 this week)');
    expect(lines[1]).toBe('2. Team 2 — 99 (-2 this week)');
    expect(lines.at(-1)).toBe('…and 2 more.');
  });
});
