'use client';

import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

// 280ms, inside the 150–300ms band. The previous 450ms read as the page
// assembling itself in front of you rather than as a settle.
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } },
} satisfies import('framer-motion').Variants;

/**
 * Three claims as a numbered, hairline-separated list on a narrow/wide column
 * split — deliberately not a three-up card grid. Cards here would be three
 * equal boxes of two sentences each, which is the shape every generated
 * landing page reaches for, and it flattens the claims into decoration
 * instead of letting them read in order.
 */
const CLAIMS = [
  {
    step: '01',
    title: 'Draft real houseguests',
    body: 'Snake-draft the live cast before the season locks in.',
  },
  {
    step: '02',
    title: 'Score every move',
    body: 'HOH wins, vetos, blindsides and blowups all count toward your team.',
  },
  {
    step: '03',
    title: 'Live leaderboard',
    body: 'Ranks update episode by episode, all season long.',
  },
];

/**
 * The signed-out pitch.
 *
 * Everything below the call to action is `live` — the cast marquee, the last
 * scored events, and the X timeline — passed in as a slot rather than built
 * here, because the signed-in home page renders the identical block under its
 * league rail. Rendering it as children also keeps it a server component
 * inside this client one, so the marquee and its avatars stay off the
 * JavaScript bundle.
 *
 * Copy is left-aligned throughout. Centring a whole page is the fastest way
 * to make it read as generated: it gives every block the same axis, so
 * nothing leads, and it forces the eye to re-find the start of each line.
 */
export function SignedOutLanding({ live }: { live: ReactNode }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="pt-6">
      <motion.p
        variants={item}
        className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-gold-deep"
      >
        Fantasy leagues for reality TV
      </motion.p>

      <motion.h1
        variants={item}
        className="mt-3 font-display text-5xl leading-[0.92] tracking-wide sm:text-[64px] lg:text-[76px]"
      >
        DRAFT THE HOUSE.
        <br />
        <span className="text-brand-gold">OWN THE LEADERBOARD.</span>
      </motion.h1>

      {/* The lede sits on a measure, not on the container's width: the display
          face wants the full column, body copy does not. The two different
          widths are what give the block its asymmetry. */}
      <motion.p variants={item} className="mt-5 max-w-measure text-md leading-relaxed text-muted">
        Draft real houseguests, score every HOH, veto and blindside, and chase the board live as
        episodes air.
      </motion.p>

      <motion.div variants={item} className="mt-7 flex flex-wrap items-center gap-3">
        <SignInButton mode="modal">
          <button type="button" className="btn-primary px-10 py-3.5 text-md">
            Sign in
          </button>
        </SignInButton>
        <Link href="/rules" className="btn-ghost">
          See scoring rules
        </Link>
      </motion.div>

      <motion.div variants={item} className="mt-14">
        {live}
      </motion.div>

      <motion.section variants={item} className="mt-14" aria-labelledby="how-it-works">
        <h2
          id="how-it-works"
          className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          How it works
        </h2>
        <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
          {CLAIMS.map((claim) => (
            <li
              key={claim.step}
              className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-5 sm:grid-cols-[4rem_1fr] sm:gap-x-6"
            >
              {/* Decorative for a screen reader — the list is already
                  ordered, so announcing "01" before every heading is noise —
                  but it is still text someone reads, so it holds AA. Gold at
                  40% measured 2.3:1 on canvas; 70% is 4.6:1 and still reads
                  as a quiet numeral rather than competing with the heading. */}
              <span aria-hidden className="font-display text-xl leading-none text-brand-gold/70">
                {claim.step}
              </span>
              <div>
                <h3 className="text-base font-semibold">{claim.title}</h3>
                <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">{claim.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </motion.section>

      <motion.div variants={item} className="mt-10 text-xs">
        <Link href="/seasons" className="text-brand-gold-deep">
          Browse every season
        </Link>
      </motion.div>
    </motion.div>
  );
}
