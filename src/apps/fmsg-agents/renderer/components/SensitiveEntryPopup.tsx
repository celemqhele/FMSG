import React, { useState } from 'react';

interface SensitiveEntryPopupProps {
  field: string;
  description: string;
  onConfirm: (value: string | File, save: boolean) => void;
  onSkip: () => void;
  onClose: () => void;
  isFile?: boolean;
}

export default function SensitiveEntryPopup({ field, description, onConfirm, onSkip, onClose, isFile = false }: SensitiveEntryPopupProps) {
  const [value, setValue] = useState('');
  const [save, setSave] = useState(false);
  const [doNotSave, setDoNotSave] = useState(false);

  const handleConfirm = () => {
    if (isFile) {
      // File handling: in a real build, this would open a file picker via Electron dialog
      // For framework: pass a placeholder file reference
      onConfirm(value || 'file-selected', save && !doNotSave);
    } else {
      onConfirm(value, save && !doNotSave);
    }
  };

  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <h2>Sensitive Entry Required — {field}</h2>
        <p><strong>Description:</strong> {description}</p>
        <p style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
          This data is encrypted locally. Only this agent process can access it. It never leaves the device.
        </p>

        {!isFile ? (
          <input
            type={field.toLowerCase().includes('password') ? 'password' : 'text'}
            placeholder={`Enter ${field}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: '100%', padding: 10, marginBottom: 8, background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, color: '#fff' }}
          />
        ) : (
          <div>
            <input
              type="text"
              placeholder="Select file (framework placeholder)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 8, background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, color: '#fff' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={save && !doNotSave}
              onChange={(e) => {
                setSave(e.target.checked);
                if (e.target.checked) setDoNotSave(false);
              }}
              style={{ accentColor: '#4f8cff' }}
            />
            Save securely for future applications
          </label>
          <label style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={doNotSave}
              onChange={(e) => {
                setDoNotSave(e.target.checked);
                if (e.target.checked) setSave(false);
              }}
              style={{ accentColor: '#e74c3c' }}
            />
            Do not save (ask again each time)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-start" style={{ flex: 1 }} onClick={handleConfirm}>
            Confirm Entry
          </button>
          <button className="btn btn-stop" style={{ flex: 1 }} onClick={onSkip}>
            Skip
          </button>
          <button style={{ flex: 1, padding: '10px', borderRadius: 6, border: '1px solid #333', background: '#12121f', color: '#fff', cursor: 'pointer', fontSize: 14 }} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: '#555', textAlign: 'center' }}>
          Encrypted storage: %APPDATA%/fmsg-agents/secure/ (agent-only access)
        </div>
      </div>
    </div>
  );
}
