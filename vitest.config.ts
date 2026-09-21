import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Claude Code keeps git worktrees under .claude/, each a full copy of the
    // repo. Without this, every test file ran once per worktree.
    exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
  },
});
