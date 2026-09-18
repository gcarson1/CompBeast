export interface DraftSlot {
  pickNumber: number;
  round: number;
  /** Position within the round, 1-indexed. */
  pickInRound: number;
  teamId: string;
}

/**
 * Expands a draft order into the full pick sequence.
 *
 * Snake drafts reverse direction each round so the team picking last in round 1
 * picks first in round 2, which is what keeps an early pick from compounding
 * into an unbeatable roster. Linear drafts keep the same order every round.
 */
export function buildDraftOrder(
  teamIdsInOrder: string[],
  rounds: number,
  type: 'SNAKE' | 'LINEAR' = 'SNAKE',
): DraftSlot[] {
  const slots: DraftSlot[] = [];
  const teamCount = teamIdsInOrder.length;
  if (teamCount === 0 || rounds <= 0) return slots;

  let pickNumber = 1;
  for (let round = 1; round <= rounds; round += 1) {
    const reversed = type === 'SNAKE' && round % 2 === 0;
    const order = reversed ? [...teamIdsInOrder].reverse() : teamIdsInOrder;
    order.forEach((teamId, index) => {
      slots.push({ pickNumber, round, pickInRound: index + 1, teamId });
      pickNumber += 1;
    });
  }
  return slots;
}

/** The slot that is on the clock given how many picks have already been made. */
export function slotForPick(order: DraftSlot[], picksMade: number): DraftSlot | null {
  return order[picksMade] ?? null;
}

export interface DraftValidationInput {
  order: DraftSlot[];
  picksMade: Array<{ pickNumber: number; teamId: string; contestantId: string }>;
  teamId: string;
  contestantId: string;
  /** Contestants that exist in this season and may be drafted. */
  eligibleContestantIds: Set<string>;
}

export type DraftValidation =
  | { ok: true; slot: DraftSlot }
  | { ok: false; reason: DraftRejection; message: string };

export type DraftRejection =
  | 'DRAFT_COMPLETE'
  | 'NOT_ON_THE_CLOCK'
  | 'CONTESTANT_TAKEN'
  | 'CONTESTANT_INELIGIBLE';

/**
 * Pure validation for a single pick. The database's unique constraints on
 * DraftPick are the real backstop against duplicates under concurrency; this
 * exists so the UI can reject a bad pick with a useful message before a write.
 */
export function validatePick({
  order,
  picksMade,
  teamId,
  contestantId,
  eligibleContestantIds,
}: DraftValidationInput): DraftValidation {
  const slot = slotForPick(order, picksMade.length);
  if (!slot) {
    return { ok: false, reason: 'DRAFT_COMPLETE', message: 'The draft is already complete.' };
  }
  if (slot.teamId !== teamId) {
    return { ok: false, reason: 'NOT_ON_THE_CLOCK', message: 'Another team is on the clock.' };
  }
  if (!eligibleContestantIds.has(contestantId)) {
    return {
      ok: false,
      reason: 'CONTESTANT_INELIGIBLE',
      message: 'That houseguest is not part of this season.',
    };
  }
  if (picksMade.some((p) => p.contestantId === contestantId)) {
    return {
      ok: false,
      reason: 'CONTESTANT_TAKEN',
      message: 'That houseguest has already been drafted.',
    };
  }
  return { ok: true, slot };
}
