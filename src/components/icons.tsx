import type { ReactNode } from 'react';
import { cn } from '@/lib/ui';

/**
 * The app's icon set: one 24px grid, one 1.8px rounded stroke, drawn in
 * `currentColor` so an icon takes the colour of the text beside it. Every
 * icon is decorative — whatever it sits next to says the same thing in
 * words — so each is `aria-hidden`.
 *
 * These replace a set of die-cut sticker glyphs that were stuck at angles
 * over tile corners. An icon here goes where it means something (a lock
 * beside a locked roster, a crown beside the leader) and nowhere else.
 */
function Svg({
  size = 20,
  className,
  children,
  strokeWidth = 1.8,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number; className?: string };

export function CrownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5 8 12l4-6.5 4 6.5 4.5-3.5-1.8 9.5H5.3Z" />
      <path d="M5.5 21h13" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 15v2" />
    </Svg>
  );
}

export function LockOpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7M12 15v2" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3Z" />
      <path d="M12 9.5V14" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

/** The draft board: a grid of picks. */
export function BoardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8.5 9.5V20M15.5 9.5V20M5.5 13h1M11 13h2M18 13h1M5.5 16.5h1M11 16.5h2" />
    </Svg>
  );
}

/** A cog: eight teeth around a hub. (The glyph it replaced was a sun.) */
export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19.3 9.9 L22.1 10.4 L22.1 13.6 L19.3 14.1 L18.6 15.7 L20.3 18 L18 20.3 L15.7 18.6 L14.1 19.3 L13.6 22.1 L10.4 22.1 L9.9 19.3 L8.3 18.6 L6 20.3 L3.7 18 L5.4 15.7 L4.7 14.1 L1.9 13.6 L1.9 10.4 L4.7 9.9 L5.4 8.3 L3.7 6 L6 3.7 L8.3 5.4 L9.9 4.7 L10.4 1.9 L13.6 1.9 L14.1 4.7 L15.7 5.4 L18 3.7 L20.3 6 L18.6 8.3Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

/**
 * The wordmark's three bars, as a mark to set in a corner: a feature tile,
 * the landing hero. Filled, in `currentColor`, the first bar a step dimmer
 * like the logo's slate one. Purely decorative, and meant to be faint.
 */
export function TallyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 46 44" fill="currentColor" aria-hidden className={cn('pointer-events-none', className)}>
      <polygon points="7,24 14,24 7,44 0,44" opacity="0.55" />
      <polygon points="22,12 29,12 21,44 14,44" />
      <polygon points="37,0 45,0 35,44 27,44" />
    </svg>
  );
}
