import React, { useState, useEffect } from 'react';
import { useDialog } from './DialogSystem';

interface SettingsPanelProps {
  selectedProfileId: string;
  costCap: number;
  billingMode: 'pay-as-you-go' | 'bundle';
  bundleTier: 'Starter' | 'Lite' | 'Standard' | 'Power';
  isRunning: boolean;
  onRunningChange: (running: boolean) => void;
  onBatchChange?: (batch: number) => void;
  fullPage?: boolean;
}

export default function SettingsPanel(_props: SettingsPanelProps) {
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
    browserStatus?: { available: boolean; browserName: string; message: string };
  }>({
    currentVersion: '0.6.0',
    installedVersion: '0.6.0',
    channel: 'stable',
    lastCheckAt: null,
    lastCheckStatus: 'Never checked',
    deviceId: '',
    deviceKeyOk: true,
  });

  const refreshSettingsMeta = () => {
    window.electronAPI
      ?.getUpdateSettings()
      .then((res) => {
        if (res) setSettingsMeta(res);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshSettingsMeta();
  }, []);

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

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">Settings</h2>
          <p className="billing-subtitle">
            Run preferences, browser verification, and software updates.
          </p>
        </div>
        <span className="balance-chip">
          Version <strong>v{settingsMeta.currentVersion}</strong>
        </span>
      </header>

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
              style={{ height: 32, width: 124, fontSize: '11.5px' }}
              aria-label="Update channel"
            >
              <option value="stable">Stable channel</option>
              <option value="beta">Beta channel</option>
            </select>

            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 32, padding: '0 12px', fontSize: '11.5px' }}
              disabled={updateStatus === 'checking'}
              onClick={handleCheckUpdate}
            >
              {updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
        </div>

        {updateInfo && (
          <div className="form-banner info" style={{ marginTop: '10px', fontSize: '11.5px' }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
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
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                Automation browser
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(148, 163, 184, 0.85)' }}>
                {settingsMeta.browserStatus?.message || 'Checking browser…'}
              </div>
            </div>
            <span
              className="tag"
              style={{
                fontSize: '10.5px',
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
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                Installation security key
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(148, 163, 184, 0.85)' }}>
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

      {/* Agreements & Policies */}
      <section className="billing-section">
        <div className="billing-section-head">
          <h3 className="billing-section-title">Agreements &amp; policies</h3>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
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
    </div>
  );
}
