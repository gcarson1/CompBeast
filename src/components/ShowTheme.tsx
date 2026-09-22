import type { CSSProperties, ReactNode } from 'react';
import { themeFor } from '@/lib/shows/registry';

/**
 * Paints a subtree in one show's colours.
 *
 * Wrap the pages that belong to a show — a season, a league, a team, a
 * player — and anything inside that says `bg-show-accent`, `text-show-deep`
 * or `<Tag tone="show">` takes that show's hue. Pages outside a wrapper
 * keep the brand gold (`:root` in globals.css), so the site's own surfaces
 * never borrow a show's identity. A server component: the colours are plain
 * custom properties, so there is nothing to hydrate.
 */
export function ShowTheme({ showSlug, children }: { showSlug: string; children: ReactNode }) {
  const theme = themeFor(showSlug);
  const style = {
    '--show-accent': theme.accent,
    '--show-accent-deep': theme.accentDeep,
    '--show-accent-soft': theme.accentSoft,
    '--show-glow': theme.glow,
  } as CSSProperties;

  return (
    <div data-show={showSlug} style={style} className="contents">
      {children}
    </div>
  );
}
