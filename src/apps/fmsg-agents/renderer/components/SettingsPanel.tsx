import React, { useState } from 'react';

export default function SettingsPanel() {
  const [batch, setBatch] = useState('4');
  const [autoAccept, setAutoAccept] = useState(false);
  const [provider, setProvider] = useState('openrouter');
  const [key, setKey] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  const handleStart = () => {
    setIsRunning(true);
    // Get selected profile from ProfileBar (framework connection)
    const profileSelect = document.querySelector('select') as HTMLSelectElement;
    const profileId = profileSelect?.value || 'default';
    const batchNum = batch === 'unlimited' ? 128 : parseInt(batch, 10);

    (window as any).electronAPI.runAgent({
      profileId,
      batchSize: batchNum,
      autoAccept,
      mode: autoAccept ? 'complete' : 'ask',
      aiProvider: provider,
      aiKey: key,
    }).then((res: any) => {
      console.log('Agent result:', res);
      setIsRunning(false);
    });
  };

  return (
    <div className="controls">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <button className="btn btn-start" onClick={handleStart} disabled={isRunning}>
          {isRunning ? 'Running...' : 'Start'}
        </button>
        {isRunning && (
          <button className="btn btn-stop" onClick={() => setIsRunning(false)}>
            Stop
          </button>
        )}

        <span className="toggle-label">Batch:</span>
        <select className="select-input" value={batch} onChange={(e) => setBatch(e.target.value)}>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="4">4</option>
          <option value="8">8</option>
          <option value="16">16</option>
          <option value="32">32</option>
          <option value="64">64</option>
          <option value="128">128</option>
          <option value="unlimited">Unlimited</option>
        </select>

        <label className="toggle-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(e) => setAutoAccept(e.target.checked)}
            style={{ accentColor: '#4f8cff' }}
          />
          Auto-accept / Complete agent
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="toggle-label">AI Provider:</span>
        <select className="select-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="openrouter">OpenRouter</option>
          <option value="gemini">Gemini</option>
        </select>
        <input
          type="password"
          placeholder="Provider key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="select-input"
          style={{ width: 200 }}
        />
      </div>

      <div style={{ fontSize: 11, color: '#666' }}>
        Updates: security = auto | feature = optional (reminder after 5th launch)
      </div>
    </div>
  );
}
