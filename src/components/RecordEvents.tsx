'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn, formatPoints } from '@/lib/ui';

export interface RecordableSeason {
  id: string;
  name: string;
  cycles: Array<{ id: string; label: string }>;
  /** The cycle to start on: the latest one that has aired. */
  currentCycleId: string | null;
  contestants: Array<{ id: string; name: string; isActive: boolean }>;
  /** The show's word for them, lower-cased: "houseguests", "players". */
  contestantPlural: string;
  events: Array<{
    code: string;
    label: string;
    category: string;
    points: number;
    isVariable: boolean;
  }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  COMPETITION_GAMEPLAY: 'Competition & gameplay',
  ELIMINATION_ENDGAME: 'Elimination & endgame',
  SOCIAL_DRAMA: 'Social & drama',
};

/**
 * Records what a results page never says: the week's Have-Nots, who won the
 * Blockbuster, America's Favorite Player on Big Brother; the dagger or the
 * seer on The Traitors; the alliances, blowups and episode titles every
 * show's Drama & Social scores — the events no source publishes.
 *
 * One event, one cycle, any number of contestants: the four Have-Nots of a
 * week go in as one submission. It writes through the same ledger as the
 * ingestion pipeline (`/api/admin/events`), so every league on the season is
 * rescored at once, and the toast offers an undo that voids what was just
 * written rather than deleting it.
 */
export function RecordEvents({ seasons }: { seasons: RecordableSeason[] }) {
  const router = useRouter();
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? '');
  const season = seasons.find((s) => s.id === seasonId) ?? seasons[0];
  const [cycleId, setCycleId] = useState(season?.currentCycleId ?? season?.cycles.at(-1)?.id ?? '');
  const [eventCode, setEventCode] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  const grouped = useMemo(() => {
    const groups = new Map<string, RecordableSeason['events']>();
    for (const event of season?.events ?? []) {
      const list = groups.get(event.category) ?? [];
      list.push(event);
      groups.set(event.category, list);
    }
    return [...groups.entries()];
  }, [season]);

  if (!season) {
    return <p className="list-empty">No season has any weeks yet.</p>;
  }

  const event = season.events.find((e) => e.code === eventCode) ?? null;
  // Still in the game first: a week's events are almost always about them.
  const contestants = [...season.contestants].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
  );

  const chooseSeason = (id: string) => {
    const next = seasons.find((s) => s.id === id);
    setSeasonId(id);
    setCycleId(next?.currentCycleId ?? next?.cycles.at(-1)?.id ?? '');
    setEventCode('');
    setPicked(new Set());
  };

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ready = Boolean(cycleId && event && picked.size > 0 && (!event.isVariable || points.trim() !== ''));

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!ready || !event) return;
    setPending(true);
    try {
      const response = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId,
          events: [...picked].map((contestantId) => ({
            contestantId,
            eventCode: event.code,
            ...(note.trim() ? { note: note.trim() } : {}),
            ...(event.isVariable ? { points: Number(points) } : {}),
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? 'Could not record that.');
        return;
      }
      const ids: string[] = body.ids ?? [];
      toast.success(
        `${event.label} × ${ids.length} recorded · ${body.leaguesRecalculated ?? 0} ${
          body.leaguesRecalculated === 1 ? 'league' : 'leagues'
        } rescored`,
        // Long enough to notice a wrong pick and take it back.
        { duration: 10_000, action: { label: 'Undo', onClick: () => void undo(ids) } },
      );
      setPicked(new Set());
      setNote('');
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const undo = async (ids: string[]) => {
    const results = await Promise.all(
      ids.map((scoredEventId) =>
        fetch('/api/admin/events', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scoredEventId, reason: 'Undone right after recording' }),
        }),
      ),
    );
    if (results.every((r) => r.ok)) toast.success('Undone — those events are voided.');
    else toast.error('Some of those could not be undone; void them from the ledger.');
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4 border-y border-hairline py-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Season</span>
          <select className="field" value={season.id} onChange={(e) => chooseSeason(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Week</span>
          <select className="field" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {season.cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">Event</span>
        <select className="field" value={eventCode} onChange={(e) => setEventCode(e.target.value)}>
          <option value="">Choose what happened…</option>
          {grouped.map(([category, events]) => (
            <optgroup key={category} label={CATEGORY_LABELS[category] ?? category}>
              {events.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.label} ({e.isVariable ? 'set per event' : formatPoints(e.points)})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {event?.isVariable && (
        <label className="block">
          <span className="label">Points</span>
          <input
            className="field"
            type="number"
            inputMode="numeric"
            step="1"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="e.g. −16 for the first one out"
          />
        </label>
      )}

      <fieldset>
        <legend className="label">
          Who{picked.size > 0 && <span className="text-ink"> · {picked.size} picked</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {contestants.map((contestant) => {
            const on = picked.has(contestant.id);
            return (
              <button
                key={contestant.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(contestant.id)}
                className={cn(
                  'btn-sm btn border',
                  on
                    ? 'border-brand-gold bg-brand-gold text-on-gold'
                    : 'border-hairline bg-canvas text-ink hover:bg-surface-raised',
                  !contestant.isActive && !on && 'text-muted',
                )}
              >
                {contestant.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block">
        <span className="label">Note (optional)</span>
        <input
          className="field"
          value={note}
          maxLength={280}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Time capsule — first key"
        />
      </label>

      <button type="submit" disabled={!ready || pending} aria-busy={pending} className="btn-primary w-full">
        {pending
          ? 'Recording…'
          : picked.size > 1
            ? `Record for ${picked.size} ${season.contestantPlural}`
            : 'Record'}
      </button>
    </form>
  );
}
