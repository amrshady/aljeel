const base = require("./base");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...base,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
