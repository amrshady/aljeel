const next = require('@aljeel/config/eslint/next');

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];
