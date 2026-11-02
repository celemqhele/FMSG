import React, { useState, useEffect, useCallback } from 'react';
import { DialogProvider, useDialog } from './components/DialogSystem';
import LiveLog from './components/LiveLog';
import SettingsPanel from './components/SettingsPanel';
import LoginScreen from './components/LoginScreen';
import BillingPanel from './components/BillingPanel';
import UpdateProgress, { UpdateScreenPhase } from './components/UpdateProgress';

export type ViewType =
  | 'dashboard'
  | 'profiles'
  | 'billing'
  | 'settings'
  | 'account';

function CosmicBackdrop() {
  return (
    <div className="cosmic-backdrop-layer" aria-hidden="true">
      <div className="cosmic-nebula-glow" />
      <div className="cosmic-stardust-overlay" />
      {/* Cosmic Portrait & Stardust Nebula Artwork */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.58,
          mixBlendMode: 'screen',
        }}
      >
        <defs>
          <radialGradient id="cosmicFaceGlow" cx="42%" cy="48%" r="44%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.82" />
            <stop offset="32%" stopColor="#3b82f6" stopOpacity="0.48" />
            <stop offset="68%" stopColor="#1e1b4b" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#020515" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="stardustGold" cx="49%" cy="66%" r="32%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.72" />
            <stop offset="42%" stopColor="#f472b6" stopOpacity="0.38" />
            <stop offset="78%" stopColor="#6366f1" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#020515" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="portraitRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <circle cx="590" cy="440" r="430" fill="url(#cosmicFaceGlow)" />
        <circle cx="710" cy="600" r="290" fill="url(#stardustGold)" />
        {/* Stylized cosmic silhouette & upward gaze contours */}
        <path
          d="M490,120 C410,195 390,320 412,430 C375,475 362,510 388,542 C378,572 385,605 408,632 C398,668 422,718 475,742 C515,760 545,820 580,890 L860,890 L860,120 Z"
          fill="rgba(29, 78, 216, 0.16)"
          stroke="url(#portraitRim)"
          strokeWidth="2.2"
        />
        {/* Golden/amber stardust constellation sparks across the portrait */}
        <circle cx="545" cy="260" r="3" fill="#fbbf24" opacity="0.85" />
        <circle cx="568" cy="242" r="2" fill="#f472b6" opacity="0.75" />
        <circle cx="520" cy="295" r="2.2" fill="#93c5fd" opacity="0.8" />
        <circle cx="640" cy="670" r="3.5" fill="#fbbf24" opacity="0.9" />
        <circle cx="672" cy="695" r="2.5" fill="#f59e0b" opacity="0.85" />
        <circle cx="615" cy="720" r="2.8" fill="#ec4899" opacity="0.75" />
        <circle cx="705" cy="650" r="2.2" fill="#fde047" opacity="0.8" />
        <circle cx="745" cy="710" r="3.2" fill="#fbbf24" opacity="0.75" />
      </svg>
    </div>
  );
}

function AppInner() {
  const { showModal, showToast } = useDialog();

  const [bootChecking, setBootChecking] = useState(true);
  const [configValid, setConfigValid] = useState(true);
  const [appVersion, setAppVersion] = useState('0.6.0');

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

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isRunning, setIsRunning] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [autoAccept, setAutoAccept] = useState(true);
  const [appliedCount, setAppliedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  // Lightning Launch Modal state ("How many jobs do you want to apply for?")
  const [showLaunchModal, setShowLaunchModal] = useState(false);

  // Billing state (Pay-As-You-Go cost cap defaults to R0 initially per requirement)
  const [costCap, setCostCap] = useState(500);
  const [billingMode, setBillingMode] = useState<'pay-as-you-go' | 'bundle'>(
    'pay-as-you-go'
  );
  const [bundleTier, setBundleTier] = useState<
    'Starter' | 'Lite' | 'Standard' | 'Power'
  >('Starter');

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

      if (event.type === 'run-done') {
        setIsRunning(false);
        setAppliedCount(event.applied ?? 0);
        setSkippedCount(event.skipped ?? 0);
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
  }, [showToast]);

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
      showToast('Email verified.', 'success');
    } else {
      setVerifyError(res?.error || 'Invalid code. Please try again.');
    }
  };

  const handleLaunchAgentBatch = () => {
    window.electronAPI?.logUIEvent('click', 'lightning_launch_agent', {
      batch_size: batchSize,
    });

    if (billingMode === 'pay-as-you-go' && costCap <= 0) {
      setShowLaunchModal(false);
      setCurrentView('billing');
      showModal({
        title: 'Set Your Cost Cap First',
        message:
          'Your Pay-As-You-Go cost cap is currently set to R0. Please set a cost cap greater than R0 before starting a run.',
        confirmLabel: 'OK',
      });
      return;
    }

    setShowLaunchModal(false);
    setCurrentView('dashboard');
    setAppliedCount(0);
    setSkippedCount(0);
    setIsRunning(true);

    if (!selectedProfileId) {
      setIsRunning(false);
      showModal({
        title: 'Choose a Search Profile',
        message:
          'Pick a saved search profile first — the agent reads your job titles, location and CV from it.',
        confirmLabel: 'OK',
      });
      return;
    }

    window.electronAPI
      .runAgent({
        profileId: selectedProfileId,
        batchSize,
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

  const handleStopAgent = () => {
    window.electronAPI?.logUIEvent('click', 'stop_agent_button');
    setIsRunning(false);
    window.electronAPI?.stopAgent?.().catch(() => {});
    showToast('Agent paused.', 'info');
  };

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

  // Neutral startup config failure screen
  if (!configValid) {
    return (
      <div className="auth-viewport">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-logo-mark">FM</div>
          <h1
            className="auth-title"
            style={{ fontSize: '20px', marginBottom: '12px' }}
          >
            Unable to Start
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '28px',
              lineHeight: 1.55,
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
    );
  }

  if (bootChecking) {
    return (
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
    );
  }

  // Auth Wall
  if (!authenticated) {
    return (
      <>
        <LoginScreen
          version={appVersion}
          onAuthenticated={handleAuthenticated}
        />
        {renderUpdateModal()}
      </>
    );
  }

  // Blocked account state (website parity)
  if (user?.accountStatus === 'blocked') {
    return (
      <div className="auth-viewport">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h2
            style={{
              margin: '0 0 12px 0',
              fontSize: '20px',
              color: 'var(--text-primary)',
            }}
          >
            Account Restricted
          </h2>
          <p
            style={{
              fontSize: '13.5px',
              color: 'var(--text-secondary)',
              marginBottom: '24px',
              lineHeight: 1.55,
            }}
          >
            Your account is currently restricted. Please visit the FMSG website
            to submit an appeal or contact support.
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
    );
  }

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <div className="futuristic-shell">
      <CosmicBackdrop />

      {/* Email verification banner (website parity) */}
      {user && user.emailVerified === false && (
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            background: 'rgba(245, 158, 11, 0.18)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 14,
            padding: '8px 18px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '12.5px', color: '#fef3c7' }}>
            Verify your email address to unlock full search and application
            features.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 30, padding: '0 14px', fontSize: '12px' }}
            onClick={handleOpenVerifyModal}
          >
            Verify Email
          </button>
        </div>
      )}

      {/* MAIN ROUNDED STAGE FRAME */}
      <main className="futuristic-stage-frame">
        {currentView === 'dashboard' && (
          <LiveLog
            profile={selectedProfile}
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            onProfileChange={setSelectedProfileId}
            isRunning={isRunning}
            batchSize={batchSize}
            appliedCount={appliedCount}
            skippedCount={skippedCount}
            onOpenLaunchModal={() => setShowLaunchModal(true)}
            onStopAgent={handleStopAgent}
          />
        )}

        {currentView === 'profiles' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            <ProfilesView
              profiles={profiles}
              selectedProfileId={selectedProfileId}
              onSelect={(id) => {
                setSelectedProfileId(id);
                showToast('Active profile updated.', 'success');
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
          </div>
        )}

        {currentView === 'billing' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            <BillingPanel
              costCap={costCap}
              onCostCapChange={setCostCap}
              mode={billingMode}
              onModeChange={(nextMode) => {
                setBillingMode(nextMode);
                if (nextMode === 'pay-as-you-go') {
                  setCostCap(0);
                }
              }}
              tier={bundleTier}
              onTierChange={setBundleTier}
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
          </div>
        )}

        {currentView === 'settings' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            <SettingsPanel
              selectedProfileId={selectedProfileId}
              costCap={costCap}
              billingMode={billingMode}
              bundleTier={bundleTier}
              isRunning={isRunning}
              onRunningChange={setIsRunning}
              onBatchChange={setBatchSize}
              fullPage
            />
          </div>
        )}

        {currentView === 'account' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            <AccountView
              user={user}
              appVersion={appVersion}
              onLogout={handleLogout}
            />
          </div>
        )}
      </main>

      {/* BOTTOM FLOATING CAPSULE DOCK & BOTTOM-RIGHT PROFILE SILHOUETTE */}
      <footer className="futuristic-bottom-bar">
        <nav className="organic-capsule-dock" aria-label="Primary Navigation">
          {/* Left 2 Menu Options */}
          <div className="dock-nav-group">
            <button
              type="button"
              onClick={() => {
                setCurrentView('dashboard');
                window.electronAPI?.logUIEvent('navigate', 'dashboard');
              }}
              className={`dock-nav-item ${
                currentView === 'dashboard' ? 'active' : ''
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="9" rx="2" />
                <rect x="14" y="3" width="7" height="5" rx="2" />
                <rect x="14" y="12" width="7" height="9" rx="2" />
                <rect x="3" y="16" width="7" height="5" rx="2" />
              </svg>
              <span>Live Feed</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentView('profiles');
                window.electronAPI?.logUIEvent('navigate', 'profiles');
              }}
              className={`dock-nav-item ${
                currentView === 'profiles' ? 'active' : ''
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Profiles</span>
            </button>
          </div>

          {/* Central Elevated Lightning Trigger Button */}
          <button
            type="button"
            aria-label={isRunning ? 'Configure or Stop Agent' : 'Launch Agent'}
            title={
              isRunning
                ? 'Agent Running — Click to adjust or stop'
                : 'Launch Agent Batch'
            }
            onClick={() => setShowLaunchModal(true)}
            className={`dock-lightning-btn ${isRunning ? 'running' : ''}`}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>

          {/* Right 2 Menu Options */}
          <div className="dock-nav-group">
            <button
              type="button"
              onClick={() => {
                setCurrentView('billing');
                window.electronAPI?.logUIEvent('navigate', 'billing');
              }}
              className={`dock-nav-item ${
                currentView === 'billing' ? 'active' : ''
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="5" width="20" height="14" rx="3" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span>Spend Cap</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentView('settings');
                window.electronAPI?.logUIEvent('navigate', 'settings');
              }}
              className={`dock-nav-item ${
                currentView === 'settings' ? 'active' : ''
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
            </button>
          </div>
        </nav>

        {/* Bottom-Right User Profile Silhouette Icon */}
        <button
          type="button"
          aria-label="Account & Profile"
          title={`Signed in as ${user?.email || 'User'} (v${appVersion})`}
          onClick={() => {
            setCurrentView('account');
            window.electronAPI?.logUIEvent('navigate', 'account');
          }}
          className={`bottom-right-profile-btn ${
            currentView === 'account' ? 'active' : ''
          }`}
        >
          <span className="profile-status-ring" />
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2.5c-3.34 0-10 1.68-10 5v2.5h20v-2.5c0-3.32-6.66-5-10-5z" />
          </svg>
        </button>
      </footer>

      {/* LIGHTNING BUTTON LAUNCH MODAL: "How many jobs do you want to apply for?" */}
      {showLaunchModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowLaunchModal(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 400,
              background:
                'linear-gradient(165deg, rgba(15, 23, 42, 0.96) 0%, rgba(7, 11, 28, 0.98) 100%)',
              border: '1px solid rgba(96, 165, 250, 0.35)',
              borderRadius: 18,
              padding: '20px 22px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background:
                    'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: '14px',
                  boxShadow: '0 0 14px rgba(59, 130, 246, 0.45)',
                }}
              >
                ⚡
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                  }}
                >
                  How many jobs do you want to apply for?
                </h3>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Select your target application batch size
                </div>
              </div>
            </div>

            {/* Quick Preset Selectors */}
            <div className="batch-preset-grid">
              {[5, 10, 25, 50].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBatchSize(preset)}
                  className={`batch-preset-btn ${
                    batchSize === preset ? 'selected' : ''
                  }`}
                >
                  {preset} Jobs
                </button>
              ))}
            </div>

            {/* Slider + Manual Input (no arrows) */}
            <div
              style={{
                background: 'rgba(2, 6, 23, 0.55)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                borderRadius: 11,
                padding: '10px 12px',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                  Custom batch target
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={batchSize}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                    setBatchSize(Math.max(1, Math.min(128, n || 1)));
                  }}
                  style={{
                    width: 64,
                    height: 28,
                    borderRadius: 7,
                    border: '1px solid rgba(96, 165, 250, 0.4)',
                    background: '#0f172a',
                    color: '#ffffff',
                    textAlign: 'center',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    outline: 'none',
                  }}
                />
              </div>

              <input
                type="range"
                min={1}
                max={100}
                value={Math.min(100, batchSize)}
                onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 5)}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
            </div>

            <label
              className="checkbox-label"
              style={{ marginBottom: '14px', fontSize: '11.5px' }}
            >
              <input
                type="checkbox"
                checked={autoAccept}
                onChange={(e) => setAutoAccept(e.target.checked)}
              />
              <span>
                Auto-submit applications after tailoring CV to job spec
              </span>
            </label>

            <div style={{ display: 'flex', gap: '8px' }}>
              {isRunning && (
                <button
                  type="button"
                  onClick={() => {
                    handleStopAgent();
                    setShowLaunchModal(false);
                  }}
                  className="btn btn-danger"
                  style={{ flex: 1, height: 34, fontSize: '12px' }}
                >
                  Stop run
                </button>
              )}
              <button
                type="button"
                onClick={handleLaunchAgentBatch}
                className="btn btn-primary"
                style={{
                  flex: 2,
                  height: 34,
                  fontSize: '12px',
                  background:
                    'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                  boxShadow: '0 6px 18px rgba(59, 130, 246, 0.35)',
                }}
              >
                {isRunning ? 'Restart batch' : `Launch · ${batchSize} jobs`}
              </button>
              <button
                type="button"
                onClick={() => setShowLaunchModal(false)}
                className="btn btn-secondary"
                style={{ height: 34, fontSize: '12px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6-Digit Email Verification Modal */}
      {showVerifyModal && (
        <div className="modal-backdrop">
          <div className="modal-card" role="dialog" aria-modal="true">
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-weight-bold)',
              }}
            >
              Verify Your Email
            </h3>
            <p
              style={{
                margin: '0 0 18px 0',
                fontSize: 'var(--text-sm)',
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
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={verifyLoading}
                >
                  {verifyLoading ? 'Verifying...' : 'Verify'}
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

function ProfilesView({
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
  return (
    <div
      style={{
        maxWidth: 780,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--text-primary)',
              margin: '0 0 4px 0',
            }}
          >
            Search Profiles
          </h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Select the profile the agent will use for searching and CV tailoring.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
        >
          Refresh Profiles
        </button>
      </div>

      {!profiles || profiles.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center' }}>
          <h3
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 'var(--font-weight-semibold)',
              margin: '0 0 8px 0',
            }}
          >
            No Profiles Found
          </h3>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              marginBottom: '18px',
            }}
          >
            Create and configure your job search profile on the FMSG website,
            then click Refresh Profiles.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              window.electronAPI?.openExternalUrl(
                'https://findmesomejobs.co.za/dashboard'
              )
            }
          >
            Open FMSG Dashboard
          </button>
        </div>
      ) : (
        profiles.map((p: any) => {
          const active = selectedProfileId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className="bento-card"
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: active
                  ? '1.5px solid var(--accent)'
                  : '1px solid var(--border-card)',
                background: active
                  ? 'var(--bg-card-elevated)'
                  : 'var(--bg-card)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--text-md)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {p.name ? `${p.name}: ` : ''}
                  {(p.job_titles || []).join(' / ') || 'Untitled Profile'}
                </div>
                <span
                  className="tag"
                  style={{
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {active ? 'Active' : 'Select'}
                </span>
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                }}
              >
                Industry: {p.industry || 'General'} | Location:{' '}
                {p.location || 'Any'}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

function AccountView({
  user,
  appVersion,
  onLogout,
}: {
  user: any;
  appVersion: string;
  onLogout: () => void;
}) {
  return (
    <div
      style={{
        maxWidth: 680,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Account
        </h2>
        <span className="tag">v{appVersion}</span>
      </div>

      <div className="bento-card">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              Signed in as
            </div>
            <div
              style={{
                fontSize: 'var(--text-md)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--text-primary)',
              }}
            >
              {user?.email || 'Authenticated User'}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <span className="tag">Plan: {user?.plan || 'Free'}</span>
            <span className="tag">
              Searches: {user?.balances?.search ?? 0}
            </span>
            <span className="tag">CV Credits: {user?.balances?.cv ?? 0}</span>
            <span className="tag">
              Persistent Finder: {user?.balances?.pf ?? 0}
            </span>
          </div>

          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-danger"
              onClick={onLogout}
            >
              Sign Out
            </button>
          </div>
        </div>
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
