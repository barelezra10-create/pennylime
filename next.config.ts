import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permanent redirect from the old /loans/* URLs to /advances/*.
  // PennyLime is a cash advance product, not a loan — the URL space was
  // renamed to match the product framing.
  async redirects() {
    return [
      {
        source: "/loans/:slug*",
        destination: "/advances/:slug*",
        permanent: true,
      },
      { source: "/tools/loan-calculator", destination: "/tools/advance-calculator", permanent: true },
      { source: "/tools/loan-comparison", destination: "/tools/advance-comparison", permanent: true },
      {
        source: "/tools/loan-affordability-calculator",
        destination: "/tools/advance-affordability-calculator",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
