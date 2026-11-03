import React from 'react';
import { ApplicationStatus, STATUS_DISPLAY } from '../../lib/status';

/** Inline async spinner for buttons (AU-03, LS-02). */
export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <span
      className="btn-spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Canonical status pill: colour + text + dot, never colour alone. */
export function StatusPill({ status }: { status: ApplicationStatus }) {
  const meta = STATUS_DISPLAY[status] || STATUS_DISPLAY.applied;
  return (
    <span
      className={`status-pill-sm ${meta.pillClass}`}
      title={meta.description}
    >
      <span className="status-pill-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/**
 * Shared zero-data block: icon, headline, supporting line, one action.
 * Every empty screen uses this so "nothing yet" never reads as a loading
 * skeleton.
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  compact = false,
  inline = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  inline?: boolean;
}) {
  return (
    <div
      className={`empty-state${compact ? ' compact' : ''}${
        inline ? ' inline' : ''
      }`}
    >
      <span className="empty-state-icon">{icon}</span>
      <div className="empty-state-text">
        <p className="empty-state-title">{title}</p>
        <p className="empty-state-body">{body}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          className="btn btn-primary empty-state-action"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** One H1 + one-line subtitle + right-aligned actions (F6 page anatomy). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="billing-header">
      <div>
        <h1 className="billing-title">{title}</h1>
        {subtitle ? <p className="billing-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

/** Loading skeleton for tabular data (LS-01). */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-table" aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="skeleton-table-row">
          <span className="skeleton-block" style={{ width: '18%' }} />
          <span className="skeleton-block" style={{ width: '28%' }} />
          <span className="skeleton-block" style={{ width: '16%' }} />
          <span className="skeleton-block" style={{ width: '14%' }} />
          <span className="skeleton-block" style={{ width: '10%' }} />
        </div>
      ))}
    </div>
  );
}
