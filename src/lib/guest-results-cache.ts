export interface CachedGuestJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  applyUrl: string;
}

export const GUEST_RESULTS_KEY = "fmsg-guest-results";

export function readGuestResults(): CachedGuestJob[] {
  try {
    const raw = localStorage.getItem(GUEST_RESULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeGuestResults(jobs: CachedGuestJob[]) {
  try {
    localStorage.setItem(GUEST_RESULTS_KEY, JSON.stringify(jobs));
  } catch {
    // storage unavailable — ignore
  }
}

export function clearGuestResults() {
  try {
    localStorage.removeItem(GUEST_RESULTS_KEY);
  } catch {
    // storage unavailable — ignore
  }
}
