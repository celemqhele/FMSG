import React, { useState } from 'react';
import { useDialog } from './DialogSystem';

type AuthScreenMode =
  | 'login'
  | 'signup'
  | 'forgot'
  | 'forgot-sent'
  | 'check-email';

interface LoginScreenProps {
  version: string;
  onAuthenticated: (data: { user: any; profiles: any[] }) => void;
}

export default function LoginScreen({
  version,
  onAuthenticated,
}: LoginScreenProps) {
  const { openLegalDocument, showToast } = useDialog();

  const [screen, setScreen] = useState<AuthScreenMode>('login');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const [agreeTos, setAgreeTos] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    surname?: string;
    email?: string;
    password?: string;
    terms?: string;
    general?: string;
  }>({});

  const clearErrors = () => setFieldErrors({});

  const switchScreen = (next: AuthScreenMode) => {
    clearErrors();
    setLoading(false);
    setScreen(next);
    window.electronAPI?.logUIEvent('switch_auth_screen', next);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFieldErrors({ email: 'Please enter your email address.' });
      return;
    }
    if (!password) {
      setFieldErrors({ password: 'Please enter your password.' });
      return;
    }

    setLoading(true);
    window.electronAPI?.logUIEvent('submit_form', 'login_form');

    try {
      const res = await window.electronAPI.login({
        email: cleanEmail,
        password,
        keepSignedIn,
      });
      setLoading(false);

      if (res?.ok && res.user) {
        onAuthenticated({ user: res.user, profiles: res.profiles || [] });
        return;
      }

      if (res?.requiresEmailConfirmation) {
        setPendingEmail(res.unconfirmedEmail || cleanEmail);
        setScreen('check-email');
        return;
      }

      const targetField = res?.field || 'general';
      setFieldErrors({
        [targetField]:
          res?.error ||
          'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
      });
    } catch (err: any) {
      setLoading(false);
      window.electronAPI?.logRendererError(
        err?.message || 'Login IPC call failed',
        err?.stack
      );
      setFieldErrors({
        general:
          'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
      });
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const cleanName = name.trim();
    const cleanSurname = surname.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setFieldErrors({ name: 'Please enter your name.' });
      return;
    }
    if (!cleanSurname) {
      setFieldErrors({ surname: 'Please enter your surname.' });
      return;
    }
    if (!cleanEmail) {
      setFieldErrors({ email: 'Please enter your email address.' });
      return;
    }
    if (!password || password.length < 8) {
      setFieldErrors({
        password: 'Password must be at least 8 characters long.',
      });
      return;
    }
    if (!agreeTos) {
      setFieldErrors({
        terms: 'You must agree to the Terms of Service.',
      });
      return;
    }
    if (!agreePrivacy) {
      setFieldErrors({
        terms: 'You must agree to the Privacy Policy.',
      });
      return;
    }
    if (!agreeAge) {
      setFieldErrors({
        terms: 'You must confirm you are 18 or older.',
      });
      return;
    }

    setLoading(true);
    window.electronAPI?.logUIEvent('submit_form', 'signup_form');

    try {
      const res = await window.electronAPI.signup({
        name: cleanName,
        surname: cleanSurname,
        email: cleanEmail,
        password,
        agreeTos,
        agreePrivacy,
        agreeAge,
      });
      setLoading(false);

      if (res?.ok && res.user) {
        onAuthenticated({ user: res.user, profiles: res.profiles || [] });
        return;
      }

      if (res?.ok && res.requiresEmailConfirmation) {
        setPendingEmail(res.unconfirmedEmail || cleanEmail);
        setScreen('check-email');
        return;
      }

      const targetField = res?.field || 'general';
      setFieldErrors({
        [targetField]:
          res?.error ||
          'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
      });
    } catch (err: any) {
      setLoading(false);
      window.electronAPI?.logRendererError(
        err?.message || 'Signup IPC call failed',
        err?.stack
      );
      setFieldErrors({
        general:
          'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
      });
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFieldErrors({ email: 'Please enter your email address.' });
      return;
    }

    setLoading(true);
    window.electronAPI?.logUIEvent('submit_form', 'forgot_password_form');

    try {
      const res = await window.electronAPI.forgotPassword(cleanEmail);
      setLoading(false);
      if (res?.ok) {
        setPendingEmail(cleanEmail);
        setScreen('forgot-sent');
      } else {
        const targetField = res?.field || 'general';
        setFieldErrors({
          [targetField]:
            res?.error ||
            'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
        });
      }
    } catch (err: any) {
      setLoading(false);
      window.electronAPI?.logRendererError(
        err?.message || 'Forgot password IPC call failed',
        err?.stack
      );
      setFieldErrors({
        general:
          'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
      });
    }
  };

  const handleResendConfirmation = async () => {
    const targetEmail = pendingEmail || email.trim();
    if (!targetEmail || resending) return;
    setResending(true);
    window.electronAPI?.logUIEvent('click', 'resend_confirmation');

    try {
      const res = await window.electronAPI.resendConfirmation(targetEmail);
      setResending(false);
      if (res?.ok) {
        showToast('Confirmation email sent. Please check your inbox.', 'success');
      } else {
        showToast(
          res?.error || 'Could not resend email. Please try again shortly.',
          'error'
        );
      }
    } catch {
      setResending(false);
      showToast('No internet connection. Please try again.', 'error');
    }
  };

  return (
    <div className="auth-viewport">
      <div className="auth-card">
        {/* Logo & Title Block (32px bottom margin to toggle) */}
        <div className="auth-title-block">
          <div className="auth-logo-mark" aria-hidden="true">
            FM
          </div>
          <h1 className="auth-title">FMSG Agents</h1>
        </div>

        {/* Segmented Toggle (30px bottom margin to first field) */}
        {(screen === 'login' || screen === 'signup') && (
          <div className="segmented-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={screen === 'login'}
              className={`segmented-toggle-btn ${
                screen === 'login' ? 'active' : ''
              }`}
              onClick={() => switchScreen('login')}
            >
              Log In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={screen === 'signup'}
              className={`segmented-toggle-btn ${
                screen === 'signup' ? 'active' : ''
              }`}
              onClick={() => switchScreen('signup')}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* General Banner Error */}
        {fieldErrors.general && (
          <div
            className="form-banner error"
            role="alert"
            style={{ marginBottom: '18px' }}
          >
            {fieldErrors.general}
          </div>
        )}

        {/* SCREEN: LOG IN */}
        {screen === 'login' && (
          <form onSubmit={handleLoginSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="login-email" className="field-label">
                Email
              </label>
              <div className="field-input-wrap">
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email || fieldErrors.general) clearErrors();
                  }}
                  placeholder="you@example.com"
                  className={`field-input ${
                    fieldErrors.email ? 'has-error' : ''
                  }`}
                  required
                />
              </div>
              {fieldErrors.email && (
                <div className="field-error-text" role="alert">
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="login-password" className="field-label">
                Password
              </label>
              <div className="field-input-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password || fieldErrors.general)
                      clearErrors();
                  }}
                  placeholder="Enter your password"
                  className={`field-input ${
                    fieldErrors.password ? 'has-error' : ''
                  }`}
                  style={{ paddingRight: '68px' }}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && (
                <div className="field-error-text" role="alert">
                  {fieldErrors.password}
                </div>
              )}
            </div>

            <div className="auth-options-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                />
                <span>Keep me signed in</span>
              </label>

              <button
                type="button"
                className="link-btn"
                onClick={() => switchScreen('forgot')}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit-btn"
            >
              {loading ? 'Signing in...' : 'Log In'}
            </button>
          </form>
        )}

        {/* SCREEN: SIGN UP */}
        {screen === 'signup' && (
          <form onSubmit={handleSignUpSubmit} className="auth-form" noValidate>
            <div className="auth-row-two">
              <div className="form-group">
                <label htmlFor="signup-name" className="field-label">
                  Name
                </label>
                <input
                  id="signup-name"
                  name="given-name"
                  type="text"
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) clearErrors();
                  }}
                  placeholder="Your name"
                  className={`field-input ${
                    fieldErrors.name ? 'has-error' : ''
                  }`}
                  required
                />
                {fieldErrors.name && (
                  <div className="field-error-text" role="alert">
                    {fieldErrors.name}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="signup-surname" className="field-label">
                  Surname
                </label>
                <input
                  id="signup-surname"
                  name="family-name"
                  type="text"
                  autoComplete="family-name"
                  value={surname}
                  onChange={(e) => {
                    setSurname(e.target.value);
                    if (fieldErrors.surname) clearErrors();
                  }}
                  placeholder="Your surname"
                  className={`field-input ${
                    fieldErrors.surname ? 'has-error' : ''
                  }`}
                  required
                />
                {fieldErrors.surname && (
                  <div className="field-error-text" role="alert">
                    {fieldErrors.surname}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-email" className="field-label">
                Email
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) clearErrors();
                }}
                placeholder="you@example.com"
                className={`field-input ${
                  fieldErrors.email ? 'has-error' : ''
                }`}
                required
              />
              {fieldErrors.email && (
                <div className="field-error-text" role="alert">
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="signup-password" className="field-label">
                Password
              </label>
              <div className="field-input-wrap">
                <input
                  id="signup-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) clearErrors();
                  }}
                  placeholder="At least 8 characters"
                  className={`field-input ${
                    fieldErrors.password ? 'has-error' : ''
                  }`}
                  style={{ paddingRight: '68px' }}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && (
                <div className="field-error-text" role="alert">
                  {fieldErrors.password}
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginTop: '2px',
              }}
            >
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={agreeTos}
                  onChange={(e) => {
                    setAgreeTos(e.target.checked);
                    if (fieldErrors.terms) clearErrors();
                  }}
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openLegalDocument('terms')}
                  >
                    Terms of Service
                  </button>
                </span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => {
                    setAgreePrivacy(e.target.checked);
                    if (fieldErrors.terms) clearErrors();
                  }}
                />
                <span>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openLegalDocument('privacy')}
                  >
                    Privacy Policy
                  </button>
                </span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={agreeAge}
                  onChange={(e) => {
                    setAgreeAge(e.target.checked);
                    if (fieldErrors.terms) clearErrors();
                  }}
                />
                <span>I confirm that I am 18 years or older</span>
              </label>

              {fieldErrors.terms && (
                <div className="field-error-text" role="alert">
                  {fieldErrors.terms}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit-btn"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* SCREEN: FORGOT PASSWORD */}
        {screen === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="auth-form" noValidate>
            <p
              style={{
                margin: '0 0 6px 0',
                fontSize: '13.5px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
              }}
            >
              Enter your email and we will send you a password reset link.
            </p>

            <div className="form-group">
              <label htmlFor="forgot-email" className="field-label">
                Email
              </label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) clearErrors();
                }}
                placeholder="you@example.com"
                className={`field-input ${
                  fieldErrors.email ? 'has-error' : ''
                }`}
                required
              />
              {fieldErrors.email && (
                <div className="field-error-text" role="alert">
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit-btn"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button
                type="button"
                className="link-btn"
                onClick={() => switchScreen('login')}
              >
                Back to Log In
              </button>
            </div>
          </form>
        )}

        {/* SCREEN: FORGOT PASSWORD SENT */}
        {screen === 'forgot-sent' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Check your email. We sent a password reset link to
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '14.5px',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--text-primary)',
              }}
            >
              {pendingEmail}
            </p>
            <button
              type="button"
              className="auth-submit-btn"
              onClick={() => switchScreen('login')}
            >
              Back to Log In
            </button>
          </div>
        )}

        {/* SCREEN: CHECK EMAIL (Unconfirmed Email State) */}
        {screen === 'check-email' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--text-primary)',
              }}
            >
              Check your email
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '13.5px',
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
              }}
            >
              We sent a confirmation link to{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {pendingEmail || email}
              </strong>
              . Confirm your email address in your inbox, then sign in below.
            </p>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', height: '48px' }}
              disabled={resending}
              onClick={handleResendConfirmation}
            >
              {resending ? 'Sending...' : 'Resend Confirmation Email'}
            </button>

            <button
              type="button"
              className="auth-submit-btn"
              onClick={() => switchScreen('login')}
            >
              Back to Log In
            </button>
          </div>
        )}

        {/* Footer line (28px below button) */}
        <div className="auth-footer">
          No account?{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              window.electronAPI?.openExternalUrl(
                'https://findmesomejobs.co.za'
              )
            }
          >
            Sign up on FMSG
          </button>
        </div>

        {/* Muted version tag at bottom */}
        <div className="auth-version-tag">v{version.replace(/^v/i, '')}</div>
      </div>
    </div>
  );
}
