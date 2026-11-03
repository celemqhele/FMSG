import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DialogProvider, useDialog } from './components/DialogSystem';
import LiveLog from './components/LiveLog';
import HomeView from './views/HomeView';
import ApplicationsView from './views/ApplicationsView';
import ReviewView from './views/ReviewView';
import { Spinner } from './components/ui/primitives';
import SettingsPanel from './components/SettingsPanel';
import LoginScreen from './components/LoginScreen';
import BillingPanel from './components/BillingPanel';
import UpdateProgress, { UpdateScreenPhase } from './components/UpdateProgress';
import {
  formatDateZA,
  formatLocationZA,
  formatProfileName,
  formatShortDayDateZA,
  formatZar,
  computeAllowanceUsage,
} from './lib/format';
import { setActiveAppVersion } from './lib/legal';
import {
  ApplicationStatus,
  LocalJobOverride,
  SavedJobRecord,
  STATUS_DISPLAY,
  isJobArchived,
  loadLocalJobOverrides,
  resolveApplicationStatus,
  saveLocalJobOverride,
} from './lib/status';

export type ViewType =
  | 'home'
  | 'run'
  | 'applications'
  | 'review'
  | 'profiles'
  | 'billing'
  | 'settings'
  | 'account';

export type AutonomyMode = 'full-auto' | 'approve-each' | 'aggressive';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  kind: 'info' | 'success' | 'warning';
}

const ONBOARDING_SITES = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    domain: 'linkedin.com',
    keyName: 'LINKEDIN_PASSWORD',
    color: '#0a66c2',
  },
  {
    id: 'indeed',
    label: 'Indeed',
    domain: 'indeed.com',
    keyName: 'INDEED_PASSWORD',
    color: '#2557a7',
  },
  {
    id: 'glassdoor',
    label: 'Glassdoor',
    domain: 'glassdoor.com',
    keyName: 'GLASSDOOR_PASSWORD',
    color: '#0caa41',
  },
  {
    id: 'pnet',
    label: 'PNet',
    domain: 'pnet.co.za',
    keyName: 'PNET_PASSWORD',
    color: '#dc2626',
  },
  {
    id: 'careerjunction',
    label: 'CareerJunction',
    domain: 'careerjunction.co.za',
    keyName: 'CAREERJUNCTION_PASSWORD',
    color: '#7c3aed',
  },
  {
    id: 'careers24',
    label: 'Careers24',
    domain: 'careers24.com',
    keyName: 'CAREERS24_PASSWORD',
    color: '#ea580c',
  },
];

function AppInner() {
  const { showModal, showToast } = useDialog();

  const [bootChecking, setBootChecking] = useState(true);
  const [configValid, setConfigValid] = useState(true);
  const [appVersion, setAppVersion] = useState('');

  // Startup Update Screen state (runs on every launch before login)
  const [startupPhase, setStartupPhase] =
    useState<UpdateScreenPhase>('checking');
  const [startupTargetVersion, setStartupTargetVersion] = useState<string>('');
  const [startupPct, setStartupPct] = useState<number>(10);
  const [startupTransferredBytes, setStartupTransferredBytes] =
    useState<number>(0);
  const [startupTotalBytes, setStartupTotalBytes] = useState<number>(0);
  const [startupManifest, setStartupManifest] = useState<any>(null);

  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [batchSize, setBatchSize] = useState(25);
  const [dailyCapApps, setDailyCapApps] = useState(25);
  const [autonomyMode, setAutonomyMode] =
    useState<AutonomyMode>('approve-each');
  const [appliedCount, setAppliedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  // Run Setup Modal & Onboarding Wizard state
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3 | 4>(1);

  // Billing state — Cost cap defaults strictly to R0 per user requirement
  const [costCap, setCostCap] = useState(0);
  const [billingMode, setBillingMode] = useState<'pay-as-you-go' | 'bundle'>(
    'pay-as-you-go'
  );
  const [bundleTier, setBundleTier] = useState<
    'Starter' | 'Lite' | 'Standard' | 'Power'
  >('Starter');

  // Saved Jobs (Applications Tracker, Review Queue & Dashboard)
  const [savedJobs, setSavedJobs] = useState<SavedJobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedDetailJob, setSelectedDetailJob] =
    useState<SavedJobRecord | null>(null);

  // Local, reversible status/archive overrides (optimistic Phase 1B semantics,
  // synced to the backend IPC once those channels exist).
  const [jobOverrides, setJobOverrides] = useState<Record<string, LocalJobOverride>>(
    () => loadLocalJobOverrides()
  );

  // Notifications Popover
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // 6-digit email verification modal state (website parity)
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyCodeInput, setVerifyCodeInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Manual / in-app update modal state
  const [updatePrompt, setUpdatePrompt] = useState<{
    available: boolean;
    phase: UpdateScreenPhase;
    current: string;
    latest: string;
    percent: number;
    transferredBytes: number;
    totalBytes: number;
    manifest: any;
    deferred?: boolean;
  } | null>(null);

  const pushNotification = useCallback(
    (
      title: string,
      body: string,
      kind: 'info' | 'success' | 'warning' = 'info'
    ) => {
      setNotifications((prev) => [
        {
          id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title,
          body,
          time: new Date().toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          read: false,
          kind,
        },
        ...prev.slice(0, 24),
      ]);
    },
    []
  );

  const refreshSavedJobs = useCallback(async () => {
    if (!window.electronAPI?.listSavedJobs) return;
    setJobsLoading(true);
    try {
      const res = await window.electronAPI.listSavedJobs();
      if (res?.ok && Array.isArray(res.jobs)) {
        setSavedJobs(res.jobs);
      }
    } catch {
      // ignore
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadPersistedAgentPrefs = useCallback(async () => {
    try {
      const res = await window.electronAPI?.getAgentPrefs?.();
      if (res?.ok && res.prefs) {
        setCostCap(
          typeof res.prefs.costCap === 'number'
            ? Math.max(0, res.prefs.costCap)
            : 0
        );
        if (res.prefs.billingMode) setBillingMode(res.prefs.billingMode);
        if (res.prefs.bundleTier) setBundleTier(res.prefs.bundleTier);
        if (res.prefs.autonomyMode) setAutonomyMode(res.prefs.autonomyMode);
        if (!res.prefs.onboardingCompleted) {
          setShowOnboarding(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const finishBootToAuthOrSession = useCallback(async () => {
    try {
      const restored = await window.electronAPI.restoreSession();
      if (restored?.code === 'CONFIG_INVALID') {
        setConfigValid(false);
        setBootChecking(false);
        return;
      }
      if (restored?.ok && restored.user) {
        setUser(restored.user);
        const list = restored.profiles || [];
        setProfiles(list);
        if (list.length > 0) setSelectedProfileId(list[0].id);
        setAuthenticated(true);
      }
    } catch {
      // Stay on login screen
    } finally {
      setBootChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    refreshSavedJobs();
    loadPersistedAgentPrefs();
  }, [authenticated, refreshSavedJobs, loadPersistedAgentPrefs]);

  // Keep bundled legal documents stamped with the running version (ST-12).
  useEffect(() => {
    if (appVersion) setActiveAppVersion(appVersion);
  }, [appVersion]);

  // One-time, version-aware welcome notification (NT-01, NT-04): shown once per
  // installed version, never a hardcoded stale string, never an internal memo.
  useEffect(() => {
    if (!authenticated || !appVersion) return;
    const seenKey = `fmsg_welcome_seen_v${appVersion}`;
    try {
      if (window.localStorage.getItem(seenKey)) return;
      window.localStorage.setItem(seenKey, '1');
    } catch {
      return;
    }
    setNotifications((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: `welcome_${appVersion}`,
          title: `You're on FMSG Agents v${appVersion}`,
          body: 'Choose a search profile, set your spend cap, and start your first application run.',
          time: new Date().toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          read: false,
          kind: 'info',
        },
      ];
    });
  }, [authenticated, appVersion]);

  useEffect(() => {
    const handleUpdateEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.available) {
        const total = (detail.manifest?.files || []).reduce(
          (s: number, f: any) => s + (f.size_bytes || 0),
          0
        );
        setUpdatePrompt({
          available: true,
          phase: 'optional-prompt',
          current: detail.currentVersion || appVersion,
          latest: detail.latestVersion || detail.manifest?.version || '',
          percent: 0,
          transferredBytes: 0,
          totalBytes: total,
          manifest: detail.manifest,
          deferred: detail.deferred,
        });
      }
    };
    window.addEventListener('agent-update-available', handleUpdateEvent);
    return () =>
      window.removeEventListener('agent-update-available', handleUpdateEvent);
  }, [appVersion]);

  useEffect(() => {
    if (!window.electronAPI?.onAgentEvent) return;
    const unsubscribe = window.electronAPI.onAgentEvent((event: any) => {
      if (!event || typeof event !== 'object') return;

      if (event.type === 'attention') {
        pushNotification(
          event.title || 'Needs You',
          event.message || 'An application needs your input.',
          'warning'
        );
      }

      if (event.type === 'run-done') {
        setIsRunning(false);
        setIsPaused(false);
        setAppliedCount(event.applied ?? 0);
        setSkippedCount(event.skipped ?? 0);
        pushNotification(
          'Application Run Finished',
          `${event.applied ?? 0} applied · ${event.skipped ?? 0} skipped.`,
          'success'
        );
        refreshSavedJobs();
        return;
      }

      if (event.type === 'phase' && event.phase === 'error') {
        showToast(
          event.sublabel ||
            'The agent stopped unexpectedly. Please try again.',
          'error'
        );
      }
    });
    return unsubscribe;
  }, [pushNotification, refreshSavedJobs, showToast]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateProgress) return;
    const unsubscribe = window.electronAPI.onUpdateProgress((p: any) => {
      if (!p) return;
      if (
        p.phase === 'checking' ||
        p.phase === 'downloading' ||
        p.phase === 'installing' ||
        p.phase === 'optional-prompt'
      ) {
        setStartupPhase(p.phase);
      }
      if (typeof p.percent === 'number') setStartupPct(p.percent);
      if (typeof p.transferredBytes === 'number')
        setStartupTransferredBytes(p.transferredBytes);
      if (typeof p.totalBytes === 'number') setStartupTotalBytes(p.totalBytes);
      if (p.version) setStartupTargetVersion(p.version);
      if (p.manifest) setStartupManifest(p.manifest);

      setUpdatePrompt((prev) =>
        prev
          ? {
              ...prev,
              phase: p.phase || prev.phase,
              percent:
                typeof p.percent === 'number' ? p.percent : prev.percent,
              transferredBytes:
                typeof p.transferredBytes === 'number'
                  ? p.transferredBytes
                  : prev.transferredBytes,
              totalBytes:
                typeof p.totalBytes === 'number' ? p.totalBytes : prev.totalBytes,
            }
          : null
      );
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const status = await window.electronAPI.getStartupStatus();
        if (!mounted) return;
        if (status?.activeVersion) setAppVersion(status.activeVersion);
        if (status && status.configValid === false) {
          setConfigValid(false);
          setBootChecking(false);
          return;
        }

        if (window.electronAPI.runStartupUpdateFlow) {
          const updateRes = await window.electronAPI.runStartupUpdateFlow();
          if (!mounted) return;

          if (updateRes?.applied) {
            setStartupPhase('installing');
            if (updateRes.latestVersion) {
              setStartupTargetVersion(updateRes.latestVersion);
            }
            return;
          }

          if (
            updateRes?.available &&
            !updateRes?.applied &&
            updateRes?.updateType === 'feature'
          ) {
            setStartupPhase('optional-prompt');
            setStartupTargetVersion(updateRes.latestVersion || '');
            setStartupManifest(updateRes.manifest || null);
            return;
          }
        }

        if (mounted) {
          await finishBootToAuthOrSession();
        }
      } catch {
        if (mounted) {
          await finishBootToAuthOrSession();
        }
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [finishBootToAuthOrSession]);

  const handleAuthenticated = useCallback(
    (payload: { user: any; profiles: any[] } | any, maybeProfiles?: any[]) => {
      const authUser = payload?.user !== undefined ? payload.user : payload;
      const list =
        (payload?.profiles !== undefined ? payload.profiles : maybeProfiles) ||
        [];
      setUser(authUser);
      setProfiles(list);
      if (list.length > 0) {
        setSelectedProfileId(list[0].id);
      }
      setAuthenticated(true);
    },
    []
  );

  const handleLogout = async () => {
    await window.electronAPI.logout();
    setAuthenticated(false);
    setUser(null);
    setProfiles([]);
    setSelectedProfileId('');
    showToast('Signed out.', 'info');
  };

  const handleOpenVerifyModal = async () => {
    setVerifyCodeInput('');
    setVerifyError('');
    setShowVerifyModal(true);
    await window.electronAPI.sendVerificationCode();
  };

  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError('');
    if (!/^\d{6}$/.test(verifyCodeInput.trim())) {
      setVerifyError('Please enter the 6-digit code sent to your email.');
      return;
    }
    setVerifyLoading(true);
    const res = await window.electronAPI.verifyEmailCode(
      verifyCodeInput.trim()
    );
    setVerifyLoading(false);
    if (res?.ok) {
      setUser((prev: any) =>
        prev ? { ...prev, emailVerified: true } : prev
      );
      setShowVerifyModal(false);
      showToast(
        'Email verified! 5 welcome bonus applications unlocked.',
        'success'
      );
    } else {
      setVerifyError(res?.error || 'Invalid code. Please try again.');
    }
  };

  // ── Honest Approve / Skip / Archive Semantics (RV-01, RV-03, AP-05) ──────
  const applyStatusOverride = useCallback(
    (
      job: SavedJobRecord,
      patch: Omit<LocalJobOverride, 'updated_at'>,
      summaryNote?: string
    ) => {
      // Optimistic local override keeps the UI correct even before Migration
      // 039 lands; the IPC calls below become authoritative once it does.
      const next = saveLocalJobOverride(job.id, patch);
      setJobOverrides(next);

      const api = window.electronAPI as any;
      if (
        patch.review_status &&
        typeof api?.updateSavedJobStatus === 'function'
      ) {
        const nextSummary = summaryNote
          ? `${job.match_summary ? `${job.match_summary} ` : ''}${summaryNote}`.slice(0, 500)
          : undefined;
        api
          .updateSavedJobStatus(job.id, patch.review_status, nextSummary)
          .catch(() => {});
      }
      if (
        patch.archived_at !== undefined &&
        typeof api?.archiveSavedJob === 'function'
      ) {
        api
          .archiveSavedJob(job.id, Boolean(patch.archived_at))
          .catch(() => {});
      }
    },
    []
  );

  const handleApproveJob = useCallback(
    (job: SavedJobRecord) => {
      const today = formatDateZA(new Date());
      applyStatusOverride(
        job,
        { review_status: 'approved', archived_at: null },
        `Approved in Review Queue on ${today}.`
      );
      window.electronAPI?.openExternalUrl?.(job.job_url);
      setSavedJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, review_status: 'approved' as const }
            : j
        )
      );
      showToast(
        'Approved — posting opened in your browser and saved to Applications.',
        'success'
      );
    },
    [applyStatusOverride, showToast]
  );

  const handleSkipJob = useCallback(
    (job: SavedJobRecord) => {
      const today = formatDateZA(new Date());
      applyStatusOverride(
        job,
        {
          review_status: 'skipped',
          archived_at: new Date().toISOString(),
        },
        `Skipped in Review Queue on ${today}.`
      );
      setSavedJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                review_status: 'skipped' as const,
                archived_at: new Date().toISOString(),
              }
            : j
        )
      );
      showToast(
        `${job.job_title || 'Posting'} skipped and removed from the queue.`,
        'info',
        {
          action: {
            label: 'Undo',
            onClick: () => {
              applyStatusOverride(job, {
                review_status: 'needs_review',
                archived_at: null,
              });
              setSavedJobs((prev) =>
                prev.map((j) =>
                  j.id === job.id
                    ? {
                        ...j,
                        review_status: 'needs_review' as const,
                        archived_at: null,
                      }
                    : j
                )
              );
              showToast('Restored to Review Queue.', 'success');
            },
          },
          durationMs: 10000,
        }
      );
    },
    [applyStatusOverride, showToast]
  );

  const handleArchiveJob = useCallback(
    (job: SavedJobRecord) => {
      applyStatusOverride(job, {
        archived_at: new Date().toISOString(),
      });
      setSavedJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, archived_at: new Date().toISOString() }
            : j
        )
      );
      if (selectedDetailJob?.id === job.id) setSelectedDetailJob(null);
      showToast('Application record removed from this view.', 'info', {
        action: {
          label: 'Undo',
          onClick: () => {
            applyStatusOverride(job, { archived_at: null });
            setSavedJobs((prev) =>
              prev.map((j) =>
                j.id === job.id ? { ...j, archived_at: null } : j
              )
            );
            showToast('Application record restored.', 'success');
          },
        },
        durationMs: 10000,
      });
    },
    [applyStatusOverride, selectedDetailJob, showToast]
  );

  const handleMarkSubmitted = useCallback(
    (job: SavedJobRecord) => {
      const today = formatDateZA(new Date());
      applyStatusOverride(
        job,
        { review_status: 'submitted', archived_at: null },
        `Marked submitted manually on ${today}.`
      );
      setSavedJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, review_status: 'submitted' as const }
            : j
        )
      );
      showToast('Marked as submitted.', 'success');
    },
    [applyStatusOverride, showToast]
  );

  const handleLaunchAgentBatch = () => {
    window.electronAPI?.logUIEvent('click', 'launch_agent_batch', {
      batch_size: batchSize,
      autonomy_mode: autonomyMode,
    });

    if (billingMode === 'pay-as-you-go' && costCap <= 0) {
      setShowLaunchModal(false);
      setCurrentView('billing');
      showModal({
        title: 'Set Your Spend Cap First (Currently R0)',
        message:
          'Your Pay-As-You-Go spend cap defaults to R0 so you are never charged without consent. Set a cap above R0 or choose a monthly plan to start.',
        confirmLabel: 'Go to Billing',
      });
      return;
    }

    if (!selectedProfileId) {
      setShowLaunchModal(false);
      setCurrentView('profiles');
      showModal({
        title: 'Choose a Search Profile',
        message:
          'Select or refresh a search profile first — the agent reads your job titles, location, and CV from it.',
        confirmLabel: 'OK',
      });
      return;
    }

    const autoAccept = autonomyMode !== 'approve-each';
    setShowLaunchModal(false);
    setCurrentView('run');
    setAppliedCount(0);
    setSkippedCount(0);
    setIsPaused(false);
    setIsRunning(true);

    window.electronAPI
      .runAgent({
        profileId: selectedProfileId,
        batchSize: Math.min(batchSize, dailyCapApps),
        autoAccept,
        mode: autoAccept ? 'complete' : 'ask',
        billingConfig: {
          mode: billingMode,
          tier: bundleTier,
          costCap,
        },
      })
      .then((res: any) => {
        if (res && res.ok === false) {
          setIsRunning(false);
          showToast(
            res.error || 'The agent could not start. Please try again.',
            'error'
          );
        }
      })
      .catch(() => {
        setIsRunning(false);
        showToast('The agent could not start. Please try again.', 'error');
      });
  };

  const handlePauseAgent = () => {
    setIsPaused(true);
    window.electronAPI?.pauseAgent?.().catch(() => {});
    showToast('Run paused. Click Resume Run to continue.', 'info');
  };

  const handleResumeAgent = () => {
    setIsPaused(false);
    window.electronAPI?.resumeAgent?.().catch(() => {});
    showToast('Run resumed.', 'info');
  };

  const handleStopAgent = () => {
    window.electronAPI?.logUIEvent('click', 'stop_agent_button');
    setIsRunning(false);
    setIsPaused(false);
    window.electronAPI?.stopAgent?.().catch(() => {});
    showToast('Agent stopped.', 'info');
  };

  const handleEmergencyStopAgent = () => {
    window.electronAPI?.logUIEvent('click', 'emergency_stop_button');
    setIsRunning(false);
    setIsPaused(false);
    window.electronAPI?.emergencyStopAgent?.().catch(() => {});
    showToast('Emergency Stop: browser closed immediately.', 'info');
  };

  const reviewQueueJobs = useMemo(
    () =>
      savedJobs.filter(
        (j) =>
          !isJobArchived(j, jobOverrides) &&
          resolveApplicationStatus(j, jobOverrides) === 'needs_review'
      ),
    [savedJobs, jobOverrides]
  );

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const renderTitleBar = () => (
    <header className="custom-titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-logo" aria-hidden="true">
          FM
        </span>
        <span className="titlebar-name">FMSG Agents</span>
        <span className="titlebar-version">
          {appVersion ? `v${appVersion}` : 'v—'}
        </span>
      </div>

      <div className="titlebar-right">
        {authenticated && (
          <>
            <span
              className={`titlebar-status-pill ${
                isPaused ? 'paused' : isRunning ? 'running' : 'idle'
              }`}
            >
              <span className="titlebar-status-dot" />
              {isPaused ? 'Paused' : isRunning ? 'Running' : 'Idle'}
            </span>

            <button
              type="button"
              className="titlebar-icon-btn"
              title="Open Setup Guide"
              onClick={() => {
                setOnboardingStep(1);
                setShowOnboarding(true);
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-.9 1-.9 1.7" />
                <circle cx="12" cy="17" r="0.6" fill="currentColor" />
              </svg>
              Guide
            </button>

            <div className="titlebar-notif-wrap">
              <button
                type="button"
                className="titlebar-icon-btn"
                aria-label={`Notifications${unreadNotifCount > 0 ? ` (${unreadNotifCount} unread)` : ''}`}
                onClick={() => {
                  const opening = !showNotifications;
                  setShowNotifications(opening);
                  if (opening) {
                    setNotifications((prev) =>
                      prev.map((n) => ({ ...n, read: true }))
                    );
                  }
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadNotifCount > 0 && (
                  <span className="titlebar-notif-dot">{unreadNotifCount}</span>
                )}
              </button>

              {showNotifications && (
                <div className="notifications-popover">
                  <div className="notifications-popover-head">
                    <strong>Notifications</strong>
                    <div className="notifications-popover-head-actions">
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          className="viewport-footer-link"
                          onClick={() => {
                            setNotifications([]);
                            showToast('Notifications cleared.', 'info');
                          }}
                        >
                          Clear all
                        </button>
                      )}
                      <button
                        type="button"
                        className="viewport-footer-link"
                        onClick={() => setShowNotifications(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="notifications-popover-list">
                    {notifications.length === 0 ? (
                      <div className="notifications-empty">
                        You&apos;re all caught up.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`notif-row ${n.kind}`}>
                          <div className="notif-row-top">
                            <strong>{n.title}</strong>
                            <span>{n.time}</span>
                          </div>
                          <p>{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="titlebar-window-controls">
          <button
            type="button"
            className="win-ctrl-btn"
            aria-label="Minimize window"
            onClick={() => window.electronAPI?.minimizeWindow?.()}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            className="win-ctrl-btn"
            aria-label="Maximize window"
            onClick={() => window.electronAPI?.maximizeWindow?.()}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="5" y="5" width="14" height="14" rx="1.5" />
            </svg>
          </button>
          <button
            type="button"
            className="win-ctrl-btn close"
            aria-label="Close window"
            onClick={() => window.electronAPI?.closeWindow?.()}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );

  const renderUpdateModal = () =>
    updatePrompt?.available ? (
      <UpdateProgress
        mode="modal"
        phase={updatePrompt.phase}
        currentVersion={updatePrompt.current}
        targetVersion={updatePrompt.latest}
        percent={updatePrompt.percent}
        transferredBytes={updatePrompt.transferredBytes}
        totalBytes={updatePrompt.totalBytes}
        manifest={updatePrompt.manifest}
        deferred={updatePrompt.deferred || isRunning}
        onAcceptOptional={() => {
          setUpdatePrompt((prev) =>
            prev ? { ...prev, phase: 'downloading', percent: 5 } : null
          );
          window.electronAPI
            .applyUpdate(updatePrompt.manifest)
            .then((res) => {
              if (res?.deferred) {
                showToast(res.message, 'info');
                setUpdatePrompt(null);
              }
            });
        }}
        onSkipOptional={() => setUpdatePrompt(null)}
      />
    ) : null;

  if (!configValid) {
    return (
      <div className="app-root-frame">
        {renderTitleBar()}
        <div className="auth-viewport">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div className="auth-logo-mark" aria-hidden="true">
              FM
            </div>
            <h1 className="auth-title" style={{ fontSize: '18px', marginBottom: '10px' }}>
              Unable to Start
            </h1>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: '20px',
                lineHeight: 1.5,
              }}
            >
              The app couldn&apos;t start properly. Please reinstall or contact
              support.
            </p>
            <button
              type="button"
              className="auth-submit-btn"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (bootChecking) {
    return (
      <div className="app-root-frame">
        {renderTitleBar()}
        <UpdateProgress
          mode="startup"
          phase={startupPhase}
          currentVersion={appVersion}
          targetVersion={startupTargetVersion}
          percent={startupPct}
          transferredBytes={startupTransferredBytes}
          totalBytes={startupTotalBytes}
          manifest={startupManifest}
          onAcceptOptional={() => {
            setStartupPhase('downloading');
            setStartupPct(5);
            window.electronAPI.applyUpdate(startupManifest);
          }}
          onSkipOptional={() => {
            finishBootToAuthOrSession();
          }}
        />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="app-root-frame">
        {renderTitleBar()}
        <LoginScreen
          version={appVersion}
          onAuthenticated={handleAuthenticated}
        />
        {renderUpdateModal()}
      </div>
    );
  }

  if (user?.accountStatus === 'blocked') {
    return (
      <div className="app-root-frame">
        {renderTitleBar()}
        <div className="auth-viewport">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <h2
              style={{
                margin: '0 0 10px 0',
                fontSize: '18px',
                color: 'var(--text-primary)',
              }}
            >
              Account Restricted
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: '20px',
                lineHeight: 1.5,
              }}
            >
              Your account is currently restricted. Please visit the FMSG
              website to submit an appeal or contact support.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const perAppRateZar =
    billingMode === 'bundle'
      ? bundleTier === 'Power'
        ? 22
        : bundleTier === 'Standard'
          ? 25
          : bundleTier === 'Lite'
            ? 30
            : 35
      : 40;

  const navItems: Array<{
    id: ViewType;
    label: string;
    badge?: number;
    icon: React.ReactNode;
  }> = [
    {
      id: 'home',
      label: 'Home',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      ),
    },
    {
      id: 'run',
      label: 'Run',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
    {
      id: 'applications',
      label: 'Applications',
      badge: savedJobs.filter((j) => !isJobArchived(j, jobOverrides)).length || undefined,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="7" y1="9" x2="17" y2="9" />
          <line x1="7" y1="13" x2="17" y2="13" />
          <line x1="7" y1="17" x2="13" y2="17" />
        </svg>
      ),
    },
    {
      id: 'review',
      label: 'Review',
      badge: reviewQueueJobs.length || undefined,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      id: 'profiles',
      label: 'Profiles',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: 'billing',
      label: 'Billing',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      id: 'account',
      label: 'Account',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      ),
    },
  ];

  return (
    <div className="app-root-frame">
      {renderTitleBar()}

      <div className="workspace-layout">
        {/* LEFT SIDEBAR NAVIGATION (184px expanded / 56px collapsed) */}
        <aside
          className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
          aria-label="Primary Navigation"
        >
          <div className="sidebar-nav-list">
            {navItems.map((item) => {
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={`sidebar-nav-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentView(item.id);
                    window.electronAPI?.logUIEvent('navigate', item.id);
                  }}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="sidebar-nav-label">{item.label}</span>
                  )}
                  {!sidebarCollapsed &&
                    item.badge != null &&
                    item.badge > 0 && (
                      <span className="sidebar-nav-badge">{item.badge}</span>
                    )}
                </button>
              );
            })}
          </div>

          <div className="sidebar-footer">
            {isRunning && (
              <button
                type="button"
                className="btn btn-primary sidebar-launch-btn"
                onClick={() => setShowLaunchModal(true)}
              >
                <span aria-hidden="true">⚡</span>
                {!sidebarCollapsed && <span>Run Controls</span>}
              </button>
            )}

            <div className="sidebar-user-row">
              <button
                type="button"
                className="sidebar-user-btn"
                onClick={() => setCurrentView('account')}
                title={user?.email || 'Account'}
              >
                <span className="sidebar-avatar" aria-hidden="true">
                  {(user?.email || 'U').slice(0, 1).toUpperCase()}
                </span>
                {!sidebarCollapsed && (
                  <div className="sidebar-user-meta">
                    <div className="sidebar-user-email">
                      {user?.email || 'Signed in'}
                    </div>
                    <div className="sidebar-user-plan">
                      {billingMode === 'bundle'
                        ? `${bundleTier} Plan`
                        : `${formatZar(costCap)} cap`}
                    </div>
                  </div>
                )}
              </button>

              <button
                type="button"
                className="sidebar-collapse-btn"
                title={
                  sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                }
                aria-label={
                  sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                }
                onClick={() => setSidebarCollapsed((v) => !v)}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="workspace-main">
          {/* Email verification banner */}
          {user && user.emailVerified === false && (
            <div className="verify-email-banner">
              <span>
                Verify your email address to unlock your 5 free welcome bonus
                applications.
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ height: 30, padding: '0 12px', fontSize: '12px' }}
                onClick={handleOpenVerifyModal}
              >
                Verify Email
              </button>
            </div>
          )}

          {/* 1. HOME DASHBOARD */}
          {currentView === 'home' && (
            <HomeView
              profile={selectedProfile}
              savedJobs={savedJobs}
              jobOverrides={jobOverrides}
              reviewCount={reviewQueueJobs.length}
              isRunning={isRunning}
              costCap={costCap}
              billingMode={billingMode}
              bundleTier={bundleTier}
              emailVerified={user?.emailVerified !== false}
              onStartApplying={() => setShowLaunchModal(true)}
              onNavigate={setCurrentView}
              onOpenJobDetail={(job) => {
                setSelectedDetailJob(job);
                setCurrentView('applications');
              }}
            />
          )}

          {/* 2. LIVE RUN */}
          {currentView === 'run' && (
            <LiveLog
              profile={selectedProfile}
              profiles={profiles}
              selectedProfileId={selectedProfileId}
              onProfileChange={setSelectedProfileId}
              isRunning={isRunning}
              isPaused={isPaused}
              batchSize={batchSize}
              appliedCount={appliedCount}
              skippedCount={skippedCount}
              onOpenLaunchModal={() => setShowLaunchModal(true)}
              onStopAgent={handleStopAgent}
              onPauseAgent={handlePauseAgent}
              onResumeAgent={handleResumeAgent}
              onEmergencyStopAgent={handleEmergencyStopAgent}
            />
          )}

          {/* 3. APPLICATIONS TRACKER + DETAIL & REPLAY */}
          {currentView === 'applications' && (
            <ApplicationsView
              jobs={savedJobs}
              overrides={jobOverrides}
              loading={jobsLoading}
              selectedJob={selectedDetailJob}
              onSelectJob={setSelectedDetailJob}
              onRefresh={refreshSavedJobs}
              onStartRun={() => setCurrentView('run')}
              onArchiveJob={handleArchiveJob}
              onMarkSubmitted={handleMarkSubmitted}
            />
          )}

          {/* 4. REVIEW QUEUE */}
          {currentView === 'review' && (
            <ReviewView
              jobs={reviewQueueJobs}
              onApproveJob={handleApproveJob}
              onSkipJob={handleSkipJob}
              onInspectJob={(job) => {
                setSelectedDetailJob(job);
                setCurrentView('applications');
              }}
              onStartRun={() => setCurrentView('run')}
            />
          )}

          {/* 5. PROFILES + RULES & ANSWER BANK */}
          {currentView === 'profiles' && (
            <ProfilesAndRulesView
              profiles={profiles}
              selectedProfileId={selectedProfileId}
              onSelect={(id) => {
                setSelectedProfileId(id);
                showToast('Active search profile updated.', 'success');
              }}
              onRefresh={async () => {
                const res = await window.electronAPI.loadProfiles();
                if (res?.ok && res.profiles) {
                  setProfiles(res.profiles);
                  if (res.profiles.length > 0 && !selectedProfileId) {
                    setSelectedProfileId(res.profiles[0].id);
                  }
                  showToast('Profiles refreshed.', 'info');
                }
              }}
            />
          )}

          {/* 6. BILLING, PLANS & SPEND CAP */}
          {currentView === 'billing' && (
            <BillingPanel
              costCap={costCap}
              onCostCapChange={setCostCap}
              mode={billingMode}
              onModeChange={(nextMode) => {
                setBillingMode(nextMode);
                window.electronAPI
                  ?.saveAgentPrefs?.({ billingMode: nextMode })
                  .catch(() => {});
              }}
              tier={bundleTier}
              onTierChange={(nextTier) => {
                setBundleTier(nextTier);
                window.electronAPI
                  ?.saveAgentPrefs?.({ bundleTier: nextTier })
                  .catch(() => {});
              }}
              appliedTotal={savedJobs.filter((j) => !isJobArchived(j, jobOverrides)).length}
              emailVerified={user?.emailVerified !== false}
              onUpgraded={async () => {
                try {
                  const res = await window.electronAPI.loadProfiles();
                  if (res?.ok) {
                    if (res.user) setUser(res.user);
                    if (res.profiles) setProfiles(res.profiles);
                  }
                } catch {
                  // ignore
                }
              }}
            />
          )}

          {/* 7. SETTINGS */}
          {currentView === 'settings' && (
            <SettingsPanel
              selectedProfileId={selectedProfileId}
              costCap={costCap}
              billingMode={billingMode}
              bundleTier={bundleTier}
              isRunning={isRunning}
              onRunningChange={setIsRunning}
              onBatchChange={setBatchSize}
              onOpenOnboarding={() => {
                setOnboardingStep(1);
                setShowOnboarding(true);
              }}
              onAccountDeleted={() => {
                setAuthenticated(false);
                setUser(null);
                setProfiles([]);
              }}
              fullPage
            />
          )}

          {/* 8. ACCOUNT & SECURITY CENTRE */}
          {currentView === 'account' && (
            <AccountView
              user={user}
              appVersion={appVersion}
              billingMode={billingMode}
              bundleTier={bundleTier}
              costCap={costCap}
              savedJobsCount={
                savedJobs.filter((j) => !isJobArchived(j, jobOverrides)).length
              }
              profilesCount={profiles.length}
              onLogout={handleLogout}
              onOpenSettings={() => setCurrentView('settings')}
              onOpenBilling={() => setCurrentView('billing')}
              onOpenProfiles={() => setCurrentView('profiles')}
            />
          )}
        </main>
      </div>

      {/* RUN SETUP MODAL (Matches Sheet Screen #6) */}
      {showLaunchModal && (
        <div
          className={`modal-backdrop content-modal ${
            sidebarCollapsed ? 'sidebar-collapsed' : ''
          }`}
          onClick={() => setShowLaunchModal(false)}
        >
          <div
            className="modal-card run-setup-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-setup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="run-setup-header modal-shell-header">
              <div>
                <span className="needs-you-eyebrow">RUN SETUP</span>
                <h2 id="run-setup-title" className="run-setup-title">
                  Configure Application Run
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close run setup"
                title="Close (Esc)"
                onClick={() => setShowLaunchModal(false)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="modal-shell-body">
              <div className="run-setup-grid">
                {/* Left Column: Select Profile */}
                <div className="run-setup-col">
                  <div className="run-setup-label">
                    Select profile{' '}
                    <span className="run-setup-count">
                      {profiles.length} available
                    </span>
                  </div>
                  <div className="run-setup-profile-list">
                    {profiles.length === 0 ? (
                      <div className="card-nested" style={{ padding: 12 }}>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                          No profiles loaded yet.
                        </div>
                      </div>
                    ) : (
                      profiles.map((p: any) => {
                        const active = p.id === selectedProfileId;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={`run-setup-profile-card ${
                              active ? 'active' : ''
                            }`}
                            aria-pressed={active}
                            onClick={() => setSelectedProfileId(p.id)}
                          >
                            <span className="run-setup-avatar" aria-hidden="true">
                              {(p.name || 'P').slice(0, 1).toUpperCase()}
                            </span>
                            <div className="run-setup-profile-text">
                              <strong>{formatProfileName(p.name)}</strong>
                              <span>
                                {(p.job_titles || [])[0] ||
                                  p.industry ||
                                  'General'}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Center Column: Batch Size, Autonomy Mode, Daily Cap Slider */}
                <div className="run-setup-col">
                  <div className="run-setup-label">Batch size</div>
                  <div className="batch-preset-grid">
                    {[10, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBatchSize(preset)}
                        className={`batch-preset-btn ${
                          batchSize === preset ? 'selected' : ''
                        }`}
                        aria-pressed={batchSize === preset}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div
                    className="run-setup-label"
                    style={{ marginTop: 10 }}
                  >
                    Autonomy mode
                  </div>
                  <div className="autonomy-mode-grid">
                    {[
                      {
                        id: 'full-auto' as const,
                        title: 'Full auto',
                        desc: 'Tailor CV & submit automatically',
                      },
                      {
                        id: 'approve-each' as const,
                        title: 'Approve each',
                        desc: 'Pause for your review before submit',
                      },
                      {
                        id: 'aggressive' as const,
                        title: 'Fast batch',
                        desc: 'Prioritize rapid multi-board apply',
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`autonomy-card ${
                          autonomyMode === m.id ? 'active' : ''
                        }`}
                        aria-pressed={autonomyMode === m.id}
                        onClick={() => {
                          setAutonomyMode(m.id);
                          window.electronAPI
                            ?.saveAgentPrefs?.({ autonomyMode: m.id })
                            .catch(() => {});
                        }}
                      >
                        <strong>{m.title}</strong>
                        <span>{m.desc}</span>
                      </button>
                    ))}
                  </div>

                  <div className="run-setup-slider-box">
                    <div className="run-setup-slider-top">
                      <label htmlFor="daily-cap-slider">
                        Daily cap: {dailyCapApps} applications
                      </label>
                      <span>Range 1–100</span>
                    </div>
                    <input
                      id="daily-cap-slider"
                      type="range"
                      min={1}
                      max={100}
                      value={dailyCapApps}
                      onChange={(e) =>
                        setDailyCapApps(parseInt(e.target.value, 10) || 25)
                      }
                      style={{ width: '100%', accentColor: '#203eea' }}
                    />
                  </div>
                </div>

                {/* Right Column: Est. Cost & Start Button */}
                <div className="run-setup-col run-setup-summary-col">
                  <div className="run-setup-label">Estimated cost</div>
                  <div className="run-setup-cost-box">
                    <div className="run-setup-cost-big">
                      {Math.min(batchSize, dailyCapApps)} applications
                    </div>
                    <div className="run-setup-cost-sub">
                      {formatZar(perAppRateZar, { perApplication: true })}{' '}
                      (job searches included)
                    </div>
                    <div className="run-setup-divider" />
                    <div className="run-setup-stat-row">
                      <span>Billing mode</span>
                      <strong>
                        {billingMode === 'bundle'
                          ? `${bundleTier} Plan`
                          : 'Pay-As-You-Go'}
                      </strong>
                    </div>
                    <div className="run-setup-stat-row">
                      <span>Spend cap</span>
                      <strong>{formatZar(costCap)}</strong>
                    </div>
                    <div className="run-setup-stat-row">
                      <span>Estimated run cost</span>
                      <strong>
                        {formatZar(
                          Math.min(batchSize, dailyCapApps) * perAppRateZar
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-shell-footer run-setup-footer">
              <div className="run-setup-footer-cost">
                <span>Run total:</span>
                <strong>
                  {formatZar(
                    Math.min(batchSize, dailyCapApps) * perAppRateZar
                  )}
                </strong>
                <span className="run-setup-footer-note">
                  capped at {formatZar(costCap)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {isRunning && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      handleStopAgent();
                      setShowLaunchModal(false);
                    }}
                  >
                    Stop
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleLaunchAgentBatch}
                >
                  Start ({Math.min(batchSize, dailyCapApps)})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4-STEP ONBOARDING WIZARD MODAL (Matches Sheet Screens #2, #3, #4) */}
      {showOnboarding && (
        <OnboardingWizardModal
          step={onboardingStep}
          onStepChange={setOnboardingStep}
          profile={selectedProfile}
          onClose={() => {
            setShowOnboarding(false);
            window.electronAPI
              ?.saveAgentPrefs?.({ onboardingCompleted: true })
              .catch(() => {});
          }}
          onRunTest={() => {
            setShowOnboarding(false);
            window.electronAPI
              ?.saveAgentPrefs?.({ onboardingCompleted: true })
              .catch(() => {});
            setBatchSize(5);
            setShowLaunchModal(true);
          }}
        />
      )}

      {/* 6-Digit Email Verification Modal */}
      {showVerifyModal && (
        <div className="modal-backdrop">
          <div
            className="modal-card shared-modal-shell modal-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-email-title"
          >
            <div className="modal-shell-header">
              <h2
                id="verify-email-title"
                className="modal-shell-title"
                style={{ margin: 0 }}
              >
                Verify Your Email
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close dialog"
                onClick={() => setShowVerifyModal(false)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-shell-body">
              <p className="modal-shell-message">
                Enter the 6-digit verification code sent to {user?.email}.
              </p>
              <form onSubmit={handleVerifyCodeSubmit} className="auth-form">
                <div className="form-group">
                  <label htmlFor="verify-code-input" className="field-label">
                    6-Digit Code
                  </label>
                  <input
                    id="verify-code-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={verifyCodeInput}
                    onChange={(e) =>
                      setVerifyCodeInput(e.target.value.replace(/\D/g, ''))
                    }
                    placeholder="123456"
                    className="field-input"
                    autoFocus
                  />
                  {verifyError && (
                    <div className="field-error-text" role="alert">
                      {verifyError}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={verifyLoading}
                  >
                    {verifyLoading ? (
                      <>
                        <Spinner />
                        Verifying…
                      </>
                    ) : (
                      'Verify'
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowVerifyModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {renderUpdateModal()}
    </div>
  );
}

/* ── 5. PROFILES + RULES & ANSWER BANK (Matches Sheet Screens #12 & #13) ─── */

function ProfilesAndRulesView({
  profiles,
  selectedProfileId,
  onSelect,
  onRefresh,
}: {
  profiles: any[];
  selectedProfileId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const { showToast } = useDialog();
  const [tab, setTab] = useState<'profiles' | 'rules'>('profiles');
  const [minSalary, setMinSalary] = useState(25000);
  const [minSalaryInput, setMinSalaryInput] = useState('25 000');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [answers, setAnswers] = useState<
    Array<{
      id: string;
      question: string;
      answer: string;
      category: 'Personal' | 'Experience' | 'Preferences';
      askEachTime: boolean;
    }>
  >([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');

  useEffect(() => {
    window.electronAPI
      ?.getScreeningRules?.()
      .then((res) => {
        if (res?.ok && res.rules) {
          setMinSalary(res.rules.minSalaryZar || 0);
          setMinSalaryInput(
            String(res.rules.minSalaryZar || 0)
              .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
          );
          setKeywords(res.rules.mustHaveKeywords || []);
          setAnswers(res.rules.answers || []);
        }
      })
      .catch(() => {});
  }, []);

  const persistRules = (patch: any) => {
    window.electronAPI
      ?.saveScreeningRules?.({
        minSalaryZar: minSalary,
        mustHaveKeywords: keywords,
        answers,
        ...patch,
      })
      .then(() => {
        showToast('Rules & Answer Bank saved.', 'success');
      })
      .catch(() => {});
  };

  const handleMinSalaryInput = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '').slice(0, 7);
    setMinSalaryInput(
      digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    );
    const parsed = parseInt(digits, 10);
    if (!Number.isNaN(parsed)) {
      setMinSalary(Math.min(parsed, 500000));
    }
  };

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h1 className="billing-title">
            {tab === 'profiles' ? 'Search Profiles' : 'Rules & Answer Bank'}
          </h1>
          <p className="billing-subtitle">
            {tab === 'profiles'
              ? 'Choose the active profile the agent applies with.'
              : 'Configure the screening rules and reusable answers the agent uses when filling applications.'}
          </p>
        </div>
        <div className="profiles-header-controls">
          <div className="tracker-filter-pills" role="tablist" aria-label="Profiles sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'profiles'}
              className={`spend-preset-chip ${
                tab === 'profiles' ? 'active' : ''
              }`}
              onClick={() => setTab('profiles')}
            >
              Profiles ({profiles.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'rules'}
              className={`spend-preset-chip ${
                tab === 'rules' ? 'active' : ''
              }`}
              onClick={() => setTab('rules')}
            >
              Rules &amp; Answer Bank
            </button>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </header>

      {tab === 'profiles' ? (
        <div className="profiles-card-grid">
          {profiles.map((p: any) => {
            const active = selectedProfileId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                className={`profile-grid-card ${active ? 'active' : ''}`}
                aria-pressed={active}
              >
                <div className="profile-grid-avatar" aria-hidden="true">
                  {(p.name || 'P').slice(0, 2).toUpperCase()}
                </div>
                <div className="profile-grid-body">
                  <div className="profile-grid-top">
                    <strong>{formatProfileName(p.name)}</strong>
                    <span
                      className={`tag ${active ? 'tag-active' : ''}`}
                    >
                      {active ? '✓ Active' : 'Select'}
                    </span>
                  </div>
                  <div className="profile-grid-roles">
                    {(p.job_titles || []).slice(0, 3).join(' · ') ||
                      'No titles set'}
                  </div>
                  <div className="profile-grid-meta">
                    {p.industry || 'General'} ·{' '}
                    {formatLocationZA(p.location, 'South Africa')}
                  </div>
                  <div className="profile-grid-facts">
                    {p.desired_salary ? (
                      <span>Expected: {p.desired_salary}</span>
                    ) : null}
                    {p.cv_file_path ? (
                      <span className="profile-cv-ok">CV attached</span>
                    ) : (
                      <span className="profile-cv-missing">No CV on file</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          <button
            type="button"
            className="profile-grid-card create-new"
            onClick={() =>
              window.electronAPI?.openExternalUrl(
                'https://www.findmesomejobs.co.za/dashboard'
              )
            }
          >
            <div className="profile-grid-avatar" aria-hidden="true">
              +
            </div>
            <div className="profile-grid-body">
              <strong>Create / Edit Profile on FMSG</strong>
              <div className="profile-grid-meta">
                Opens your FMSG web dashboard, then click Refresh here.
              </div>
            </div>
          </button>
        </div>
      ) : (
        <div className="rules-bank-layout">
          <section className="billing-section">
            <div className="billing-section-head">
              <h2 className="billing-section-title">Screening Rules</h2>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => persistRules({})}
              >
                Save Rules
              </button>
            </div>

            <div className="rules-slider-row">
              <div className="run-setup-slider-top">
                <label htmlFor="min-salary-range">
                  Minimum expected monthly salary (ZAR)
                </label>
                <strong>{formatZar(minSalary)}</strong>
              </div>
              <input
                id="min-salary-range"
                type="range"
                min={0}
                max={200000}
                step={2500}
                value={Math.min(minSalary, 200000)}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10) || 0;
                  setMinSalary(parsed);
                  setMinSalaryInput(
                    String(parsed).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                  );
                }}
                style={{ width: '100%', accentColor: '#203eea' }}
              />
              <div className="salary-input-row">
                <label className="spend-field" htmlFor="min-salary-input">
                  <span className="spend-prefix">R</span>
                  <input
                    id="min-salary-input"
                    className="spend-input"
                    type="text"
                    inputMode="numeric"
                    aria-label="Minimum salary in Rand"
                    value={minSalaryInput}
                    onChange={(e) => handleMinSalaryInput(e.target.value)}
                    onBlur={() => {
                      setMinSalaryInput(
                        String(minSalary).replace(
                          /\B(?=(\d{3})+(?!\d))/g,
                          ' '
                        )
                      );
                    }}
                  />
                </label>
                <span className="field-hint">
                  Exact amount also available as typed input
                </span>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="run-setup-label">Must-have keywords</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: 6 }}>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Add keyword (e.g. Remote, TypeScript, BCom)…"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && keywordInput.trim()) {
                      e.preventDefault();
                      const next = [...keywords, keywordInput.trim()];
                      setKeywords(next);
                      setKeywordInput('');
                      persistRules({ mustHaveKeywords: next });
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!keywordInput.trim()) return;
                    const next = [...keywords, keywordInput.trim()];
                    setKeywords(next);
                    setKeywordInput('');
                    persistRules({ mustHaveKeywords: next });
                  }}
                >
                  Add Keyword
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginTop: 8,
                }}
              >
                {keywords.map((kw) => (
                  <span key={kw} className="tag">
                    {kw}{' '}
                    <button
                      type="button"
                      className="viewport-footer-link"
                      aria-label={`Remove keyword ${kw}`}
                      onClick={() => {
                        const next = keywords.filter((k) => k !== kw);
                        setKeywords(next);
                        persistRules({ mustHaveKeywords: next });
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="billing-section">
            <div className="billing-section-head">
              <h2 className="billing-section-title">
                Saved Application Answers
              </h2>
              <span className="tag">Saved automatically</span>
            </div>
            <div className="answer-bank-list">
              {answers.length === 0 && (
                <p className="billing-section-note">
                  Add a question you see often and a truthful answer. The agent
                  reuses saved answers so it never fills a form with guesswork.
                </p>
              )}
              {answers.map((a) =>
                editingAnswerId === a.id ? (
                  <div key={a.id} className="answer-bank-row editing">
                    <div className="answer-bank-edit-fields">
                      <input
                        type="text"
                        className="field-input"
                        aria-label="Edit question"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                      />
                      <input
                        type="text"
                        className="field-input"
                        aria-label="Edit answer"
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                      />
                    </div>
                    <div className="answer-bank-row-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-compact"
                        onClick={() => {
                          const next = answers.map((item) =>
                            item.id === a.id
                              ? {
                                  ...item,
                                  question: editQuestion.trim() || item.question,
                                  answer: editAnswer.trim() || item.answer,
                                }
                              : item
                          );
                          setAnswers(next);
                          setEditingAnswerId(null);
                          persistRules({ answers: next });
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => setEditingAnswerId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={a.id} className="answer-bank-row">
                    <div>
                      <strong>{a.question}</strong>
                      <div className="answer-bank-val">{a.answer}</div>
                    </div>
                    <div className="answer-bank-row-actions">
                      <button
                        type="button"
                        className="viewport-footer-link"
                        onClick={() => {
                          setEditingAnswerId(a.id);
                          setEditQuestion(a.question);
                          setEditAnswer(a.answer);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="viewport-footer-link"
                        onClick={() => {
                          const next = answers.filter(
                            (item) => item.id !== a.id
                          );
                          setAnswers(next);
                          persistRules({ answers: next });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="secret-editor-fields" style={{ marginTop: 10 }}>
              <input
                type="text"
                className="field-input"
                placeholder="Question (e.g. How many years of experience?)"
                aria-label="New screening question"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
              />
              <input
                type="text"
                className="field-input"
                placeholder="Your truthful answer"
                aria-label="New screening answer"
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!newQuestion.trim() || !newAnswer.trim()) return;
                  const next = [
                    ...answers,
                    {
                      id: `ans_${Date.now()}`,
                      question: newQuestion.trim(),
                      answer: newAnswer.trim(),
                      category: 'Experience' as const,
                      askEachTime: false,
                    },
                  ];
                  setAnswers(next);
                  setNewQuestion('');
                  setNewAnswer('');
                  persistRules({ answers: next });
                }}
              >
                Add Answer
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ── 4-STEP ONBOARDING WIZARD MODAL (Matches Sheet Screens #2, #3, #4) ──── */

function OnboardingWizardModal({
  step,
  onStepChange,
  profile,
  onClose,
  onRunTest,
}: {
  step: 1 | 2 | 3 | 4;
  onStepChange: (s: 1 | 2 | 3 | 4) => void;
  profile: any;
  onClose: () => void;
  onRunTest: () => void;
}) {
  const { showToast } = useDialog();
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [activeSite, setActiveSite] = useState<
    (typeof ONBOARDING_SITES)[0] | null
  >(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const refreshSaved = useCallback(() => {
    window.electronAPI
      ?.listSiteSecrets?.()
      .then((res) => {
        if (res?.ok && Array.isArray(res.items)) {
          setSavedKeys(res.items.map((i: any) => i.keyName));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSaved();
  }, [refreshSaved]);

  const handleSaveConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSite) return;
    const res = await window.electronAPI?.saveSiteSecret?.({
      siteLabel: activeSite.label,
      allowedDomain: activeSite.domain,
      username: username.trim(),
      password,
      keyName: activeSite.keyName,
    });
    if (res?.ok) {
      showToast(
        `Saved ${activeSite.label} sign-in securely on this PC.`,
        'success'
      );
      setActiveSite(null);
      setUsername('');
      setPassword('');
      refreshSaved();
    } else {
      showToast(res?.error || 'Could not save login.', 'error');
    }
  };

  const STEP_TITLES: Record<1 | 2 | 3 | 4, string> = {
    1: 'How it works',
    2: 'Connect job accounts',
    3: 'Test run',
    4: 'You\u2019re ready',
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card onboarding-modal shared-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-top modal-shell-header">
          <div>
            <span className="needs-you-eyebrow">
              STEP {step} OF 4 · {STEP_TITLES[step].toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="viewport-footer-link"
              onClick={onClose}
            >
              Skip tour
            </button>
            <button
              type="button"
              className="modal-close-btn"
              aria-label="Close setup guide"
              onClick={onClose}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="modal-shell-body">
          {step === 1 && (
            <div className="onboarding-body">
              <h2 id="onboarding-modal-title" className="onboarding-title">
                How FMSG Agents works
              </h2>
              <p className="onboarding-sub">
                Three steps from live posting to a tracked application — in
                your own Chrome, with your approval wherever it matters.
              </p>
              <div className="onboarding-feature-grid">
                <div className="onboarding-feature-card">
                  <span className="onboarding-feature-icon" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.2-3.2" />
                    </svg>
                  </span>
                  <strong>Find jobs</strong>
                  <span>
                    Searches live postings matching your FMSG search profile.
                  </span>
                </div>
                <div className="onboarding-feature-card">
                  <span className="onboarding-feature-icon" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                      <path d="M14 3v5h5" />
                      <path d="M9 13h6M9 17h4" />
                    </svg>
                  </span>
                  <strong>Tailor your CV</strong>
                  <span>
                    Aligns your verified profile highlights to each job spec.
                  </span>
                </div>
                <div className="onboarding-feature-card">
                  <span className="onboarding-feature-icon" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M3 16.5 9 10l4 4 7.5-7.5" />
                      <path d="M15 3h5v5" />
                    </svg>
                  </span>
                  <strong>Apply for you</strong>
                  <span>
                    Fills forms in Chrome and pauses whenever it needs you.
                  </span>
                </div>
              </div>

              <div className="onboarding-explain-box">
                <h3>Two settings worth knowing</h3>
                <ul>
                  <li>
                    <strong>Your allowance:</strong> every plan includes a set
                    number of applications, and your spend cap (starts at R0)
                    stops Pay-As-You-Go charges before they surprise you.
                  </li>
                  <li>
                    <strong>&quot;Approve each&quot;:</strong> the agent pauses
                    before submitting so you review the form in Chrome first.
                    Nothing is ever submitted without your chosen approval
                    setting.
                  </li>
                </ul>
              </div>

              <div className="onboarding-footer">
                <div className="onboarding-dots" aria-hidden="true">
                  <span className="active" />
                  <span />
                  <span />
                  <span />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onStepChange(2)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-body">
              <h2 id="onboarding-modal-title" className="onboarding-title">
                Connect your job accounts
              </h2>
              <p className="onboarding-sub">
                Optional: save job-board sign-ins encrypted on this PC. The
                agent uses them only on the matching official website, never
                with AI models or external servers.
              </p>
              <div className="onboarding-sites-grid">
                {ONBOARDING_SITES.map((s) => {
                  const connected = savedKeys.includes(s.keyName);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`onboarding-site-tile ${
                        connected ? 'connected' : ''
                      }`}
                      aria-pressed={connected}
                      onClick={() => {
                        setActiveSite(s);
                        setUsername('');
                        setPassword('');
                      }}
                    >
                      <span
                        className="onboarding-site-icon"
                        style={{ background: s.color }}
                        aria-hidden="true"
                      >
                        {s.label.slice(0, 2).toUpperCase()}
                      </span>
                      <strong>{s.label}</strong>
                      <span>{connected ? 'Connected ✓' : 'Connect'}</span>
                    </button>
                  );
                })}
              </div>

              {activeSite && (
                <form
                  onSubmit={handleSaveConnect}
                  className="secret-editor-box"
                  style={{ marginTop: 10 }}
                >
                  <div className="secret-editor-head">
                    <strong>Connect {activeSite.label}</strong>
                    <span>Locked to {activeSite.domain}</span>
                  </div>
                  <div className="secret-editor-fields">
                    <input
                      type="text"
                      className="field-input"
                      aria-label={`${activeSite.label} email or username`}
                      placeholder={`Email / username for ${activeSite.label}`}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                    <input
                      type="password"
                      className="field-input"
                      aria-label={`${activeSite.label} password`}
                      placeholder={`Password for ${activeSite.label} (encrypted locally)`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn btn-primary">
                      Save
                    </button>
                  </div>
                </form>
              )}

              <div className="onboarding-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onStepChange(1)}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onStepChange(3)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-body">
              <h2 id="onboarding-modal-title" className="onboarding-title">
                Run a quick test
              </h2>
              <p className="onboarding-sub">
                Verify your active profile and watch the agent open real
                postings in Chrome.
              </p>
              <div className="bento-card" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                  {(profile?.job_titles || [])[0] ||
                    formatProfileName(profile?.name) ||
                    'Your Active Search Profile'}
                </div>
                <div
                  style={{ fontSize: '12px', color: '#94a3b8', marginTop: 4 }}
                >
                  Location: {formatLocationZA(profile?.location)} · Industry:{' '}
                  {profile?.industry || 'All'}
                </div>
                <ul
                  style={{
                    margin: '10px 0 0',
                    paddingLeft: 18,
                    fontSize: '12px',
                    color: '#cbd5e1',
                    lineHeight: 1.6,
                  }}
                >
                  <li>Finds live matching job postings</li>
                  <li>Tailors your CV highlights honestly</li>
                  <li>Shows real-time browser screenshots in the Run tab</li>
                </ul>
              </div>

              <div className="onboarding-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onStepChange(2)}
                >
                  ← Back
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onStepChange(4)}
                  >
                    Skip Test
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onRunTest}
                  >
                    Run Test
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="onboarding-body">
              <h2 id="onboarding-modal-title" className="onboarding-title">
                You&apos;re ready to go
              </h2>
              <p className="onboarding-sub">
                Your account includes{' '}
                <strong>5 free welcome bonus applications</strong> (once email
                is verified), and your Pay-As-You-Go spend cap starts safely at{' '}
                <strong>R0</strong>.
              </p>
              <div className="onboarding-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onStepChange(3)}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onClose}
                >
                  Open Workspace
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 8. ACCOUNT & SECURITY CENTRE VIEW (AC-01, AC-02, AC-05, P3.2) ────────── */

function AccountView({
  user,
  billingMode,
  bundleTier,
  costCap,
  savedJobsCount,
  profilesCount,
  onLogout,
  onOpenSettings,
  onOpenBilling,
  onOpenProfiles,
}: {
  user: any;
  appVersion: string;
  billingMode: 'pay-as-you-go' | 'bundle';
  bundleTier: string;
  costCap: number;
  savedJobsCount: number;
  profilesCount: number;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenBilling: () => void;
  onOpenProfiles: () => void;
}) {
  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h1 className="billing-title">Account</h1>
          <p className="billing-subtitle">
            Your identity, plan, and security summary for this installation.
          </p>
        </div>
      </header>

      <div className="account-overview-grid">
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h2 className="billing-section-title">Profile</h2>
          </div>
          <div className="account-identity-row">
            <span className="account-avatar" aria-hidden="true">
              {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="account-name">
                {[user?.name, user?.surname].filter(Boolean).join(' ') ||
                  'FMSG member'}
              </div>
              <div className="account-email">{user?.email}</div>
            </div>
          </div>
          <div className="billing-usage-meta" style={{ marginTop: 12 }}>
            <div className="billing-stat-line">
              <span>Email status:</span>
              <strong>
                {user?.emailVerified === false
                  ? 'Unverified'
                  : 'Verified ✓'}
              </strong>
            </div>
            <div className="billing-stat-line">
              <span>Plan:</span>
              <strong>
                {billingMode === 'bundle'
                  ? `${bundleTier} Plan`
                  : 'Pay-As-You-Go'}
              </strong>
            </div>
            <div className="billing-stat-line">
              <span>Spend cap:</span>
              <strong>{formatZar(costCap)}</strong>
            </div>
            <div className="billing-stat-line">
              <span>Active profiles:</span>
              <strong>{profilesCount}</strong>
            </div>
            <div className="billing-stat-line">
              <span>Tracked applications:</span>
              <strong>{savedJobsCount}</strong>
            </div>
          </div>
        </section>

        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h2 className="billing-section-title">Security</h2>
            <span className="status-pill-sm applied">Protected</span>
          </div>
          <p className="billing-section-note">
            This installation uses a random security key stored in Windows
            protected storage to verify signed updates. Saved job-board
            sign-ins stay encrypted on this PC.
          </p>
          <div className="account-security-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenSettings}
            >
              Manage Security Settings
            </button>
          </div>
        </section>

        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h2 className="billing-section-title">Quick Actions</h2>
          </div>
          <div className="account-security-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenBilling}
            >
              Manage Plan &amp; Billing
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenProfiles}
            >
              Manage Search Profiles
            </button>
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={onLogout}
            >
              Sign Out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DialogProvider>
      <AppInner />
    </DialogProvider>
  );
}
