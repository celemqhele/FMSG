import React, { useState, useEffect, useCallback } from 'react';
import { useDialog } from './DialogSystem';

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

  // Local Credential Manager Site Secrets
  const [secrets, setSecrets] = useState<SiteSecretItem[]>([]);
  const [editingSite, setEditingSite] = useState<{
    siteLabel: string;
    allowedDomain: string;
    keyName: string;
  } | null>(null);
  const [secretUsername, setSecretUsername] = useState('');
  const [secretPassword, setSecretPassword] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);

  // Account Deletion Modal State
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
      showToast(`Release channel set to ${newChannel}.`, 'info');
    });
  };

  const handleResetDeviceKey = () => {
    showModal({
      title: 'Re-register Device Key',
      message:
        'This will generate a new security key for this installation and re-register it with the update service. Continue?',
      confirmLabel: 'Re-register',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        window.electronAPI?.resetDeviceKey().then((res) => {
          refreshSettingsMeta();
          if (res?.ok) {
            showToast('Device key re-registered.', 'success');
          } else {
            showToast('Could not reset device key.', 'error');
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
          `Saved ${editingSite.keyName} in Windows Credential Manager (locked to ${editingSite.allowedDomain}).`,
          'success'
        );
        setEditingSite(null);
        setSecretUsername('');
        setSecretPassword('');
        refreshSecrets();
      } else {
        showToast(res?.error || 'Could not save secret.', 'error');
      }
    } finally {
      setSavingSecret(false);
    }
  };

  const handleForgetSecret = async (keyName: string) => {
    await window.electronAPI?.deleteSiteSecret?.(keyName);
    showToast(`Removed ${keyName} from Windows Credential Manager.`, 'info');
    refreshSecrets();
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

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">Settings &amp; Local Security Vault</h2>
          <p className="billing-subtitle">
            Run preferences, Windows Credential Manager site secrets, software
            updates, and account controls.
          </p>
        </div>
        <span className="balance-chip">
          Version <strong>v{settingsMeta.currentVersion || '—'}</strong>
        </span>
      </header>

      {/* Connected Job Accounts — Local Credential Manager Secret Vault */}
      <section className="billing-section">
        <div className="billing-section-head">
          <div>
            <h3 className="billing-section-title">
              Connected Job Accounts (Local Windows Credential Manager)
            </h3>
            <p className="billing-section-note" style={{ margin: '2px 0 0' }}>
              Passwords are stored locally on this PC as secret keys (e.g.{' '}
              <code>LINKEDIN_PASSWORD</code>). The AI only sees the key name and
              calls <code>fill_secret(name)</code> on the verified domain —
              passwords never reach the AI, server, or screenshots.
            </p>
          </div>
          {onOpenOnboarding && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenOnboarding}
            >
              Launch Setup Wizard
            </button>
          )}
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
                  <div className="site-secret-badge">
                    {site.siteLabel.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="site-secret-info">
                    <div className="site-secret-name">{site.siteLabel}</div>
                    <div className="site-secret-domain">
                      {site.allowedDomain} · <code>{site.defaultKeyName}</code>
                    </div>
                  </div>
                  <span
                    className={`tag ${saved ? 'tag-connected' : ''}`}
                    style={{
                      color: saved ? '#22c55e' : '#94a3b8',
                    }}
                  >
                    {saved ? 'Saved' : 'Not set'}
                  </span>
                </div>

                {saved && (
                  <div className="site-secret-user">
                    Account: <strong>{saved.username}</strong>
                  </div>
                )}

                <div className="site-secret-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ height: 28, fontSize: '11.5px', flex: 1 }}
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
                    {saved ? 'Update Key' : 'Connect'}
                  </button>
                  {saved && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ height: 28, fontSize: '11.5px' }}
                      onClick={() => handleForgetSecret(site.defaultKeyName)}
                    >
                      Forget
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
              <strong>
                Configure {editingSite.siteLabel} (
                <code>{editingSite.keyName}</code>)
              </strong>
              <span>Domain lock: https://{editingSite.allowedDomain}</span>
            </div>
            <div className="secret-editor-fields">
              <input
                type="text"
                className="field-input"
                placeholder={`Login email or username for ${editingSite.siteLabel}`}
                value={secretUsername}
                onChange={(e) => setSecretUsername(e.target.value)}
                required
              />
              <input
                type="password"
                className="field-input"
                placeholder={`Password (stored as ${editingSite.keyName})`}
                value={secretPassword}
                onChange={(e) => setSecretPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSecret}
              >
                {savingSecret ? 'Encrypting…' : 'Save in Credential Manager'}
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

      {/* Run Preferences */}
      <section className="billing-section">
        <div className="billing-section-head">
          <h3 className="billing-section-title">Run preferences</h3>
        </div>
        <p className="billing-section-note">
          Keep Windows awake while the agent works through a batch of job
          postings.
        </p>

        <label className="checkbox-label" style={{ fontSize: '12px' }}>
          <input
            type="checkbox"
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
          <span>Prevent computer from sleeping during agent runs</span>
        </label>
      </section>

      {/* Software Updates */}
      <section className="billing-section">
        <div className="billing-section-head">
          <div>
            <h3 className="billing-section-title">Software updates</h3>
            <p className="billing-section-note" style={{ margin: '2px 0 0' }}>
              Status: {settingsMeta.lastCheckStatus}
              {settingsMeta.lastCheckAt
                ? ` · Last checked ${new Date(settingsMeta.lastCheckAt).toLocaleString()}`
                : ''}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="select-input"
              value={settingsMeta.channel}
              onChange={(e) =>
                handleChannelChange(e.target.value as 'stable' | 'beta')
              }
              style={{ height: 32, minWidth: 148, fontSize: '12px' }}
              aria-label="Update channel"
            >
              <option value="stable">Stable channel</option>
              <option value="beta">Beta channel</option>
            </select>

            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 32, padding: '0 14px', fontSize: '12px' }}
              disabled={updateStatus === 'checking'}
              onClick={handleCheckUpdate}
            >
              {updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
        </div>

        {updateInfo && (
          <div
            className="form-banner info"
            style={{ marginTop: '10px', fontSize: '12px' }}
          >
            {updateInfo}
          </div>
        )}
      </section>

      {/* Browser & Device Security */}
      <section className="billing-section">
        <div className="billing-section-head">
          <h3 className="billing-section-title">
            Browser &amp; installation verification
          </h3>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          <div
            className="card-nested"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
            }}
          >
            <div>
              <div
                style={{ fontSize: '12.5px', fontWeight: 600, color: '#f1f5f9' }}
              >
                Automation browser
              </div>
              <div
                style={{ fontSize: '11.5px', color: 'rgba(148, 163, 184, 0.9)' }}
              >
                {settingsMeta.browserStatus?.message || 'Checking browser…'}
              </div>
            </div>
            <span
              className="tag"
              style={{
                fontSize: '11px',
                color: settingsMeta.browserStatus?.available
                  ? 'var(--success)'
                  : 'var(--danger)',
              }}
            >
              {settingsMeta.browserStatus?.available ? 'Verified' : 'Missing'}
            </span>
          </div>

          <div
            className="card-nested"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 12px',
            }}
          >
            <div>
              <div
                style={{ fontSize: '12.5px', fontWeight: 600, color: '#f1f5f9' }}
              >
                Installation security key
              </div>
              <div
                style={{ fontSize: '11.5px', color: 'rgba(148, 163, 184, 0.9)' }}
              >
                {settingsMeta.deviceKeyOk
                  ? `Active (${settingsMeta.deviceId.slice(0, 16)}…)`
                  : 'Key mismatch detected on this device'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 30, padding: '0 12px', fontSize: '11.5px' }}
              onClick={handleResetDeviceKey}
            >
              Re-register device
            </button>
          </div>
        </div>
      </section>

      {/* Agreements & Policies + Danger Zone (Delete Account) */}
      <div className="billing-top-grid">
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h3 className="billing-section-title">Agreements &amp; policies</h3>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 30, padding: '0 12px', fontSize: '11.5px' }}
              onClick={() => openLegalDocument('eula')}
            >
              License Agreement (EULA)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 30, padding: '0 12px', fontSize: '11.5px' }}
              onClick={() => openLegalDocument('terms')}
            >
              Terms of Service
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 30, padding: '0 12px', fontSize: '11.5px' }}
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
              <h3
                className="billing-section-title"
                style={{ color: '#fca5a5' }}
              >
                Delete Account
              </h3>
              <p className="billing-section-note" style={{ margin: '2px 0 0' }}>
                Permanently delete your FMSG account, profiles, and saved job
                history.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-danger"
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

      {/* Delete Account Two-Step Modal */}
      {showDeleteModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '16px',
                fontWeight: 700,
                color: '#fca5a5',
              }}
            >
              Delete Account Permanently?
            </h3>

            {deleteStep === 'confirm' ? (
              <>
                <p
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                    marginBottom: '16px',
                    lineHeight: 1.5,
                  }}
                >
                  This action is permanent and cannot be undone. All search
                  profiles, CVs, and application history will be removed. We
                  will send a 6-digit confirmation code to your email.
                </p>
                {deleteError && (
                  <div className="field-error-text" style={{ marginBottom: 10 }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    disabled={deleteBusy}
                    onClick={handleSendDeleteCode}
                  >
                    {deleteBusy ? 'Sending Code…' : 'Send Confirmation Code'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleConfirmDeleteAccount}>
                <p
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                    marginBottom: '12px',
                  }}
                >
                  Enter the 6-digit code sent to your email address to confirm
                  permanent deletion:
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="field-input"
                  placeholder="123456"
                  value={deleteCode}
                  onChange={(e) =>
                    setDeleteCode(e.target.value.replace(/\D/g, ''))
                  }
                  style={{ marginBottom: '12px' }}
                  autoFocus
                />
                {deleteError && (
                  <div className="field-error-text" style={{ marginBottom: 10 }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="submit"
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? 'Deleting…' : 'Permanently Delete Account'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
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
