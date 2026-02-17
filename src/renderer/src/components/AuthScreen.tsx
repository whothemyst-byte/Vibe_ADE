import { useEffect, useMemo, useState } from 'react';
import type { AuthSession } from '@shared/ipc';

interface AuthScreenProps {
  onAuthenticated: (session: AuthSession) => void;
}

const RATE_LIMIT_COOLDOWN_SECONDS = 60;

export function AuthScreen({ onAuthenticated }: AuthScreenProps): JSX.Element {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="auth-overlay">
      <section className="auth-card" onClick={(event) => event.stopPropagation()}>
        <header className="auth-card-header">
          <div className="auth-card-brand">
            <span>{'\u26A1'}</span>
            <small>Vibe-ADE Authentication</small>
          </div>
        </header>

        <div className="auth-card-body">
          <div className="auth-title">
            <h1>Vibe-ADE</h1>
            <p>Sign in to access your terminal workspace</p>
          </div>

          <div className="auth-mode-switch">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} disabled={submitting || isCooldownActive}>
              Login
            </button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} disabled={submitting || isCooldownActive}>
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
              disabled={submitting}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              disabled={submitting}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </label>

          {isCooldownActive && <div className="auth-info">Rate limit active. Try again in {cooldownSecondsRemaining}s.</div>}
          {error && (
            <div className="auth-error">
              <strong>Authentication Error</strong>
              <span>{error}</span>
            </div>
          )}

          <button className="primary auth-submit" onClick={() => void submit()} disabled={submitting || isCooldownActive}>
            {submitting ? 'Please wait...' : isCooldownActive ? `Try again in ${cooldownSecondsRemaining}s` : mode === 'login' ? 'Sign in with Email' : 'Create an account'}
          </button>
        </div>
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
