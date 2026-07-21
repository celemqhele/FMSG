# Fix: Cookie rejection killing valid job pages

## Problem
`scrapeJobPage()` in `serpapi.ts:637-651` rejects individual job pages (14-20KB) because they contain cookie consent banner text alongside real job content. This kills ALL results from the Google Search source, making the pipeline return 0 jobs.

## Root Cause
Three cookie-related checks fire regardless of content length:
- Line 647: `"cookie" && ("privacy"|"consent"|"policy")` — catches any page with a cookie banner
- Line 649: `"cookie policy" && !"job requirements"` — catches pages without literal "job requirements"
- Line 650: regex `/we\s+(use|use|and|store)\s+cookies/i` — catches cookie consent text

A 17KB careerjunction page with a cookie banner + full job content is treated the same as a 500-char cookie-only page.

## Fix
Split the rejection block into two categories:
1. **Listing page checks** (lines 638-646) — keep as-is, no length guard needed
2. **Cookie checks** (lines 647-650) — only reject when `lowerContent.length < 5000` (page is primarily cookie/consent text)

### Before (serpapi.ts:637-651):
```typescript
if (
  lowerContent.includes("total jobs found") ||
  lowerContent.includes("results for") && lowerContent.includes("jobs in") ||
  lowerContent.includes("search results") ||
  lowerContent.includes("refine your search") ||
  lowerContent.includes("sort by") && lowerContent.includes("per page") ||
  lowerContent.match(/\d+\s+jobs?\s+found/i) ||
  lowerContent.match(/\d+\s+results?\s+for/i) ||
  lowerContent.match(/show\s+\d+\s+\d+\s+\d+/i) ||
  (lowerContent.includes("save this job") && lowerContent.split("save this job").length > 3) ||
  (lowerContent.includes("cookie") && (lowerContent.includes("privacy") || lowerContent.includes("consent") || lowerContent.includes("policy"))) ||
  (lowerContent.includes("we use cookies") && lowerContent.length < 2000) ||
  lowerContent.includes("cookie policy") && !lowerContent.includes("job requirements") ||
  lowerContent.match(/we\s+(use|use|and|store)\s+cookies/i)
) {
```

### After:
```typescript
const isListingPage =
  lowerContent.includes("total jobs found") ||
  (lowerContent.includes("results for") && lowerContent.includes("jobs in")) ||
  lowerContent.includes("search results") ||
  lowerContent.includes("refine your search") ||
  (lowerContent.includes("sort by") && lowerContent.includes("per page")) ||
  lowerContent.match(/\d+\s+jobs?\s+found/i) ||
  lowerContent.match(/\d+\s+results?\s+for/i) ||
  lowerContent.match(/show\s+\d+\s+\d+\s+\d+/i) ||
  (lowerContent.includes("save this job") && lowerContent.split("save this job").length > 3);

const isCookieOnly =
  lowerContent.length < 5000 && (
    (lowerContent.includes("cookie") && (lowerContent.includes("privacy") || lowerContent.includes("consent") || lowerContent.includes("policy"))) ||
    lowerContent.includes("we use cookies") ||
    lowerContent.includes("cookie policy") ||
    lowerContent.match(/we\s+(use|and|store)\s+cookies/i)
  );

if (isListingPage || isCookieOnly) {
```

### Behavior changes:
| Page | Before | After |
|------|--------|-------|
| careerjunction 17KB with cookie banner | REJECTED | PASSED |
| jobmail 17KB with cookie banner | REJECTED | PASSED |
| 500-char cookie-only page | REJECTED | REJECTED (still) |
| Listing page ("total jobs found") | REJECTED | REJECTED (still) |
| Admin manual job post (create-job-post) | Benefits too | Same fix |

## Resilience note
The pipeline already handles partial failures correctly:
- Each source has `.catch()` → returns `[]` on timeout/failure
- Two-step Jina crawl has `withTimeout().catch()` → skips failed URLs
- Merge collects whatever succeeded from each source
- The "No matching jobs found" message at line 1437 is only shown when ALL sources return 0 results

The cookie fix is what will actually produce results for careerjunction/jobmail queries.

## Files modified
1. `src/lib/serpapi.ts` — lines 637-651 (scrapeJobPage rejection logic)
