// Architecture rules of the modulos-backend skill, as ESLint flat-config blocks (NestJS + Prisma).
// Add them to eslint.config.mjs:
//   import boundaries from './eslint.boundaries.mjs';
//   export default [...yourConfig, ...boundaries];
// `import/no-cycle` needs eslint-plugin-import (or eslint-plugin-import-x): npm i -D eslint-plugin-import
// Adjust PRISMA_SERVICE to the path of your Prisma service.
import importPlugin from 'eslint-plugin-import';

const PRISMA_SERVICE = ['**/prisma.service', '**/prisma/prisma.service', '@/prisma/*'];

const noDatabase = {
  paths: [{ name: '@prisma/client', importNames: ['PrismaClient'], message: 'Only *.repository.ts and adapters/** touch the database.' }],
  patterns: [{ group: PRISMA_SERVICE, message: 'Only *.repository.ts and adapters/** touch the database.' }],
};

export default [
  {
    // Controller → Service → Repository: the database only in repositories and adapters.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.repository.ts', 'src/**/adapters/**', 'src/**/prisma/**', 'src/**/*.spec.ts', 'test/**'],
    rules: { 'no-restricted-imports': ['error', noDatabase] },
  },
  {
    // A controller never skips the service.
    files: ['src/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...noDatabase,
          patterns: [...noDatabase.patterns, { group: ['**/*.repository'], message: 'A controller calls its service, never a repository.' }],
        },
      ],
    },
  },
  {
    // The module graph is acyclic (a child never imports its parent; foreign data comes through a port).
    files: ['src/**/*.ts'],
    plugins: { import: importPlugin },
    rules: { 'import/no-cycle': ['error', { maxDepth: 10, ignoreExternal: true }] },
  },
];
