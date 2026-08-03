export interface JobPost {
  role: string;
  date: string;
  key: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  applyUrl: string;
  paraphrase: string;
  snippet: string;
}

export const jobPosts: JobPost[] = [];

export function getJobPost(role: string, date: string, key: string): JobPost | null {
  return jobPosts.find(
    (p) => p.role === role && p.date === date && p.key === key
  ) ?? null;
}

export function getJobPostByKey(key: string): JobPost | null {
  return jobPosts.find((p) => p.key === key) ?? null;
}
