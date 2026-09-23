/**
 * The Traitors: which side a player is on, as the source states it —
 * "Traitor", "Faithful", "Accomplice" — written to the contestant's metadata
 * by the adapter once the broadcast has revealed it. Null for every other
 * show, and for a Traitors player the source has not placed yet.
 */
export function affiliationOf(metadata: unknown): string | null {
  const value = (metadata as { affiliation?: unknown } | null)?.affiliation;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Whether they held a cloak. An Accomplice helps the Traitors but is not one. */
export function isTraitor(metadata: unknown): boolean {
  return /\btraitor\b/i.test(affiliationOf(metadata) ?? '');
}
