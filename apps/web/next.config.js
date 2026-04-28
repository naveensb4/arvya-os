/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@arvya/core", "@arvya/agents", "@arvya/prompts"],
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

module.exports = nextConfig;
