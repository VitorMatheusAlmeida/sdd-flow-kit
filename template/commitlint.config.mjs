// Commit messages in Conventional Commits (husky commit-msg → `npx --no -- commitlint --edit "$1"`).
// type(scope): subject — feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The subject is written in the project language, lowercase, imperative, no final period.
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
};
