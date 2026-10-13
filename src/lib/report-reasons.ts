import type { ReportReason } from '@prisma/client';

/**
 * Why something was reported, in the words the report form offers. Its own
 * module so the form (a client component) can list them without importing
 * the server's moderation code.
 */
export const REPORT_REASONS: Record<ReportReason, string> = {
  HARASSMENT: 'Harassment or bullying',
  HATE: 'Hate speech or slurs',
  SEXUAL: 'Sexual or explicit content',
  SPAM: 'Spam or scams',
  IMPERSONATION: 'Pretending to be someone else',
  OTHER: 'Something else',
};
