import type { ReportReason } from '@prisma/client';
import { prisma } from '../lib/db';
import { REPORT_REASONS } from '../lib/report-reasons';
import { DomainError } from './errors';
import { notify } from './notifications';
import { canViewLeague } from './queries';

/**
 * Keeping the people in a league safe from each other.
 *
 * Three tools, each the floor any app with user posts owes its users (and
 * what App Review guideline 1.2 asks of one):
 *
 * - **Block.** One tap ends contact both ways: neither person sees the
 *   other's league posts, and neither can find, befriend or invite the other.
 *   The posts disappear from the blocker's feed at once, and a report is
 *   filed so the moderators hear about it too.
 * - **Report.** A post or a person goes into the moderation queue
 *   (/admin/reports) with what it said at the time, and every platform admin
 *   is alerted — in the app, by push and by email.
 * - **Suspend.** A moderator can remove a post and eject its author. A
 *   suspended account can still read, change its settings and delete itself,
 *   but nothing it does reaches anyone else (`requireActiveUser`).
 *
 * The first net is the slur filter on every post and name
 * (src/lib/content-filter.ts); this is for everything a word list can't see.
 */

export interface BlockedPerson {
  userId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  blockedAt: Date;
}

/** The people this person has blocked (not the other direction — that is not theirs to see). */
export async function getBlockedPeople(userId: string): Promise<BlockedPerson[]> {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      blocked: { select: { id: true, name: true, handle: true, avatarUrl: true } },
    },
  });
  return rows.map((row) => ({
    userId: row.blocked.id,
    name: row.blocked.name ?? row.blocked.handle ?? 'Former member',
    handle: row.blocked.handle,
    avatarUrl: row.blocked.avatarUrl,
    blockedAt: row.createdAt,
  }));
}

/**
 * Blocks someone. Idempotent: blocking twice is one block. Ends any
 * friendship or pending request between the two, and files a report so the
 * moderators see it — against the post it was done from, when there is one.
 */
export async function blockUser(userId: string, targetUserId: string, context: { messageId?: string } = {}) {
  if (userId === targetUserId) throw new DomainError('You cannot block yourself.', 'SELF_BLOCK');
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!target) throw new DomainError('That account no longer exists.', 'USER_NOT_FOUND', 404);

  const message = context.messageId
    ? await prisma.leagueMessage.findFirst({
        where: { id: context.messageId, authorId: targetUserId },
        select: { id: true, leagueId: true, body: true },
      })
    : null;

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } },
      create: { blockerId: userId, blockedId: targetUserId },
      update: {},
    }),
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: userId },
        ],
      },
    }),
  ]);

  await fileReport({
    reporterId: userId,
    subjectUserId: targetUserId,
    reason: 'OTHER',
    details: 'Blocked by the reporter.',
    message,
    viaBlock: true,
  });
}

export async function unblockUser(userId: string, targetUserId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetUserId } });
}

/**
 * Reports a league post, or a person (their name, picture or team name).
 * The reporter has to be able to see what they are reporting: a post only in
 * a league they can view, a person only someone who exists.
 */
export async function reportContent(
  userId: string,
  input: { messageId?: string; subjectUserId?: string; reason: ReportReason; details?: string },
) {
  let subjectUserId = input.subjectUserId ?? null;
  let message: { id: string; leagueId: string; body: string } | null = null;

  if (input.messageId) {
    const row = await prisma.leagueMessage.findUnique({
      where: { id: input.messageId },
      select: { id: true, leagueId: true, body: true, authorId: true },
    });
    if (!row || !(await canViewLeague(row.leagueId, userId))) {
      throw new DomainError('That post is gone.', 'MESSAGE_NOT_FOUND', 404);
    }
    message = { id: row.id, leagueId: row.leagueId, body: row.body };
    subjectUserId = row.authorId;
  }

  if (!subjectUserId) throw new DomainError('Say what you are reporting.', 'REPORT_EMPTY');
  if (subjectUserId === userId) throw new DomainError('You cannot report yourself.', 'SELF_REPORT');
  const subject = await prisma.user.findUnique({ where: { id: subjectUserId }, select: { id: true } });
  if (!subject) throw new DomainError('That account no longer exists.', 'USER_NOT_FOUND', 404);

  await fileReport({
    reporterId: userId,
    subjectUserId,
    reason: input.reason,
    details: input.details?.trim().slice(0, 1000) || null,
    message,
    viaBlock: false,
  });
}

/**
 * Writes the report and alerts the moderators. A second report of the same
 * thing by the same person while the first is still open is a no-op, so a
 * double tap does not alert everyone twice.
 */
async function fileReport(input: {
  reporterId: string;
  subjectUserId: string;
  reason: ReportReason;
  details: string | null;
  message: { id: string; leagueId: string; body: string } | null;
  viaBlock: boolean;
}) {
  const duplicate = await prisma.contentReport.findFirst({
    where: {
      reporterId: input.reporterId,
      subjectUserId: input.subjectUserId,
      messageId: input.message?.id ?? null,
      status: 'OPEN',
    },
    select: { id: true },
  });
  if (duplicate) return;

  await prisma.contentReport.create({
    data: {
      reporterId: input.reporterId,
      subjectUserId: input.subjectUserId,
      messageId: input.message?.id,
      leagueId: input.message?.leagueId,
      snapshot: input.message?.body,
      reason: input.reason,
      details: input.details,
      viaBlock: input.viaBlock,
    },
  });

  const admins = await prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { id: true } });
  await notify(
    admins.map((admin) => ({
      userId: admin.id,
      type: 'CONTENT_REPORTED' as const,
      title: input.viaBlock
        ? 'Someone was blocked'
        : `New report: ${REPORT_REASONS[input.reason].toLowerCase()}`,
      body: input.message?.body
        ? `“${input.message.body.slice(0, 140)}”`
        : 'A person was reported. Review it in the moderation queue.',
      href: '/admin/reports',
      actorId: input.reporterId,
    })),
  );
}

// ---------------------------------------------------------------------------
// The moderation queue (platform admins only — callers check)
// ---------------------------------------------------------------------------

export interface QueuedReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  viaBlock: boolean;
  createdAt: Date;
  snapshot: string | null;
  /** The post as it is now: null when it has been deleted since. */
  currentBody: string | null;
  messageId: string | null;
  leagueId: string | null;
  reporterName: string | null;
  subject: { id: string; name: string; email: string; suspended: boolean; openReports: number };
}

export async function getModerationQueue(limit = 100): Promise<QueuedReport[]> {
  const rows = await prisma.contentReport.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      reason: true,
      details: true,
      viaBlock: true,
      createdAt: true,
      snapshot: true,
      messageId: true,
      leagueId: true,
      message: { select: { body: true, deletedAt: true } },
      reporter: { select: { name: true, handle: true } },
      subjectUser: {
        select: { id: true, name: true, handle: true, email: true, suspendedAt: true },
      },
    },
  });

  const counts = await prisma.contentReport.groupBy({
    by: ['subjectUserId'],
    where: { status: 'OPEN', subjectUserId: { in: rows.map((row) => row.subjectUser.id) } },
    _count: { _all: true },
  });
  const openBySubject = new Map(counts.map((row) => [row.subjectUserId, row._count._all]));

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    details: row.details,
    viaBlock: row.viaBlock,
    createdAt: row.createdAt,
    snapshot: row.snapshot,
    currentBody: row.message && !row.message.deletedAt ? row.message.body : null,
    messageId: row.messageId,
    leagueId: row.leagueId,
    reporterName: row.reporter ? (row.reporter.name ?? row.reporter.handle ?? 'A member') : null,
    subject: {
      id: row.subjectUser.id,
      name: row.subjectUser.name ?? row.subjectUser.handle ?? 'Unnamed member',
      email: row.subjectUser.email,
      suspended: row.subjectUser.suspendedAt !== null,
      openReports: openBySubject.get(row.subjectUser.id) ?? 0,
    },
  }));
}

export type ModerationAction = 'REMOVE_POST' | 'SUSPEND' | 'DISMISS';

/**
 * Settles a report. Removing the post also closes every other open report
 * of the same post; suspending also removes the post, and closes every open
 * report against the person, since they have been dealt with as a whole.
 */
export async function resolveReport(adminId: string, reportId: string, action: ModerationAction) {
  const report = await prisma.contentReport.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, messageId: true, subjectUserId: true, reason: true },
  });
  if (!report) throw new DomainError('That report is gone.', 'REPORT_NOT_FOUND', 404);
  if (report.status !== 'OPEN')
    throw new DomainError('That report was already settled.', 'REPORT_SETTLED', 409);

  const now = new Date();
  const settle = (resolution: string, status: 'ACTIONED' | 'DISMISSED') => ({
    status,
    resolution,
    resolvedById: adminId,
    resolvedAt: now,
  });

  if (action === 'DISMISS') {
    await prisma.contentReport.update({
      where: { id: report.id },
      data: settle('Dismissed: no rule broken.', 'DISMISSED'),
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (report.messageId) {
      await tx.leagueMessage.updateMany({
        where: { id: report.messageId, deletedAt: null },
        data: { deletedAt: now },
      });
    }

    if (action === 'SUSPEND') {
      await tx.user.update({
        where: { id: report.subjectUserId },
        data: { suspendedAt: now, suspensionReason: REPORT_REASONS[report.reason] },
      });
      await tx.contentReport.updateMany({
        where: { subjectUserId: report.subjectUserId, status: 'OPEN' },
        data: settle('Post removed and the author suspended.', 'ACTIONED'),
      });
      return;
    }

    await tx.contentReport.updateMany({
      where: report.messageId ? { messageId: report.messageId, status: 'OPEN' } : { id: report.id },
      data: settle(report.messageId ? 'Post removed.' : 'Reviewed and actioned.', 'ACTIONED'),
    });
  });
}

export interface SuspendedPerson {
  id: string;
  name: string;
  email: string;
  suspendedAt: Date;
  reason: string | null;
}

export async function getSuspendedPeople(): Promise<SuspendedPerson[]> {
  const rows = await prisma.user.findMany({
    where: { suspendedAt: { not: null } },
    orderBy: { suspendedAt: 'desc' },
    select: { id: true, name: true, handle: true, email: true, suspendedAt: true, suspensionReason: true },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? row.handle ?? 'Unnamed member',
    email: row.email,
    suspendedAt: row.suspendedAt as Date,
    reason: row.suspensionReason,
  }));
}

export async function liftSuspension(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { suspendedAt: null, suspensionReason: null } });
}
