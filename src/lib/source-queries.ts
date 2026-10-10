/**
 * Per-source query shaping.
 *
 * The pipeline builds ONE query string off the profile ladders, e.g.
 *   `"Supply Chain Coordinator"* ("Industrial Goods" OR Services) jobs`
 * and passes it to every source. But each source has different query
 * semantics — a Google-style boolean string is invalid for JSearch, Adzuna
 * wants separate what/where params, Workday/Ditto are keyword-only, and the
 * location must travel in a different place everywhere.
 *
 * Ditto already reshaped the pipeline string into `job_title=<role>` + a
 * numeric city id; these helpers do the same per-source tailoring for the rest:
 *
 *   Google Jobs (SerpAPI) — Google syntax + separate geo `location` param
 *   JSearch               — natural-language "role in place" + country=za
 *   Adzuna                — separate `what` / `where` params
 *   Scrappa (Google Jobs) — free-text `q`, no location param → role + place
 *   Bing Jobs (page `q`)  — free-text `q`, cc=ZA → role + place
 *   Workday               — keyword `searchText` per tenant → role only
 *   Ditto                 — keyword `job_title` + numeric city id → role only
 */

/**
 * Pull the primary role title out of a pipeline query. The first quoted phrase
 * is the role (mirrors Ditto's existing extractor); if the query has no quoted
 * phrase we fall back to the first OR-segment with operators stripped.
 */
export function primaryTitle(q: string): string {
  const quoted = (q || "").match(/"([^"]+)"/);
  if (quoted && quoted[1].trim()) return quoted[1].trim();
  return (q || "")
    .split(/\s+OR\s+/i)[0]
    .replace(/["*]/g, "")
    .trim();
}

/** Normalise a location string for use inside a keyword query. */
function cleanPlace(location?: string): string {
  return (location || "South Africa")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `role in place` — for sources whose free-text query expects natural language. */
function roleInPlace(q: string, location?: string): string {
  const role = primaryTitle(q);
  const place = cleanPlace(location);
  return [role, place ? `in ${place}` : ""].filter(Boolean).join(" ").trim();
}

/**
 * Google Jobs (SerpAPI) understands Google search syntax, so the built query is
 * already close. We only drop the `*` wildcards buildOrQuery appends (not
 * supported by the google_jobs engine) and the trailing "jobs" filler. Location
 * is passed separately via SerpAPI's geo `location` param.
 */
export function googleJobsQuery(q: string): string {
  return (q || "")
    .replace(/\*/g, "")
    .replace(/\s+\bjobs?\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * JSearch wants a natural-language query ("role in place") plus `country=za`.
 * It performs badly with boolean operators, cities crammed in and duplicated
 * country tokens (the old string ended up as "... Newcastle South Africa South
 * Africa"), so we send just role + location.
 */
export function jsearchQuery(q: string, location?: string): string {
  return roleInPlace(q, location);
}

/** Adzuna takes a separate `what` (keywords) and `where` (place). */
export function adzunaQuery(q: string, location?: string): { what: string; where: string } {
  return { what: primaryTitle(q), where: cleanPlace(location) };
}

/**
 * Scrappa scrapes Google Jobs but only exposes `q` (no location param), so the
 * location has to live inside the query.
 */
export function scrappaQuery(q: string, location?: string): string {
  return roleInPlace(q, location);
}

/** Bing Jobs page takes a single `q` + cc=ZA, so location goes in the query. */
export function bingQuery(q: string, location?: string): string {
  return roleInPlace(q, location);
}

/**
 * Workday's `searchText` is a keyword search run against every tenant, and each
 * posting already carries its own location — so send the role only.
 */
export function workdayQuery(q: string): string {
  return primaryTitle(q);
}

/** Ditto's `job_title` is a keyword search; location is handled by the city id. */
export function dittoQuery(q: string): string {
  return primaryTitle(q);
}
