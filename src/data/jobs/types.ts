export interface JobCard {
  slug: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  applyUrl: string;
  description: string;
  snippet: string;
  featured?: boolean;
}

export interface JobBoard {
  slug: string;
  name: string;
  tagline: string;
  search: { title: string; location: string };
  jobs: JobCard[];
}
