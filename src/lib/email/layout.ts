/**
 * The shared shell every Comp Beast email is poured into.
 *
 * Written the way email has to be written rather than the way the app is:
 * tables, inline styles, no flexbox, no grid, no web fonts, no SVG. Gmail
 * strips `<style>` blocks in some clients and Outlook renders through Word,
 * so anything clever here does not degrade — it breaks, in somebody's inbox,
 * where we will never see it.
 *
 * The logo is drawn with background-coloured table cells rather than an image
 * for the same reason: most clients block remote images by default, and a
 * branded email whose branding is hidden until you click "show images" has no
 * branding. Ascending bars plus the red pip is the same mark the app uses,
 * rendered in the only primitives every client agrees on.
 */

export const BRAND = {
  canvas: '#0F172A',
  surface: '#1E293B',
  raised: '#273449',
  ink: '#F8FAFC',
  muted: '#94A3B8',
  hairline: '#2A3A52',
  gold: '#F59E0B',
  goldDeep: '#FBBF24',
  onGold: '#1A1206',
  danger: '#EF4444',
  dangerDeep: '#F87171',
  /** Destructive button fill. White on plain #EF4444 is only 3.8:1. */
  dangerStrong: '#B91C1C',
  velvet: '#8B5CF6',
  velvetDeep: '#C4B5FD',
  /** Velvet button fill. White on the bright velvet is only 4.2:1. */
  velvetDeepFill: '#4C1D95',
  slate: '#64748B',
} as const;

/**
 * Anton is not available in email, so the wordmark falls back to the most
 * condensed heavy faces that ship with each platform. The shape is close
 * enough that the mark still reads as itself.
 */
const DISPLAY_STACK =
  "'Archivo Black','Arial Black','Helvetica Neue',Impact,Haettenschweiler,Arial,sans-serif";
const TEXT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * One accent, three jobs, three colours.
 *
 * They cannot be the same value. A hue bright enough to read as a label on
 * the dark card is too light to put white text on, and a fill dark enough for
 * white text disappears as a rule against the card. Collapsing them into one
 * "accent" is what produced eyebrow labels at 3.1:1 and button text at 4.2:1
 * — both under the 4.5:1 floor, in the one place nobody can report a bug
 * from, because it is in their inbox.
 *
 * The app's own palette already encodes this split: `deep` variants are
 * text-on-dark only, `strong` exists so a destructive button has a fill white
 * can sit on.
 */
export interface Accent {
  /** The 3px band across the top of the card. Decorative; 3:1 is the floor. */
  rule: string;
  /** The small uppercase label. Text on the card, so 4.5:1 against surface. */
  eyebrow: string;
  /** Button fill, paired with `ink` below to clear 4.5:1. */
  fill: string;
  ink: string;
}

export interface ShellInput {
  /** Inbox preview line. Shown next to the subject before anything is opened. */
  preheader: string;
  /** Small uppercase label above the headline, e.g. "Draft". */
  eyebrow: string;
  accent: Accent;
  headline: string;
  body: string;
  cta?: { label: string; url: string };
  /** Sits under the button in smaller type, e.g. league and round detail. */
  detail?: string;
  /** "You're getting this because…" plus the opt-out links. */
  footerReason: string;
  unsubscribeUrl?: string;
  settingsUrl: string;
}

export function renderShell(input: ShellInput): string {
  const {
    preheader,
    eyebrow,
    accent,
    headline,
    body,
    cta,
    detail,
    footerReason,
    unsubscribeUrl,
    settingsUrl,
  } = input;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND.canvas};color:${BRAND.ink};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:${BRAND.canvas};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.canvas};">
<tr><td align="center" style="padding:28px 16px 40px 16px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">

  <tr><td style="padding:0 4px 20px 4px;">${wordmark()}</td></tr>

  <tr><td style="background-color:${BRAND.surface};border:1px solid ${BRAND.hairline};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="height:3px;line-height:3px;font-size:3px;background-color:${accent.rule};">&nbsp;</td></tr>
      <tr><td style="padding:28px 28px 30px 28px;">
        <p style="margin:0 0 10px 0;font-family:${TEXT_STACK};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${accent.eyebrow};">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0;font-family:${TEXT_STACK};font-size:23px;line-height:30px;font-weight:700;color:${BRAND.ink};">${escapeHtml(headline)}</h1>
        <p style="margin:12px 0 0 0;font-family:${TEXT_STACK};font-size:15px;line-height:23px;color:${BRAND.muted};">${escapeHtml(body)}</p>
        ${cta ? button(cta.label, cta.url, accent) : ''}
        ${
          detail
            ? `<p style="margin:18px 0 0 0;padding-top:16px;border-top:1px solid ${BRAND.hairline};font-family:${TEXT_STACK};font-size:13px;line-height:19px;color:${BRAND.muted};">${escapeHtml(detail)}</p>`
            : ''
        }
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 12px 0 12px;">
    <p style="margin:0;font-family:${TEXT_STACK};font-size:12px;line-height:19px;color:${BRAND.muted};">${escapeHtml(footerReason)}</p>
    <p style="margin:8px 0 0 0;font-family:${TEXT_STACK};font-size:12px;line-height:19px;color:${BRAND.muted};">
      <a href="${escapeHtml(settingsUrl)}" style="color:${BRAND.goldDeep};text-decoration:underline;">Email settings</a>${
        unsubscribeUrl
          ? ` &nbsp;·&nbsp; <a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe from these</a>`
          : ''
      }
    </p>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

/** Ascending tally plus the red pip — the app's mark, in table cells. */
function wordmark(): string {
  const bar = (height: number, color: string) =>
    `<td valign="bottom" style="padding-right:4px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:5px;height:${height}px;line-height:${height}px;font-size:1px;background-color:${color};">&nbsp;</td></tr></table></td>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td valign="bottom" style="padding-right:10px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      ${bar(11, BRAND.slate)}${bar(17, BRAND.gold)}${bar(23, BRAND.gold)}
      <td valign="top" style="padding-left:1px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:6px;height:6px;line-height:6px;font-size:1px;background-color:${BRAND.danger};border-radius:3px;">&nbsp;</td></tr></table></td>
    </tr></table>
  </td>
  <td valign="bottom" style="font-family:${DISPLAY_STACK};font-size:21px;letter-spacing:1.5px;line-height:22px;">
    <span style="color:${BRAND.ink};">COMP</span><span style="color:${BRAND.gold};">&nbsp;BEAST</span>
  </td>
</tr></table>`;
}

/**
 * Outlook ignores padding on anchors, so the button is a table cell with the
 * link stretched inside it. Without this it renders as bare blue text.
 */
function button(label: string, url: string, accent: Accent): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
    <td align="center" style="background-color:${accent.fill};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:${TEXT_STACK};font-size:14px;font-weight:700;line-height:18px;color:${accent.ink};text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

/**
 * The plain-text alternative.
 *
 * Not a nicety: a message with no text part is scored as spam by most
 * filters, and there is no point building alerts nobody receives.
 */
export function renderText(input: {
  headline: string;
  body: string;
  cta?: { label: string; url: string };
  detail?: string;
  footerReason: string;
  unsubscribeUrl?: string;
  settingsUrl: string;
}): string {
  const lines = ['COMP BEAST', '', input.headline, '', input.body];
  if (input.detail) lines.push('', input.detail);
  if (input.cta) lines.push('', `${input.cta.label}: ${input.cta.url}`);
  lines.push('', '—', input.footerReason, `Email settings: ${input.settingsUrl}`);
  if (input.unsubscribeUrl) lines.push(`Unsubscribe from these: ${input.unsubscribeUrl}`);
  return lines.join('\n');
}
