import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Applicants upload their last 90 days of bank statements to the
  // finalizeDocumentsAndVerify Server Action. The Next.js default body
  // limit is 1MB, which silently rejected most statement PDFs (1-5MB+) —
  // the application was created but the statement never saved. Raise it
  // to comfortably cover real statements (the app's own rule still caps
  // each file at max_file_size_mb).
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },

  // Allow brand logos served by Simple Icons CDN. Used on the
  // /cash-advance hub + leaf pages to show each platform's logo
  // next to its name. SVG is unoptimized by next/image; we use
  // <img> tags or unoptimized={true} when displaying these.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.simpleicons.org" },
      // Google Favicons fallback for platforms not on Simple Icons
      // (Shipt, Rover, TaskRabbit, GoPuff, Veho, Roadie, etc.)
      { protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons" },
    ],
  },

  // Permanent redirects from the old "loan" URLs to "advance" URLs.
  // PennyLime is a cash advance product, not a loan — the URL space was
  // renamed to match the product framing.
  async redirects() {
    return [
      // www → apex. Ahrefs flagged www.pennylime.com as a 404; this catches it
      // at the Next.js layer in case DNS / CDN ever forwards www traffic here.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.pennylime.com" }],
        destination: "https://pennylime.com/:path*",
        permanent: true,
      },
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
      // Blog article slug renames (DB sweep moved these). Permanent so old
      // inbound links / SEO equity transfer to the new URLs.
      { source: "/blog/bank-statement-loans-explained-gig-workers", destination: "/blog/bank-statement-advances-explained-gig-workers", permanent: true },
      { source: "/blog/doordash-driver-loans-how-to-qualify", destination: "/blog/doordash-driver-advances-how-to-qualify", permanent: true },
      { source: "/blog/fiverr-income-freelancer-personal-loans", destination: "/blog/fiverr-income-freelancer-cash-advance", permanent: true },
      { source: "/blog/emergency-loan-uber-driver", destination: "/blog/emergency-advance-uber-driver", permanent: true },
      { source: "/blog/non-qm-loans-self-employed-guide", destination: "/blog/non-qm-advances-self-employed-guide", permanent: true },
      { source: "/blog/amazon-flex-loans-delivery-income", destination: "/blog/amazon-flex-advances-delivery-income", permanent: true },
      { source: "/blog/upwork-freelancers-loan-approval-contract-income", destination: "/blog/upwork-freelancers-advance-approval-contract-income", permanent: true },
      { source: "/blog/refinancing-loan-gig-worker-when-how", destination: "/blog/refinancing-advance-gig-worker-when-how", permanent: true },
      { source: "/blog/loan-approval-tips-gig-workers", destination: "/blog/advance-approval-tips-gig-workers", permanent: true },
      { source: "/blog/pennylime-vs-payday-loans-difference-matters", destination: "/blog/pennylime-vs-payday-advances-difference-matters", permanent: true },
      { source: "/blog/turo-host-loans-car-rental-income", destination: "/blog/turo-host-advances-car-rental-income", permanent: true },
      { source: "/blog/shipt-shopper-loan-guide", destination: "/blog/shipt-shopper-advance-guide", permanent: true },
      { source: "/blog/rover-pet-sitter-loans-pet-care-income", destination: "/blog/rover-pet-sitter-advances-pet-care-income", permanent: true },
      { source: "/blog/thumbtack-pro-loans-home-services-business", destination: "/blog/thumbtack-pro-advances-home-services-business", permanent: true },
      { source: "/blog/what-happens-default-gig-worker-loan", destination: "/blog/what-happens-default-gig-worker-advance", permanent: true },
      { source: "/blog/1099-loans-complete-guide-gig-workers", destination: "/blog/1099-advances-complete-guide-gig-workers", permanent: true },
      { source: "/blog/cosigner-gig-worker-loan-pros-cons-risks", destination: "/blog/cosigner-gig-worker-advance-pros-cons-risks", permanent: true },
      { source: "/blog/gig-workers-business-loans-complete-guide", destination: "/blog/gig-workers-business-advances-complete-guide", permanent: true },

      // Platform landing pages — slug migration from /advances/[short] to
      // /cash-advance/[descriptive] for stronger keyword targeting.
      { source: "/advances", destination: "/cash-advance", permanent: true },
      { source: "/advances/uber", destination: "/cash-advance/uber-drivers", permanent: true },
      { source: "/advances/doordash", destination: "/cash-advance/doordash-dashers", permanent: true },
      { source: "/advances/lyft", destination: "/cash-advance/lyft-drivers", permanent: true },
      { source: "/advances/amazon-flex", destination: "/cash-advance/amazon-flex-drivers", permanent: true },
      { source: "/advances/instacart", destination: "/cash-advance/instacart-shoppers", permanent: true },
      { source: "/advances/grubhub", destination: "/cash-advance/grubhub-drivers", permanent: true },
      { source: "/advances/postmates", destination: "/cash-advance/postmates-couriers", permanent: true },
      { source: "/advances/shipt", destination: "/cash-advance/shipt-shoppers", permanent: true },
      { source: "/advances/turo", destination: "/cash-advance/turo-hosts", permanent: true },
      { source: "/advances/rover", destination: "/cash-advance/rover-sitters", permanent: true },
      { source: "/advances/taskrabbit", destination: "/cash-advance/taskrabbit-taskers", permanent: true },
      { source: "/advances/thumbtack", destination: "/cash-advance/thumbtack-pros", permanent: true },
      { source: "/advances/fiverr", destination: "/cash-advance/fiverr-freelancers", permanent: true },
      { source: "/advances/upwork", destination: "/cash-advance/upwork-freelancers", permanent: true },
    ];
  },
};

export default nextConfig;
