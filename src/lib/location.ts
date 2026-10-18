/**
 * SA city/suburb → province mapper.
 * Used by all job sources to tighten search queries to the correct region.
 */

const SA_CITY_TO_PROVINCE: Record<string, { province: string; cityName: string }> = {
  // Gauteng
  "johannesburg":  { province: "Gauteng", cityName: "Johannesburg" },
  "sandton":       { province: "Gauteng", cityName: "Johannesburg" },
  "fourways":      { province: "Gauteng", cityName: "Johannesburg" },
  "midrand":       { province: "Gauteng", cityName: "Johannesburg" },
  "centurion":     { province: "Gauteng", cityName: "Pretoria" },
  "pretoria":      { province: "Gauteng", cityName: "Pretoria" },
  "soweto":        { province: "Gauteng", cityName: "Johannesburg" },
  "roodepoort":    { province: "Gauteng", cityName: "Johannesburg" },
  "benoni":        { province: "Gauteng", cityName: "Johannesburg" },
  "boksburg":      { province: "Gauteng", cityName: "Johannesburg" },
  "germiston":     { province: "Gauteng", cityName: "Johannesburg" },
  "vereeniging":   { province: "Gauteng", cityName: "Vereeniging" },
  "randburg":      { province: "Gauteng", cityName: "Johannesburg" },
  "brakpan":       { province: "Gauteng", cityName: "Johannesburg" },
  "kempton park":  { province: "Gauteng", cityName: "Johannesburg" },
  "springs":       { province: "Gauteng", cityName: "Johannesburg" },
  "alberton":      { province: "Gauteng", cityName: "Johannesburg" },
  "bryanston":     { province: "Gauteng", cityName: "Johannesburg" },
  "woodmead":      { province: "Gauteng", cityName: "Johannesburg" },
  "waterfall":     { province: "Gauteng", cityName: "Johannesburg" },
  "randpark":      { province: "Gauteng", cityName: "Johannesburg" },
  "rugby":         { province: "Gauteng", cityName: "Johannesburg" },
  "rosebank":      { province: "Gauteng", cityName: "Johannesburg" },
  "melrose arch":  { province: "Gauteng", cityName: "Johannesburg" },
  // Western Cape
  "cape town":     { province: "Western Cape", cityName: "Cape Town" },
  "stellenbosch":  { province: "Western Cape", cityName: "Stellenbosch" },
  "paarl":         { province: "Western Cape", cityName: "Paarl" },
  "george":        { province: "Western Cape", cityName: "George" },
  "somerset west":  { province: "Western Cape", cityName: "Cape Town" },
  "bellville":     { province: "Western Cape", cityName: "Cape Town" },
  "durbanville":   { province: "Western Cape", cityName: "Cape Town" },
  "claremont":     { province: "Western Cape", cityName: "Cape Town" },
  "worcester":     { province: "Western Cape", cityName: "Worcester" },
  "knysna":        { province: "Western Cape", cityName: "George" },
  "mossel bay":    { province: "Western Cape", cityName: "George" },
  "hermanus":      { province: "Western Cape", cityName: "Cape Town" },
  "strand":        { province: "Western Cape", cityName: "Cape Town" },
  "goodwood":      { province: "Western Cape", cityName: "Cape Town" },
  "milnerton":     { province: "Western Cape", cityName: "Cape Town" },
  "table view":    { province: "Western Cape", cityName: "Cape Town" },
  "plattekloof":   { province: "Western Cape", cityName: "Cape Town" },
  // KwaZulu-Natal
  "durban":        { province: "KwaZulu-Natal", cityName: "Durban" },
  "umhlanga":      { province: "KwaZulu-Natal", cityName: "Durban" },
  "pinetown":      { province: "KwaZulu-Natal", cityName: "Durban" },
  "pietermaritzburg": { province: "KwaZulu-Natal", cityName: "Pietermaritzburg" },
  "richards bay":  { province: "KwaZulu-Natal", cityName: "Richards Bay" },
  "newcastle":     { province: "KwaZulu-Natal", cityName: "Newcastle" },
  "howick":        { province: "KwaZulu-Natal", cityName: "Pietermaritzburg" },
  "westville":     { province: "KwaZulu-Natal", cityName: "Durban" },
  "ballito":       { province: "KwaZulu-Natal", cityName: "Durban" },
  // Eastern Cape
  "port elizabeth": { province: "Eastern Cape", cityName: "Port Elizabeth" },
  "gqeberha":      { province: "Eastern Cape", cityName: "Port Elizabeth" },
  "east london":   { province: "Eastern Cape", cityName: "East London" },
  "makhanda":      { province: "Eastern Cape", cityName: "East London" },
  "jeffreys bay":  { province: "Eastern Cape", cityName: "Port Elizabeth" },
  // Free State
  "bloemfontein":  { province: "Free State", cityName: "Bloemfontein" },
  // Limpopo
  "polokwane":     { province: "Limpopo", cityName: "Polokwane" },
  "tzaneen":       { province: "Limpopo", cityName: "Polokwane" },
  "thohoyandou":   { province: "Limpopo", cityName: "Polokwane" },
  "haenertsburg":  { province: "Limpopo", cityName: "Polokwane" },
  "mokopane":      { province: "Limpopo", cityName: "Polokwane" },
  // Mpumalanga
  "nelspruit":     { province: "Mpumalanga", cityName: "Nelspruit" },
  "mbombela":      { province: "Mpumalanga", cityName: "Nelspruit" },
  "witbank":       { province: "Mpumalanga", cityName: "Witbank" },
  "emalahleni":    { province: "Mpumalanga", cityName: "Witbank" },
  "barberton":     { province: "Mpumalanga", cityName: "Nelspruit" },
  "white river":   { province: "Mpumalanga", cityName: "Nelspruit" },
  "graskop":       { province: "Mpumalanga", cityName: "Nelspruit" },
  "hoedspruit":    { province: "Mpumalanga", cityName: "Nelspruit" },
  // North West
  "rustenburg":    { province: "North West", cityName: "Rustenburg" },
  "klerksdorp":    { province: "North West", cityName: "Klerksdorp" },
  "potchefstroom": { province: "North West", cityName: "Potchefstroom" },
  // Northern Cape
  "kimberley":     { province: "Northern Cape", cityName: "Kimberley" },
  "upington":      { province: "Northern Cape", cityName: "Upington" },
};

const SA_PROVINCES = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State", "Limpopo", "Mpumalanga", "North West", "Northern Cape"];

// ─── Location scope filter (city → region → country → continent → world) ────
// The user's scope setting (search_profiles.location_scope) hard-filters search
// results to their chosen geographic tier. All lookups here are deterministic —
// the AI only builds the user's ladder once at profile save; every job match at
// search time uses these static tables.

export type LocationScope = "local" | "provincial" | "country" | "continental" | "world";

export const LOCATION_SCOPES: { value: LocationScope; label: string; hint: string }[] = [
  { value: "local", label: "Local", hint: "Only my city / metro area" },
  { value: "provincial", label: "Provincial", hint: "My province / region" },
  { value: "country", label: "Country", hint: "Anywhere in my country" },
  { value: "continental", label: "Continental", hint: "Anywhere on my continent" },
  { value: "world", label: "World", hint: "No location filter" },
];

/** AI-generated broadening ladder (mirrors the industry ladder pattern). */
export interface LocationLadder {
  city: string;      // location_step_1
  region: string;    // location_step_2
  country: string;   // location_step_3
  continent: string; // location_step_4
}

export interface JobGeo {
  city: string;
  region: string;
  country: string;
  continent: string;
  isRemote: boolean;
  /** "exact" = city/region resolved · "country" = only country resolved · "unknown" = nothing resolved */
  confidence: "exact" | "country" | "unknown";
}

/**
 * Patterns that mean the job is genuinely workable from anywhere (checked on
 * the location field only). Note "hybrid"/"flexible" are deliberately NOT here:
 * a hybrid role still has a real workplace, so it is resolved like an on-site
 * role (e.g. "Hybrid – Sandton" is a Sandton job, not a worldwide remote job).
 */
export const REMOTE_LOCATION_PATTERNS = ["remote", "work from home", "wfh", "anywhere", "worldwide", "global", "fully remote", "100% remote", "remote-first", "telecommute", "work remotely"];

/**
 * Country → continent table for classifying a job's location.
 * Africa is complete (all 54); the rest covers the world's major job markets.
 * Lowercase, matched with word boundaries.
 */
const CONTINENT_BY_COUNTRY: Record<string, string[]> = {
  "Africa": [
    "algeria", "angola", "benin", "botswana", "burkina faso", "burundi", "cabo verde", "cameroon",
    "central african republic", "chad", "comoros", "congo", "democratic republic of the congo", "drc",
    "djibouti", "egypt", "equatorial guinea", "eritrea", "eswatini", "ethiopia", "gabon", "gambia",
    "ghana", "guinea", "guinea-bissau", "ivory coast", "côte d'ivoire", "kenya", "lesotho", "liberia",
    "libya", "madagascar", "malawi", "mali", "mauritania", "mauritius", "morocco", "mozambique",
    "namibia", "niger", "nigeria", "rwanda", "sao tome and principe", "senegal", "seychelles",
    "sierra leone", "somalia", "south africa", "south sudan", "sudan", "tanzania", "togo", "tunisia",
    "uganda", "zambia", "zimbabwe",
  ],
  "Europe": [
    "albania", "andorra", "armenia", "austria", "belarus", "belgium", "bosnia", "bulgaria", "croatia",
    "cyprus", "czech republic", "czechia", "denmark", "estonia", "finland", "france",
    "germany", "greece", "hungary", "iceland", "ireland", "italy", "kosovo", "latvia", "liechtenstein",
    "lithuania", "luxembourg", "malta", "moldova", "monaco", "montenegro", "netherlands", "holland",
    "north macedonia", "norway", "poland", "portugal", "romania", "russia", "san marino", "serbia",
    "slovakia", "slovenia", "spain", "sweden", "switzerland", "turkey", "ukraine", "united kingdom",
    "uk", "england", "scotland", "wales",
  ],
  "North America": [
    "united states", "usa", "canada", "mexico", "costa rica", "cuba", "dominican republic",
    "guatemala", "honduras", "jamaica", "panama", "trinidad", "barbados", "bahamas", "haiti",
  ],
  "South America": [
    "argentina", "bolivia", "brazil", "chile", "colombia", "ecuador", "paraguay", "peru", "uruguay",
    "venezuela", "guyana", "suriname",
  ],
  "Asia": [
    "china", "india", "indonesia", "japan", "south korea", "north korea", "malaysia", "singapore",
    "thailand", "vietnam", "philippines", "pakistan", "bangladesh", "sri lanka", "nepal", "bhutan",
    "myanmar", "cambodia", "laos", "mongolia", "taiwan", "hong kong", "israel", "palestine", "jordan",
    "lebanon", "iraq", "iran", "saudi arabia", "uae", "united arab emirates", "qatar", "kuwait",
    "bahrain", "oman", "yemen", "syria", "kazakhstan", "uzbekistan", "turkmenistan", "kyrgyzstan",
    "tajikistan", "afghanistan", "brunei", "maldives",
  ],
  "Oceania": [
    "australia", "new zealand", "fiji", "papua new guinea", "samoa", "tonga", "solomon islands",
    "vanuatu", "kiribati", "micronesia", "palau", "nauru", "marshall islands",
  ],
};

// Compile one word-boundary regex per continent at module load (deterministic, no AI).
const COUNTRY_PATTERNS: { regex: RegExp; country: string; continent: string }[] = Object.entries(
  CONTINENT_BY_COUNTRY
).flatMap(([continent, countries]) =>
  countries.map((c) => ({
    regex: new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    country: c,
    continent,
  }))
);
// Longest names first so "united arab emirates" beats "uae", "south africa" beats nothing else, etc.
COUNTRY_PATTERNS.sort((a, b) => b.country.length - a.country.length);

const CANONICAL_COUNTRY: Record<string, string> = {
  "uk": "United Kingdom", "england": "United Kingdom", "scotland": "United Kingdom", "wales": "United Kingdom",
  "holland": "Netherlands", "czech republic": "Czechia",
  "congo": "Republic of the Congo", "democratic republic of the congo": "DR Congo", "drc": "DR Congo",
  "usa": "United States", "united states": "United States", "uae": "United Arab Emirates",
  "united arab emirates": "United Arab Emirates", "côte d'ivoire": "Ivory Coast",
  "south africa": "South Africa",
};

/**
 * Well-known metro areas → country. Job boards very often publish city-only
 * locations ("New York", "London", "Dubai"), so without this table a foreign
 * job would look like an unknown location and be kept instead of filtered.
 * Only applied to the LOCATION FIELD (never to spec text — too noisy there).
 */
const FOREIGN_CITY_TO_COUNTRY: Record<string, { country: string; continent: string }> = {
  // Europe
  "london": { country: "United Kingdom", continent: "Europe" },
  "manchester": { country: "United Kingdom", continent: "Europe" },
  "birmingham": { country: "United Kingdom", continent: "Europe" },
  "edinburgh": { country: "United Kingdom", continent: "Europe" },
  "glasgow": { country: "United Kingdom", continent: "Europe" },
  "bristol": { country: "United Kingdom", continent: "Europe" },
  "dublin": { country: "Ireland", continent: "Europe" },
  "cork": { country: "Ireland", continent: "Europe" },
  "amsterdam": { country: "Netherlands", continent: "Europe" },
  "rotterdam": { country: "Netherlands", continent: "Europe" },
  "eindhoven": { country: "Netherlands", continent: "Europe" },
  "paris": { country: "France", continent: "Europe" },
  "lyon": { country: "France", continent: "Europe" },
  "toulouse": { country: "France", continent: "Europe" },
  "berlin": { country: "Germany", continent: "Europe" },
  "munich": { country: "Germany", continent: "Europe" },
  "munchen": { country: "Germany", continent: "Europe" },
  "hamburg": { country: "Germany", continent: "Europe" },
  "frankfurt": { country: "Germany", continent: "Europe" },
  "stuttgart": { country: "Germany", continent: "Europe" },
  "dusseldorf": { country: "Germany", continent: "Europe" },
  "madrid": { country: "Spain", continent: "Europe" },
  "barcelona": { country: "Spain", continent: "Europe" },
  "valencia": { country: "Spain", continent: "Europe" },
  "lisbon": { country: "Portugal", continent: "Europe" },
  "porto": { country: "Portugal", continent: "Europe" },
  "rome": { country: "Italy", continent: "Europe" },
  "milan": { country: "Italy", continent: "Europe" },
  "milano": { country: "Italy", continent: "Europe" },
  "turin": { country: "Italy", continent: "Europe" },
  "zurich": { country: "Switzerland", continent: "Europe" },
  "geneva": { country: "Switzerland", continent: "Europe" },
  "vienna": { country: "Austria", continent: "Europe" },
  "brussels": { country: "Belgium", continent: "Europe" },
  "antwerp": { country: "Belgium", continent: "Europe" },
  "copenhagen": { country: "Denmark", continent: "Europe" },
  "stockholm": { country: "Sweden", continent: "Europe" },
  "gothenburg": { country: "Sweden", continent: "Europe" },
  "oslo": { country: "Norway", continent: "Europe" },
  "helsinki": { country: "Finland", continent: "Europe" },
  "warsaw": { country: "Poland", continent: "Europe" },
  "krakow": { country: "Poland", continent: "Europe" },
  "prague": { country: "Czechia", continent: "Europe" },
  "budapest": { country: "Hungary", continent: "Europe" },
  "bucharest": { country: "Romania", continent: "Europe" },
  "athens": { country: "Greece", continent: "Europe" },
  "istanbul": { country: "Turkey", continent: "Europe" },
  "moscow": { country: "Russia", continent: "Europe" },
  "kyiv": { country: "Ukraine", continent: "Europe" },
  // North America
  "new york": { country: "United States", continent: "North America" },
  "nyc": { country: "United States", continent: "North America" },
  "san francisco": { country: "United States", continent: "North America" },
  "silicon valley": { country: "United States", continent: "North America" },
  "los angeles": { country: "United States", continent: "North America" },
  "seattle": { country: "United States", continent: "North America" },
  "boston": { country: "United States", continent: "North America" },
  "chicago": { country: "United States", continent: "North America" },
  "austin": { country: "United States", continent: "North America" },
  "denver": { country: "United States", continent: "North America" },
  "atlanta": { country: "United States", continent: "North America" },
  "dallas": { country: "United States", continent: "North America" },
  "houston": { country: "United States", continent: "North America" },
  "miami": { country: "United States", continent: "North America" },
  "washington dc": { country: "United States", continent: "North America" },
  "california": { country: "United States", continent: "North America" },
  "texas": { country: "United States", continent: "North America" },
  "toronto": { country: "Canada", continent: "North America" },
  "vancouver": { country: "Canada", continent: "North America" },
  "montreal": { country: "Canada", continent: "North America" },
  "calgary": { country: "Canada", continent: "North America" },
  "mexico city": { country: "Mexico", continent: "North America" },
  // South America
  "sao paulo": { country: "Brazil", continent: "South America" },
  "rio de janeiro": { country: "Brazil", continent: "South America" },
  "buenos aires": { country: "Argentina", continent: "South America" },
  "santiago": { country: "Chile", continent: "South America" },
  "bogota": { country: "Colombia", continent: "South America" },
  "lima": { country: "Peru", continent: "South America" },
  // Asia / Middle East
  "dubai": { country: "United Arab Emirates", continent: "Asia" },
  "abu dhabi": { country: "United Arab Emirates", continent: "Asia" },
  "abudhabi": { country: "United Arab Emirates", continent: "Asia" },
  "doha": { country: "Qatar", continent: "Asia" },
  "riyadh": { country: "Saudi Arabia", continent: "Asia" },
  "jeddah": { country: "Saudi Arabia", continent: "Asia" },
  "singapore": { country: "Singapore", continent: "Asia" },
  "hong kong": { country: "Hong Kong", continent: "Asia" },
  "shanghai": { country: "China", continent: "Asia" },
  "beijing": { country: "China", continent: "Asia" },
  "shenzhen": { country: "China", continent: "Asia" },
  "tokyo": { country: "Japan", continent: "Asia" },
  "osaka": { country: "Japan", continent: "Asia" },
  "seoul": { country: "South Korea", continent: "Asia" },
  "taipei": { country: "Taiwan", continent: "Asia" },
  "kuala lumpur": { country: "Malaysia", continent: "Asia" },
  "jakarta": { country: "Indonesia", continent: "Asia" },
  "manila": { country: "Philippines", continent: "Asia" },
  "bangkok": { country: "Thailand", continent: "Asia" },
  "ho chi minh": { country: "Vietnam", continent: "Asia" },
  "hanoi": { country: "Vietnam", continent: "Asia" },
  "bengaluru": { country: "India", continent: "Asia" },
  "bangalore": { country: "India", continent: "Asia" },
  "mumbai": { country: "India", continent: "Asia" },
  "delhi": { country: "India", continent: "Asia" },
  "new delhi": { country: "India", continent: "Asia" },
  "hyderabad": { country: "India", continent: "Asia" },
  "chennai": { country: "India", continent: "Asia" },
  "pune": { country: "India", continent: "Asia" },
  "gurgaon": { country: "India", continent: "Asia" },
  "noida": { country: "India", continent: "Asia" },
  "kolkata": { country: "India", continent: "Asia" },
  "tel aviv": { country: "Israel", continent: "Asia" },
  "jerusalem": { country: "Israel", continent: "Asia" },
  // Oceania
  "sydney": { country: "Australia", continent: "Oceania" },
  "melbourne": { country: "Australia", continent: "Oceania" },
  "brisbane": { country: "Australia", continent: "Oceania" },
  "perth": { country: "Australia", continent: "Oceania" },
  "adelaide": { country: "Australia", continent: "Oceania" },
  "auckland": { country: "New Zealand", continent: "Oceania" },
  "wellington": { country: "New Zealand", continent: "Oceania" },
  // Rest of Africa (SA cities are handled by the SA map above)
  "cairo": { country: "Egypt", continent: "Africa" },
  "lagos": { country: "Nigeria", continent: "Africa" },
  "abuja": { country: "Nigeria", continent: "Africa" },
  "nairobi": { country: "Kenya", continent: "Africa" },
  "accra": { country: "Ghana", continent: "Africa" },
  "casablanca": { country: "Morocco", continent: "Africa" },
  "tunis": { country: "Tunisia", continent: "Africa" },
  "algiers": { country: "Algeria", continent: "Africa" },
  "addis ababa": { country: "Ethiopia", continent: "Africa" },
  "kampala": { country: "Uganda", continent: "Africa" },
  "dar es salaam": { country: "Tanzania", continent: "Africa" },
  "kigali": { country: "Rwanda", continent: "Africa" },
  "lusaka": { country: "Zambia", continent: "Africa" },
  "harare": { country: "Zimbabwe", continent: "Africa" },
  "gaborone": { country: "Botswana", continent: "Africa" },
  "windhoek": { country: "Namibia", continent: "Africa" },
  "maputo": { country: "Mozambique", continent: "Africa" },
  "luanda": { country: "Angola", continent: "Africa" },
  "abidjan": { country: "Ivory Coast", continent: "Africa" },
  "dakar": { country: "Senegal", continent: "Africa" },
  "maseru": { country: "Lesotho", continent: "Africa" },
  "mbabane": { country: "Eswatini", continent: "Africa" },
};

const FOREIGN_CITY_PATTERNS: { regex: RegExp; country: string; continent: string }[] = Object.entries(
  FOREIGN_CITY_TO_COUNTRY
).map(([city, meta]) => ({
  regex: new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  country: meta.country,
  continent: meta.continent,
}));
FOREIGN_CITY_PATTERNS.sort((a, b) => b.country.length - a.country.length);

/**
 * "Remote — US", "Remote (UK)", "Remote - EMEA" … these are NOT workable from
 * anywhere; they restrict the role to a region. Detected before the generic
 * remote markers so they resolve to a country/continent instead of passing as
 * location-independent everywhere.
 */
const REMOTE_RESTRICTION_REGEX =
  /\b(?:remote|anywhere|wfh|work from home)\s*[-–—(,:/]*\s*(us|u\.s\.|usa|united states|uk|u\.k\.|united kingdom|eu|e\.u\.|europe|emea|canada|india|australia|germany|france|spain|netherlands|ireland|new zealand|singapore|uae|poland|brazil|japan|china)\b/i;
const REMOTE_RESTRICTION_REGION: Record<string, { country?: string; continent?: string }> = {
  "us": { country: "United States" }, "u.s.": { country: "United States" }, "usa": { country: "United States" },
  "united states": { country: "United States" },
  "uk": { country: "United Kingdom" }, "u.k.": { country: "United Kingdom" }, "united kingdom": { country: "United Kingdom" },
  "eu": { continent: "Europe" }, "e.u.": { continent: "Europe" }, "europe": { continent: "Europe" }, "emea": { continent: "Europe" },
  "canada": { country: "Canada" }, "india": { country: "India" }, "australia": { country: "Australia" },
  "germany": { country: "Germany" }, "france": { country: "France" }, "spain": { country: "Spain" },
  "netherlands": { country: "Netherlands" }, "ireland": { country: "Ireland" }, "new zealand": { country: "New Zealand" },
  "singapore": { country: "Singapore" }, "uae": { country: "United Arab Emirates" },
  "poland": { country: "Poland" }, "brazil": { country: "Brazil" }, "japan": { country: "Japan" }, "china": { country: "China" },
};
const CONTINENT_OF_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(CONTINENT_BY_COUNTRY).flatMap(([continent, countries]) => countries.map((c) => [c, continent]))
);

function normPlace(s: string): string {
  return s.toLowerCase().trim().replace(/[-\s]+/g, " ");
}

/** Compare two place names tolerantly ("KwaZulu Natal" == "kwaZulu-Natal"). */
export function placeEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normPlace(a) === normPlace(b);
}

/**
 * Find the country mentioned in a text fragment, if any.
 * `includeCities` also matches well-known metro areas ("London" → UK) — used for
 * the location FIELD only, never for spec text.
 */
function detectCountry(text: string, opts?: { includeCities?: boolean }): { country: string; continent: string } | null {
  if (!text) return null;
  for (const { regex, country, continent } of COUNTRY_PATTERNS) {
    if (regex.test(text)) {
      return { country: CANONICAL_COUNTRY[country] ?? country.charAt(0).toUpperCase() + country.slice(1), continent };
    }
  }
  if (opts?.includeCities) {
    for (const { regex, country, continent } of FOREIGN_CITY_PATTERNS) {
      if (regex.test(text)) return { country, continent };
    }
  }
  return null;
}

/**
 * Whole-word containment test ("East London" contains "east london", but
 * "London" does not contain "east london").
 */
function containsWholeWord(text: string, phrase: string): boolean {
  const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
  if (!escaped) return false;
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text.toLowerCase());
}

/**
 * Resolve a job's geography from its location field ONLY (remote markers, SA
 * city→province map, country/foreign-metro names). `unverified` = the source
 * stamped the *query's* location onto the job (see serpapi.ts
 * `_locationUnverified`) — the field is skipped entirely.
 */
function resolveGeoFromField(fieldRaw: string, opts?: { unverified?: boolean }): JobGeo {
  const geo: JobGeo = { city: "", region: "", country: "", continent: "", isRemote: false, confidence: "unknown" };
  const field = (fieldRaw || "").trim();

  if (field && !opts?.unverified) {
    // 1. Restricted remote ("Remote – US", "Remote (UK)", "Remote - EMEA") is
    // NOT workable from anywhere — resolve it to that region so scopes filter it.
    const restriction = field.match(REMOTE_RESTRICTION_REGEX);
    if (restriction) {
      const region = REMOTE_RESTRICTION_REGION[restriction[1].toLowerCase()];
      if (region) {
        geo.country = region.country ?? "";
        geo.continent = region.continent ?? (region.country ? CONTINENT_OF_COUNTRY[normPlace(region.country)] ?? "" : "");
        geo.confidence = "country";
        return geo; // isRemote deliberately stays false
      }
    }
  }

  // 2. Location-independent markers — checked on the raw field: sources stamp a
  // *query* location when missing, never the word "Remote".
  if (field && REMOTE_LOCATION_PATTERNS.some((p) => field.toLowerCase().includes(p))) {
    geo.isRemote = true;
  }

  if (field && !opts?.unverified) {
    // 3. SA city/suburb → province (metro folding handles Sandton → Johannesburg etc.)
    const mapped = mapLocationToProvince(field);
    const saMatch = SA_PROVINCES.includes(mapped.province);
    // 4. A country — or a well-known foreign metro — named in the field
    const country = detectCountry(field, { includeCities: true });

    // The SA partial matcher can fold a *substring* into an SA name ("London" →
    // "East London"). When the SA result is only a loose alias and the field also
    // names a foreign place, trust the foreign match ("London" is the UK).
    const saIsWholeWord = saMatch && containsWholeWord(field, mapped.cityName);
    if (saMatch && (saIsWholeWord || !country)) {
      geo.city = mapped.cityName;
      geo.region = mapped.province;
      geo.country = "South Africa";
      geo.continent = "Africa";
      geo.confidence = "exact";
      return geo;
    }

    if (country) {
      geo.country = country.country;
      geo.continent = country.continent;
      geo.confidence = "country";
      // "Madrid, Spain" / "Lagos, Nigeria" → first segment is a probable city
      const firstSegment = field.split(",")[0].trim();
      if (firstSegment && !placeEq(firstSegment, country.country) && firstSegment.length > 1) {
        geo.city = firstSegment;
      }
      return geo;
    }
  }
  return geo;
}

// ── URL-path country codes (Workday et al.) ──────────────────────────────────
// Workday job links bury the country in a path segment as an ISO 3166-1 code:
//   https://vendor.wd.myworkdayjobs.com/…/job/Cape-Town/Western-Cape/ZAF/<uuid>
// Alpha-3 ("ZAF", "GBR", "USA") is unambiguous. Alpha-2 codes that collide with
// US state abbreviations (CA, VA, GA, IN, …) are skipped — "/job/Springfield/VA/"
// is Virginia, not Vietnam. Codes are matched ONLY as whole path segments, never
// free text.
const ISO_ALPHA3_ROWS =
  "AFG|Afghanistan;ALB|Albania;DZA|Algeria;ASM|American Samoa;AND|Andorra;AGO|Angola;AIA|Anguilla;ATA|Antarctica;ATG|Antigua and Barbuda;ARG|Argentina;ARM|Armenia;ABW|Aruba;AUS|Australia;AUT|Austria;AZE|Azerbaijan;BHS|Bahamas;BHR|Bahrain;BGD|Bangladesh;BRB|Barbados;BLR|Belarus;BEL|Belgium;BLZ|Belize;BEN|Benin;BMU|Bermuda;BTN|Bhutan;BOL|Bolivia;BIH|Bosnia and Herzegovina;BWA|Botswana;BVT|Bouvet Island;BRA|Brazil;BRN|Brunei;BGR|Bulgaria;BFA|Burkina Faso;BDI|Burundi;CPV|Cabo Verde;KHM|Cambodia;CMR|Cameroon;CAN|Canada;CYM|Cayman Islands;CAF|Central African Republic;TCD|Chad;CHL|Chile;CHN|China;CXR|Christmas Island;COC|Cocos Islands;COL|Colombia;COM|Comoros;COG|Republic of the Congo;COD|DR Congo;COK|Cook Islands;CRI|Costa Rica;CIV|Ivory Coast;HRV|Croatia;CUB|Cuba;CYP|Cyprus;CZE|Czechia;DNK|Denmark;DJI|Djibouti;DMA|Dominica;DOM|Dominican Republic;ECU|Ecuador;EGY|Egypt;SLV|El Salvador;GNQ|Equatorial Guinea;ERI|Eritrea;EST|Estonia;ETH|Ethiopia;FLK|Falkland Islands;FRO|Faroe Islands;FJI|Fiji;FIN|Finland;FRA|France;GUF|French Guiana;PYF|French Polynesia;GAB|Gabon;GMB|Gambia;GEO|Georgia;DEU|Germany;GHA|Ghana;GIB|Gibraltar;GRC|Greece;GRL|Greenland;GRD|Grenada;GLP|Guadeloupe;GUM|Guam;GTM|Guatemala;GGY|Guernsey;GIN|Guinea;GNB|Guinea-Bissau;GUY|Guyana;HTI|Haiti;HMD|Heard Island;VAT|Holy See;HND|Honduras;HKG|Hong Kong;HUN|Hungary;ISL|Iceland;IND|India;IDN|Indonesia;IRN|Iran;IRQ|Iraq;IRL|Ireland;IMN|Isle of Man;ISR|Israel;ITA|Italy;JAM|Jamaica;JPN|Japan;JEY|Jersey;JOR|Jordan;KAZ|Kazakhstan;KEN|Kenya;KIR|Kiribati;PRK|North Korea;KOR|South Korea;KWT|Kuwait;KGZ|Kyrgyzstan;LAO|Laos;LVA|Latvia;LBN|Lebanon;LSO|Lesotho;LBR|Liberia;LBY|Libya;LIE|Liechtenstein;LTU|Lithuania;LUX|Luxembourg;MAC|Macao;MDG|Madagascar;MWI|Malawi;MYS|Malaysia;MDV|Maldives;MLI|Mali;MLT|Malta;MHL|Marshall Islands;MTQ|Martinique;MRT|Mauritania;MUS|Mauritius;MYT|Mayotte;MEX|Mexico;FSM|Micronesia;MDA|Moldova;MCO|Monaco;MNG|Mongolia;MNE|Montenegro;MSR|Montserrat;MAR|Morocco;MOZ|Mozambique;MMR|Myanmar;NAM|Namibia;NRU|Nauru;NPL|Nepal;NLD|Netherlands;NCL|New Caledonia;NZL|New Zealand;NIC|Nicaragua;NER|Niger;NGA|Nigeria;NIU|Niue;NFK|Norfolk Island;MKD|North Macedonia;MNP|Northern Mariana Islands;NOR|Norway;OMN|Oman;PAK|Pakistan;PLW|Palau;PSE|Palestine;PAN|Panama;PNG|Papua New Guinea;PRY|Paraguay;PER|Peru;PHL|Philippines;PCN|Pitcairn;POL|Poland;PRT|Portugal;PRI|Puerto Rico;QAT|Qatar;REU|Reunion;ROU|Romania;RUS|Russia;RWA|Rwanda;BLM|Saint Barthelemy;SHN|Saint Helena;KNA|Saint Kitts and Nevis;LCA|Saint Lucia;MAF|Saint Martin;VCT|Saint Vincent;WSM|Samoa;SMR|San Marino;STP|Sao Tome and Principe;SAU|Saudi Arabia;SEN|Senegal;SRB|Serbia;SYC|Seychelles;SLE|Sierra Leone;SGP|Singapore;SVK|Slovakia;SVN|Slovenia;SLB|Solomon Islands;SOM|Somalia;ZAF|South Africa;SSD|South Sudan;ESP|Spain;LKA|Sri Lanka;SDN|Sudan;SUR|Suriname;SJV|Svalbard;SWZ|Eswatini;SWE|Sweden;CHE|Switzerland;SYR|Syria;TWN|Taiwan;TJK|Tajikistan;TZA|Tanzania;THA|Thailand;TLS|Timor-Leste;TGO|Togo;TKL|Tokelau;TON|Tonga;TTO|Trinidad and Tobago;TUN|Tunisia;TUR|Turkey;TKM|Turkmenistan;TCA|Turks and Caicos Islands;TUV|Tuvalu;UGA|Uganda;UKR|Ukraine;ARE|United Arab Emirates;GBR|United Kingdom;USA|United States;URY|Uruguay;UZB|Uzbekistan;VUT|Vanuatu;VEN|Venezuela;VNM|Vietnam;VGB|British Virgin Islands;VIR|U.S. Virgin Islands;WLF|Wallis and Futuna;ESH|Western Sahara;YEM|Yemen;ZMB|Zambia;ZWE|Zimbabwe";
const ISO_ALPHA2_ROWS =
  "AF|Afghanistan;AL|Albania;DZ|Algeria;AS|American Samoa;AD|Andorra;AO|Angola;AI|Anguilla;AQ|Antarctica;AG|Antigua and Barbuda;AR|Argentina;AM|Armenia;AW|Aruba;AU|Australia;AT|Austria;AZ|Azerbaijan;BS|Bahamas;BH|Bahrain;BD|Bangladesh;BB|Barbados;BY|Belarus;BE|Belgium;BZ|Belize;BJ|Benin;BM|Bermuda;BT|Bhutan;BO|Bolivia;BA|Bosnia and Herzegovina;BW|Botswana;BV|Bouvet Island;BR|Brazil;IO|British Indian Ocean Territory;BN|Brunei;BG|Bulgaria;BF|Burkina Faso;BI|Burundi;CV|Cabo Verde;KH|Cambodia;CM|Cameroon;CA|Canada;KY|Cayman Islands;CF|Central African Republic;TD|Chad;CL|Chile;CN|China;CX|Christmas Island;CC|Cocos Islands;CO|Colombia;KM|Comoros;CG|Republic of the Congo;CD|DR Congo;CK|Cook Islands;CR|Costa Rica;CI|Ivory Coast;HR|Croatia;CU|Cuba;CY|Cyprus;CZ|Czechia;DK|Denmark;DJ|Djibouti;DM|Dominica;DO|Dominican Republic;EC|Ecuador;EG|Egypt;SV|El Salvador;GQ|Equatorial Guinea;ER|Eritrea;EE|Estonia;ET|Ethiopia;FK|Falkland Islands;FO|Faroe Islands;FJ|Fiji;FI|Finland;FR|France;GF|French Guiana;PF|French Polynesia;TF|French Southern Territories;GA|Gabon;GM|Gambia;GE|Georgia;DE|Germany;GH|Ghana;GI|Gibraltar;GR|Greece;GL|Greenland;GD|Grenada;GP|Guadeloupe;GU|Guam;GT|Guatemala;GG|Guernsey;GN|Guinea;GW|Guinea-Bissau;GY|Guyana;HT|Haiti;HM|Heard Island;VA|Holy See;HN|Honduras;HK|Hong Kong;HU|Hungary;IS|Iceland;IN|India;ID|Indonesia;IR|Iran;IQ|Iraq;IE|Ireland;IM|Isle of Man;IL|Israel;IT|Italy;JM|Jamaica;JP|Japan;JE|Jersey;JO|Jordan;KZ|Kazakhstan;KE|Kenya;KI|Kiribati;KP|North Korea;KR|South Korea;KW|Kuwait;KG|Kyrgyzstan;LA|Laos;LV|Latvia;LB|Lebanon;LS|Lesotho;LR|Liberia;LY|Libya;LI|Liechtenstein;LT|Lithuania;LU|Luxembourg;MO|Macao;MK|North Macedonia;MG|Madagascar;MW|Malawi;MY|Malaysia;MV|Maldives;ML|Mali;MT|Malta;MH|Marshall Islands;MQ|Martinique;MR|Mauritania;MU|Mauritius;YT|Mayotte;MX|Mexico;FM|Micronesia;MD|Moldova;MC|Monaco;MN|Mongolia;ME|Montenegro;MS|Montserrat;MA|Morocco;MZ|Mozambique;MM|Myanmar;NA|Namibia;NR|Nauru;NP|Nepal;NL|Netherlands;NC|New Caledonia;NZ|New Zealand;NI|Nicaragua;NE|Niger;NG|Nigeria;NU|Niue;NF|Norfolk Island;MP|Northern Mariana Islands;NO|Norway;OM|Oman;PK|Pakistan;PW|Palau;PS|Palestine;PA|Panama;PG|Papua New Guinea;PY|Paraguay;PE|Peru;PH|Philippines;PN|Pitcairn;PL|Poland;PT|Portugal;PR|Puerto Rico;QA|Qatar;RE|Reunion;RO|Romania;RU|Russia;RW|Rwanda;BL|Saint Barthelemy;SH|Saint Helena;KN|Saint Kitts and Nevis;LC|Saint Lucia;MF|Saint Martin;PM|Saint Pierre and Miquelon;VC|Saint Vincent;WS|Samoa;SM|San Marino;ST|Sao Tome and Principe;SA|Saudi Arabia;SN|Senegal;RS|Serbia;SC|Seychelles;SL|Sierra Leone;SG|Singapore;SK|Slovakia;SI|Slovenia;SB|Solomon Islands;SO|Somalia;ZA|South Africa;SS|South Sudan;ES|Spain;LK|Sri Lanka;SD|Sudan;SR|Suriname;SJ|Svalbard;SZ|Eswatini;SE|Sweden;CH|Switzerland;SY|Syria;TW|Taiwan;TJ|Tajikistan;TZ|Tanzania;TH|Thailand;TL|Timor-Leste;TG|Togo;TK|Tokelau;TO|Tonga;TT|Trinidad and Tobago;TN|Tunisia;TR|Turkey;TM|Turkmenistan;TC|Turks and Caicos Islands;TV|Tuvalu;UG|Uganda;UA|Ukraine;AE|United Arab Emirates;GB|United Kingdom;UK|United Kingdom;US|United States;UY|Uruguay;UZ|Uzbekistan;VU|Vanuatu;VE|Venezuela;VN|Vietnam;VG|British Virgin Islands;VI|U.S. Virgin Islands;WF|Wallis and Futuna;EH|Western Sahara;YE|Yemen;ZM|Zambia;ZW|Zimbabwe";
const ISO_CODE_TO_COUNTRY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const rows of [ISO_ALPHA3_ROWS, ISO_ALPHA2_ROWS]) {
    for (const row of rows.split(";")) {
      const i = row.indexOf("|");
      if (i > 0) m[row.slice(0, i)] = row.slice(i + 1);
    }
  }
  return m;
})();
const US_STATE_ABBRS = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ")
);

/**
 * Deterministic geography from a job's URL path: the ISO country-code segment,
 * plus the adjacent city/region slugs. Never called on free text — codes are
 * only trustworthy as whole path segments. Returns `unknown` when nothing matches.
 */
export function resolveGeoFromLink(link: string): JobGeo {
  const geo: JobGeo = { city: "", region: "", country: "", continent: "", isRemote: false, confidence: "unknown" };
  if (!link) return geo;
  let path = link;
  try { path = new URL(link).pathname; } catch { /* already a bare path */ }
  const jobIdx = path.toLowerCase().indexOf("/job/");
  if (jobIdx === -1) return geo;
  const segments = path
    .slice(jobIdx + 5)
    .split("/")
    .filter(Boolean)
    .map((s) => { try { return decodeURIComponent(s); } catch { return s; } })
    // Drop uuids, long numeric req-ids, and LOCALE pairs ("en-US", "fr-FR",
    // "pt-BR") — a locale is a language setting, not a location. Real locale
    // region subtags are exactly 2 letters (ISO 3166-1 alpha-2), while city
    // second-parts are 4+ ("New-York", "San-Jose", "Cape-Town"), so this never
    // removes a genuine place slug — and no ISO country code contains a dash.
    .filter(
      (s) =>
        s.length > 1 &&
        !/^[0-9a-f][0-9a-f-]{15,}$/i.test(s) &&
        !/^\d{5,}$/.test(s) &&
        !/^[a-z]{2,3}[-_][a-z]{2}$/i.test(s)
    );

  // Scan from the end: Workday lays the path out as …/city/region/COUNTRY/<uuid>,
  // so the country code is the last code-looking segment.
  for (let i = segments.length - 1; i >= 0; i--) {
    const code = segments[i].toUpperCase();
    if (code.length === 2 && US_STATE_ABBRS.has(code)) continue;
    const country = ISO_CODE_TO_COUNTRY[code];
    if (!country) continue;
    geo.country = country;
    geo.continent = CONTINENT_OF_COUNTRY[normPlace(country)] ?? "";
    geo.confidence = "country";
    // The one or two slugs before the code are usually city + region.
    for (let k = i - 1; k >= 0 && k >= i - 2; k--) {
      const text = segments[k].replace(/-/g, " ").trim();
      if (text.length < 2) continue;
      const place = detectCountry(text, { includeCities: true });
      if (place && placeEq(place.country, geo.country) && !geo.city) { geo.city = text; break; }
      const mapped = mapLocationToProvince(text);
      if (SA_PROVINCES.includes(mapped.province)) {
        if (mapped.cityName && mapped.cityName !== mapped.province && !geo.city) geo.city = mapped.cityName;
        if (!geo.region) geo.region = mapped.province;
        break;
      }
    }
    return geo;
  }

  // No ISO code — last resort, try each slug as a plain place name ("Cape-Town").
  for (let i = segments.length - 1; i >= 0; i--) {
    const text = segments[i].replace(/-/g, " ").trim();
    const resolved = resolveGeoFromField(text);
    if (resolved.confidence !== "unknown") return resolved;
  }
  return geo;
}

/**
 * Resolve every independent location signal on a job — the location field, the
 * extra location strings sources carry (Workday shows up to four), the job URL
 * path, and (last) the scraped spec. Returns one JobGeo per distinct signal
 * that resolved; a single `unknown` geo when none did. Callers fold with
 * `foldScopeVerdicts`, so a multi-location job passes when ANY location passes.
 * `unverified` (source stamped the query's location) skips field, extras and
 * link — only the spec can resolve such a job.
 */
export function resolveJobGeos(opts: { field?: string; extras?: string[]; link?: string; spec?: string; unverified?: boolean }): JobGeo[] {
  const geos: JobGeo[] = [];
  const push = (g: JobGeo) => {
    const key = `${g.city}|${g.region}|${g.country}|${g.isRemote}`;
    if (!geos.some((x) => `${x.city}|${x.region}|${x.country}|${x.isRemote}` === key)) geos.push(g);
  };

  push(resolveGeoFromField(opts.field ?? "", { unverified: opts.unverified }));
  if (!opts.unverified) {
    for (const extra of opts.extras ?? []) push(resolveGeoFromField(extra));
    if (opts.link) push(resolveGeoFromLink(opts.link));
  }

  // Second pass: the scraped spec may name the country even when nothing else did
  if (geos.every((g) => g.confidence === "unknown") && opts.spec) {
    const country = detectCountry(opts.spec.slice(0, 4000));
    if (country) {
      push({ city: "", region: "", country: country.country, continent: country.continent, isRemote: false, confidence: "country" });
    }
  }
  return geos;
}

/**
 * Fold per-location scope verdicts into one: a multi-location job PASSES when
 * ANY of its locations passes. A confidently-resolved out-of-scope location
 * drops the job UNLESS another confidently-resolved location is possibly
 * in-scope (e.g. right country, region unknown). Unresolvable signals — req
 * IDs, dates or "title_R 12345" composites that pollute Workday's
 * _extraLocations all resolve to confidence "unknown" — must NOT veto a
 * confident foreign verdict (they used to: one "drop" + any "demote" returned
 * "demote", so junk strings kept foreign jobs alive). With no confident
 * signal at all, the job demotes (never a hard drop) and stage 3's LLM
 * verdict decides.
 */
export function foldScopeVerdicts(
  geos: JobGeo[],
  ladder: LocationLadder,
  scope: LocationScope
): "match" | "demote" | "drop" {
  let sawKnownDrop = false;  // a confidently-resolved out-of-scope location
  let sawKnownMaybe = false; // a confidently-resolved possibly-in-scope location
  let sawUnknown = false;    // junk / unresolvable signals
  for (const geo of geos) {
    const v = jobMatchesScope(geo, ladder, scope);
    if (v === "match") return "match";
    if (v === "demote") {
      if (geo.confidence === "unknown") sawUnknown = true;
      else sawKnownMaybe = true;
    } else {
      sawKnownDrop = true;
    }
  }
  if (sawKnownDrop && !sawKnownMaybe) return "drop"; // junk can't save a resolved foreign job
  if (sawKnownMaybe || sawUnknown) return "demote";
  return "drop"; // no signals at all — out (matches previous behaviour)
}

/**
 * Resolve a job's geography from its location field (and spec text as a
 * second pass). `unverified` = the source stamped the *query's* location onto
 * the job (see serpapi.ts `_locationUnverified`) — the field is skipped and
 * only the spec can resolve the job. Single-signal back-compat wrapper over
 * `resolveJobGeos` (first resolved signal wins).
 */
export function resolveJobGeo(location: string, opts?: { spec?: string; unverified?: boolean }): JobGeo {
  return resolveJobGeos({ field: location, spec: opts?.spec, unverified: opts?.unverified })[0];
}

/**
 * Check a job's geography against the user's ladder at their chosen scope.
 * Returns "match" (keep), "demote" (keep but score lower), or "drop".
 */
export function jobMatchesScope(
  job: JobGeo,
  ladder: LocationLadder,
  scope: LocationScope
): "match" | "demote" | "drop" {
  if (scope === "world") return "match";
  if (job.isRemote) return "match"; // remote roles are location-independent
  if (job.confidence === "unknown") return "demote"; // never hard-drop unknowns

  // Degrade up a tier when the ladder rung is missing — never drop everything
  let effective: LocationScope = scope;
  if (effective === "local" && !ladder.city) effective = "provincial";
  if (effective === "provincial" && !ladder.region) effective = "country";
  if (effective === "country" && !ladder.country) effective = "continental";
  if (effective === "continental" && !ladder.continent) return "demote";

  if (effective === "local" || effective === "provincial") {
    // Known region on both sides decides definitively
    if (job.region && ladder.region) {
      if (placeEq(job.region, ladder.region)) {
        // Same region — exact city match is a full match, otherwise demote at local scope
        if (effective === "provincial") return "match";
        if (job.city && ladder.city && placeEq(job.city, ladder.city)) return "match";
        return "demote"; // right region, unknown/other city
      }
      return "drop"; // same country, different region — out at local/provincial scope
    }
    if (job.city && ladder.city && placeEq(job.city, ladder.city)) return "match";
    if (job.country && ladder.country && placeEq(job.country, ladder.country)) return "demote"; // right country, region unknown
    if (job.country && ladder.country && !placeEq(job.country, ladder.country)) return "drop";
    return "demote";
  }

  if (effective === "country") {
    if (job.country && ladder.country && placeEq(job.country, ladder.country)) return "match";
    return "drop"; // job resolved to another country — out of scope
  }

  // continental
  if (job.continent && ladder.continent && placeEq(job.continent, ladder.continent)) return "match";
  return "drop";
}

/**
 * Build a best-effort ladder straight from the profile location text — used
 * when the AI ladder hasn't been generated yet (legacy profiles). Returns
 * empty rungs for whatever can't be resolved; jobMatchesScope degrades up.
 */
export function buildLadderFromProfileLocation(rawLocation: string): LocationLadder {
  const ladder: LocationLadder = { city: "", region: "", country: "", continent: "" };
  if (!rawLocation) return ladder;

  const mapped = mapLocationToProvince(rawLocation);
  if (SA_PROVINCES.includes(mapped.province)) {
    ladder.city = mapped.cityName;
    ladder.region = mapped.province;
    ladder.country = "South Africa";
    ladder.continent = "Africa";
    return ladder;
  }

  const country = detectCountry(rawLocation, { includeCities: true });
  if (country) {
    ladder.country = country.country;
    ladder.continent = country.continent;
    const firstSegment = rawLocation.split(",")[0].trim();
    if (firstSegment && !placeEq(firstSegment, country.country)) ladder.city = firstSegment;
    return ladder;
  }

  // Unresolvable (e.g. "Remote") — leave empty; scope filter then demotes only
  ladder.city = rawLocation.split(",")[0].trim();
  return ladder;
}

/**
 * Map a user's profile location (city, suburb, area) to the correct
 * province for tighter search queries across all job sources.
 * Uses a static map — no AI latency.
 */
export function mapLocationToProvince(rawLocation: string): { province: string; cityName: string } {
  if (!rawLocation) return { province: "", cityName: "" };

  const lower = rawLocation.toLowerCase().trim();

  // Already a province? Pass through
  for (const prov of SA_PROVINCES) {
    if (lower === prov.toLowerCase()) {
      return { province: prov, cityName: prov };
    }
  }

  // Direct match in the city map
  const direct = SA_CITY_TO_PROVINCE[lower];
  if (direct) return direct;

  // Partial match — e.g. "Johannesburg South" → match "johannesburg"
  const keys = Object.keys(SA_CITY_TO_PROVINCE);
  for (const key of keys) {
    if (lower.includes(key) || key.includes(lower)) {
      return SA_CITY_TO_PROVINCE[key];
    }
  }

  // Unknown location — return as-is
  console.log(`[LOCATION] No province mapping for "${rawLocation}", passing as-is`);
  return { province: rawLocation, cityName: rawLocation.split(",")[0].trim() };
}
