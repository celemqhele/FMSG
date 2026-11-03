import React, { useMemo } from 'react';
import {
  formatLocationZA,
  formatProfileName,
  formatShortDayDateZA,
  formatZar,
  computeAllowanceUsage,
  formatDateZA,
} from '../lib/format';
import {
  LocalJobOverride,
  SavedJobRecord,
  isJobArchived,
  resolveApplicationStatus,
} from '../lib/status';
import { EmptyState, StatusPill } from '../components/ui/primitives';
import type { ViewType } from '../App';

export default function HomeView({
  profile,
  savedJobs,
  jobOverrides,
  reviewCount,
  isRunning,
  costCap,
  billingMode,
  bundleTier,
  emailVerified,
  onStartApplying,
  onNavigate,
  onOpenJobDetail,
}: {
  profile: any;
  savedJobs: SavedJobRecord[];
  jobOverrides: Record<string, LocalJobOverride>;
  reviewCount: number;
  isRunning: boolean;
  costCap: number;
  billingMode: 'pay-as-you-go' | 'bundle';
  bundleTier: 'Starter' | 'Lite' | 'Standard' | 'Power';
  emailVerified: boolean;
  onStartApplying: () => void;
  onNavigate: (v: ViewType) => void;
  onOpenJobDetail: (job: SavedJobRecord) => void;
}) {
  const roleTitle =
    (profile?.job_titles || [])[0] ||
    formatProfileName(profile?.name) ||
    'your target roles';
  const bundleAllowance =
    billingMode === 'bundle'
      ? bundleTier === 'Power'
        ? 150
        : bundleTier === 'Standard'
          ? 60
          : bundleTier === 'Lite'
            ? 25
            : 10
      : 0;
  const visibleJobs = savedJobs.filter((j) => !isJobArchived(j, jobOverrides));
  const usageTruth = computeAllowanceUsage(
    visibleJobs.length,
    bundleAllowance + (emailVerified ? 5 : 0)
  );

  const last7Days = useMemo(() => {
    const days: Array<{
      iso: string;
      weekday: string;
      dayMonth: string;
      count: number;
    }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - offset);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const count = savedJobs.filter((job) => {
        if (!job.created_at) return false;
        const stamp = new Date(job.created_at).getTime();
        return stamp >= start.getTime() && stamp < end.getTime();
      }).length;
      const formatted = formatShortDayDateZA(start);
      days.push({
        iso: start.toISOString().slice(0, 10),
        weekday: formatted.weekday,
        dayMonth: formatted.dayMonth,
        count,
      });
    }
    return days;
  }, [savedJobs]);

  const weekTotal = useMemo(
    () => last7Days.reduce((sum, day) => sum + day.count, 0),
    [last7Days]
  );
  const weekPeak = Math.max(1, ...last7Days.map((day) => day.count));

  return (
    <div className="dashboard-home">
      <section className="dashboard-hero-card">
        <div className="dashboard-hero-glow" />
        <div className="dashboard-hero-content">
          <span className="needs-you-eyebrow">AUTOPILOT WORKSPACE</span>
          <h1 className="dashboard-hero-title">
            Put your job search on autopilot
          </h1>
          <p className="dashboard-hero-sub">
            Active profile:{' '}
            <strong>{formatProfileName(profile?.name) || roleTitle}</strong> ·{' '}
            {formatLocationZA(profile?.location)}. The agent discovers matching
            roles, tailors your CV, and fills applications in Chrome.
          </p>
          <button
            type="button"
            className="btn btn-primary dashboard-hero-cta"
            onClick={onStartApplying}
          >
            {isRunning ? 'View Active Run' : 'Start Applying'}
          </button>
        </div>

        <ul className="dashboard-hero-features">
          <li className="dashboard-hero-feature">
            <span className="dashboard-hero-feature-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.2-3.2" />
              </svg>
            </span>
            <span className="dashboard-hero-feature-text">
              <strong>Find relevant roles</strong>
              <span>
                Discovers live South African postings that match your active
                FMSG profile.
              </span>
            </span>
          </li>
          <li className="dashboard-hero-feature">
            <span className="dashboard-hero-feature-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
                <path d="M9 13h6M9 17h4" />
              </svg>
            </span>
            <span className="dashboard-hero-feature-text">
              <strong>Tailor with AI</strong>
              <span>
                Aligns your verified CV highlights to each job spec, without
                inventing anything.
              </span>
            </span>
          </li>
          <li className="dashboard-hero-feature">
            <span className="dashboard-hero-feature-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 16.5 9 10l4 4 7.5-7.5" />
                <path d="M15 3h5v5" />
              </svg>
            </span>
            <span className="dashboard-hero-feature-text">
              <strong>Apply and track</strong>
              <span>
                Fills forms in your own Chrome and records every application
                here.
              </span>
            </span>
          </li>
        </ul>
      </section>

      <section className="quick-actions-grid">
        <button type="button" className="quick-action-tile" onClick={onStartApplying}>
          <span className="quick-action-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </span>
          <strong>Start a Run</strong>
          <span>Launch batch automation</span>
        </button>

        <button type="button" className="quick-action-tile" onClick={() => onNavigate('review')}>
          <span className="quick-action-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </span>
          <strong>Review Queue</strong>
          <span>{reviewCount} awaiting review</span>
        </button>

        <button type="button" className="quick-action-tile" onClick={() => onNavigate('applications')}>
          <span className="quick-action-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="7" y1="9" x2="17" y2="9" />
              <line x1="7" y1="13" x2="17" y2="13" />
              <line x1="7" y1="17" x2="13" y2="17" />
            </svg>
          </span>
          <strong>Applications</strong>
          <span>{visibleJobs.length} total tracked</span>
        </button>

        <button type="button" className="quick-action-tile" onClick={() => onNavigate('billing')}>
          <span className="quick-action-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2.5" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </span>
          <strong>Spend Cap &amp; Plans</strong>
          <span>
            {billingMode === 'bundle'
              ? `${bundleTier} Plan`
              : `${formatZar(costCap)} cap`}
          </span>
        </button>
      </section>

      <section className="dashboard-bottom-grid">
        <div className="bento-card">
          <div className="bento-card-head">
            <h2>Last 7 days</h2>
            <span className="tag">{weekTotal} handled</span>
          </div>
          {weekTotal === 0 ? (
            <EmptyState
              compact
              inline
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
                </svg>
              }
              title={
                savedJobs.length === 0
                  ? 'No applications yet'
                  : 'Nothing handled this week'
              }
              body={
                savedJobs.length === 0
                  ? 'Daily activity appears once the agent starts applying.'
                  : 'Your last application was more than 7 days ago.'
              }
            />
          ) : (
            <div className="week-bars" aria-label="Applications per day, last 7 days">
              {last7Days.map((day) => (
                <div
                  key={day.iso}
                  className="week-bar-col"
                  title={`${day.weekday}, ${day.dayMonth}: ${day.count} application${day.count === 1 ? '' : 's'}`}
                >
                  <span className="week-bar-value" aria-hidden="true">{day.count}</span>
                  <div className="week-bar-track">
                    <div
                      className="week-bar-fill"
                      style={{
                        height: `${Math.round((day.count / weekPeak) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="week-bar-label">{day.weekday}</span>
                  <span className="week-bar-date">{day.dayMonth}</span>
                </div>
              ))}
            </div>
          )}
          <div className="week-stats-list" style={{ marginTop: 10 }}>
            <div className="week-stat-item">
              <div>
                <span>Applications handled</span>
                <strong>{visibleJobs.length}</strong>
              </div>
            </div>
            <div className="week-stat-item">
              <div>
                <span>Awaiting review</span>
                <strong>{reviewCount}</strong>
              </div>
            </div>
            <div className="week-stat-item">
              <div>
                <span>Active profile</span>
                <strong>{formatProfileName(profile?.name) || 'None'}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="bento-card">
          <div className="bento-card-head">
            <h2>Recent applications</h2>
            <button
              type="button"
              className="viewport-footer-link"
              onClick={() => onNavigate('applications')}
            >
              View all
            </button>
          </div>
          {visibleJobs.length === 0 ? (
            <EmptyState
              compact
              inline
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16v16H4z" />
                  <path d="M8 9h8M8 13h5" />
                </svg>
              }
              title="Nothing tracked yet"
              body="Applications recorded by the agent will show up here."
            />
          ) : (
            <div className="recent-apps-list">
              {visibleJobs.slice(0, 4).map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="recent-app-row"
                  onClick={() => onOpenJobDetail(job)}
                >
                  <div className="recent-app-badge" aria-hidden="true">
                    {(job.company || 'CO').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="recent-app-info">
                    <strong>{job.job_title}</strong>
                    <span>
                      {job.company} · {formatDateZA(job.created_at)}
                    </span>
                  </div>
                  <StatusPill status={resolveApplicationStatus(job, jobOverrides)} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bento-card">
          <div className="bento-card-head">
            <h2>Usage</h2>
            <span className="tag">
              {billingMode === 'bundle' ? `${bundleTier} Plan` : 'Pay-As-You-Go'}
            </span>
          </div>
          <div className="usage-donut-wrap">
            <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
              <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="7" />
              <circle
                cx="48"
                cy="48"
                r="38"
                fill="none"
                stroke={usageTruth.isOverage ? '#f59e0b' : '#203eea'}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 38}
                strokeDashoffset={2 * Math.PI * 38 * (1 - usageTruth.ringPercent / 100)}
                transform="rotate(-90 48 48)"
              />
            </svg>
            <div className="usage-donut-label">
              <strong>{usageTruth.ringCenterTop}</strong>
              <span>{usageTruth.ringCenterBottom}</span>
            </div>
          </div>
          <p className={`usage-truth-line ${usageTruth.isOverage ? 'overage' : ''}`}>
            {usageTruth.isOverage
              ? `Allowance exceeded by ${usageTruth.overageCount} — extra applications use Pay-As-You-Go at your rate.`
              : usageTruth.summaryLine}
          </p>
        </div>
      </section>
    </div>
  );
}
