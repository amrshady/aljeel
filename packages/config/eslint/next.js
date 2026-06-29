const base = require("./base");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...base,
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      react: require("eslint-plugin-react"),
      "react-hooks": require("eslint-plugin-react-hooks"),
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...require("eslint-plugin-react").configs.recommended.rules,
      ...require("eslint-plugin-react-hooks").configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },
  require("eslint-config-prettier"),
];
