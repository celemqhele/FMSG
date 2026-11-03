import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DialogProvider, useDialog } from './components/DialogSystem';
import LiveLog from './components/LiveLog';
import SettingsPanel from './components/SettingsPanel';
import LoginScreen from './components/LoginScreen';
import BillingPanel from './components/BillingPanel';
import UpdateProgress, { UpdateScreenPhase } from './components/UpdateProgress';

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

interface SavedJobRow {
  id: string;
  profile_id?: string | null;
  job_title: string;
  company: string;
  location?: string;
  estimated_salary?: string;
  match_score?: number;
  match_summary?: string;
  job_url: string;
  full_spec?: string;
  created_at?: string;
}

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

function deriveJobStatus(
  job: SavedJobRow
): 'Applied' | 'Needs Review' | 'Skipped' {
  const summary = (job.match_summary || '').toLowerCase();
  if (summary.includes('applied via fmsg agents')) return 'Applied';
  if (summary.includes('not auto-submitted') || summary.includes('opened via'))
    return 'Needs Review';
  return 'Applied';
}

/**
 * Shared zero-data block: icon, headline, supporting line, one action.
 * Every empty screen uses this so "nothing yet" never reads as a loading
 * skeleton (the mockups always pair an empty state with a primary action).
 */
function EmptyState({
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
  const [savedJobs, setSavedJobs] = useState<SavedJobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedDetailJob, setSelectedDetailJob] =
    useState<SavedJobRow | null>(null);

  // Notifications Popover
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif_welcome',
      title: 'Welcome to FMSG Agents v0.7.0',
      body: 'Local Credential Manager secret vault and live browser preview are active.',
      time: 'Just now',
      read: false,
      kind: 'info',
    },
  ]);
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
    (title: string, body: string, kind: 'info' | 'success' | 'warning' = 'info') => {
      setNotifications((prev) => [
        {
          id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title,
          body,
          time: new Date().toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit',
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
          event.sublabel || 'The agent stopped unexpectedly. Please try again.',
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
              percent: typeof p.percent === 'number' ? p.percent : prev.percent,
              transferredBytes:
                typeof p.transferredBytes === 'number'
                  ? p.transferredBytes
                  : prev.transferredBytes,
              totalBytes:
                typeof p.totalBytes === 'number'
                  ? p.totalBytes
                  : prev.totalBytes,
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
      setUser((prev: any) => (prev ? { ...prev, emailVerified: true } : prev));
      setShowVerifyModal(false);
      showToast('Email verified! 5 welcome bonus applications unlocked.', 'success');
    } else {
      setVerifyError(res?.error || 'Invalid code. Please try again.');
    }
  };

  const handleLaunchAgentBatch = () => {
    window.electronAPI?.logUIEvent('click', 'launch_agent_batch', {
      batch_size: batchSize,
      autonomy_mode: autonomyMode,
    });

    if (billingMode === 'pay-as-you-go' && costCap <= 0) {
      setShowLaunchModal(false);
      setCurrentView('billing');
      showModal({
        title: 'Set Your Cost Cap First (Currently R0)',
        message:
          'Your Pay-As-You-Go cost cap defaults to R0 so you are never charged without consent. Set a cost cap above R0 or choose an Application Bundle to start.',
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
    showToast('Run paused. Click Resume to continue.', 'info');
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
    () => savedJobs.filter((j) => deriveJobStatus(j) === 'Needs Review'),
    [savedJobs]
  );

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const renderTitleBar = () => (
    <header className="custom-titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-logo">FM</span>
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
              title="Setup & Onboarding Wizard"
              onClick={() => {
                setOnboardingStep(1);
                setShowOnboarding(true);
              }}
            >
              Tour
            </button>

            <div className="titlebar-notif-wrap">
              <button
                type="button"
                className="titlebar-icon-btn"
                aria-label="Notifications"
                onClick={() => {
                  setShowNotifications((v) => !v);
                  setNotifications((prev) =>
                    prev.map((n) => ({ ...n, read: true }))
                  );
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
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
                    <button
                      type="button"
                      className="viewport-footer-link"
                      onClick={() => setShowNotifications(false)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="notifications-popover-list">
                    {notifications.map((n) => (
                      <div key={n.id} className={`notif-row ${n.kind}`}>
                        <div className="notif-row-top">
                          <strong>{n.title}</strong>
                          <span>{n.time}</span>
                        </div>
                        <p>{n.body}</p>
                      </div>
                    ))}
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
            ─
          </button>
          <button
            type="button"
            className="win-ctrl-btn"
            aria-label="Maximize window"
            onClick={() => window.electronAPI?.maximizeWindow?.()}
          >
            □
          </button>
          <button
            type="button"
            className="win-ctrl-btn close"
            aria-label="Close window"
            onClick={() => window.electronAPI?.closeWindow?.()}
          >
            ✕
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
            <div className="auth-logo-mark">FM</div>
            <h1
              className="auth-title"
              style={{ fontSize: '18px', marginBottom: '10px' }}
            >
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      ),
    },
    {
      id: 'run',
      label: 'Run',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
    {
      id: 'applications',
      label: 'Applications',
      badge: savedJobs.length || undefined,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      id: 'profiles',
      label: 'Profiles',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
                  {!sidebarCollapsed && item.badge != null && item.badge > 0 && (
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
                <span>⚡</span>
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
                <span className="sidebar-avatar">
                  {(user?.email || 'U').slice(0, 1).toUpperCase()}
                </span>
                {!sidebarCollapsed && (
                  <div className="sidebar-user-meta">
                    <div className="sidebar-user-email">
                      {user?.email || 'Signed in'}
                    </div>
                    <div className="sidebar-user-plan">
                      {billingMode === 'bundle'
                        ? `${bundleTier} Bundle`
                        : `PAYG · R${costCap} cap`}
                    </div>
                  </div>
                )}
              </button>

              <button
                type="button"
                className="sidebar-collapse-btn"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
                style={{ height: 28, padding: '0 12px', fontSize: '11.5px' }}
                onClick={handleOpenVerifyModal}
              >
                Verify Email
              </button>
            </div>
          )}

          {/* 1. HOME DASHBOARD */}
          {currentView === 'home' && (
            <HomeDashboardView
              profile={selectedProfile}
              savedJobs={savedJobs}
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
            <ApplicationsTrackerView
              jobs={savedJobs}
              loading={jobsLoading}
              selectedJob={selectedDetailJob}
              onSelectJob={setSelectedDetailJob}
              onRefresh={refreshSavedJobs}
              onStartRun={() => setCurrentView('run')}
              onDeleteJob={async (id) => {
                await window.electronAPI?.deleteSavedJob?.(id);
                refreshSavedJobs();
                if (selectedDetailJob?.id === id) setSelectedDetailJob(null);
                showToast('Removed application record.', 'info');
              }}
            />
          )}

          {/* 4. REVIEW QUEUE */}
          {currentView === 'review' && (
            <ReviewQueueView
              jobs={reviewQueueJobs}
              onOpenJob={(job) => {
                window.electronAPI?.openExternalUrl?.(job.job_url);
              }}
              onSkipJob={async (id) => {
                await window.electronAPI?.deleteSavedJob?.(id);
                refreshSavedJobs();
                showToast('Skipped and removed from review queue.', 'info');
              }}
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

          {/* 6. BILLING, BUNDLES & SPEND CAP */}
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
              appliedTotal={savedJobs.length}
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

          {/* 7. SETTINGS & CREDENTIAL MANAGER VAULT */}
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

          {/* 8. ACCOUNT */}
          {currentView === 'account' && (
            <AccountView
              user={user}
              appVersion={appVersion}
              billingMode={billingMode}
              bundleTier={bundleTier}
              costCap={costCap}
              onLogout={handleLogout}
              onOpenSettings={() => setCurrentView('settings')}
            />
          )}
        </main>
      </div>

      {/* RUN SETUP MODAL (Matches Sheet Screen #6) */}
      {showLaunchModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowLaunchModal(false)}
        >
          <div
            className="modal-card run-setup-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="run-setup-header">
              <div>
                <span className="needs-you-eyebrow">RUN SETUP</span>
                <h3 className="run-setup-title">Configure Application Run</h3>
              </div>
              <button
                type="button"
                className="win-ctrl-btn"
                onClick={() => setShowLaunchModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="run-setup-grid">
              {/* Left Column: Select Profile */}
              <div className="run-setup-col">
                <div className="run-setup-label">Select profile</div>
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
                          onClick={() => setSelectedProfileId(p.id)}
                        >
                          <span className="run-setup-avatar">
                            {(p.name || 'P').slice(0, 1).toUpperCase()}
                          </span>
                          <div className="run-setup-profile-text">
                            <strong>{p.name || 'Search Profile'}</strong>
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
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="run-setup-label" style={{ marginTop: 10 }}>
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
                    <span>Daily cap: {dailyCapApps} applications</span>
                    <span>1–100</span>
                  </div>
                  <input
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
                    Rate: R{perAppRateZar} / application (searches included)
                  </div>
                  <div className="run-setup-divider" />
                  <div className="run-setup-stat-row">
                    <span>Billing mode</span>
                    <strong>
                      {billingMode === 'bundle'
                        ? `${bundleTier} Bundle`
                        : 'Pay-As-You-Go'}
                    </strong>
                  </div>
                  <div className="run-setup-stat-row">
                    <span>Cost cap</span>
                    <strong>R{costCap.toLocaleString('en-ZA')}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  {isRunning && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ flex: 1 }}
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
                    style={{ flex: 2 }}
                    onClick={handleLaunchAgentBatch}
                  >
                    Start ({Math.min(batchSize, dailyCapApps)})
                  </button>
                </div>
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
          <div className="modal-card" role="dialog" aria-modal="true">
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              Verify Your Email
            </h3>
            <p
              style={{
                margin: '0 0 14px 0',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
              }}
            >
              Enter the 6-digit verification code sent to {user?.email}.
            </p>
            <form onSubmit={handleVerifyCodeSubmit} className="auth-form">
              <div className="form-group">
                <label className="field-label">6-Digit Code</label>
                <input
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
                  <div className="field-error-text">{verifyError}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={verifyLoading}
                >
                  {verifyLoading ? 'Verifying…' : 'Verify'}
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
      )}

      {renderUpdateModal()}
    </div>
  );
}

/* ── 1. HOME DASHBOARD VIEW (Matches Sheet Screen #5) ─────────────────────── */

function HomeDashboardView({
  profile,
  savedJobs,
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
  savedJobs: SavedJobRow[];
  reviewCount: number;
  isRunning: boolean;
  costCap: number;
  billingMode: 'pay-as-you-go' | 'bundle';
  bundleTier: 'Starter' | 'Lite' | 'Standard' | 'Power';
  emailVerified: boolean;
  onStartApplying: () => void;
  onNavigate: (v: ViewType) => void;
  onOpenJobDetail: (job: SavedJobRow) => void;
}) {
  const roleTitle =
    (profile?.job_titles || [])[0] || profile?.name || 'your target roles';
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
  const totalAllowance = bundleAllowance + (emailVerified ? 5 : 0);
  const usedPct =
    totalAllowance > 0
      ? Math.min(100, Math.round((savedJobs.length / totalAllowance) * 100))
      : 0;

  // Real 7-day activity derived from stored application records (no mock data)
  const last7Days = useMemo(() => {
    const days: Array<{
      iso: string;
      weekday: string;
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
      days.push({
        iso: start.toLocaleDateString('en-ZA'),
        weekday: start.toLocaleDateString('en-ZA', { weekday: 'narrow' }),
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
      {/* Hero Banner */}
      <section className="dashboard-hero-card">
        <div className="dashboard-hero-glow" />
        <div className="dashboard-hero-content">
          <span className="needs-you-eyebrow">AUTOPILOT WORKSPACE</span>
          <h1 className="dashboard-hero-title">
            Put your job search on autopilot
          </h1>
          <p className="dashboard-hero-sub">
            Active profile: <strong>{roleTitle}</strong> ·{' '}
            {profile?.location || 'South Africa'}. The agent discovers matching
            roles, tailors your CV, and fills applications in Chrome.
          </p>
          <button
            type="button"
            className="btn btn-primary dashboard-hero-cta"
            onClick={onStartApplying}
          >
            {isRunning ? 'View Active Run ★' : 'Start Applying ★'}
          </button>
        </div>

        <ul className="dashboard-hero-features">
          <li className="dashboard-hero-feature">
            <span className="dashboard-hero-feature-icon" aria-hidden="true">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
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
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
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
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
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

      {/* 4 Quick Action Cards */}
      <section className="quick-actions-grid">
        <button
          type="button"
          className="quick-action-tile"
          onClick={onStartApplying}
        >
          <span className="quick-action-icon">⚡</span>
          <strong>Start a Run</strong>
          <span>Launch batch automation</span>
        </button>

        <button
          type="button"
          className="quick-action-tile"
          onClick={() => onNavigate('review')}
        >
          <span className="quick-action-icon">✓</span>
          <strong>Review Queue</strong>
          <span>{reviewCount} awaiting review</span>
        </button>

        <button
          type="button"
          className="quick-action-tile"
          onClick={() => onNavigate('applications')}
        >
          <span className="quick-action-icon">☰</span>
          <strong>Applications</strong>
          <span>{savedJobs.length} total tracked</span>
        </button>

        <button
          type="button"
          className="quick-action-tile"
          onClick={() => onNavigate('billing')}
        >
          <span className="quick-action-icon">R</span>
          <strong>Spend Cap &amp; Bundles</strong>
          <span>
            {billingMode === 'bundle'
              ? `${bundleTier} Bundle`
              : `Cap R${costCap}`}
          </span>
        </button>
      </section>

      {/* Bottom 3-Column Row: This Week + Recent Applications + Usage Ring */}
      <section className="dashboard-bottom-grid">
        {/* This Week — real 7-day activity from saved application records */}
        <div className="bento-card">
          <div className="bento-card-head">
            <h3>Last 7 days</h3>
            <span className="tag">{weekTotal} handled</span>
          </div>
          {weekTotal === 0 ? (
            <EmptyState
              compact
              inline
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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
            <div
              className="week-bars"
              aria-label="Applications per day, last 7 days"
            >
              {last7Days.map((day) => (
                <div
                  key={day.iso}
                  className="week-bar-col"
                  title={`${day.iso}: ${day.count}`}
                >
                  <div className="week-bar-track">
                    <div
                      className="week-bar-fill"
                      style={{
                        height: `${Math.round((day.count / weekPeak) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="week-bar-label">{day.weekday}</span>
                </div>
              ))}
            </div>
          )}
          <div className="week-stats-list" style={{ marginTop: 10 }}>
            <div className="week-stat-item">
              <div>
                <span>Applications handled</span>
                <strong>{savedJobs.length}</strong>
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
                <strong>{profile ? 1 : 0}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Applications */}
        <div className="bento-card">
          <div className="bento-card-head">
            <h3>Recent applications</h3>
            <button
              type="button"
              className="viewport-footer-link"
              onClick={() => onNavigate('applications')}
            >
              View all
            </button>
          </div>
          {savedJobs.length === 0 ? (
            <EmptyState
              compact
              inline
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 4h16v16H4z" />
                  <path d="M8 9h8M8 13h5" />
                </svg>
              }
              title="Nothing tracked yet"
              body="Applications recorded by the agent will show up here."
            />
          ) : (
            <div className="recent-apps-list">
              {savedJobs.slice(0, 4).map((job) => {
                const st = deriveJobStatus(job);
                return (
                  <button
                    key={job.id}
                    type="button"
                    className="recent-app-row"
                    onClick={() => onOpenJobDetail(job)}
                  >
                    <div className="recent-app-badge">
                      {(job.company || 'CO').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="recent-app-info">
                      <strong>{job.job_title}</strong>
                      <span>{job.company}</span>
                    </div>
                    <span
                      className={`status-pill-sm ${
                        st === 'Applied' ? 'applied' : 'review'
                      }`}
                    >
                      {st}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Usage Donut */}
        <div className="bento-card">
          <div className="bento-card-head">
            <h3>Usage</h3>
            <span className="tag">
              {billingMode === 'bundle' ? bundleTier : 'PAYG'}
            </span>
          </div>
          <div className="usage-donut-wrap">
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                r="38"
                fill="none"
                stroke="rgba(148, 163, 184, 0.16)"
                strokeWidth="7"
              />
              <circle
                cx="48"
                cy="48"
                r="38"
                fill="none"
                stroke="#203eea"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 38}
                strokeDashoffset={2 * Math.PI * 38 * (1 - usedPct / 100)}
                transform="rotate(-90 48 48)"
              />
            </svg>
            <div className="usage-donut-label">
              <strong>{usedPct}%</strong>
              <span>
                {savedJobs.length} / {totalAllowance || '∞'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── 3. APPLICATIONS TRACKER + DETAIL & REPLAY (Screens #10 & #11) ───────── */

function ApplicationsTrackerView({
  jobs,
  loading,
  selectedJob,
  onSelectJob,
  onRefresh,
  onDeleteJob,
  onStartRun,
}: {
  jobs: SavedJobRow[];
  loading: boolean;
  selectedJob: SavedJobRow | null;
  onSelectJob: (job: SavedJobRow | null) => void;
  onRefresh: () => void;
  onDeleteJob: (id: string) => void;
  onStartRun: () => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'All' | 'Applied' | 'Needs Review'
  >('All');

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const st = deriveJobStatus(j);
      if (statusFilter !== 'All' && st !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (j.job_title || '').toLowerCase().includes(q) ||
        (j.company || '').toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q)
      );
    });
  }, [jobs, query, statusFilter]);

  if (selectedJob) {
    const st = deriveJobStatus(selectedJob);
    return (
      <div className="billing-panel">
        <header className="billing-header">
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 28, fontSize: '11.5px', marginBottom: 6 }}
              onClick={() => onSelectJob(null)}
            >
              ← Back to Applications Tracker
            </button>
            <h2 className="billing-title">{selectedJob.job_title}</h2>
            <p className="billing-subtitle">
              {selectedJob.company} · {selectedJob.location || 'South Africa'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              className={`status-pill-sm ${
                st === 'Applied' ? 'applied' : 'review'
              }`}
            >
              {st}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                window.electronAPI?.openExternalUrl?.(selectedJob.job_url)
              }
            >
              Open Job Posting ↗
            </button>
          </div>
        </header>

        <div className="detail-replay-grid">
          {/* Process Timeline */}
          <div className="bento-card">
            <h3 className="billing-section-title">Application Timeline</h3>
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
                    st === 'Applied'
                      ? 'Application submitted in Chrome'
                      : 'Opened in Chrome (awaiting manual submit)',
                  done: st === 'Applied',
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

          {/* Summary & Spec */}
          <div className="bento-card">
            <h3 className="billing-section-title">
              Agent Summary &amp; Job Spec
            </h3>
            <p
              style={{
                fontSize: '12.5px',
                color: '#cbd5e1',
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              {selectedJob.match_summary ||
                'Processed by FMSG Agents using verified profile fields.'}
            </p>
            <div className="spec-scroll-box">
              {selectedJob.full_spec ||
                'No extended job description text was stored for this posting.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">Applications Tracker</h2>
          <p className="billing-subtitle">
            Every role opened or submitted by FMSG Agents, synced with your
            account.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="tracker-toolbar">
        <input
          type="text"
          className="field-input tracker-search"
          placeholder="Search company, role, or location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="tracker-filter-pills">
          {(['All', 'Applied', 'Needs Review'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`spend-preset-chip ${
                statusFilter === f ? 'active' : ''
              }`}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="tracker-table-wrap">
        {filtered.length === 0 ? (
          jobs.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
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
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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
                <th>Company</th>
                <th>Role</th>
                <th>Location</th>
                <th>Date</th>
                <th>Match</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
                const st = deriveJobStatus(job);
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
                    <td>{job.location || 'SA'}</td>
                    <td>
                      {job.created_at
                        ? new Date(job.created_at).toLocaleDateString('en-ZA')
                        : 'Recent'}
                    </td>
                    <td>{job.match_score ? `${job.match_score}%` : '—'}</td>
                    <td>
                      <span
                        className={`status-pill-sm ${
                          st === 'Applied' ? 'applied' : 'review'
                        }`}
                      >
                        {st}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="viewport-footer-link"
                        onClick={() => onDeleteJob(job.id)}
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
    </div>
  );
}

/* ── 4. REVIEW QUEUE VIEW (Matches Sheet Screen #9) ──────────────────────── */

function ReviewQueueView({
  jobs,
  onOpenJob,
  onSkipJob,
  onInspectJob,
  onStartRun,
}: {
  jobs: SavedJobRow[];
  onOpenJob: (job: SavedJobRow) => void;
  onSkipJob: (id: string) => void;
  onInspectJob: (job: SavedJobRow) => void;
  onStartRun: () => void;
}) {
  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">
            {jobs.length === 0
              ? 'Review Queue'
              : `${jobs.length} application${jobs.length === 1 ? '' : 's'} need your review`}
          </h2>
          <p className="billing-subtitle">
            Roles prepared in Approve Each mode or awaiting final confirmation
            on the employer&apos;s site.
          </p>
        </div>
      </header>

      {jobs.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
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
                  <h4>{job.job_title}</h4>
                  {job.match_score != null && (
                    <span className="current-job-score">
                      {job.match_score}% Match
                    </span>
                  )}
                </div>
                <div className="review-queue-sub">
                  {job.company} · {job.location || 'South Africa'}
                </div>
                <p className="review-queue-summary">
                  {job.match_summary || 'Ready for review and submission.'}
                </p>
              </div>
              <div className="review-queue-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onOpenJob(job)}
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
                  onClick={() => onSkipJob(job.id)}
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

  useEffect(() => {
    window.electronAPI
      ?.getScreeningRules?.()
      .then((res) => {
        if (res?.ok && res.rules) {
          setMinSalary(res.rules.minSalaryZar || 0);
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

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">Search Profiles &amp; Answer Bank</h2>
          <p className="billing-subtitle">
            Choose the active FMSG profile and configure reusable screening
            answers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn ${
              tab === 'profiles' ? 'btn-primary' : 'btn-secondary'
            }`}
            onClick={() => setTab('profiles')}
          >
            Profiles ({profiles.length})
          </button>
          <button
            type="button"
            className={`btn ${
              tab === 'rules' ? 'btn-primary' : 'btn-secondary'
            }`}
            onClick={() => setTab('rules')}
          >
            Rules &amp; Answer Bank
          </button>
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
              >
                <div className="profile-grid-avatar">
                  {(p.name || 'P').slice(0, 2).toUpperCase()}
                </div>
                <div className="profile-grid-body">
                  <div className="profile-grid-top">
                    <strong>{p.name || 'Search Profile'}</strong>
                    <span className="tag">{active ? 'Active' : 'Select'}</span>
                  </div>
                  <div className="profile-grid-roles">
                    {(p.job_titles || []).join(' · ') || 'No titles set'}
                  </div>
                  <div className="profile-grid-meta">
                    {p.industry || 'General'} · {p.location || 'South Africa'}
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
            <div className="profile-grid-avatar">+</div>
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
              <h3 className="billing-section-title">Screening Rules</h3>
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
                <span>Minimum expected monthly salary (ZAR)</span>
                <strong>R{minSalary.toLocaleString('en-ZA')}</strong>
              </div>
              <input
                type="range"
                min={0}
                max={150000}
                step={2500}
                value={minSalary}
                onChange={(e) =>
                  setMinSalary(parseInt(e.target.value, 10) || 0)
                }
                style={{ width: '100%', accentColor: '#203eea' }}
              />
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
                  Add
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
              <h3 className="billing-section-title">
                Saved Application Answers
              </h3>
            </div>
            <div className="answer-bank-list">
              {answers.map((a) => (
                <div key={a.id} className="answer-bank-row">
                  <div>
                    <strong>{a.question}</strong>
                    <div className="answer-bank-val">{a.answer}</div>
                  </div>
                  <button
                    type="button"
                    className="viewport-footer-link"
                    onClick={() => {
                      const next = answers.filter((item) => item.id !== a.id);
                      setAnswers(next);
                      persistRules({ answers: next });
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="secret-editor-fields" style={{ marginTop: 10 }}>
              <input
                type="text"
                className="field-input"
                placeholder="Question (e.g. How many years of experience?)"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
              />
              <input
                type="text"
                className="field-input"
                placeholder="Your truthful answer"
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
        `Saved ${activeSite.keyName} in local Windows Credential Manager.`,
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card onboarding-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-top">
          <span className="needs-you-eyebrow">STEP {step} OF 4</span>
          <button type="button" className="win-ctrl-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {step === 1 && (
          <div className="onboarding-body">
            <h2 className="onboarding-title">
              Let&apos;s get your job search on autopilot
            </h2>
            <p className="onboarding-sub">
              FMSG Agents finds matching South African postings, tailors your
              CV, and fills applications in your own Chrome browser.
            </p>
            <div className="onboarding-feature-grid">
              <div className="onboarding-feature-card">
                <span className="quick-action-icon">🔍</span>
                <strong>Find jobs</strong>
                <span>
                  Searches live postings matching your FMSG search profile.
                </span>
              </div>
              <div className="onboarding-feature-card">
                <span className="quick-action-icon">📄</span>
                <strong>Tailor your CV</strong>
                <span>
                  Aligns your verified profile highlights to each job spec.
                </span>
              </div>
              <div className="onboarding-feature-card">
                <span className="quick-action-icon">🚀</span>
                <strong>Apply for you</strong>
                <span>
                  Fills forms in Chrome and pauses whenever it needs you.
                </span>
              </div>
            </div>
            <div className="onboarding-footer">
              <div className="onboarding-dots">
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
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-body">
            <h2 className="onboarding-title">Connect your job accounts</h2>
            <p className="onboarding-sub">
              Optional: save logins in your local Windows Credential Manager (
              <code>SITE_PASSWORD</code>). The AI only sees the key name and
              autofills only on the verified domain.
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
                    onClick={() => {
                      setActiveSite(s);
                      setUsername('');
                      setPassword('');
                    }}
                  >
                    <span
                      className="onboarding-site-icon"
                      style={{ background: s.color }}
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
                  <strong>
                    Save {activeSite.label} (<code>{activeSite.keyName}</code>)
                  </strong>
                  <span>Locked to {activeSite.domain}</span>
                </div>
                <div className="secret-editor-fields">
                  <input
                    type="text"
                    className="field-input"
                    placeholder={`Email / username for ${activeSite.label}`}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    className="field-input"
                    placeholder="Password (encrypted locally)"
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
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-body">
            <h2 className="onboarding-title">Let&apos;s run a test</h2>
            <p className="onboarding-sub">
              Verify your active profile and watch the agent open real postings
              in Chrome.
            </p>
            <div className="bento-card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                {(profile?.job_titles || [])[0] ||
                  profile?.name ||
                  'Your Active Search Profile'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: 4 }}>
                Location: {profile?.location || 'South Africa'} · Industry:{' '}
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
                  Run Test ★
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-body">
            <h2 className="onboarding-title">You&apos;re ready to go</h2>
            <p className="onboarding-sub">
              Your account includes <strong>5 free welcome bonus applications</strong>{' '}
              (once email is verified), and your Pay-As-You-Go cost cap starts
              safely at <strong>R0</strong>.
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
  );
}

/* ── 8. ACCOUNT VIEW ─────────────────────────────────────────────────────── */

function AccountView({
  user,
  appVersion,
  billingMode,
  bundleTier,
  costCap,
  onLogout,
  onOpenSettings,
}: {
  user: any;
  appVersion: string;
  billingMode: 'pay-as-you-go' | 'bundle';
  bundleTier: string;
  costCap: number;
  onLogout: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">Account</h2>
          <p className="billing-subtitle">
            Signed in as {user?.email || 'Authenticated User'}
          </p>
        </div>
        <span className="tag">v{appVersion}</span>
      </header>

      <section className="billing-section">
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <span className="tag">
            Mode:{' '}
            {billingMode === 'bundle'
              ? `${bundleTier} Bundle`
              : 'Pay-As-You-Go'}
          </span>
          <span className="tag">Cost Cap: R{costCap}</span>
          <span className="tag">
            Email: {user?.emailVerified === false ? 'Unverified' : 'Verified'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenSettings}
          >
            Security Vault &amp; Account Settings
          </button>
          <button type="button" className="btn btn-danger" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </section>
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
