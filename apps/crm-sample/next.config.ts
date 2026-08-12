import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * `next dev` otherwise writes its own AGENTS.md and CLAUDE.md into this
   * directory on every run. This repository documents agent instructions at
   * the root, so the generated pair is turned off rather than committed and
   * then re-created as an uncommitted change by the next `dev`.
   */
  agentRules: false,
};

export default nextConfig;
