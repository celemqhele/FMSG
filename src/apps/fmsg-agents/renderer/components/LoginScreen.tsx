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
  onAuthenticated,
}: LoginScreenProps) {
  const { openLegalDocument, showToast } = useDialog();

  const [screen, setScreen] = useState<AuthScreenMode>('login');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // AU-01: Default to false so shared/demo machines never persist sessions silently
  const [keepSignedIn, setKeepSignedIn] = useState(false);

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
    const nextErrors: typeof fieldErrors = {};
    if (!cleanEmail) {
      nextErrors.email = 'Please enter your email address.';
    }
    if (!password) {
      nextErrors.password = 'Please enter your password.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
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

    // AU-09: Validate all fields simultaneously so the user sees every required correction at once
    const nextErrors: typeof fieldErrors = {};
    if (!cleanName) {
      nextErrors.name = 'Enter your first name.';
    }
    if (!cleanSurname) {
      nextErrors.surname = 'Enter your surname.';
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!password || password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters long.';
    }
    if (!agreeTos || !agreePrivacy || !agreeAge) {
      nextErrors.terms =
        'Please accept the Terms of Service, Privacy Policy, and age confirmation to continue.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
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
        showToast(
          'Confirmation email sent. Please check your inbox.',
          'success'
        );
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

  const errorCount = Object.keys(fieldErrors).filter(
    (k) => Boolean((fieldErrors as any)[k])
  ).length;

  return (
    <main className="auth-viewport" aria-label="FMSG Agents sign in">
      <div className="auth-card">
        {/* Logo, Title & Value Proposition (AU-06) */}
        <div className="auth-title-block">
          <div className="auth-logo-mark" aria-hidden="true">
            FM
          </div>
          <h1 className="auth-title">FMSG Agents</h1>
          <p className="auth-subtitle">
            Automated South African job applications in your own browser
          </p>
        </div>

        {/* Segmented Toggle */}
        {(screen === 'login' || screen === 'signup') && (
          <div className="segmented-toggle" role="tablist" aria-label="Authentication mode">
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

        {/* General Error Banner with Recovery Action (AU-02, LS-04) */}
        {fieldErrors.general && (
          <div
            className="form-banner error"
            role="alert"
            style={{ marginBottom: '14px' }}
          >
            <div>{fieldErrors.general}</div>
            {screen === 'login' && (
              <button
                type="button"
                className="link-btn"
                style={{ marginTop: 4 }}
                onClick={() => switchScreen('forgot')}
              >
                Forgot your password? Reset it here →
              </button>
            )}
          </div>
        )}

        {/* Multi-Field Validation Summary Banner (AU-09) */}
        {!fieldErrors.general && errorCount > 1 && (
          <div
            className="form-banner error"
            role="alert"
            style={{ marginBottom: '12px' }}
          >
            Please correct the {errorCount} highlighted fields below to
            continue.
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
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={
                    fieldErrors.email ? 'login-email-error' : undefined
                  }
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
                <div
                  id="login-email-error"
                  className="field-error-text"
                  role="alert"
                >
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
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password ? 'login-password-error' : undefined
                  }
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
                <div
                  id="login-password-error"
                  className="field-error-text"
                  role="alert"
                >
                  {fieldErrors.password}
                </div>
              )}
            </div>

            <div className="auth-options-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="styled-checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                />
                <span>Keep me signed in on this PC</span>
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
              {loading ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Log In'
              )}
            </button>
          </form>
        )}

        {/* SCREEN: SIGN UP */}
        {screen === 'signup' && (
          <form
            onSubmit={handleSignUpSubmit}
            className="auth-form auth-form-compact"
            noValidate
          >
            <div className="auth-row-two">
              <div className="form-group">
                <label htmlFor="signup-name" className="field-label">
                  First name
                </label>
                <input
                  id="signup-name"
                  name="given-name"
                  type="text"
                  autoComplete="given-name"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={
                    fieldErrors.name ? 'signup-name-error' : undefined
                  }
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name)
                      setFieldErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="First name"
                  className={`field-input ${
                    fieldErrors.name ? 'has-error' : ''
                  }`}
                  required
                />
                {fieldErrors.name && (
                  <div
                    id="signup-name-error"
                    className="field-error-text"
                    role="alert"
                  >
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
                  aria-invalid={Boolean(fieldErrors.surname)}
                  aria-describedby={
                    fieldErrors.surname ? 'signup-surname-error' : undefined
                  }
                  value={surname}
                  onChange={(e) => {
                    setSurname(e.target.value);
                    if (fieldErrors.surname)
                      setFieldErrors((p) => ({ ...p, surname: undefined }));
                  }}
                  placeholder="Surname"
                  className={`field-input ${
                    fieldErrors.surname ? 'has-error' : ''
                  }`}
                  required
                />
                {fieldErrors.surname && (
                  <div
                    id="signup-surname-error"
                    className="field-error-text"
                    role="alert"
                  >
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
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={
                  fieldErrors.email ? 'signup-email-error' : undefined
                }
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email)
                    setFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="you@example.com"
                className={`field-input ${
                  fieldErrors.email ? 'has-error' : ''
                }`}
                required
              />
              {fieldErrors.email && (
                <div
                  id="signup-email-error"
                  className="field-error-text"
                  role="alert"
                >
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="form-group">
              <div className="field-label-row">
                <label htmlFor="signup-password" className="field-label">
                  Password
                </label>
                <span
                  id="signup-password-hint"
                  className={`field-hint ${
                    password.length >= 8 ? 'valid' : ''
                  }`}
                >
                  {password.length >= 8
                    ? '8+ characters ✓'
                    : 'Minimum 8 characters'}
                </span>
              </div>
              <div className="field-input-wrap">
                <input
                  id="signup-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby="signup-password-hint"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder="Create a password (8+ characters)"
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

            <div className="auth-consent-stack">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="styled-checkbox"
                  checked={agreeTos}
                  onChange={(e) => {
                    setAgreeTos(e.target.checked);
                    if (fieldErrors.terms)
                      setFieldErrors((p) => ({ ...p, terms: undefined }));
                  }}
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openLegalDocument('terms');
                    }}
                  >
                    Terms of Service
                  </button>
                </span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="styled-checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => {
                    setAgreePrivacy(e.target.checked);
                    if (fieldErrors.terms)
                      setFieldErrors((p) => ({ ...p, terms: undefined }));
                  }}
                />
                <span>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openLegalDocument('privacy');
                    }}
                  >
                    Privacy Policy
                  </button>
                </span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="styled-checkbox"
                  checked={agreeAge}
                  onChange={(e) => {
                    setAgreeAge(e.target.checked);
                    if (fieldErrors.terms)
                      setFieldErrors((p) => ({ ...p, terms: undefined }));
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
              {loading ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Creating account…
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        )}

        {/* SCREEN: FORGOT PASSWORD (AU-15, AU-16, AU-17) */}
        {screen === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="auth-form" noValidate>
            <div style={{ marginBottom: '4px' }}>
              <h2 className="auth-section-heading">Reset your password</h2>
              <p className="auth-section-copy">
                Enter the email address linked to your FMSG account and we will
                send a password reset link.
              </p>
            </div>

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
                  if (fieldErrors.email || fieldErrors.general) clearErrors();
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
              {loading ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Sending link…
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => switchScreen('login')}
            >
              ← Back to Log In
            </button>
          </form>
        )}

        {/* SCREEN: FORGOT PASSWORD SENT */}
        {screen === 'forgot-sent' && (
          <div className="auth-form" style={{ textAlign: 'center' }}>
            <h2 className="auth-section-heading">Check your email</h2>
            <p className="auth-section-copy">
              We sent a password reset link to{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {pendingEmail || email}
              </strong>
              . Follow the link in that email, then return here to sign in.
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

        {/* SCREEN: CHECK EMAIL FOR CONFIRMATION */}
        {screen === 'check-email' && (
          <div className="auth-form" style={{ textAlign: 'center' }}>
            <h2 className="auth-section-heading">Confirm your email</h2>
            <p className="auth-section-copy">
              Please confirm your email address at{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {pendingEmail || email}
              </strong>{' '}
              to activate your account.
            </p>

            <button
              type="button"
              disabled={resending}
              className="auth-submit-btn"
              onClick={handleResendConfirmation}
            >
              {resending ? 'Sending…' : 'Resend Confirmation Email'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => switchScreen('login')}
            >
              Back to Log In
            </button>
          </div>
        )}

        {/* Single Clear Footer Note (AU-04, AU-07) */}
        {(screen === 'login' || screen === 'signup') && (
          <div className="auth-footer">
            <span className="text-muted">
              Manage CVs and search profiles at{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  window.electronAPI?.openExternalUrl(
                    'https://www.findmesomejobs.co.za/dashboard'
                  )
                }
              >
                findmesomejobs.co.za ↗
              </button>
            </span>
          </div>
        )}
      </div>
    </main>
  );
}
