import { useEffect, useMemo, useState } from 'react';
import type { AuthSession } from '@shared/ipc';
import { UiIcon } from './UiIcon';

interface AuthScreenProps {
  onAuthenticated: (session: AuthSession) => void;
  authAvailable?: boolean;
}

const RATE_LIMIT_COOLDOWN_SECONDS = 60;

export function AuthScreen({ onAuthenticated, authAvailable = true }: AuthScreenProps): JSX.Element {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }
    const interval = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  const cooldownSecondsRemaining = useMemo(() => {
    if (!cooldownUntil) {
      return 0;
    }
    return Math.max(0, Math.ceil((cooldownUntil - tick) / 1000));
  }, [cooldownUntil, tick]);

  const isCooldownActive = cooldownSecondsRemaining > 0;

  useEffect(() => {
    if (cooldownUntil && cooldownSecondsRemaining === 0) {
      setCooldownUntil(null);
    }
  }, [cooldownSecondsRemaining, cooldownUntil]);

  const submit = async (): Promise<void> => {
    if (!authAvailable) {
      setError('Authentication service is not configured. Please contact support.');
      return;
    }
    const normalizedEmail = email.trim();
    if (isCooldownActive) {
      setError(`Too many attempts. Try again in ${cooldownSecondsRemaining}s.`);
      return;
    }
    if (!normalizedEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session =
        mode === 'login'
          ? await window.vibeAde.auth.login(normalizedEmail, password)
          : await window.vibeAde.auth.signup(normalizedEmail, password);
      onAuthenticated(session);
    } catch (submitError) {
      const rawMessage = submitError instanceof Error ? submitError.message : 'Authentication failed.';
      const friendly = toFriendlyAuthMessage(rawMessage);
      if (friendly.type === 'rate_limit') {
        setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_SECONDS * 1000);
        setTick(Date.now());
        setError(`Too many attempts. Try again in ${RATE_LIMIT_COOLDOWN_SECONDS}s.`);
      } else {
        setError(friendly.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-overlay auth-overlay-minimal">
      <section className="auth-shell auth-shell-minimal" onClick={(event) => event.stopPropagation()}>
        <section className="auth-card auth-card-minimal">
          <div className="auth-card-body">
            <div className="auth-title">
              <span className="auth-title-kicker">{mode === 'login' ? 'Return to workspace' : 'Provision your account'}</span>
              <h2>{mode === 'login' ? 'Log in to Vibe-ADE' : 'Create your Vibe-ADE account'}</h2>
              <p>{mode === 'login' ? 'Use your email credentials to restore your development surface.' : 'Create an account to initialize synced environments and desktop workspace access.'}</p>
            </div>

            <div className="auth-mode-switch">
              <button
                className={mode === 'login' ? 'active' : ''}
                onClick={() => setMode('login')}
                disabled={submitting || isCooldownActive || !authAvailable}
              >
                Login
              </button>
              <button
                className={mode === 'signup' ? 'active' : ''}
                onClick={() => setMode('signup')}
                disabled={submitting || isCooldownActive || !authAvailable}
              >
                Create Account
              </button>
            </div>

            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                disabled={submitting || !authAvailable}
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'login' ? 'Enter password' : 'Create password'}
                  disabled={submitting || !authAvailable}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={submitting || !authAvailable}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <UiIcon name={showPassword ? 'eye-off' : 'eye'} className="ui-icon ui-icon-sm" />
                </button>
              </div>
            </label>

            <div className="auth-feedback-stack">
              {!authAvailable && (
                <div className="auth-info">
                  Authentication service is not configured. Please contact support or your administrator.
                </div>
              )}

              {isCooldownActive && <div className="auth-info">Rate limit active. Try again in {cooldownSecondsRemaining}s.</div>}
              {error && (
                <div className="auth-error">
                  <strong>Authentication Error</strong>
                  <span>{error}</span>
                </div>
              )}
            </div>

            <button
              className="primary auth-submit"
              onClick={() => void submit()}
              disabled={submitting || isCooldownActive || !authAvailable}
            >
              {submitting ? 'Please wait...' : isCooldownActive ? `Try again in ${cooldownSecondsRemaining}s` : mode === 'login' ? 'Access Workspace' : 'Create Account'}
            </button>

            <div className="auth-terms">
              By continuing, you agree to Terms of Service and Privacy Policy.
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

type AuthErrorType = 'rate_limit' | 'invalid_credentials' | 'network' | 'generic';

function toFriendlyAuthMessage(message: string): { type: AuthErrorType; message: string } {
  const clean = message.replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '').trim();
  const normalized = clean.toLowerCase();

  if (normalized.includes('rate limit')) {
    return { type: 'rate_limit', message: 'Too many attempts. Please wait a minute and try again.' };
  }
  if (
    normalized.includes('invalid login credentials')
    || normalized.includes('invalid email or password')
    || normalized.includes('invalid email')
    || normalized.includes('invalid password')
  ) {
    return { type: 'invalid_credentials', message: 'Invalid email or password.' };
  }
  if (normalized.includes('timed out') || normalized.includes('network error') || normalized.includes('fetch failed')) {
    return { type: 'network', message: 'Network issue detected. Check your connection and try again.' };
  }
  return { type: 'generic', message: clean || 'Authentication failed.' };
}
