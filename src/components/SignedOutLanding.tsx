'use client';

import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
} satisfies import('framer-motion').Variants;

/**
 * The signed-out pitch.
 *
 * Everything below the sign-in button is `live` — the cast marquee, the last
 * scored events, and the X timeline — passed in as a slot rather than built
 * here, because the signed-in home page renders the identical block under its
 * league rail. Rendering it as children also keeps it a server component
 * inside this client one, so the marquee and its avatars stay off the
 * JavaScript bundle.
 */
export function SignedOutLanding({ live }: { live: ReactNode }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="pt-6 text-center">
      <motion.h1
        variants={item}
        className="mt-4 font-display text-5xl leading-[0.95] tracking-wide sm:text-[64px] lg:text-[76px]"
      >
        DRAFT THE HOUSE.
        <br />
        <span className="text-brand-gold">OWN THE LEADERBOARD.</span>
      </motion.h1>

      <motion.p
        variants={item}
        className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-muted sm:max-w-md sm:text-md"
      >
        Fantasy leagues for reality TV. Draft real houseguests, score every HOH, veto, and
        blindside, and chase the board live as episodes air.
      </motion.p>

      <motion.div variants={item}>
        <SignInButton mode="modal">
          {/* Full-bleed on a phone where it is the only thing to tap; sized to
              its own text once the hero is wide enough that a 700px button
              would read as a banner rather than a control. */}
          <button type="button" className="btn-primary mt-6 w-full py-3.5 text-md sm:w-auto sm:px-12">
            Sign In
          </button>
        </SignInButton>
      </motion.div>

      <motion.div variants={item} className="mt-10">
        {live}
      </motion.div>

      {/* Three equal claims, so they sit as a row the moment there is width
          for one — stacked on a phone, side by side everywhere else. */}
      <motion.div variants={item} className="mt-10 grid gap-3 text-left sm:grid-cols-3">
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

      <motion.div
        variants={item}
        className="mt-10 flex items-center justify-center gap-3 text-xs text-brand-gold-deep"
      >
        <Link href="/seasons">Browse seasons</Link>
        <span className="text-muted">·</span>
        <Link href="/rules">See scoring rules</Link>
      </motion.div>
    </motion.div>
  );
}

function FeatureRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
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
