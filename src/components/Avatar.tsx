'use client';

import Image from 'next/image';
import { useState } from 'react';
import imageHosts from '../../image-hosts';
import { avatarColor, cn, initials } from '@/lib/ui';

/**
 * Whether `next/image` may be used for this URL. The optimizer only accepts
 * the hosts in image-hosts.js, and `next/image` throws — not falls back —
 * on any other, so an unexpected host is drawn with a plain `<img>` instead.
 */
function isOptimizable(url: string): boolean {
  try {
    return imageHosts.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function Avatar({
  name,
  photoUrl,
  size = 40,
  dimmed = false,
  className,
}: {
  name: string;
  /** Contestant headshot, when the source has one. Falls back to initials on load failure. */
  photoUrl?: string | null;
  size?: number;
  dimmed?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (photoUrl && !broken) {
    // Cropped toward the top: some networks publish tall portraits rather
    // than square headshots, and a centred crop of one is a torso. A square
    // photo is unaffected — there is nothing to crop.
    const imgClassName = cn(
      'inline-block shrink-0 rounded-full object-cover object-[50%_18%] ring-2 ring-surface',
      dimmed && 'opacity-40 grayscale',
      className,
    );

    // Resized to what is drawn and re-encoded as WebP/AVIF by the optimizer
    // — a headshot displayed at 56px was arriving as a 25 KB, 375px JPEG.
    if (isOptimizable(photoUrl)) {
      return (
        <Image
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          onError={() => setBroken(true)}
          className={imgClassName}
          style={{ width: size, height: size }}
        />
      );
    }

    return (
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={imgClassName}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface',
        avatarColor(name),
        dimmed && 'opacity-40 grayscale',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  names,
  max = 3,
  total,
}: {
  names: string[];
  max?: number;
  /**
   * The real member count, when `names` is a capped sample of it. Callers
   * that page the names (the home rail takes 4) would otherwise report the
   * size of their own `take` as the size of the league — an eight-person
   * league announcing itself as four.
   */
  total?: number;
}) {
  const shown = names.slice(0, max);
  const count = total ?? names.length;
  const overflow = count - shown.length;

  // The individual avatars are decorative (aria-hidden), so without this the
  // whole roster is invisible to a screen reader — the names appear nowhere
  // else in the markup. One label on the group reads better than N images.
  const label =
    count === 0
      ? 'No members yet'
      : `${count} ${count === 1 ? 'member' : 'members'}: ${names.join(', ')}${
          count > names.length ? ', and others' : ''
        }`;

  return (
    <span className="flex items-center" role="img" aria-label={label}>
      <span className="flex -space-x-2">
        {shown.map((name) => (
          <Avatar key={name} name={name} size={26} />
        ))}
      </span>
      {overflow > 0 && (
        <span aria-hidden className="ml-2 text-xs text-muted">
          +{overflow}
        </span>
      )}
    </span>
  );
}
