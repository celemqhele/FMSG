import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDialog } from './DialogSystem';

/**
 * Live Run & Browser Preview (v0.7.0)
 *
 * - Renders real `agent-event` IPC steps from `AgentRunner`
 * - Vertical 6-stage pipeline (Finding jobs -> Filtering -> Tailoring -> Applying -> Monitoring -> Complete)
 * - Active job card with match % badge and progress bar
 * - Pause / Resume, Stop, and Emergency Stop controls
 * - Real Playwright JPEG screenshot monitor (`page.screenshot`) in a dark bezel
 * - "Needs You" modal with a live 10:00 (600s) SVG countdown ring that expires
 *   into `skip` (never auto-submits) and supports saving a domain-locked
 *   `SITE_PASSWORD` into Windows Credential Manager (`secret-vault.ts`).
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
        onClick={() => setOpen((v) => !v)}
      >
        <span className="profile-picker-dot" />
        <span className="profile-picker-text">
          {selected?.name ? `${selected.name} · ` : ''}
          {titleOf(selected)}
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
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="profile-picker-menu" role="listbox">
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
                <span className="profile-picker-item-title">{titleOf(p)}</span>
                <span className="profile-picker-item-meta">
                  {[p.name, p.location || p.location_scope]
                    .filter(Boolean)
                    .join(' · ') || 'Saved profile'}
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
  const [screenshot, setScreenshot] = useState<{
    dataUrl: string;
    caption: string;
    host: string;
  } | null>(null);
  const [attention, setAttention] = useState<AttentionPrompt | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(600);

  // Optional local Credential Manager save inside the Needs You modal
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
        item.status === 'active' ? { ...item, status: 'completed' as const } : item
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
          label: event.label || PHASE_LABEL[event.phase as StepPhase] || 'Working',
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

      if (event.type === 'screenshot' && event.dataUrl) {
        setScreenshot({
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
        item.status === 'active' ? { ...item, status: 'completed' as const } : item
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

      // If user opted to save login to local Credential Manager before continuing
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
          const res = await window.electronAPI?.saveSiteSecret?.({
            siteLabel: current.company || current.allowedDomain,
            allowedDomain: current.allowedDomain,
            username: vaultUser.trim(),
            password: vaultPass,
            keyName: current.secretKeyName,
          });
          if (res?.ok) {
            showToast(
              `Saved ${res.meta?.keyName || current.secretKeyName} to Windows Credential Manager.`,
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
    () => [...entries].reverse().find((e) => e.status === 'active') || entries[entries.length - 1],
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
    (profile?.job_titles || [])[0] || profile?.name || 'your saved profile';

  const totalCountdown = attention?.countdownSeconds || 600;
  const ringRadius = 28;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference * (1 - Math.max(0, secondsLeft) / totalCountdown);

  return (
    <div className="live-feed-root">
      {/* LEFT / CENTER: Live Run Pipeline, Current Job Card & Activity */}
      <section className="matrix-log-column">
        {/* Top Progress Header */}
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
                    : 'Ready to Run'}
            </span>
            <span className="matrix-counter">
              {stats.applied} applied
              {stats.skipped > 0 ? ` · ${stats.skipped} skipped` : ''}
            </span>
          </div>

          <div className="matrix-log-meta">
            {onProfileChange && (
              <ProfilePicker
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                onProfileChange={onProfileChange}
              />
            )}
          </div>
        </div>

        {/* Determinate Run Progress Bar */}
        <div className="live-run-progress-wrap">
          <div className="live-run-progress-labels">
            <span>Progress</span>
            <span>
              {currentJobEntry?.jobIndex && currentJobEntry?.totalJobs
                ? `Job ${currentJobEntry.jobIndex} of ${currentJobEntry.totalJobs} (${progressPct}%)`
                : isRunning
                  ? `${progressPct}%`
                  : 'Idle'}
            </span>
          </div>
          <div className="live-run-progress-track">
            <div
              className="live-run-progress-fill"
              style={{ width: `${isRunning || entries.length ? Math.max(6, progressPct) : 0}%` }}
            />
          </div>
        </div>

        {/* Middle Split: 6-Step Pipeline + Current Job Card + Activity Stream */}
        <div className="live-run-middle-grid">
          {/* 6-Step Vertical Stepper */}
          <div className="live-run-stepper">
            {PIPELINE_STEPS.map((step, idx) => {
              const done =
                activePipelineIdx > idx ||
                (!isRunning && entries.length > 0 && activeEntry?.phase === 'completed');
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
            {currentJobEntry && (currentJobEntry.jobTitle || currentJobEntry.company) && (
              <div className="current-job-spotlight">
                <div className="current-job-spotlight-top">
                  <div className="current-job-badge">
                    {(currentJobEntry.company || 'JOB').slice(0, 4).toUpperCase()}
                  </div>
                  <div className="current-job-meta">
                    <div className="current-job-title">
                      {currentJobEntry.jobTitle || 'Active Posting'}
                    </div>
                    <div className="current-job-sub">
                      {[
                        currentJobEntry.company,
                        currentJobEntry.location,
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
                      : `Click Start Applying to discover live postings for ${profileTitle}, tailor your CV, and watch the browser work in real time.`}
                  </p>
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
                          {entry.location && <span>{entry.location}</span>}
                          {entry.matchScore != null && (
                            <span className="matrix-score">
                              {entry.matchScore}% fit
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

        {/* Bottom Run Controls: Pause / Stop / Emergency Stop (or Start Applying) */}
        <div className="agent-action-row">
          {isRunning ? (
            <div className="live-run-control-group">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={isPaused ? onResumeAgent : onPauseAgent}
              >
                {isPaused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onStopAgent}
              >
                ■ Stop
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={onEmergencyStopAgent || onStopAgent}
              >
                ⊗ Emergency Stop
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary agent-primary-action"
              onClick={onOpenLaunchModal}
            >
              Start Applying · {batchSize} jobs
            </button>
          )}
          <span className="agent-action-hint">
            {isPaused
              ? 'Paused — click Resume to continue from this posting'
              : isRunning
                ? activeEntry?.label || 'Working in visible Chrome window…'
                : 'Opens a visible Chrome window on your PC'}
          </span>
        </div>
      </section>

      {/* RIGHT: Real Browser Preview Monitor (Dark Bezel) */}
      <section className="live-viewport-column">
        <div className="live-viewport-monitor">
          <div className="viewport-browser-bar">
            <div className="viewport-traffic-dots">
              <span
                className="viewport-traffic-dot"
                style={{ background: '#ef4444' }}
              />
              <span
                className="viewport-traffic-dot"
                style={{ background: '#f59e0b' }}
              />
              <span
                className="viewport-traffic-dot"
                style={{ background: '#22c55e' }}
              />
            </div>
            <div className="viewport-url-pill">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>
                {screenshot?.host
                  ? `https://${screenshot.host}`
                  : 'Live browser preview'}
              </span>
            </div>
            <span
              className={`viewport-live-badge ${isRunning ? 'live' : 'idle'}`}
            >
              {isPaused ? 'PAUSED' : isRunning ? 'LIVE' : 'IDLE'}
            </span>
          </div>

          <div className="viewport-body">
            {screenshot ? (
              <div className="viewport-shot-wrap">
                <img
                  className="viewport-shot"
                  src={screenshot.dataUrl}
                  alt={screenshot.caption}
                />
                <div className="viewport-caption">{screenshot.caption}</div>
              </div>
            ) : (
              <div className="viewport-idle">
                <div className="viewport-idle-mark">
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
                    : 'Live Browser Viewport'}
                </p>
                <p className="viewport-idle-body">
                  {isRunning
                    ? 'Each page the agent opens in Chrome is captured and mirrored here automatically.'
                    : 'When a run starts, real screenshots of each job posting, form, and confirmation receipt appear in this dark viewport.'}
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

                    {/* 10:00 SVG Countdown Ring */}
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

                  {/* Optional Local Credential Manager Save on Login Walls */}
                  {attention.kind === 'login' && attention.allowedDomain && (
                    <div className="needs-you-vault-box">
                      <label className="checkbox-label" style={{ fontSize: '11.5px' }}>
                        <input
                          type="checkbox"
                          checked={saveToVault}
                          onChange={(e) => setSaveToVault(e.target.checked)}
                        />
                        <span>
                          Save <strong>{attention.secretKeyName}</strong> in local
                          Windows Credential Manager for{' '}
                          <strong>{attention.allowedDomain}</strong> (never sent to
                          AI or server)
                        </span>
                      </label>

                      {saveToVault && (
                        <div className="needs-you-vault-inputs">
                          <input
                            type="text"
                            className="field-input"
                            placeholder={`Email / username for ${attention.allowedDomain}`}
                            value={vaultUser}
                            onChange={(e) => setVaultUser(e.target.value)}
                          />
                          <input
                            type="password"
                            className="field-input"
                            placeholder={`Password (${attention.secretKeyName})`}
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
                      {savingVault ? 'Saving & Continuing…' : 'Save and Continue'}
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
              : 'Browser automation runs locally in Chrome; job search & AI ranking use FMSG'}
          </span>
          {screenshot && (
            <button
              type="button"
              className="viewport-footer-link"
              onClick={() => setScreenshot(null)}
            >
              Clear preview
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
