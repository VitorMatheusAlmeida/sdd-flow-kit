// Runs on the staged files only (husky pre-commit → `npx lint-staged`).
// Code: lint with autofix, format, then ONLY the tests related to what changed (created or edited tests
// and the tests that import a changed file). A failure blocks the commit.
// Jest: `--findRelatedTests`. Vitest: replace with `vitest related --run`.
export default {
  '*.{ts,tsx,js,jsx,mjs,cjs}': [
    'eslint --fix --max-warnings=0',
    'prettier --write',
    'jest --bail --findRelatedTests --passWithNoTests',
  ],
  '*.{json,md,yml,yaml,css,scss}': ['prettier --write'],
  // Prisma schema: format and validate (both read the whole schema, so the file list is not passed).
  'prisma/schema.prisma': () => ['prisma format', 'prisma validate'],
};
