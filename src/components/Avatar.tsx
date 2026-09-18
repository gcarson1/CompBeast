'use client';

import { useState } from 'react';
import { avatarColor, cn, initials } from '@/lib/ui';

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
    return (
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn(
          'inline-block shrink-0 rounded-full object-cover ring-2 ring-surface',
          dimmed && 'opacity-40 grayscale',
          className,
        )}
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

export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;

  return (
    <span className="flex items-center">
      <span className="flex -space-x-2">
        {shown.map((name) => (
          <Avatar key={name} name={name} size={26} />
        ))}
      </span>
      {overflow > 0 && <span className="ml-2 text-[13px] text-muted">+{overflow}</span>}
    </span>
  );
}
