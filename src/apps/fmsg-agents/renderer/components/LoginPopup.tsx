import React, { useState, useEffect, useCallback } from 'react';

interface LoginPopupProps {
  site: string;
  reason: string;
  onLogin: (creds: { username?: string; email?: string; password: string; save: boolean }) => void;
  onSkip: () => void;
  onClose: () => void;
}

export default function LoginPopup({ site, reason, onLogin, onSkip, onClose }: LoginPopupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [save, setSave] = useState(false);
  const [timer, setTimer] = useState(600); // 10 minutes in seconds
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(interval);
          onSkip(); // Auto-skip after 10 minutes
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onSkip]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onLogin({ email: email || undefined, password, save });
  }, [email, password, save, onLogin]);

  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <h2>Login Required — {site}</h2>
        <p><strong>Reason:</strong> {reason}</p>
        <p style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
          Everything stays on this device. Nothing is transmitted unless you confirm.
        </p>

        <div style={{ marginBottom: 12 }}>
          <button
            style={{ marginRight: 8, padding: '6px 12px', fontSize: 12, borderRadius: 4, border: '1px solid #333', background: mode === 'login' ? '#2a2a40' : '#12121f', color: '#fff', cursor: 'pointer' }}
            onClick={() => setMode('login')}
          >
            Log In
          </button>
          <button
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, border: '1px solid #333', background: mode === 'signup' ? '#2a2a40' : '#12121f', color: '#fff', cursor: 'pointer' }}
            onClick={() => setMode('signup')}
          >
            Sign Up
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email / Username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: 10, marginBottom: 10, background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, color: '#fff' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: 10, marginBottom: 8, background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, color: '#fff' }}
            />
            <label style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
                style={{ accentColor: '#4f8cff' }}
              />
              Save securely in .exe folder (encrypted)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-start" style={{ flex: 1 }}>
                Confirm Login
              </button>
              <button type="button" className="btn btn-stop" style={{ flex: 1 }} onClick={onSkip}>
                Skip ({formatTime(timer)})
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: '#ccc', marginBottom: 12 }}>
              Sign up: the agent will either create the account using your email (and confirm via Gmail if you are logged in) or you can provide your preferred login details below.
            </p>
            <input
              type="text"
              placeholder="Preferred username / email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 10, background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, color: '#fff' }}
            />
            <input
              type="password"
              placeholder="Password to set"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 8, background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, color: '#fff' }}
            />
            <label style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
                style={{ accentColor: '#4f8cff' }}
              />
              Save securely
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-start" style={{ flex: 1 }} onClick={() => {
                if (email && password) {
                  onLogin({ email, password, save });
                }
              }}>
                Confirm Sign Up
              </button>
              <button className="btn btn-stop" style={{ flex: 1 }} onClick={onSkip}>
                Skip ({formatTime(timer)})
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #222', textAlign: 'center', fontSize: 10, color: '#555' }}>
          Auto-skip in: <span className="countdown">{formatTime(timer)}</span>
        </div>
      </div>
    </div>
  );
}
