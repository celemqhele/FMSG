import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Live Feed — the agent's real work, as it happens.
 *
 * Every row, caption and screenshot in this view comes from the running agent
 * in the main process (`agent-event` IPC). Nothing here is simulated: if the
 * agent opened LinkedIn, the preview is a screenshot of that LinkedIn page.
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

interface AttentionPrompt {
  id: string;
  kind: 'login' | 'captcha' | 'sensitive' | 'submit' | 'info';
  title: string;
  message: string;
  company?: string;
}

interface LiveLogProps {
  profile?: any;
  profiles?: any[];
  selectedProfileId?: string;
  onProfileChange?: (id: string) => void;
  isRunning: boolean;
  batchSize: number;
  appliedCount?: number;
  skippedCount?: number;
  onOpenLaunchModal?: () => void;
  onStopAgent?: () => void;
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
  found: 'Shortlisting',
  reading: 'Reading',
  tailoring: 'Tailoring',
  applying: 'Applying',
  confirming: 'Confirming',
  completed: 'Done',
  paused: 'Paused',
  error: 'Stopped',
};

/* ── animated profile picker (Apple-style spring menu) ───────────────────── */

function ProfilePicker({
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
                style={{ animationDelay: `${index * 22}ms` }}
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
                    width="14"
                    height="14"
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

/* ── main view ───────────────────────────────────────────────────────────── */

export default function LiveLog({
  profile,
  profiles = [],
  selectedProfileId,
  onProfileChange,
  isRunning,
  batchSize,
  appliedCount,
  skippedCount,
  onOpenLaunchModal,
  onStopAgent,
}: LiveLogProps) {
  const [entries, setEntries] = useState<MatrixLogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<{
    dataUrl: string;
    caption: string;
    host: string;
  } | null>(null);
  const [attention, setAttention] = useState<AttentionPrompt | null>(null);
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
        setAttention({
          id: event.id,
          kind: event.kind || 'info',
          title: event.title || 'Your attention is needed',
          message: event.message || '',
          company: event.job?.company,
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

  // A run that ends (stopped, or finished) should never leave a spinner behind.
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

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    pinnedRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 48;
  };

  const activeEntry = useMemo(
    () => [...entries].reverse().find((e) => e.status === 'active'),
    [entries]
  );

  const answerAttention = (answer: 'continue' | 'skip') => {
    const current = attention;
    setAttention(null);
    if (current) {
      window.electronAPI
        ?.respondAgentAttention?.(current.id, answer)
        .catch(() => {});
    }
    pushEntry({
      id: `answer_${Date.now()}`,
      phase: answer === 'skip' ? 'paused' : 'applying',
      label: answer === 'skip' ? 'Skipped this posting' : 'Continuing',
      sublabel: current?.company
        ? `${current.company} — ${answer === 'skip' ? 'moved on' : 'you handled it'}`
        : undefined,
      status: 'active',
      timestamp: nowLabel(),
    });
  };

  const profileTitle =
    (profile?.job_titles || [])[0] || profile?.name || 'your saved profile';

  const attentionLabel =
    attention?.kind === 'login'
      ? "I've signed in"
      : attention?.kind === 'captcha'
        ? "I've completed it"
        : attention?.kind === 'sensitive'
          ? "I've filled it in"
          : attention?.kind === 'submit'
            ? 'Submit now'
            : 'Continue';

  return (
    <div className="live-feed-root">
      {/* LEFT: activity stream */}
      <section className="matrix-log-column">
        <div className="matrix-log-header">
          <div className="matrix-log-heading">
            <span
              className={`matrix-live-dot ${isRunning ? 'running' : 'idle'}`}
            />
            <span className="matrix-log-title">
              {isRunning ? 'Agent working' : entries.length ? 'Run finished' : 'Ready'}
            </span>
          </div>

          <div className="matrix-log-meta">
            <span className="matrix-counter">
              {stats.applied} applied
              {stats.skipped > 0 ? ` · ${stats.skipped} skipped` : ''}
            </span>
            {onProfileChange && (
              <ProfilePicker
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                onProfileChange={onProfileChange}
              />
            )}
          </div>
        </div>

        <div
          className="matrix-log-scroll"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {entries.length === 0 ? (
            <div className="matrix-empty">
              <p className="matrix-empty-title">Nothing running yet</p>
              <p className="matrix-empty-body">
                {profiles.length === 0
                  ? 'Add a search profile on the FMSG website, then refresh profiles here.'
                  : `The agent will search live postings for ${profileTitle}, read each one, and show you the browser as it works.`}
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
                        <span className="matrix-score">{entry.matchScore}% fit</span>
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

        <div className="agent-action-row">
          {isRunning ? (
            <button
              type="button"
              className="btn btn-danger agent-primary-action"
              onClick={onStopAgent}
            >
              Stop agent
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary agent-primary-action"
              onClick={onOpenLaunchModal}
            >
              Launch agent · {batchSize} jobs
            </button>
          )}
          <span className="agent-action-hint">
            {isRunning
              ? activeEntry?.label || 'Starting up…'
              : 'A visible Chrome window opens on your machine'}
          </span>
        </div>
      </section>

      {/* RIGHT: real browser preview */}
      <section className="live-viewport-column">
        <div className="live-viewport-monitor">
          <div className="viewport-browser-bar">
            <div className="viewport-traffic-dots">
              <span
                className="viewport-traffic-dot"
                style={{ background: '#ff5f57' }}
              />
              <span
                className="viewport-traffic-dot"
                style={{ background: '#febc2e' }}
              />
              <span
                className="viewport-traffic-dot"
                style={{ background: '#28c840' }}
              />
            </div>
            <div className="viewport-url-pill">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                strokeWidth="2.4"
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
            <span className="viewport-live-badge">
              {isRunning ? 'LIVE' : 'IDLE'}
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
                    width="26"
                    height="26"
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
                  {isRunning ? 'Opening the first page…' : 'Your browser, mirrored here'}
                </p>
                <p className="viewport-idle-body">
                  {isRunning
                    ? 'The agent screenshots each page it opens, so you can follow along.'
                    : 'When a run starts, this pane shows a real screenshot of the page the agent is on — job boards, application forms and confirmations included.'}
                </p>
              </div>
            )}

            {attention && (
              <div className="viewport-attention-popup" role="dialog">
                <div className="attention-head">
                  <span className={`attention-kind ${attention.kind}`} />
                  <div>
                    <p className="attention-title">{attention.title}</p>
                    {attention.company && (
                      <p className="attention-company">{attention.company}</p>
                    )}
                  </div>
                </div>
                <p className="attention-message">{attention.message}</p>
                <div className="attention-actions">
                  <button
                    type="button"
                    className="btn btn-primary attention-continue"
                    onClick={() => answerAttention('continue')}
                  >
                    {attentionLabel}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary attention-skip"
                    onClick={() => answerAttention('skip')}
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="viewport-footer">
          <span>
            {activeEntry
              ? `${PHASE_LABEL[activeEntry.phase] || 'Working'} · ${activeEntry.label}`
              : 'Everything the agent does stays on this computer'}
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
