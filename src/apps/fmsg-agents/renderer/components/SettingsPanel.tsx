import React, { useState, useEffect, useCallback } from 'react';
import { useDialog } from './DialogSystem';
import { formatDateTimeZA } from '../lib/format';

interface SettingsPanelProps {
  selectedProfileId: string;
  costCap: number;
  billingMode: 'pay-as-you-go' | 'bundle';
  bundleTier: 'Starter' | 'Lite' | 'Standard' | 'Power';
  isRunning: boolean;
  onRunningChange: (running: boolean) => void;
  onBatchChange?: (batch: number) => void;
  onOpenOnboarding?: () => void;
  onAccountDeleted?: () => void;
  fullPage?: boolean;
}

interface SiteSecretItem {
  keyName: string;
  siteLabel: string;
  allowedDomain: string;
  username: string;
  updatedAt: string;
}

const PRESET_SITES = [
  {
    id: 'linkedin',
    siteLabel: 'LinkedIn',
    allowedDomain: 'linkedin.com',
    defaultKeyName: 'LINKEDIN_PASSWORD',
  },
  {
    id: 'indeed',
    siteLabel: 'Indeed',
    allowedDomain: 'indeed.com',
    defaultKeyName: 'INDEED_PASSWORD',
  },
  {
    id: 'pnet',
    siteLabel: 'PNet',
    allowedDomain: 'pnet.co.za',
    defaultKeyName: 'PNET_PASSWORD',
  },
  {
    id: 'careerjunction',
    siteLabel: 'CareerJunction',
    allowedDomain: 'careerjunction.co.za',
    defaultKeyName: 'CAREERJUNCTION_PASSWORD',
  },
  {
    id: 'glassdoor',
    siteLabel: 'Glassdoor',
    allowedDomain: 'glassdoor.com',
    defaultKeyName: 'GLASSDOOR_PASSWORD',
  },
  {
    id: 'careers24',
    siteLabel: 'Careers24',
    allowedDomain: 'careers24.com',
    defaultKeyName: 'CAREERS24_PASSWORD',
  },
];

export default function SettingsPanel({
  onOpenOnboarding,
  onAccountDeleted,
}: SettingsPanelProps) {
  const { showModal, showToast, openLegalDocument } = useDialog();

  const [preventSleep, setPreventSleep] = useState(false);
  const [batteryWarningShown, setBatteryWarningShown] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const [updateStatus, setUpdateStatus] = useState('idle');
  const [updateInfo, setUpdateInfo] = useState<string>('');
  const [settingsMeta, setSettingsMeta] = useState<{
    currentVersion: string;
    installedVersion: string;
    channel: 'stable' | 'beta';
    lastCheckAt: string | null;
    lastCheckStatus: string;
    deviceId: string;
    deviceKeyOk: boolean;
    browserStatus?: {
      available: boolean;
      browserName: string;
      message: string;
    };
  }>({
    currentVersion: '',
    installedVersion: '',
    channel: 'stable',
    lastCheckAt: null,
    lastCheckStatus: 'Never checked',
    deviceId: '',
    deviceKeyOk: true,
  });

  const [secrets, setSecrets] = useState<SiteSecretItem[]>([]);
  const [editingSite, setEditingSite] = useState<{
    siteLabel: string;
    allowedDomain: string;
    keyName: string;
  } | null>(null);
  const [secretUsername, setSecretUsername] = useState('');
  const [secretPassword, setSecretPassword] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);

  // Account Deletion Two-Step Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'code'>('confirm');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const refreshSettingsMeta = useCallback(() => {
    window.electronAPI
      ?.getUpdateSettings()
      .then((res) => {
        if (res) setSettingsMeta(res);
      })
      .catch(() => {});
  }, []);

  const refreshSecrets = useCallback(() => {
    window.electronAPI
      ?.listSiteSecrets?.()
      .then((res) => {
        if (res?.ok && Array.isArray(res.items)) {
          setSecrets(res.items);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSettingsMeta();
    refreshSecrets();
  }, [refreshSettingsMeta, refreshSecrets]);

  const handleCheckUpdate = () => {
    setUpdateStatus('checking');
    window.electronAPI?.logUIEvent('click', 'check_for_updates');
    window.electronAPI
      ?.checkForUpdates(true)
      .then((res: any) => {
        refreshSettingsMeta();
        if (res?.available) {
          setUpdateStatus('available');
          setUpdateInfo(res.message || 'Update available');
          window.dispatchEvent(
            new CustomEvent('agent-update-available', { detail: res })
          );
        } else {
          setUpdateStatus('current');
          setUpdateInfo(res?.message || 'You are running the latest version.');
          showToast(
            res?.message || 'You are running the latest version.',
            'info'
          );
        }
      })
      .catch(() => {
        setUpdateStatus('error');
        setUpdateInfo('Could not check for updates right now.');
      });
  };

  const handleChannelChange = (newChannel: 'stable' | 'beta') => {
    window.electronAPI?.setUpdateChannel(newChannel).then(() => {
      refreshSettingsMeta();
      showToast(
        `Update channel changed to ${newChannel === 'beta' ? 'Beta' : 'Stable'}.`,
        'info'
      );
    });
  };

  const handleResetDeviceKey = () => {
    showModal({
      title: 'Re-register Installation Security Key',
      message:
        'This generates a fresh local installation key and re-registers this PC with the FMSG update service. Your saved job accounts and profiles are not affected.',
      confirmLabel: 'Re-register Key',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        window.electronAPI?.resetDeviceKey().then((res) => {
          refreshSettingsMeta();
          if (res?.ok) {
            showToast('Installation security key re-registered.', 'success');
          } else {
            showToast('Could not reset installation key.', 'error');
          }
        });
      },
    });
  };

  const handleSaveSiteSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite) return;
    setSavingSecret(true);
    try {
      const res = await window.electronAPI?.saveSiteSecret?.({
        siteLabel: editingSite.siteLabel,
        allowedDomain: editingSite.allowedDomain,
        username: secretUsername.trim(),
        password: secretPassword,
        keyName: editingSite.keyName,
      });
      if (res?.ok) {
        showToast(
          `Saved ${editingSite.siteLabel} sign-in securely on this device (locked to ${editingSite.allowedDomain}).`,
          'success'
        );
        setEditingSite(null);
        setSecretUsername('');
        setSecretPassword('');
        refreshSecrets();
      } else {
        showToast(res?.error || 'Could not save sign-in details.', 'error');
      }
    } finally {
      setSavingSecret(false);
    }
  };

  const handleForgetSecret = (siteLabel: string, keyName: string) => {
    showModal({
      title: `Disconnect ${siteLabel}?`,
      message: `This removes your saved ${siteLabel} sign-in from this computer. The agent will pause and ask you to sign in manually next time a posting on ${siteLabel} requires an account.`,
      confirmLabel: `Remove ${siteLabel}`,
      cancelLabel: 'Cancel',
      destructive: true,
      requireTypedText: siteLabel,
      requireTypedPlaceholder: `Type ${siteLabel} to confirm`,
      onConfirm: async () => {
        await window.electronAPI?.deleteSiteSecret?.(keyName);
        showToast(`Removed saved ${siteLabel} sign-in from this device.`, 'info');
        refreshSecrets();
      },
    });
  };

  const handleSendDeleteCode = async () => {
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const res = await window.electronAPI?.sendDeleteAccountCode?.();
      if (res?.ok) {
        setDeleteStep('code');
      } else {
        setDeleteError(
          res?.data?.error || 'Could not send deletion code. Please try again.'
        );
      }
    } catch {
      setDeleteError('Could not reach FMSG right now.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(deleteCode.trim())) {
      setDeleteError('Please enter the 6-digit code sent to your email.');
      return;
    }
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const res = await window.electronAPI?.confirmDeleteAccount?.(
        deleteCode.trim()
      );
      if (res?.ok) {
        setShowDeleteModal(false);
        showToast('Your account has been permanently deleted.', 'info');
        onAccountDeleted?.();
      } else {
        setDeleteError(
          res?.data?.error || 'Invalid code or could not delete account.'
        );
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h1 className="billing-title">Settings</h1>
          <p className="billing-subtitle">
            Manage connected job-board accounts, run preferences, software
            updates, and legal agreements.
          </p>
        </div>
        {onOpenOnboarding && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ whiteSpace: 'nowrap' }}
            onClick={onOpenOnboarding}
          >
            Open Setup Guide
          </button>
        )}
      </header>

      {/* Section Sub-Navigation (ST-05) */}
      <nav className="settings-subnav" aria-label="Settings sections">
        <button
          type="button"
          className="spend-preset-chip"
          onClick={() => scrollToSection('settings-accounts')}
        >
          Connected Accounts
        </button>
        <button
          type="button"
          className="spend-preset-chip"
          onClick={() => scrollToSection('settings-preferences')}
        >
          Run Preferences
        </button>
        <button
          type="button"
          className="spend-preset-chip"
          onClick={() => scrollToSection('settings-updates')}
        >
          Software Updates
        </button>
        <button
          type="button"
          className="spend-preset-chip"
          onClick={() => scrollToSection('settings-verification')}
        >
          System Verification
        </button>
        <button
          type="button"
          className="spend-preset-chip"
          onClick={() => scrollToSection('settings-legal')}
        >
          Legal &amp; Danger Zone
        </button>
      </nav>

      {/* 1. Connected Job-Board Accounts */}
      <section id="settings-accounts" className="billing-section">
        <div className="billing-section-head">
          <div>
            <h2 className="billing-section-title">Connected Job Accounts</h2>
            <p className="billing-section-note" style={{ margin: '4px 0 0' }}>
              Sign-in details are encrypted and stored strictly on this
              computer. They are used only on the matching official job-board
              domain and are never sent to AI models or external servers.
            </p>
          </div>
        </div>

        <div className="site-secrets-grid">
          {PRESET_SITES.map((site) => {
            const saved = secrets.find(
              (s) => s.keyName === site.defaultKeyName
            );
            return (
              <div
                key={site.id}
                className={`site-secret-card ${saved ? 'connected' : ''}`}
              >
                <div className="site-secret-top">
                  <div className="site-secret-badge" aria-hidden="true">
                    {site.siteLabel.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="site-secret-info">
                    <div className="site-secret-name">{site.siteLabel}</div>
                    <div className="site-secret-domain">
                      {site.allowedDomain}
                    </div>
                  </div>
                  <span
                    className={`status-pill-sm ${
                      saved ? 'applied' : 'neutral'
                    }`}
                  >
                    {saved ? 'Connected' : 'Not connected'}
                  </span>
                </div>

                <div className="site-secret-user">
                  {saved ? (
                    <>
                      Signed in as <strong>{saved.username}</strong>
                    </>
                  ) : (
                    <span className="text-muted">
                      Optional — connect for automatic sign-in
                    </span>
                  )}
                </div>

                <div className="site-secret-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setEditingSite({
                        siteLabel: site.siteLabel,
                        allowedDomain: site.allowedDomain,
                        keyName: site.defaultKeyName,
                      });
                      setSecretUsername(saved?.username || '');
                      setSecretPassword('');
                    }}
                  >
                    {saved ? 'Update Sign-In' : 'Connect'}
                  </button>
                  {saved && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact btn-danger-outline"
                      onClick={() =>
                        handleForgetSecret(site.siteLabel, site.defaultKeyName)
                      }
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {editingSite && (
          <form onSubmit={handleSaveSiteSecret} className="secret-editor-box">
            <div className="secret-editor-head">
              <strong>Connect {editingSite.siteLabel}</strong>
              <span>Verified domain: https://{editingSite.allowedDomain}</span>
            </div>
            <div className="secret-editor-fields">
              <label className="sr-only" htmlFor="secret-username-input">
                {editingSite.siteLabel} email or username
              </label>
              <input
                id="secret-username-input"
                type="text"
                className="field-input"
                placeholder={`Email or username for ${editingSite.siteLabel}`}
                value={secretUsername}
                onChange={(e) => setSecretUsername(e.target.value)}
                required
              />
              <label className="sr-only" htmlFor="secret-password-input">
                {editingSite.siteLabel} password
              </label>
              <input
                id="secret-password-input"
                type="password"
                className="field-input"
                placeholder={`Password for ${editingSite.siteLabel} (encrypted on this PC)`}
                value={secretPassword}
                onChange={(e) => setSecretPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSecret}
              >
                {savingSecret ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  'Save Account'
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingSite(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 2. Run Preferences */}
      <section id="settings-preferences" className="billing-section">
        <div className="billing-section-head">
          <h2 className="billing-section-title">Run Preferences</h2>
        </div>
        <p className="billing-section-note">
          Keep Windows awake while the agent works through a batch of job
          postings.
        </p>

        <label className="checkbox-label">
          <input
            type="checkbox"
            className="styled-checkbox"
            checked={preventSleep}
            onChange={(e) => {
              const enabled = e.target.checked;
              setPreventSleep(enabled);
              window.electronAPI?.setPreventSleep?.(enabled);
              if (enabled && !batteryWarningShown) {
                setBatteryWarningShown(true);
                showModal({
                  title: 'Keep Computer Awake Enabled',
                  message:
                    'Your computer will stay awake while FMSG Agents is open. Connect your laptop to power during long application runs.',
                  confirmLabel: 'Got It',
                });
              }
            }}
          />
          <span>Prevent computer from sleeping during active runs</span>
        </label>
      </section>

      {/* 3. Software Updates */}
      <section id="settings-updates" className="billing-section">
        <div className="billing-section-head">
          <div>
            <h2 className="billing-section-title">Software Updates</h2>
            <p className="billing-section-note" style={{ margin: '4px 0 0' }}>
              Status: <strong>{settingsMeta.lastCheckStatus}</strong>
              {settingsMeta.lastCheckAt
                ? ` · Last checked ${formatDateTimeZA(settingsMeta.lastCheckAt)}`
                : ''}
            </p>
          </div>

          <div className="settings-updates-controls">
            <label className="sr-only" htmlFor="update-channel-select">
              Update channel
            </label>
            <select
              id="update-channel-select"
              className="select-input"
              value={settingsMeta.channel}
              onChange={(e) =>
                handleChannelChange(e.target.value as 'stable' | 'beta')
              }
              aria-label="Update channel"
            >
              <option value="stable">Stable channel</option>
              <option value="beta">Beta channel</option>
            </select>

            <button
              type="button"
              className="btn btn-primary"
              style={{ whiteSpace: 'nowrap' }}
              disabled={updateStatus === 'checking'}
              onClick={handleCheckUpdate}
            >
              {updateStatus === 'checking' ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Checking…
                </>
              ) : (
                'Check for Updates'
              )}
            </button>
          </div>
        </div>

        {updateInfo && (
          <div className="form-banner info" style={{ marginTop: '12px' }}>
            {updateInfo}
          </div>
        )}
      </section>

      {/* 4. System & Security Verification */}
      <section id="settings-verification" className="billing-section">
        <div className="billing-section-head">
          <div>
            <h2 className="billing-section-title">System Verification</h2>
            <p className="billing-section-note" style={{ margin: '4px 0 0' }}>
              Local browser readiness and signed update verification status.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={() => setShowTechnicalDetails((v) => !v)}
          >
            {showTechnicalDetails ? 'Hide Technical Details' : 'Technical Details'}
          </button>
        </div>

        <div className="verification-rows">
          <div className="card-nested verification-row">
            <div>
              <div className="verification-row-title">Automation Browser</div>
              <div className="verification-row-sub">
                {settingsMeta.browserStatus?.message || 'Checking browser…'}
              </div>
            </div>
            <span
              className={`status-pill-sm ${
                settingsMeta.browserStatus?.available ? 'applied' : 'review'
              }`}
            >
              {settingsMeta.browserStatus?.available ? 'Verified' : 'Missing'}
            </span>
          </div>

          <div className="card-nested verification-row">
            <div>
              <div className="verification-row-title">
                Installation Security Key
              </div>
              <div className="verification-row-sub">
                {settingsMeta.deviceKeyOk
                  ? 'Verified hardware-independent key stored securely on this PC'
                  : 'Security key needs re-registration on this PC'}
              </div>
              {showTechnicalDetails && settingsMeta.deviceId && (
                <div className="verification-tech-detail">
                  Installation key status: Active · Channel:{' '}
                  {settingsMeta.channel} · Build v
                  {settingsMeta.installedVersion || settingsMeta.currentVersion}
                </div>
              )}
            </div>
            {showTechnicalDetails ? (
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={handleResetDeviceKey}
              >
                Re-register Key
              </button>
            ) : (
              <span
                className={`status-pill-sm ${
                  settingsMeta.deviceKeyOk ? 'applied' : 'review'
                }`}
              >
                {settingsMeta.deviceKeyOk ? 'Active' : 'Needs Attention'}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 5. Legal Agreements & Danger Zone */}
      <div id="settings-legal" className="billing-top-grid">
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <div>
              <h2 className="billing-section-title">Legal Agreements</h2>
              <p className="billing-section-note" style={{ margin: '4px 0 0' }}>
                Review the agreements governing FMSG Agents.
              </p>
            </div>
          </div>
          <div className="legal-links-row">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => openLegalDocument('eula')}
            >
              License Agreement (EULA)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => openLegalDocument('terms')}
            >
              Terms of Service
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => openLegalDocument('privacy')}
            >
              Privacy Policy
            </button>
          </div>
        </section>

        <section
          className="billing-section danger-zone-card"
          style={{ margin: 0 }}
        >
          <div className="billing-section-head">
            <div>
              <span className="danger-eyebrow">DANGER ZONE</span>
              <h2
                className="billing-section-title"
                style={{ color: '#fca5a5', marginTop: 2 }}
              >
                Delete Account
              </h2>
              <p className="billing-section-note" style={{ margin: '4px 0 0' }}>
                Permanently remove your FMSG account, search profiles, CVs, and
                application history.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                setDeleteStep('confirm');
                setDeleteCode('');
                setDeleteError('');
                setShowDeleteModal(true);
              }}
            >
              Delete Account
            </button>
          </div>
        </section>
      </div>

      {/* Delete Account Two-Step Modal (DL-04) */}
      {showDeleteModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="modal-card shared-modal-shell modal-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-shell-header">
              <h3
                id="delete-account-title"
                className="modal-shell-title"
                style={{ color: '#fca5a5' }}
              >
                Delete Account Permanently?
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close dialog"
                onClick={() => setShowDeleteModal(false)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {deleteStep === 'confirm' ? (
              <>
                <div className="modal-shell-body">
                  <p className="modal-shell-message">
                    This action is permanent and cannot be undone. Entering the
                    6-digit verification code in the next step will{' '}
                    <strong>immediately delete</strong> your FMSG account,
                    search profiles, uploaded CVs, and tracked applications.
                  </p>
                  {deleteError && (
                    <div className="field-error-text" role="alert">
                      {deleteError}
                    </div>
                  )}
                </div>
                <div className="modal-shell-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={deleteBusy}
                    onClick={handleSendDeleteCode}
                  >
                    {deleteBusy ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Sending Code…
                      </>
                    ) : (
                      'Send Verification Code'
                    )}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleConfirmDeleteAccount}>
                <div className="modal-shell-body">
                  <p className="modal-shell-message">
                    Enter the 6-digit code sent to your email. Your account and
                    all associated data will be erased immediately upon
                    confirmation:
                  </p>
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label
                      htmlFor="delete-account-code-input"
                      className="field-label"
                    >
                      6-Digit Deletion Code
                    </label>
                    <input
                      id="delete-account-code-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="field-input"
                      placeholder="123456"
                      value={deleteCode}
                      onChange={(e) =>
                        setDeleteCode(e.target.value.replace(/\D/g, ''))
                      }
                      autoFocus
                    />
                  </div>
                  {deleteError && (
                    <div className="field-error-text" role="alert">
                      {deleteError}
                    </div>
                  )}
                </div>
                <div className="modal-shell-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-danger"
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Deleting…
                      </>
                    ) : (
                      'Permanently Delete Account'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
