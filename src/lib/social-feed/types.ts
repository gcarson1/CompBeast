/** Where a buzz item came from. */
export type SocialSourceId = 'x' | 'show-feed' | 'news';

export interface SocialPost {
  /** Stable per-source id, used as the React key and for dedupe. */
  id: string;
  title: string;
  url: string;
  /** Outlet, blog author, or @handle. Null when the source does not say. */
  author: string | null;
  publishedAt: Date;
  source: SocialSourceId;
}

export interface SocialBuzz {
  posts: SocialPost[];
  /** Which source actually answered, so the UI can attribute it honestly. */
  source: SocialSourceId | null;
  /** Human label for that source, e.g. "#BB28 on X" or "Big Brother Junkies". */
  sourceLabel: string | null;
  sourceUrl: string | null;
}
