import React, { useMemo, useState } from 'react';
import {
  formatDateZA,
  formatLocationZA,
} from '../lib/format';
import {
  ApplicationStatus,
  LocalJobOverride,
  SavedJobRecord,
  STATUS_DISPLAY,
  isJobArchived,
  resolveApplicationStatus,
} from '../lib/status';
import {
  EmptyState,
  PageHeader,
  Spinner,
  StatusPill,
  TableSkeleton,
} from '../components/ui/primitives';

type ApplicationsFilter =
  | 'All'
  | 'Applied'
  | 'Needs Review'
  | 'Approved'
  | 'Submitted'
  | 'Skipped';

const FILTER_TO_STATUS: Record<ApplicationsFilter, ApplicationStatus | null> = {
  All: null,
  Applied: 'applied',
  'Needs Review': 'needs_review',
  Approved: 'approved',
  Submitted: 'submitted',
  Skipped: 'skipped',
};

const PAGE_SIZES = [25, 50, 100] as const;

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export default function ApplicationsView({
  jobs,
  overrides,
  loading,
  selectedJob,
  onSelectJob,
  onRefresh,
  onArchiveJob,
  onMarkSubmitted,
  onStartRun,
}: {
  jobs: SavedJobRecord[];
  overrides: Record<string, LocalJobOverride>;
  loading: boolean;
  selectedJob: SavedJobRecord | null;
  onSelectJob: (job: SavedJobRecord | null) => void;
  onRefresh: () => void;
  onArchiveJob: (job: SavedJobRecord) => void;
  onMarkSubmitted: (job: SavedJobRecord) => void;
  onStartRun: () => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationsFilter>('All');
  const [sortKey, setSortKey] = useState<'date' | 'company' | 'title' | 'match'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(0);

  const visibleJobs = useMemo(
    () => jobs.filter((j) => !isJobArchived(j, overrides)),
    [jobs, overrides]
  );

  const filtered = useMemo(() => {
    const base = visibleJobs.filter((j) => {
      const st = resolveApplicationStatus(j, overrides);
      const target = FILTER_TO_STATUS[statusFilter];
      if (target && st !== target) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (j.job_title || '').toLowerCase().includes(q) ||
        (j.company || '').toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q)
      );
    });
    return base.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp =
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime();
      } else if (sortKey === 'company') {
        cmp = (a.company || '').localeCompare(b.company || '');
      } else if (sortKey === 'title') {
        cmp = (a.job_title || '').localeCompare(b.job_title || '');
      } else if (sortKey === 'match') {
        cmp = (a.match_score || 0) - (b.match_score || 0);
      }
      return sortDesc ? -cmp : cmp;
    });
  }, [visibleJobs, query, statusFilter, sortKey, sortDesc, overrides]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  const toggleSort = (key: 'date' | 'company' | 'title' | 'match') => {
    if (sortKey === key) {
      setSortDesc((v) => !v);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
    setPage(0);
  };

  const renderSortArrow = (key: 'date' | 'company' | 'title' | 'match') =>
    sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : '';

  const exportCsv = () => {
    const header = [
      'Company',
      'Role',
      'Location',
      'Date',
      'Match %',
      'Status',
      'Job URL',
      'Salary',
    ];
    const lines = [header.map(csvEscape).join(',')];
    for (const job of filtered) {
      lines.push(
        [
          job.company,
          job.job_title,
          formatLocationZA(job.location, ''),
          formatDateZA(job.created_at, ''),
          job.match_score ?? '',
          STATUS_DISPLAY[resolveApplicationStatus(job, overrides)].label,
          job.job_url,
          job.estimated_salary || '',
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fmsg-applications-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (selectedJob) {
    const st = resolveApplicationStatus(selectedJob, overrides);
    const archived = isJobArchived(selectedJob, overrides);
    return (
      <div className="billing-panel">
        <header className="billing-header">
          <div>
            <nav className="detail-breadcrumb" aria-label="Breadcrumb">
              <button
                type="button"
                className="link-btn"
                onClick={() => onSelectJob(null)}
              >
                Applications
              </button>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{selectedJob.job_title}</span>
            </nav>
            <h1 className="billing-title">{selectedJob.job_title}</h1>
            <p className="billing-subtitle">
              {selectedJob.company} ·{' '}
              {formatLocationZA(selectedJob.location, 'Location not listed')}
            </p>
          </div>
          <div className="detail-header-actions">
            <StatusPill status={st} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                window.electronAPI?.openExternalUrl?.(selectedJob.job_url)
              }
            >
              Open Job Posting ↗
            </button>
            {st === 'needs_review' && !archived && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onMarkSubmitted(selectedJob)}
              >
                Mark Submitted
              </button>
            )}
          </div>
        </header>

        <div className="detail-replay-grid">
          <div className="bento-card">
            <h2 className="billing-section-title">Application Timeline</h2>
            <div className="replay-timeline">
              {[
                { label: 'Found via FMSG Job Discovery', done: true },
                {
                  label: `Matched (${selectedJob.match_score ?? 85}% fit)`,
                  done: true,
                },
                { label: 'Tailored CV highlights prepared', done: true },
                {
                  label:
                    st === 'applied' || st === 'submitted'
                      ? 'Application submitted in Chrome'
                      : st === 'approved'
                        ? 'Approved and opened in your browser'
                        : 'Opened in Chrome (awaiting manual submit)',
                  done:
                    st === 'applied' || st === 'submitted' || st === 'approved',
                },
              ].map((step, i) => (
                <div key={i} className="replay-timeline-row">
                  <span className="pipeline-step-indicator">
                    {step.done ? '✓' : i + 1}
                  </span>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bento-card">
            <h2 className="billing-section-title">
              Agent Summary &amp; Job Spec
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: '#cbd5e1',
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              {selectedJob.match_summary ||
                'Processed by FMSG Agents using verified profile fields.'}
            </p>
            <dl className="detail-facts-grid">
              <div>
                <dt>Salary</dt>
                <dd>{selectedJob.estimated_salary || 'Not advertised'}</dd>
              </div>
              <div>
                <dt>Match</dt>
                <dd>
                  {selectedJob.match_score != null
                    ? `${selectedJob.match_score}% against active search profile`
                    : 'Not scored'}
                </dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>{formatDateZA(selectedJob.created_at)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{STATUS_DISPLAY[st].label}</dd>
              </div>
            </dl>
            <div className="spec-scroll-box">
              {selectedJob.full_spec ||
                'No extended job description text was stored for this posting.'}
            </div>
            <div className="detail-footer-actions">
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(selectedJob.job_url)
                    .then(() =>
                      window.dispatchEvent(
                        new CustomEvent('fmsg-toast', {
                          detail: {
                            message: 'Posting link copied.',
                            variant: 'success',
                          },
                        })
                      )
                    )
                    .catch(() => {});
                }}
              >
                Copy Posting Link
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onArchiveJob(selectedJob)}
              >
                Remove from List
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-panel">
      <PageHeader
        title="Applications"
        subtitle="Every role opened or submitted by FMSG Agents, synced with your account."
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner />
                  Refreshing…
                </>
              ) : (
                'Refresh'
              )}
            </button>
          </>
        }
      />

      <div className="tracker-toolbar">
        <div className="tracker-search-wrap">
          <input
            type="text"
            className="field-input tracker-search"
            placeholder="Search company, role, or location…"
            value={query}
            aria-label="Search applications"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {query && (
            <button
              type="button"
              className="tracker-search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setPage(0);
              }}
            >
              ×
            </button>
          )}
        </div>
        <div className="tracker-filter-pills" role="group" aria-label="Filter by status">
          {(
            ['All', 'Applied', 'Needs Review', 'Approved', 'Submitted', 'Skipped'] as const
          ).map((f) => (
            <button
              key={f}
              type="button"
              className={`spend-preset-chip ${statusFilter === f ? 'active' : ''}`}
              aria-pressed={statusFilter === f}
              onClick={() => {
                setStatusFilter(f);
                setPage(0);
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="tracker-table-wrap">
        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          visibleJobs.length === 0 ? (
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="5" width="18" height="15" rx="2.5" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
              }
              title="No applications yet"
              body="Every role the agent opens or submits is recorded here. Start a run to fill this tracker."
              actionLabel="Go to Run"
              onAction={onStartRun}
            />
          ) : (
            <EmptyState
              compact
              icon={
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.2-3.2" />
                </svg>
              }
              title="No matching applications"
              body="No tracked application matches this search and filter combination."
            />
          )
        ) : (
          <table className="tracker-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort('company')}>
                    Company{renderSortArrow('company')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort('title')}>
                    Role{renderSortArrow('title')}
                  </button>
                </th>
                <th>Location</th>
                <th>
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort('date')}>
                    Date{renderSortArrow('date')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort('match')}>
                    Match{renderSortArrow('match')}
                  </button>
                </th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((job) => {
                const st = resolveApplicationStatus(job, overrides);
                return (
                  <tr
                    key={job.id}
                    onClick={() => onSelectJob(job)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{job.company}</strong>
                    </td>
                    <td>{job.job_title}</td>
                    <td>{formatLocationZA(job.location, '—')}</td>
                    <td title={job.created_at ? formatDateZA(job.created_at) : undefined}>
                      {formatDateZA(job.created_at)}
                    </td>
                    <td>{job.match_score != null ? `${job.match_score}%` : '—'}</td>
                    <td>
                      <StatusPill status={st} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => onArchiveJob(job)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="tracker-footer">
          <span className="tracker-footer-count">
            Showing {safePage * pageSize + 1}–
            {Math.min(filtered.length, (safePage + 1) * pageSize)} of{' '}
            {filtered.length}
          </span>
          <div className="tracker-footer-controls">
            <label className="tracker-page-size">
              <span>Rows per page</span>
              <select
                className="select-input"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="tracker-page-indicator">
              Page {safePage + 1} of {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
