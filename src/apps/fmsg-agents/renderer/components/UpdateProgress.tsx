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

  const cardContent = (
    <div
      className="update-screen-card"
      role="dialog"
      aria-modal={mode === 'modal'}
      aria-live="polite"
    >
      {/* STATE 1: CHECKING */}
      {phase === 'checking' && (
        <>
          <BrandedOrbitalLoader />
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px 0',
              letterSpacing: '-0.02em',
            }}
          >
            Checking for Updates
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            Verifying installation security and checking for the latest release...
          </p>
          <div className="auth-version-tag" style={{ marginTop: '24px' }}>
            v{cleanCurrent}
          </div>
        </>
      )}

      {/* STATE 2: DOWNLOADING */}
      {phase === 'downloading' && (
        <>
          <div
            className="auth-logo-mark"
            style={{ marginBottom: '18px' }}
            aria-hidden="true"
          >
            FM
          </div>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 6px 0',
              letterSpacing: '-0.02em',
            }}
          >
            Downloading Update v{cleanTarget}
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              margin: '0 0 8px 0',
              lineHeight: 1.5,
            }}
          >
            Downloading and verifying signed release package...
          </p>

          <div
            className="update-progress-track"
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

          <div className="update-progress-meta">
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {clampedPct}%
            </span>
            <span>
              {formatBytes(transferredBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>

          <div className="auth-version-tag" style={{ marginTop: '22px' }}>
            v{cleanCurrent} &rarr; v{cleanTarget}
          </div>
        </>
      )}

      {/* STATE 3: INSTALLING */}
      {phase === 'installing' && (
        <>
          <BrandedOrbitalLoader />
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px 0',
              letterSpacing: '-0.02em',
            }}
          >
            Installing new updates
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            Applying verified update v{cleanTarget}. FMSG Agents will reopen
            automatically...
          </p>
          <div className="auth-version-tag" style={{ marginTop: '24px' }}>
            v{cleanCurrent} &rarr; v{cleanTarget}
          </div>
        </>
      )}

      {/* STATE 4: OPTIONAL FEATURE UPDATE PROMPT */}
      {phase === 'optional-prompt' && (
        <div style={{ width: '100%', textAlign: 'left' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div className="auth-logo-mark" style={{ margin: 0 }}>
              FM
            </div>
            <div>
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                New Feature Update Available
              </h2>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                v{cleanCurrent} &rarr; v{cleanTarget}
                {totalBytes > 0 ? ` (${formatBytes(totalBytes)})` : ''}
              </div>
            </div>
          </div>

          {manifest?.changelog && manifest.changelog.length > 0 && (
            <div
              className="card-nested"
              style={{
                marginBottom: '20px',
                maxHeight: '140px',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                }}
              >
                What&apos;s New
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '18px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                {manifest.changelog.map((item: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deferred ? (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: '18px',
              }}
            >
              An application batch is currently running. This update will wait
              until your batch finishes.
            </p>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
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
          </div>
        </div>
      )}
    </div>
  );

  if (mode === 'modal') {
    return <div className="modal-backdrop">{cardContent}</div>;
  }

  return <div className="auth-viewport">{cardContent}</div>;
}
