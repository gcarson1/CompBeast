/**
 * Expected, explainable failures — "this league is full", "you already asked".
 *
 * Split out of mutations.ts so the newer server modules can throw one without
 * importing that file's whole dependency graph (Prisma, the scoring engine,
 * the draft logic) just to reach a two-line class.
 *
 * `code` is the stable machine name tests assert on; `message` is written for
 * the person who hit it and is safe to render verbatim. Anything thrown that
 * is *not* a DomainError is a bug, and the action layer turns those into a
 * generic message rather than leaking internals.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
