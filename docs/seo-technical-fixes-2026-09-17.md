# SEO maintenance — 17 September 2026

This release corrects technical SEO signals while preserving all existing URLs, titles, descriptions, navigation, design and article copy. It is isolated from the original checkout's uncommitted homepage work.

Changes:
- Paginated blog/category pages now self-canonicalize. Page 1 retains the clean URL. Canonicals and rendered queries use the same validated positive page number.
- Cash-advance pages emit one breadcrumb schema and one FAQ schema where FAQs exist, preserving FAQ text and the OnlyFans custom renderer.
- Remove only the robots-blocked /status URL from the sitemap; keep /agreement.
- Correct FinancialProduct's weekly rate from 3–7% to 4–10%, confirmed against read-only production LoanRule settings. No rates, financial calculations or database records changed.
- Strip a leading body H1 only when it exactly duplicates the article title already rendered by the template. The existing 1099 guide is the one affected page in the crawl. Stored article content is untouched.

Validation:
- Production webpack build, including TypeScript and CMS prerendering: passed.
- ESLint on changed application files and git diff --check: passed.
- Compared 179 sitemap URLs plus 14 pagination URLs against the pre-change production snapshot: all 193 HTTP statuses, titles and descriptions preserved; expected canonical changes verified.
- Resulting sitemap has 178 URLs, with /status the only removed entry.
- Verified single breadcrumb and FAQ schemas, retained FAQ contents, pricing correction and valid JSON-LD.
- Rendered content differences reviewed: the intended duplicate H1 removal, and Cloudflare's email obfuscation/adjacent whitespace absent on localhost. No other public copy differences found.

Hosting:
- The application already contains the www-to-apex permanent redirect.
- Added www.pennylime.com to the existing Railway service on port 8080, matching the apex mapping.
- Cloudflare DNS still needs CNAME www -> a87iiwy4.up.railway.app. Existing Cloudflare API credentials are expired; browser sign-in requested. Domain addition alone is not a completed redirect fix.

Follow-up:
- Search Console property access remains unavailable; do not infer traffic trends from the technical crawl.
- Wider repayment-marketing consistency and legal-page descriptions remain separate content work, not included in this small technical release.

Rollback: revert this isolated commit and redeploy. DNS adjustment is separately reversible to the recorded previous www record. No CMS or borrower records were modified.
