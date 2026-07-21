# Fix: Google Search/Jina Timeout

## Problem
The `googlePages` source (SRC5) makes 5 sequential SerpAPI calls in `searchGooglePages()`, causing wall time to exceed the 25s timeout. Additionally, URL classification is broken (query params break regex patterns), causing Jina to waste quota scraping listing pages. The two-step Jina crawl has no timeout.

## Root Causes
1. **Sequential domain searches**: `searchGooglePages` iterates 5 domains sequentially (~25s total worst case)
2. **URL classification broken**: `isListingPage()` tests `pathname + search` — query params like `?page=1` break path-based regex patterns
3. **No timeout on Jina crawl**: `scrapeJobPage()` and `extractJobUrlsFromListingPage()` calls have no timeout wrapper

## Fix 1: Parallelize `searchGooglePages` (`serpapi.ts:422-471`)

Replace sequential `for...of` loop with `Promise.all`. Each domain search is independent. Wall time becomes max(~10s) instead of sum(~25s).

### Before:
```typescript
for (const { domain } of JINA_SCRAPEABLE_DOMAINS) {
  // ... fetch, parse, push to allResults
  await new Promise((r) => setTimeout(r, 200));
}
```

### After:
```typescript
const domainResults = await Promise.all(
  JINA_SCRAPEABLE_DOMAINS.map(async ({ domain }) => {
    // ... fetch, parse, return matched[]
  })
);
for (const results of domainResults) {
  allResults.push(...results);
}
```

- Remove 200ms inter-iteration sleep (unnecessary with parallelism)
- Each domain's results are collected independently, then merged
- Existing try/catch per-domain handles failures gracefully

## Fix 2: Fix URL classification (`serpapi.ts:378-408`)

### `isListingPage` (line 392):
Change test string from `u.pathname + u.search` to `u.pathname` — listing pages are identified by path structure, not query params.

### `JINA_SCRAPEABLE_DOMAINS` pattern updates:
- **jobmail** (line 380): Add pattern `/\/jobs\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i` for nested paths like `/jobs/south-africa/page25`
- **pnet** (line 381): Remove dead pattern `/\/jobs\/[a-z0-9-]+\?/i` — the `\?` requires a literal `?` which never appears in pathname-only matching; first pattern already covers it
- **indeed** (line 382): Change `\/jobs\?` to `\/jobs\/?$` — match pathname `/jobs` without requiring `?`

### `isIndividualJobPage` (line 404):
**No changes needed** — correctly uses `pathname + search` (indeed's `/viewjob?jk=` needs query params)

## Fix 3: Add timeout to two-step Jina crawl (`route.ts:372-412`)

Wrap `scrapeJobPage` and `extractJobUrlsFromListingPage` calls with `withTimeout(..., 15_000, "Jina scrape/extract")`. Use `.catch(() => null/[])` to gracefully handle timeouts.

### Before:
```typescript
const job = await scrapeJobPage(v.link, JINA_API ?? null);
```

### After:
```typescript
const job = await withTimeout(scrapeJobPage(v.link, JINA_API ?? null), 15_000, `Jina scrape ${v.domain}`).catch(() => null);
```

Same pattern for `extractJobUrlsFromListingPage`.

## Expected Impact
- `googlePages` wall time: ~25s → ~10s (max single domain)
- Two-step crawl: bounded to ~75s max (5 URLs × 15s timeout) instead of unbounded
- Jina quota: no longer wasted on misclassified listing pages
- Listing pages properly classified → extracted job URLs → actual job scraping

## Files Modified
1. `src/lib/serpapi.ts` — Fix 1 + Fix 2
2. `src/app/api/search/route.ts` — Fix 3
