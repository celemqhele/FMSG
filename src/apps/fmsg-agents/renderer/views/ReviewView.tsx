import React from 'react';
import { formatLocationZA } from '../lib/format';
import { SavedJobRecord } from '../lib/status';
import { EmptyState, PageHeader } from '../components/ui/primitives';

export default function ReviewView({
  jobs,
  onApproveJob,
  onSkipJob,
  onInspectJob,
  onStartRun,
}: {
  jobs: SavedJobRecord[];
  onApproveJob: (job: SavedJobRecord) => void;
  onSkipJob: (job: SavedJobRecord) => void;
  onInspectJob: (job: SavedJobRecord) => void;
  onStartRun: () => void;
}) {
  return (
    <div className="billing-panel">
      <PageHeader
        title="Review Queue"
        subtitle="Applications that paused for your review before submission. Approve opens the posting; Skip removes it without deleting the record."
        actions={<span className="status-pill-sm review">{jobs.length} waiting</span>}
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          }
          title="Review queue is all clear"
          body="Applications that pause for your approval before submission appear here. Nothing is waiting on you."
          actionLabel="Go to Run"
          onAction={onStartRun}
        />
      ) : (
        <div className="review-queue-list">
          {jobs.map((job) => (
            <div key={job.id} className="review-queue-card">
              <div className="review-queue-main">
                <div className="review-queue-title-row">
                  <h2>{job.job_title}</h2>
                  {job.match_score != null && (
                    <span
                      className="current-job-score"
                      title={`${job.match_score}% match against your active search profile`}
                    >
                      {job.match_score}% Match
                    </span>
                  )}
                </div>
                <div className="review-queue-sub">
                  {job.company} · {formatLocationZA(job.location, 'South Africa')}
                </div>
                <p className="review-queue-summary">
                  {job.match_summary || 'Ready for review and submission.'}
                </p>
              </div>
              <div className="review-queue-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onApproveJob(job)}
                >
                  Approve &amp; Open ↗
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onInspectJob(job)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onSkipJob(job)}
                >
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
