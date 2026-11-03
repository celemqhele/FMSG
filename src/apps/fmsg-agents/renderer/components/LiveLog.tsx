import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDialog } from './DialogSystem';
import { formatLocationZA, formatProfileName } from '../lib/format';

/**
 * Live Run & Browser Preview
 *
 * - Page header with H1 ("Run"), subtitle, and non-truncating ProfilePicker (RN-01, RN-02)
 * - Real `agent-event` IPC steps from `AgentRunner`
 * - Vertical 6-stage pipeline + active job spotlight + activity log
 * - Dark Windows-native browser preview bezel with crisp status pill (RN-06, RN-07, GS-14)
 * - "Needs You" modal with 10:00 SVG countdown ring (expires into `skip`) and plain-English
 *   local encrypted sign-in storage (no env-var names or internal jargon)
 */

export type StepPhase =
  | 'searching'
  | 'found'
  | 'reading'
  | 'tailoring'
  | 'applying'
  | 'confirming'
  | 'completed'
  | 'paused'
  | 'error';

export interface MatrixLogEntry {
  id: string;
  phase: StepPhase;
  label: string;
  sublabel?: string;
  status: 'completed' | 'active' | 'pending';
  timestamp: string;
  jobIndex?: number;
  totalJobs?: number;
  jobTitle?: string;
  company?: string;
  location?: string;
  matchScore?: number;
  salary?: string;
}

export interface AttentionPrompt {
  id: string;
  kind: 'login' | 'captcha' | 'sensitive' | 'submit' | 'info';
  title: string;
  message: string;
  company?: string;
  jobTitle?: string;
  secretKeyName?: string;
  allowedDomain?: string;
  countdownSeconds?: number;
}

interface LiveLogProps {
  profile?: any;
  profiles?: any[];
  selectedProfileId?: string;
  onProfileChange?: (id: string) => void;
  isRunning: boolean;
  isPaused?: boolean;
  batchSize: number;
  appliedCount?: number;
  skippedCount?: number;
  onOpenLaunchModal?: () => void;
  onStopAgent?: () => void;
  onPauseAgent?: () => void;
  onResumeAgent?: () => void;
  onEmergencyStopAgent?: () => void;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function hostOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const PHASE_LABEL: Record<StepPhase, string> = {
  searching: 'Searching',
  found: 'Filtering',
  reading: 'Reading',
  tailoring: 'Tailoring',
  applying: 'Applying',
  confirming: 'Confirming',
  completed: 'Complete',
  paused: 'Paused',
  error: 'Stopped',
};

const PIPELINE_STEPS: Array<{
  key: string;
  label: string;
  phases: StepPhase[];
}> = [
  { key: 'finding', label: 'Finding jobs', phases: ['searching'] },
  { key: 'filtering', label: 'Filtering', phases: ['found', 'reading'] },
  { key: 'tailoring', label: 'Tailoring', phases: ['tailoring'] },
  { key: 'applying', label: 'Applying', phases: ['applying'] },
  { key: 'monitoring', label: 'Monitoring', phases: ['confirming'] },
  { key: 'complete', label: 'Complete', phases: ['completed'] },
];

function formatCountdown(sec: number): string {
  const clamped = Math.max(0, Math.floor(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ProfilePicker({
  profiles,
  selectedProfileId,
  onProfileChange,
}: {
  profiles: any[];
  selectedProfileId?: string;
  onProfileChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selected =
    profiles.find((p) => p.id === selectedProfileId) || profiles[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (profiles.length === 0) return null;

  const titleOf = (p: any) => (p?.job_titles || [])[0] || 'Search profile';

  return (
    <div className="profile-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`profile-picker-trigger ${open ? 'open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active search profile: ${formatProfileName(selected?.name)}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="profile-picker-avatar" aria-hidden="true">
          {(selected?.name || 'P').slice(0, 2).toUpperCase()}
          <span className="profile-picker-presence" />
        </span>
        <span className="profile-picker-text">
          {formatProfileName(selected?.name) || 'Select profile'}
        </span>
        <svg
          className="profile-picker-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="profile-picker-menu"
          role="listbox"
          aria-label="Choose active search profile"
        >
          {profiles.map((p: any, index: number) => {
            const active = p.id === selected?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`profile-picker-item ${active ? 'active' : ''}`}
                style={{ animationDelay: `${index * 20}ms` }}
                onClick={() => {
                  onProfileChange(p.id);
                  setOpen(false);
                }}
              >
                <span className="profile-picker-item-avatar" aria-hidden="true">
                  {(p.name || 'P').slice(0, 2).toUpperCase()}
                </span>
                <span className="profile-picker-item-body">
                  <span className="profile-picker-item-title">
                    {formatProfileName(p.name)}
                  </span>
                  <span className="profile-picker-item-meta">
                    {titleOf(p)}
                    {p.location || p.location_scope
                      ? ` · ${formatLocationZA(p.location || p.location_scope)}`
                      : ''}
                  </span>
                </span>
                {active && (
                  <svg
                    className="profile-picker-check"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LiveLog({
  profile,
  profiles = [],
  selectedProfileId,
  onProfileChange,
  isRunning,
  isPaused = false,
  batchSize,
  appliedCount,
  skippedCount,
  onOpenLaunchModal,
  onStopAgent,
  onPauseAgent,
  onResumeAgent,
  onEmergencyStopAgent,
}: LiveLogProps) {
  const { showToast } = useDialog();

  const [entries, setEntries] = useState<MatrixLogEntry[]>([]);
  const [still, setStill] = useState<{
    dataUrl: string;
    caption: string;
    host: string;
  } | null>(null);
  const [frame, setFrame] = useState<{
    dataUrl: string;
    host: string;
    ts: number;
    caption?: string;
  } | null>(null);
  const [feedPaused, setFeedPaused] = useState(false);
  const feedPausedRef = useRef(false);
  const [attention, setAttention] = useState<AttentionPrompt | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(600);

  const [vaultUser, setVaultUser] = useState('');
  const [vaultPass, setVaultPass] = useState('');
  const [saveToVault, setSaveToVault] = useState(false);
  const [savingVault, setSavingVault] = useState(false);

  const [stats, setStats] = useState({
    applied: appliedCount ?? 0,
    skipped: skippedCount ?? 0,
    total: 0,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  const pushEntry = useCallback((entry: MatrixLogEntry) => {
    setEntries((prev) => {
      const settled = prev.map((item) =>
        item.status === 'active'
          ? { ...item, status: 'completed' as const }
          : item
      );
      return [...settled, entry].slice(-60);
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onAgentEvent) return;

    const unsubscribe = window.electronAPI.onAgentEvent((event: any) => {
      if (!event || typeof event !== 'object') return;

      if (event.type === 'phase') {
        pushEntry({
          id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          phase: event.phase,
          label:
            event.label || PHASE_LABEL[event.phase as StepPhase] || 'Working',
          sublabel: event.sublabel,
          status: 'active',
          timestamp: nowLabel(),
          jobIndex: event.jobIndex,
          totalJobs: event.totalJobs,
          jobTitle: event.job?.title,
          company: event.job?.company,
          location: event.job?.location,
          matchScore: event.job?.matchScore,
          salary: event.job?.salary,
        });
        return;
      }

      if (event.type === 'browser-frame' && event.dataUrl) {
        if (feedPausedRef.current) return;
        setFrame({
          dataUrl: event.dataUrl,
          host: event.host || '',
          ts: event.ts || Date.now(),
          caption: event.caption,
        });
        return;
      }

      if (event.type === 'screenshot' && event.dataUrl) {
        setStill({
          dataUrl: event.dataUrl,
          caption: event.caption || 'Live browser view',
          host: hostOf(event.job?.url),
        });
        return;
      }

      if (event.type === 'attention') {
        setSecondsLeft(
          typeof event.countdownSeconds === 'number'
            ? event.countdownSeconds
            : 600
        );
        setVaultUser('');
        setVaultPass('');
        setSaveToVault(false);
        setAttention({
          id: event.id,
          kind: event.kind || 'info',
          title: event.title || 'Needs You',
          message: event.message || '',
          company: event.job?.company,
          jobTitle: event.job?.title,
          secretKeyName: event.secretKeyName,
          allowedDomain: event.allowedDomain,
          countdownSeconds: event.countdownSeconds || 600,
        });
        return;
      }

      if (event.type === 'run-done') {
        setAttention(null);
        setStats({
          applied: event.applied ?? 0,
          skipped: event.skipped ?? 0,
          total: event.total ?? 0,
        });
        setEntries((prev) =>
          prev.map((item) => ({ ...item, status: 'completed' as const }))
        );
      }
    });

    return unsubscribe;
  }, [pushEntry]);

  useEffect(() => {
    if (isRunning) return;
    setAttention(null);
    setEntries((prev) =>
      prev.map((item) =>
        item.status === 'active'
          ? { ...item, status: 'completed' as const }
          : item
      )
    );
  }, [isRunning]);

  useEffect(() => {
    if (!pinnedRef.current) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries]);

  const answerAttention = useCallback(
    async (answer: 'continue' | 'skip') => {
      const current = attention;
      if (!current) return;

      if (
        answer === 'continue' &&
        current.kind === 'login' &&
        saveToVault &&
        vaultUser.trim() &&
        vaultPass &&
        current.allowedDomain
      ) {
        setSavingVault(true);
        try {
          const siteLabel = current.company || current.allowedDomain;
          const res = await window.electronAPI?.saveSiteSecret?.({
            siteLabel,
            allowedDomain: current.allowedDomain,
            username: vaultUser.trim(),
            password: vaultPass,
            keyName: current.secretKeyName,
          });
          if (res?.ok) {
            showToast(
              `Saved ${siteLabel} sign-in securely on this PC.`,
              'success'
            );
          }
        } catch {
          // ignore
        } finally {
          setSavingVault(false);
          setVaultPass('');
        }
      }

      setAttention(null);
      window.electronAPI
        ?.respondAgentAttention?.(current.id, answer)
        .catch(() => {});

      pushEntry({
        id: `answer_${Date.now()}`,
        phase: answer === 'skip' ? 'paused' : 'applying',
        label: answer === 'skip' ? 'Skipped this posting' : 'Continuing run',
        sublabel: current?.company
          ? `${current.company} — ${answer === 'skip' ? 'skipped safely' : 'resumed'}`
          : undefined,
        status: 'active',
        timestamp: nowLabel(),
      });
    },
    [attention, pushEntry, saveToVault, showToast, vaultPass, vaultUser]
  );

  // 10:00 countdown timer — expires strictly into `skip`, NEVER `continue`/submit
  useEffect(() => {
    if (!attention) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          answerAttention('skip');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attention, answerAttention]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    pinnedRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 48;
  };

  const activeEntry = useMemo(
    () =>
      [...entries].reverse().find((e) => e.status === 'active') ||
      entries[entries.length - 1],
    [entries]
  );

  const currentJobEntry = useMemo(
    () =>
      [...entries]
        .reverse()
        .find((e) => Boolean(e.jobTitle || e.company)),
    [entries]
  );

  const activePipelineIdx = useMemo(() => {
    if (!activeEntry) return isRunning ? 0 : -1;
    const idx = PIPELINE_STEPS.findIndex((s) =>
      s.phases.includes(activeEntry.phase)
    );
    return idx >= 0 ? idx : 0;
  }, [activeEntry, isRunning]);

  // Live preview: the newest screencast frame wins; a milestone still is the
  // fallback when streaming is unavailable. Only the latest image is kept.
  const preview = frame ?? still;
  const previewHost = frame?.host || still?.host || '';
  const isStreaming = Boolean(frame) && !feedPaused && isRunning && !isPaused;
  const badgeState =
    feedPaused || isPaused ? 'paused' : isRunning && frame ? 'live' : 'idle';
  const badgeLabel = feedPaused
    ? 'Feed paused'
    : isPaused
      ? 'Paused'
      : isRunning
        ? frame
          ? 'Live'
          : 'Starting'
        : 'Standby';

  const toggleFeed = useCallback(() => {
    setFeedPaused((prev) => !prev);
  }, []);

  useEffect(() => {
    feedPausedRef.current = feedPaused;
  }, [feedPaused]);

  const clearPreview = useCallback(() => {
    setStill(null);
    setFrame(null);
  }, []);

  // Brings the automation Chrome window to the front on demand. The IPC call is
  // a bare boolean round-trip: no navigation, no data, feed unaffected.
  const openInChrome = useCallback(() => {
    const api = window.electronAPI as any;
    if (!api?.focusAutomationBrowser) return;
    api
      .focusAutomationBrowser()
      .then((res: any) => {
        if (res && res.ok === false) {
          showToast(res.error || 'Could not bring Chrome to the front.', 'info');
        }
      })
      .catch(() => {
        showToast('Could not bring Chrome to the front.', 'info');
      });
  }, [showToast]);

  const progressPct = useMemo(() => {
    if (currentJobEntry?.jobIndex && currentJobEntry?.totalJobs) {
      return Math.min(
        100,
        Math.round((currentJobEntry.jobIndex / currentJobEntry.totalJobs) * 100)
      );
    }
    if (activePipelineIdx >= 0) {
      return Math.min(100, Math.round(((activePipelineIdx + 1) / 6) * 100));
    }
    return 0;
  }, [activePipelineIdx, currentJobEntry]);

  const profileTitle =
    (profile?.job_titles || [])[0] ||
    formatProfileName(profile?.name) ||
    'your saved profile';

  const totalCountdown = attention?.countdownSeconds || 600;
  const ringRadius = 28;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference * (1 - Math.max(0, secondsLeft) / totalCountdown);

  return (
    <div className="run-page-shell">
      {/* Page Header (RN-01, RN-02) */}
      <header className="billing-header run-page-header">
        <div>
          <h1 className="billing-title">Run</h1>
          <p className="billing-subtitle">
            Monitor live browser automation and step in whenever a job posting
            needs your input.
          </p>
        </div>
        <div className="run-header-controls">
          {onProfileChange && (
            <ProfilePicker
              profiles={profiles}
              selectedProfileId={selectedProfileId}
              onProfileChange={onProfileChange}
            />
          )}
        </div>
      </header>

      <div className="live-feed-root">
        {/* LEFT / CENTER: Live Run Pipeline, Current Job Card & Activity */}
        <section className="matrix-log-column">
          {/* Status Strip */}
          <div className="matrix-log-header">
            <div className="matrix-log-heading">
              <span
                className={`matrix-live-dot ${
                  isPaused ? 'paused' : isRunning ? 'running' : 'idle'
                }`}
              />
              <span className="matrix-log-title">
                {isPaused
                  ? 'Run Paused'
                  : isRunning
                    ? 'Live Run in Progress'
                    : entries.length
                      ? 'Run Complete'
                      : 'Ready to Start'}
              </span>
              <span className="matrix-counter">
                {stats.applied} applied
                {stats.skipped > 0 ? ` · ${stats.skipped} skipped` : ''}
              </span>
            </div>
            <span className="status-pill-sm neutral">
              Batch target: {batchSize} jobs
            </span>
          </div>

          {/* Determinate Run Progress Bar */}
          <div className="live-run-progress-wrap">
            <div className="live-run-progress-labels">
              <span>Run progress</span>
              <span>
                {currentJobEntry?.jobIndex && currentJobEntry?.totalJobs
                  ? `Job ${currentJobEntry.jobIndex} of ${currentJobEntry.totalJobs} (${progressPct}%)`
                  : isRunning
                    ? `${progressPct}%`
                    : 'Waiting to start'}
              </span>
            </div>
            <div className="live-run-progress-track">
              <div
                className="live-run-progress-fill"
                style={{
                  width: `${
                    isRunning || entries.length ? Math.max(6, progressPct) : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Middle Split: 6-Step Pipeline + Current Job Card + Activity Stream */}
          <div className="live-run-middle-grid">
            {/* 6-Step Vertical Stepper */}
            <div className="live-run-stepper" aria-label="Application stages">
              {PIPELINE_STEPS.map((step, idx) => {
                const done =
                  activePipelineIdx > idx ||
                  (!isRunning &&
                    entries.length > 0 &&
                    activeEntry?.phase === 'completed');
                const current = isRunning && activePipelineIdx === idx;
                return (
                  <div
                    key={step.key}
                    className={`pipeline-step-row ${
                      done ? 'done' : current ? 'current' : 'upcoming'
                    }`}
                  >
                    <span className="pipeline-step-indicator">
                      {done ? '✓' : idx + 1}
                    </span>
                    <span className="pipeline-step-label">{step.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Current Job Card + Scrollable Activity Log */}
            <div className="live-run-center-col">
              {currentJobEntry &&
                (currentJobEntry.jobTitle || currentJobEntry.company) && (
                  <div className="current-job-spotlight">
                    <div className="current-job-spotlight-top">
                      <div className="current-job-badge">
                        {(currentJobEntry.company || 'JOB')
                          .slice(0, 4)
                          .toUpperCase()}
                      </div>
                      <div className="current-job-meta">
                        <div className="current-job-title">
                          {currentJobEntry.jobTitle || 'Active Posting'}
                        </div>
                        <div className="current-job-sub">
                          {[
                            currentJobEntry.company,
                            currentJobEntry.location
                              ? formatLocationZA(currentJobEntry.location)
                              : null,
                            currentJobEntry.salary,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      {currentJobEntry.matchScore != null && (
                        <span className="current-job-score">
                          {currentJobEntry.matchScore}% Match
                        </span>
                      )}
                    </div>
                    <div className="current-job-status-line">
                      {activeEntry?.label || 'Processing posting…'}
                    </div>
                  </div>
                )}

              <div
                className="matrix-log-scroll"
                ref={scrollRef}
                onScroll={handleScroll}
                aria-live="polite"
              >
                {entries.length === 0 ? (
                  <div className="matrix-empty">
                    <p className="matrix-empty-title">No active run right now</p>
                    <p className="matrix-empty-body">
                      {profiles.length === 0
                        ? 'Add a search profile on the FMSG website, then click Refresh in Profiles.'
                        : `Discover live postings for ${profileTitle}, tailor your CV highlights, and watch Chrome fill applications in real time.`}
                    </p>
                    {onOpenLaunchModal && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ marginTop: 12 }}
                        onClick={onOpenLaunchModal}
                      >
                        Configure &amp; Start Run
                      </button>
                    )}
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`matrix-log-row ${entry.status} ${
                        entry.id === activeEntry?.id ? 'current' : ''
                      }`}
                    >
                      <span className={`matrix-dot ${entry.status}`} />
                      <div className="matrix-log-body">
                        <div className="matrix-log-text">{entry.label}</div>
                        {entry.sublabel && (
                          <div className="matrix-log-sub">{entry.sublabel}</div>
                        )}
                        {(entry.company || entry.jobTitle) && (
                          <div className="matrix-log-tags">
                            {entry.jobTitle && <span>{entry.jobTitle}</span>}
                            {entry.company && <span>{entry.company}</span>}
                            {entry.location && (
                              <span>{formatLocationZA(entry.location)}</span>
                            )}
                            {entry.matchScore != null && (
                              <span className="matrix-score">
                                {entry.matchScore}% match
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="matrix-log-time">
                        {entry.jobIndex && entry.totalJobs
                          ? `${entry.jobIndex}/${entry.totalJobs}`
                          : entry.timestamp}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Bottom Run Controls */}
          <div className="agent-action-row">
            {isRunning ? (
              <div className="live-run-control-group">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={isPaused ? onResumeAgent : onPauseAgent}
                >
                  {isPaused ? 'Resume Run' : 'Pause Run'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onStopAgent}
                >
                  Stop Run
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={onEmergencyStopAgent || onStopAgent}
                >
                  Emergency Stop
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary agent-primary-action"
                onClick={onOpenLaunchModal}
              >
                Start Applying ({batchSize} jobs)
              </button>
            )}
            <span className="agent-action-hint">
              {isPaused
                ? 'Paused — click Resume Run to continue from this posting'
                : isRunning
                  ? activeEntry?.label || 'Working — the live view is on the right'
                  : 'No screenshots needed'}
            </span>
          </div>
        </section>

        {/* RIGHT: Real Browser Preview Monitor (Dark Windows-Native Bezel) */}
        <section className="live-viewport-column">
          <div className="live-viewport-monitor">
            <div className="viewport-browser-bar">
              <span className="viewport-window-icon" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="2" y1="9" x2="22" y2="9" />
                </svg>
              </span>
              <div className="viewport-url-pill">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  {previewHost
                    ? `https://${previewHost}`
                    : 'Chrome Automation Preview'}
                </span>
              </div>
              <span className={`viewport-live-badge ${badgeState}`}>
                {badgeLabel}
              </span>
            </div>

            <div className="viewport-body">
              {preview ? (
                <div className="viewport-shot-wrap">
                  <div className="viewport-shot-stage">
                    <img
                      className="viewport-shot"
                      src={preview.dataUrl}
                      alt={frame ? 'Live browser view' : still?.caption || 'Browser view'}
                    />
                    <div className="viewport-overlay-strip">
                      <span
                        className={`viewport-stream-dot ${
                          isStreaming ? 'is-live' : 'is-idle'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="viewport-overlay-text">
                        {activeEntry?.label ||
                          frame?.caption ||
                          still?.caption ||
                          'Live browser view'}
                      </span>
                    </div>
                  </div>
                  {!frame && still?.caption && (
                    <div className="viewport-caption">{still.caption}</div>
                  )}
                </div>
              ) : (
                <div className="viewport-idle">
                  <div className="viewport-idle-mark" aria-hidden="true">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="4" width="20" height="14" rx="2.5" />
                      <line x1="2" y1="9" x2="22" y2="9" />
                      <line x1="8" y1="22" x2="16" y2="22" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                    </svg>
                  </div>
                  <p className="viewport-idle-title">
                    {isRunning
                      ? 'Opening first job posting…'
                      : 'Live Browser Preview'}
                  </p>
                  <p className="viewport-idle-body">
                    {isRunning
                      ? 'The agent’s browser is mirrored here continuously — no screenshots needed.'
                      : 'When a run starts, the browser the agent is using streams here live, paired with the current pipeline step.'}
                  </p>
                </div>
              )}

              {/* NEEDS YOU MODAL WITH 10:00 SVG COUNTDOWN RING */}
              {attention && (
                <div
                  className="needs-you-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="needs-you-title"
                >
                  <div className="needs-you-card">
                    <div className="needs-you-header">
                      <div>
                        <span className="needs-you-eyebrow">NEEDS YOU</span>
                        <h4 id="needs-you-title" className="needs-you-title">
                          {attention.title}
                        </h4>
                        {(attention.jobTitle || attention.company) && (
                          <div className="needs-you-sub">
                            {[attention.jobTitle, attention.company]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </div>

                      <div
                        className="needs-you-ring-wrap"
                        title="When the timer hits 00:00, this posting is skipped safely (never auto-submitted)"
                      >
                        <svg width="68" height="68" viewBox="0 0 68 68">
                          <circle
                            cx="34"
                            cy="34"
                            r={ringRadius}
                            fill="none"
                            stroke="rgba(148, 163, 184, 0.18)"
                            strokeWidth="4.5"
                          />
                          <circle
                            cx="34"
                            cy="34"
                            r={ringRadius}
                            fill="none"
                            stroke={secondsLeft < 60 ? '#ef4444' : '#203eea'}
                            strokeWidth="4.5"
                            strokeLinecap="round"
                            strokeDasharray={ringCircumference}
                            strokeDashoffset={ringOffset}
                            transform="rotate(-90 34 34)"
                          />
                        </svg>
                        <div className="needs-you-ring-text">
                          <strong>{formatCountdown(secondsLeft)}</strong>
                          <span>to skip</span>
                        </div>
                      </div>
                    </div>

                    <p className="needs-you-message">{attention.message}</p>

                    {attention.kind === 'login' && attention.allowedDomain && (
                      <div className="needs-you-vault-box">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            className="styled-checkbox"
                            checked={saveToVault}
                            onChange={(e) => setSaveToVault(e.target.checked)}
                          />
                          <span>
                            Save sign-in securely on this PC for{' '}
                            <strong>{attention.allowedDomain}</strong> (never
                            sent to AI or external servers)
                          </span>
                        </label>

                        {saveToVault && (
                          <div className="needs-you-vault-inputs">
                            <input
                              type="text"
                              className="field-input"
                              aria-label={`Email or username for ${attention.allowedDomain}`}
                              placeholder={`Email / username for ${attention.allowedDomain}`}
                              value={vaultUser}
                              onChange={(e) => setVaultUser(e.target.value)}
                            />
                            <input
                              type="password"
                              className="field-input"
                              aria-label={`Password for ${attention.allowedDomain}`}
                              placeholder={`Password for ${attention.allowedDomain} (encrypted locally)`}
                              value={vaultPass}
                              onChange={(e) => setVaultPass(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="needs-you-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={savingVault}
                        onClick={() => answerAttention('continue')}
                      >
                        {savingVault
                          ? 'Saving & Continuing…'
                          : 'Save and Continue'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={savingVault}
                        onClick={() => answerAttention('skip')}
                      >
                        Skip This Job
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="viewport-footer">
            <span>
              {activeEntry
                ? `${PHASE_LABEL[activeEntry.phase] || 'Working'} · ${activeEntry.label}`
                : 'Local Chrome automation · FMSG job discovery & CV tailoring'}
            </span>
            <div className="viewport-footer-actions">
              {isRunning && (
                <button
                  type="button"
                  className="viewport-footer-link viewport-footer-open-browser"
                  onClick={openInChrome}
                  title="Bring the automation Chrome window to the front"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Open in Chrome
                </button>
              )}
              {isRunning && preview && (
                <button
                  type="button"
                  className="viewport-footer-link"
                  onClick={toggleFeed}
                >
                  {feedPaused ? 'Resume feed' : 'Pause feed'}
                </button>
              )}
              {preview && (
                <button
                  type="button"
                  className="viewport-footer-link"
                  onClick={clearPreview}
                >
                  Clear preview
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
