export const BLACKLISTED_DOMAINS = [
  'bebee.com',
  'jobleads.com',
  'jobleads.co.za',
  'jobleads.co.uk',
  'jobleads.sg',
  'jobleads.ae',
  'jobleads.fr',
  'jobleads.it',
  'talent.com',
  'talent.co.za',
  'talent.co.uk',
  'talent.ca',
  'talent.au',
  'joub.co.za',
  'jooble.org',
  'jooble.com',
  'jooble.co.za',
  'executiveplacements.com',
  'executiveplacements.co.za',
  'whatjobs.com',
  'en-za.whatjobs.com',
  'cosmoquick.com',
  'cosmoquick.club',
  'naukri.my',
  'jobrapido.com',
  'jobrapido.co.za',
  'jobrapido.co.uk',
  'jobrapido.com.au',
  'jobrapido.de',
  'jobrapido.fr',
  'jobrapido.it',
  'jobrapido.es',
  'careerjet.co.za',
  'careerjet.co',
  'jobsearch101.co.za',
  'jobsearch101.com',
  'neuvoo.co.za',
  'neuvoo.com',
  'simplyhired.com',
];

export const BLACKLISTED_COMPANIES = [
  'joub.co.za',
  'jooble',
  'executiveplacements',
  'cosmoquick',
];

export function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function decodeGoogleRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('google')) {
      for (const param of ['q', 'url', 'adurl', 'dest', 'continue', 'redirect']) {
        const val = u.searchParams.get(param);
        if (val && (val.startsWith('http://') || val.startsWith('https://'))) return val;
      }
    }
  } catch {}
  return url;
}

export function decodeBingRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("bing.com") && u.pathname.includes("/ck/a")) {
      const raw = u.searchParams.get("u");
      if (raw) {
        for (let offset = 1; offset <= 3; offset++) {
          if (raw.length > offset) {
            const decoded = Buffer.from(raw.slice(offset), "base64").toString("utf-8");
            if (decoded.startsWith("http")) return decoded;
          }
        }
      }
    }
  } catch {}
  return url;
}

export function buildJobUrl(job: {
  apply_options?: { link: string; title: string }[];
  job_highlights?: { link?: string };
  link?: string;
  via?: string;
  title: string;
  company_name: string;
}): string {
  const tryDecode = (u: string) => decodeBingRedirect(decodeGoogleRedirect(u));
  if (job.apply_options?.[0]?.link) return tryDecode(job.apply_options[0].link);
  if (job.job_highlights?.link) return tryDecode(job.job_highlights.link);
  if (job.link) return tryDecode(job.link);
  return '';
}

export function isBlacklistedByVia(via: string | undefined): boolean {
  if (!via) return false;
  const lower = via.toLowerCase();
  return BLACKLISTED_DOMAINS.some(d => {
    const name = d.replace(/\..+$/, "");
    return lower.includes(name);
  });
}
