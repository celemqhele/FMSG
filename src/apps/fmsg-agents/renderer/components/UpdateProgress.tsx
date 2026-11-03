import React from 'react';

export type UpdateScreenPhase =
  | 'checking'
  | 'downloading'
  | 'installing'
  | 'optional-prompt';

export interface UpdateProgressProps {
  mode?: 'startup' | 'modal' | 'wizard';
  phase: UpdateScreenPhase;
  currentVersion: string;
  targetVersion?: string;
  percent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  manifest?: any;
  deferred?: boolean;
  onAcceptOptional?: () => void;
  onSkipOptional?: () => void;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BrandedOrbitalLoader() {
  return (
    <div className="update-loader-wrap" role="status" aria-label="Loading">
      <div className="update-loader-ring-outer" />
      <div className="update-loader-ring-inner" />
      <div className="update-loader-core" aria-hidden="true">
        FM
      </div>
    </div>
  );
}

export default function UpdateProgress({
  mode = 'startup',
  phase,
  currentVersion,
  targetVersion,
  percent = 0,
  transferredBytes = 0,
  totalBytes = 0,
  manifest,
  deferred = false,
  onAcceptOptional,
  onSkipOptional,
}: UpdateProgressProps) {
  const clampedPct = Math.max(0, Math.min(100, Math.round(percent)));
  const cleanCurrent = (currentVersion || '').replace(/^v/i, '');
  const cleanTarget = (
    targetVersion ||
    manifest?.version ||
    cleanCurrent
  ).replace(/^v/i, '');

  // The transient states (checking / downloading / installing) are a centred
  // splash; the optional-feature prompt is a document-style page whose content
  // flows and scrolls at page level.
  const isDocumentPage = phase === 'optional-prompt';

  const cardContent = (
    <div
      className={`update-screen-page ${isDocumentPage ? 'is-page' : 'is-hero'}`}
      role="dialog"
      aria-modal={mode === 'modal'}
      aria-live="polite"
    >
      {/* STATE 1: CHECKING */}
      {phase === 'checking' && (
        <section className="update-page-section">
          <BrandedOrbitalLoader />
          <h2 className="update-page-title">Checking for Updates</h2>
          <p className="update-page-text">
            Verifying installation security and checking for the latest release...
          </p>
          <div className="auth-version-tag update-page-tag">v{cleanCurrent}</div>
        </section>
      )}

      {/* STATE 2: DOWNLOADING */}
      {phase === 'downloading' && (
        <section className="update-page-section">
          <div className="auth-logo-mark update-page-mark" aria-hidden="true">
            FM
          </div>
          <h2 className="update-page-title">Downloading Update v{cleanTarget}</h2>
          <p className="update-page-text">
            Downloading and verifying signed release package...
          </p>

          <div
            className="update-progress-track update-page-progress"
            role="progressbar"
            aria-valuenow={clampedPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="update-progress-fill"
              style={{ width: `${clampedPct}%` }}
            />
          </div>

          <div className="update-progress-meta update-page-progress-meta">
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {clampedPct}%
            </span>
            <span>
              {formatBytes(transferredBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>

          <div className="auth-version-tag update-page-tag">
            v{cleanCurrent} &rarr; v{cleanTarget}
          </div>
        </section>
      )}

      {/* STATE 3: INSTALLING */}
      {phase === 'installing' && (
        <section className="update-page-section">
          <BrandedOrbitalLoader />
          <h2 className="update-page-title">Installing new updates</h2>
          <p className="update-page-text">
            Applying verified update v{cleanTarget}. FMSG Agents will reopen
            automatically...
          </p>
          <div className="auth-version-tag update-page-tag">
            v{cleanCurrent} &rarr; v{cleanTarget}
          </div>
        </section>
      )}

      {/* STATE 4: OPTIONAL FEATURE UPDATE PROMPT */}
      {phase === 'optional-prompt' && (
        <>
          <header className="update-page-header">
            <div className="auth-logo-mark update-page-mark" aria-hidden="true">
              FM
            </div>
            <div className="update-page-heading">
              <h2 className="update-page-title">New Feature Update Available</h2>
              <div className="update-page-subtitle">
                v{cleanCurrent} &rarr; v{cleanTarget}
                {totalBytes > 0 ? ` (${formatBytes(totalBytes)})` : ''}
              </div>
            </div>
          </header>

          {manifest?.changelog && manifest.changelog.length > 0 && (
            <section className="update-changelog" aria-label="What's new">
              <div className="update-changelog-label">What&apos;s New</div>
              <ul className="update-changelog-list">
                {manifest.changelog.map((item: string, idx: number) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {deferred ? (
            <p className="update-page-note">
              An application batch is currently running. This update will wait
              until your batch finishes.
            </p>
          ) : null}

          <footer className="update-page-actions">
            {onSkipOptional && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onSkipOptional}
              >
                {deferred ? 'Close' : 'Later'}
              </button>
            )}
            {!deferred && onAcceptOptional && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onAcceptOptional}
              >
                Update Now
              </button>
            )}
          </footer>
        </>
      )}
    </div>
  );

  if (mode === 'modal') {
    return (
      <div className="modal-backdrop update-modal-backdrop">{cardContent}</div>
    );
  }

  return <div className="auth-viewport">{cardContent}</div>;
}
