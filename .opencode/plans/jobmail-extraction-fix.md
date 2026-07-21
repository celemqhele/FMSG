# Fix: Jobmail extraction + process all Google Search URLs

## Problem 1: Jobmail title/company/description extraction
Sidebar content before actual job content → wrong title, garbage company, useless description.

## Problem 2: Only 5 of 40 Google Search URLs processed
`googlePages.slice(0, 5)` at `route.ts:372` caps the crawl to 5 URLs. pnet/indeed/linkedin URLs never get scraped.

---

## Fix 1: Title — skip sidebar headings (`serpapi.ts:663`)

If the first `# heading` matches a sidebar pattern like "N **Category** jobs in **Location**", skip it.

**Detection:** `/^[\d,*]+\s+\*{0,2}[\w\s/]+\*{0,2}\s+jobs?\s+in\s+/i`

**Fallback chain:**
1. First non-sidebar `#`/`##` heading in content
2. `ogTitle` from Jina metadata
3. Title from URL slug (e.g., `sales-representatives-telecommunications-id-7119804` → "Sales Representatives Telecommunications")
4. First non-empty line under 120 chars (current fallback)

## Fix 2: Company — structured patterns only (`serpapi.ts:676-683`)

Replace greedy `at/@` with structured labels:
```typescript
/(?:company|employer|organisation|hiring\s+(?:company|organisation)):\s*(.+)/i
/\*\*(?:Company|Employer)\*\*:\s*(.+)/i
```
No match → "Unknown" (instead of picking up sidebar text).

## Fix 3: Description — extract from title position (`serpapi.ts:700`)

After finding the real title, extract description from that position forward:
```typescript
const titleIdx = content.indexOf(title);
const start = titleIdx >= 0 ? titleIdx : 0;
description: content.slice(start, start + 3000)
```

## Fix 4: Process ALL Google Search URLs (`route.ts:369-413`)

Replace the sequential capped loop with a two-phase parallel approach:

### Phase 1: Classify + extract (parallel)
For each URL in `googlePages`, classify it and extract individual URLs from listing pages — all in parallel via `Promise.all`.

### Phase 2: Scrape (parallel batches)
Collect all individual URLs from Phase 1, then scrape in parallel batches of 5 concurrent Jina calls. Each call has a 15s timeout. The existing Jina rate limiter (40/hour) handles quota automatically.

### Global timeout
Wrap the entire crawl phase in `withTimeout(..., 90_000, "Google Search crawl")`. If it exceeds 90s, return whatever was scraped so far.

### Why parallelism matters
- 40 Google Search URLs → ~5 listing pages → ~40 individual URLs + ~35 direct pages = ~75 URLs
- Jina rate limit: 40/hour → effectively caps calls at 40
- Sequential: 40 × 5s = 200s (way over timeout)
- Parallel (5 concurrent): 40 ÷ 5 = 8 batches × 5s = ~40s (fits in 90s timeout)

### Pseudocode
```typescript
// Phase 1: classify all URLs in parallel
const classifications = await Promise.all(googlePages.map(async (v) => {
  if (isIndividualJobPage(v.link)) return { type: 'direct', url: v.link, ... };
  if (isListingPage(v.link)) {
    const urls = await withTimeout(extractJobUrlsFromListingPage(...), 15_000, ...).catch(() => []);
    return { type: 'listing', urls, ... };
  }
  return { type: 'direct', url: v.link, ... };
}));

// Collect all URLs to scrape
const allUrls = classifications.flatMap(c => ...);

// Phase 2: scrape in batches of 5
for (let i = 0; i < allUrls.length; i += 5) {
  const batch = allUrls.slice(i, i + 5);
  const results = await Promise.all(batch.map(u => withTimeout(scrapeJobPage(...), 15_000, ...).catch(() => null)));
  scrapedGoogleJobs.push(...results.filter(Boolean));
}
```

---

## Files modified
1. `src/lib/serpapi.ts` — `scrapeJobPage` (title/company/description extraction)
2. `src/app/api/search/route.ts` — two-step crawl (remove cap, parallelize)

## Expected result
- All 5 domains get scraped (careerjunction, jobmail, pnet, indeed, linkedin)
- Jobmail titles: actual job titles instead of sidebar text
- Jobmail descriptions: actual job specs instead of navigation text
- AI can now read specs and produce meaningful scores
- ~40 jobs scraped within 90s (limited by Jina rate limit)
