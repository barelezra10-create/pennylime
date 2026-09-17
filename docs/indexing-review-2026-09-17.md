# Conservative indexing follow-up — September 17, 2026

Search Console's September 14 report listed 50 crawled-but-not-indexed URLs: 29 articles, eight state pages, seven assets, two platform pages, two pagination URLs, one category and one agreement. This is not a list of 50 technical failures.

Live URL Inspection: Shipt last crawled June 21; Twitch August 26. Both fetched successfully, allow indexing and declare the correct canonical; Google selected the inspected URL. Neither was indexed at inspection. Twitch reported a temporary sitemap processing error, although its URL exists in the live sitemap.

This release changes only the existing related-platform section on Shipt, Instacart, Twitch, YouTube and Patreon. Grocery shoppers get relevant grocery/delivery peers, and video creators get relevant creator/freelancer peers. Instacart links to Shipt; YouTube and Patreon link to Twitch. Existing published-platform filtering and six-card layout remain. Other platforms retain their existing selection.

No title, description, canonical, primary copy, URL, pricing, robots or sitemap changes. No blanket indexing requests or removals. Several excluded articles contain potentially stale tax, payout or eligibility claims that require factual review before further promotion. State pages also need editorial review, not bulk templated expansion. The blog's repetitive latest-three related-post selection is a later opportunity after article review.

Validation: production build and scoped ESLint pass. Rendered comparison of 30 pages confirms only five related-link sections differ; metadata and other text match the production baseline. Audit inventory and before/after snapshots are in /Users/baralezrah/pennylime-indexing-2026-09-17/.

Baseline (Search Console, Aug 18–Sep 14): 1,517 clicks, 19,300 impressions, 7.9% CTR, average position 12.1. Compare affected pages and top acquisition pages after recrawl; indexing and ranking gains are not guaranteed.
