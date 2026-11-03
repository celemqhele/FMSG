/**
 * FMSG Agents — Application & Review Status Model (Plan §4.2)
 *
 * Canonical statuses:
 * - `applied`      : Agent submitted the application automatically
 * - `needs_review` : Agent prepared/opened it; user review or manual step required
 * - `approved`     : User approved and opened the employer posting from Review Queue
 * - `submitted`    : User confirmed manual submission on the employer site
 * - `skipped`      : User dismissed the item from Review Queue (reversible)
 */

export type ApplicationStatus =
  | 'applied'
  | 'needs_review'
  | 'approved'
  | 'submitted'
  | 'skipped';

export interface SavedJobRecord {
  id: string;
  profile_id?: string | null;
  job_title: string;
  company: string;
  location?: string;
  estimated_salary?: string;
  match_score?: number;
  match_summary?: string;
  job_url: string;
  full_spec?: string;
  created_at?: string;
  review_status?: ApplicationStatus | string | null;
  archived_at?: string | null;
}

export const STATUS_DISPLAY: Record<
  ApplicationStatus,
  { label: string; pillClass: string; description: string }
> = {
  applied: {
    label: 'Applied',
    pillClass: 'applied',
    description: 'Submitted automatically by FMSG Agents',
  },
  needs_review: {
    label: 'Needs Review',
    pillClass: 'review',
    description: 'Prepared by the agent — awaiting your review or completion',
  },
  approved: {
    label: 'Approved',
    pillClass: 'approved',
    description: 'Approved in Review Queue and opened in your browser',
  },
  submitted: {
    label: 'Submitted',
    pillClass: 'applied',
    description: 'Confirmed as submitted on the employer site',
  },
  skipped: {
    label: 'Skipped',
    pillClass: 'neutral',
    description: 'Dismissed from the Review Queue',
  },
};

const LOCAL_OVERRIDES_KEY = 'fmsg_agents_job_overrides_v1';

export interface LocalJobOverride {
  review_status?: ApplicationStatus;
  archived_at?: string | null;
  updated_at: string;
}

export function loadLocalJobOverrides(): Record<string, LocalJobOverride> {
  try {
    const raw = window.localStorage.getItem(LOCAL_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLocalJobOverride(
  jobId: string,
  patch: Partial<LocalJobOverride>
): Record<string, LocalJobOverride> {
  const current = loadLocalJobOverrides();
  const next: Record<string, LocalJobOverride> = {
    ...current,
    [jobId]: {
      ...(current[jobId] || {}),
      ...patch,
      updated_at: new Date().toISOString(),
    },
  };
  try {
    window.localStorage.setItem(LOCAL_OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function resolveApplicationStatus(
  job: SavedJobRecord,
  overrides?: Record<string, LocalJobOverride>
): ApplicationStatus {
  const ov = overrides?.[job.id];
  if (ov?.review_status) return ov.review_status;

  const explicit = (job.review_status || '').toLowerCase().trim();
  if (
    explicit === 'applied' ||
    explicit === 'needs_review' ||
    explicit === 'approved' ||
    explicit === 'submitted' ||
    explicit === 'skipped'
  ) {
    return explicit;
  }

  const summary = (job.match_summary || '').toLowerCase();
  if (summary.includes('skipped')) return 'skipped';
  if (summary.includes('approved')) return 'approved';
  if (summary.includes('submitted manually')) return 'submitted';
  if (
    summary.includes('not auto-submitted') ||
    summary.includes('opened via') ||
    summary.includes('requires manual') ||
    summary.includes('required review')
  ) {
    return 'needs_review';
  }
  return 'applied';
}

export function isJobArchived(
  job: SavedJobRecord,
  overrides?: Record<string, LocalJobOverride>
): boolean {
  const ov = overrides?.[job.id];
  if (ov && ov.archived_at !== undefined) {
    return Boolean(ov.archived_at);
  }
  return Boolean(job.archived_at);
}
