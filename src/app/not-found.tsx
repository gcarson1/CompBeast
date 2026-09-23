import Link from 'next/link';
import { TallyMark } from '@/components/icons';
import { Tag } from '@/components/Tag';

/**
 * `notFound()` is called from the league, team, season and player routes,
 * and before this existed they all rendered Next's unstyled stock 404. It is
 * dressed as the show's own moment: a red "eliminated" bug and the number.
 */
export default function NotFound() {
  return (
    <div className="stage pt-10">
      {/* On the page, not in a panel: the tally faint behind the number. */}
      <TallyMark className="absolute -right-2 top-6 h-40 w-40 text-brand-gold opacity-[0.07]" />
      <div className="relative">
        <Tag tone="red">Eliminated</Tag>
        <p aria-hidden className="mt-4 font-display text-[88px] leading-none tracking-wide text-brand-gold">
          404
        </p>

        <h1 className="headline mt-3 text-2xl">This page was voted out</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          It may have been removed, or the link may be wrong.
        </p>

        <div className="relative mt-6 flex flex-wrap gap-2">
          <Link href="/leagues" className="btn-primary">
            My leagues
          </Link>
          <Link href="/seasons" className="btn-ghost">
            Browse seasons
          </Link>
        </div>
      </div>
    </div>
  );
}
