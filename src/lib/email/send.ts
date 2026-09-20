/**
 * The outbound side.
 *
 * One provider adapter, kept behind a plain function so the rest of the app
 * never learns which service is sending. Swapping providers is this file.
 *
 * Two rules it does not break:
 *
 *  1. **Nothing here may throw.** These calls sit downstream of real work —
 *     a draft pick, a league invite — and an email provider having a bad
 *     afternoon must not become a failed pick.
 *  2. **Unconfigured is a normal state, not an error.** With no API key the
 *     app runs exactly as it did before emails existed. That is what lets
 *     this ship before the domain is verified, and what keeps local
 *     development from needing a secret to run.
 */

const ENDPOINT = 'https://api.resend.com/emails';
/** Long enough for a normal round trip, short enough to never own a request. */
const TIMEOUT_MS = 5_000;
/** Resend's documented ceiling for one batch call. */
const MAX_BATCH = 100;

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Makes Gmail and Apple Mail show their own unsubscribe control, and is
   * weighed by spam filters. Bulk mail without it gets quietly filtered.
   */
  unsubscribeUrl?: string;
}

export interface SendResult {
  sent: number;
  /** True when no provider is configured — the no-op path, not a failure. */
  skipped: boolean;
  error?: string;
}

let warnedUnconfigured = false;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function emailFrom(): string {
  // resend.dev is Resend's shared sandbox sender: it works the moment you have
  // a key, but only delivers to the address that owns the account. Set
  // EMAIL_FROM to an address on a verified domain to reach everybody else.
  return process.env.EMAIL_FROM || 'Comp Beast <onboarding@resend.dev>';
}

/**
 * The origin to build links against.
 *
 * An email link has to be absolute and has to survive being opened days
 * later, so a preview deployment's URL is the wrong answer even when that is
 * where the code is running.
 */
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  return 'http://localhost:3000';
}

export async function sendEmails(messages: OutboundEmail[]): Promise<SendResult> {
  if (messages.length === 0) return { sent: 0, skipped: false };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Once per process, not once per notification. Unconfigured is a steady
    // state, and a line for every alert would bury the logs that matter.
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.info('[email] no RESEND_API_KEY — notification emails are not being sent');
    }
    return { sent: 0, skipped: true };
  }

  const from = emailFrom();
  let sent = 0;
  let error: string | undefined;

  for (let start = 0; start < messages.length; start += MAX_BATCH) {
    const chunk = messages.slice(start, start + MAX_BATCH);
    const payload = chunk.map((message) => ({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    }));

    try {
      const response = await fetch(chunk.length > 1 ? `${ENDPOINT}/batch` : ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.length > 1 ? payload : payload[0]),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) {
        sent += chunk.length;
      } else {
        // The body carries the reason — a stray domain, a bad key — and
        // without it every failure looks identical in the logs.
        error = `${response.status} ${(await response.text()).slice(0, 300)}`;
        console.error('[email] provider rejected a batch:', error);
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'unknown';
      console.error('[email] could not reach the provider:', error);
    }
  }

  return { sent, skipped: false, error };
}
