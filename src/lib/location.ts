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
