import { formatPoints } from '@/lib/ui';
import type { PointHistoryPoint } from '@/server/queries';

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_Y = 10;

/**
 * Cumulative points across a season.
 *
 * Hand-rolled SVG rather than a charting library: this draws one polyline and
 * some dots, and the smallest credible chart dependency is larger than the
 * whole page it would sit on. It is also a **server component** as a result —
 * no hover tooltips means no client JavaScript at all, and the exact numbers
 * live in the table below instead, where a screen reader can reach them.
 *
 * No text is drawn inside the SVG. The viewBox scales to the container, and
 * anything typeset in viewBox units would scale with it — legible on a
 * desktop, six pixels tall on a phone. Labels are real HTML around the chart.
 */
export function PointHistoryChart({ history, caption }: { history: PointHistoryPoint[]; caption: string }) {
  if (history.length === 0) {
    return (
      <p className="rounded-btn border border-dashed border-hairline p-4 text-2xs text-muted">
        No weeks have been scored yet. The chart fills in as the season airs.
      </p>
    );
  }

  const values = history.map((point) => point.cumulativePoints);
  // 0 is always in range, so a season that starts negative still reads against
  // the line it crossed rather than against its own worst week.
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  // A season nobody has scored in yet is every new league's first chart, and
  // it is entirely flat. Dividing by a zero span is the obvious hazard, but
  // the subtler one is that any fallback scale pins that flat line to the
  // bottom edge, where it reads as a rendering failure rather than as "no
  // points yet". Centring it makes the empty case look deliberate.
  const flat = rawMax === rawMin;
  const span = flat ? 1 : rawMax - rawMin;

  const x = (index: number) => (history.length === 1 ? VIEW_W / 2 : (index / (history.length - 1)) * VIEW_W);
  const y = (value: number) =>
    flat ? VIEW_H / 2 : VIEW_H - PAD_Y - ((value - rawMin) / span) * (VIEW_H - PAD_Y * 2);

  const points = history.map((point, index) => ({
    cx: x(index),
    cy: y(point.cumulativePoints),
    point,
  }));

  const line = points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const area = `${line} ${VIEW_W},${VIEW_H} 0,${VIEW_H}`;
  const zeroY = y(0);
  const latest = history[history.length - 1];
  const tableId = `history-${caption.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-describedby={tableId}
        aria-label={`${caption}: ${formatPoints(latest.cumulativePoints)} points after ${history.length} ${history.length === 1 ? 'week' : 'weeks'}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="pointHistoryFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The zero line only earns its place when the series actually crosses
            it; otherwise it is a second baseline competing with the axis. */}
        {rawMin < 0 && (
          <line
            x1="0"
            x2={VIEW_W}
            y1={zeroY}
            y2={zeroY}
            stroke="rgba(248,250,252,0.16)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <polygon points={area} fill="url(#pointHistoryFill)" />
        <polyline
          points={line}
          fill="none"
          stroke="#FBBF24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          // preserveAspectRatio="none" stretches the viewBox horizontally, so
          // without this the stroke stretches with it and the line renders
          // thicker than it is tall.
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p) => (
          <circle
            key={p.point.sequence}
            cx={p.cx}
            cy={p.cy}
            r="3"
            fill="#0F172A"
            stroke="#FBBF24"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="mt-2 flex items-baseline justify-between text-2xs text-muted">
        <span>{history[0].label}</span>
        {history.length > 2 && <span aria-hidden>{history[Math.floor(history.length / 2)].label}</span>}
        <span>{latest.label}</span>
      </div>

      {/* The chart is a picture of this. Anyone who cannot use the picture —
          screen reader, or just wanting the actual number for week 3 — gets
          the same data here. */}
      <figcaption id={tableId} className="sr-only">
        <table>
          <caption>{caption} week by week</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Points that week</th>
              <th scope="col">Running total</th>
              <th scope="col">Rank</th>
            </tr>
          </thead>
          <tbody>
            {history.map((point) => (
              <tr key={point.sequence}>
                <th scope="row">{point.label}</th>
                <td>{formatPoints(point.cyclePoints)}</td>
                <td>{point.cumulativePoints}</td>
                <td>{point.rank ?? 'unranked'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
