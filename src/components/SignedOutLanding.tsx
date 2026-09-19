'use client';

import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { TwitterFeed } from '@/components/TwitterFeed';
import { formatPoints, pointsTone } from '@/lib/ui';
import type { SeasonHeadline } from '@/server/queries';

export interface FeaturedCast {
  seasonSlug: string;
  seasonName: string;
  cast: Array<{ name: string; photoUrl: string }>;
}

// The community hashtag isn't derivable from season data (no guarantee
// "big-brother-29" -> "BB29" is what people actually use), so this is a
// manual knob to update each season rather than an auto-guess that could
// quietly point at the wrong tag.
const LIVE_HASHTAG = 'BB28';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
} satisfies import('framer-motion').Variants;

export function SignedOutLanding({
  featured,
  headlines,
}: {
  featured: FeaturedCast | null;
  headlines: SeasonHeadline[];
}) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="pt-6 text-center">
      <motion.h1 variants={item} className="mt-4 font-display text-5xl leading-[0.95] tracking-wide">
        DRAFT THE HOUSE.
        <br />
        <span className="text-brand-gold">OWN THE LEADERBOARD.</span>
      </motion.h1>

      <motion.p variants={item} className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-muted">
        Fantasy leagues for reality TV. Draft real houseguests, score every HOH, veto, and
        blindside, and chase the board live as episodes air.
      </motion.p>

      <motion.div variants={item}>
        <SignInButton mode="modal">
          <button type="button" className="btn-primary mt-6 w-full py-3.5 text-md">
            Sign In
          </button>
        </SignInButton>
      </motion.div>

      {featured && (
        <motion.div variants={item} className="mt-10 text-left">
          <div className="flex items-center justify-between">
            <span className="pill flex items-center gap-1.5 bg-brand-gold-soft text-2xs text-brand-gold-deep">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
              Airing now
            </span>
            <Link href={`/seasons/${featured.seasonSlug}`} className="text-2xs text-brand-gold-deep">
              {featured.seasonName} →
            </Link>
          </div>
          <CastTicker cast={featured.cast} />
        </motion.div>
      )}

      {headlines.length > 0 && (
        <motion.div variants={item} className="mt-6">
          <HeadlineTicker headlines={headlines} />
        </motion.div>
      )}

      <motion.div variants={item} className="mt-10 space-y-3 text-left">
        <FeatureRow
          icon={<DraftIcon />}
          title="Draft real houseguests"
          body="Snake-draft the live cast before the season locks in."
        />
        <FeatureRow
          icon={<BoltIcon className="h-5 w-5" />}
          title="Score every move"
          body="HOH wins, vetos, blindsides, and blowups all count toward your team."
        />
        <FeatureRow
          icon={<RankIcon />}
          title="Live leaderboard"
          body="Ranks update episode by episode, all season long."
        />
      </motion.div>

      <motion.div variants={item} className="mt-10 text-left">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Live: #{LIVE_HASHTAG} on X
          </h2>
        </div>
        <div className="card mt-3 overflow-hidden p-1">
          <TwitterFeed hashtag={LIVE_HASHTAG} />
        </div>
      </motion.div>

      <motion.div variants={item} className="mt-8 flex items-center justify-center gap-3 text-xs text-brand-gold-deep">
        <Link href="/seasons">Browse seasons</Link>
        <span className="text-muted">·</span>
        <Link href="/rules">See scoring rules</Link>
      </motion.div>
    </motion.div>
  );
}

/** Seamless infinite scroll: the cast list is duplicated and translated by
 * exactly half its width, so the loop point is invisible. */
function CastTicker({ cast }: { cast: FeaturedCast['cast'] }) {
  const reduceMotion = useReducedMotion();
  const looped = [...cast, ...cast];

  return (
    <div className="no-scrollbar mt-3 overflow-hidden">
      <motion.div
        className="flex w-max gap-4"
        animate={reduceMotion ? undefined : { x: ['0%', '-50%'] }}
        transition={reduceMotion ? undefined : { duration: cast.length * 2.5, ease: 'linear', repeat: Infinity }}
      >
        {looped.map((c, i) => (
          <div key={`${c.name}-${i}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <Avatar name={c.name} photoUrl={c.photoUrl} size={56} />
            <span className="w-full truncate text-center text-2xs text-muted">{c.name.split(' ')[0]}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/** Cycles one real recent scoring event at a time, like a breaking-news bar. */
function HeadlineTicker({ headlines }: { headlines: SeasonHeadline[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (headlines.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % headlines.length), 3800);
    return () => clearInterval(id);
  }, [headlines.length]);

  const headline = headlines[index];

  return (
    <div className="card overflow-hidden p-4">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
        Just happened
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={headline.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="mt-2 flex items-center justify-between gap-3"
        >
          <span className="min-w-0 truncate text-sm font-medium">
            <span className="font-semibold">{headline.contestantName}</span> — {headline.eventLabel}
          </span>
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${pointsTone(headline.points)}`}>
            {formatPoints(headline.points)}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function FeatureRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gold-soft text-brand-gold-deep">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-muted">{body}</span>
      </span>
    </div>
  );
}

function DraftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" strokeLinecap="round" />
    </svg>
  );
}

function RankIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 20v-6M12 20V9M18 20V4" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" strokeLinejoin="round" />
    </svg>
  );
}
