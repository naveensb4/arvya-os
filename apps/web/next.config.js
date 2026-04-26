/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");

const nextConfig = {
  transpilePackages: ["@arvya/core", "@arvya/agents", "@arvya/prompts"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

module.exports = nextConfig;
