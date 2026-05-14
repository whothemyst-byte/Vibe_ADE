import { useEffect, useMemo, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import type { AuthSession } from '@shared/ipc';
import { Button, Input, Label, cn } from './ui';

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
    if (!cooldownUntil) return;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  const cooldownSecondsRemaining = useMemo(() => {
    if (!cooldownUntil) return 0;
    return Math.max(0, Math.ceil((cooldownUntil - tick) / 1000));
  }, [cooldownUntil, tick]);

  const isCooldownActive = cooldownSecondsRemaining > 0;

  useEffect(() => {
    if (cooldownUntil && cooldownSecondsRemaining === 0) setCooldownUntil(null);
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
    <div className="min-h-screen w-full grid place-items-center bg-bg p-3">
      <section
        className="w-[420px] max-w-full"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-bg-elev border border-line rounded-lg shadow-qs-lg p-8">
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-md bg-gradient-to-br from-qs-gold-500 to-qs-bronze-400 grid place-items-center text-qs-ink-900 font-display font-bold text-xl">
              QS
            </div>
            <h1 className="font-display text-2xl text-fg">Welcome to Vibe-ADE</h1>
            <p className="text-sm text-fg-muted text-center">
              {mode === 'login'
                ? 'Sign in to sync workspaces across machines.'
                : 'Create an account to get started.'}
            </p>
          </div>

          <div className="flex p-0.5 bg-bg-sunken border border-line rounded-md mb-4">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={submitting || isCooldownActive || !authAvailable}
                className={cn(
                  'flex-1 h-8 text-xs font-medium rounded-sm transition-colors',
                  mode === m ? 'bg-bg-elev text-fg shadow-qs-xs' : 'text-fg-muted hover:text-fg',
                  (submitting || isCooldownActive || !authAvailable) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                disabled={submitting || !authAvailable}
                leftIcon={<Mail className="w-4 h-4" />}
              />
            </div>

            <div>
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'login' ? 'Enter password' : 'Create password'}
                disabled={submitting || !authAvailable}
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={submitting || !authAvailable}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="h-6 w-6 rounded-sm grid place-items-center text-fg-muted hover:text-fg transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
            </div>

            {!authAvailable && (
              <div className="rounded-sm border border-qs-warning/30 bg-qs-warning/10 px-3 py-2 text-xs text-qs-warning">
                Authentication service is not configured. Please contact support.
              </div>
            )}
            {isCooldownActive && (
              <div className="rounded-sm border border-qs-warning/30 bg-qs-warning/10 px-3 py-2 text-xs text-qs-warning">
                Rate limit active. Try again in {cooldownSecondsRemaining}s.
              </div>
            )}
            {error && (
              <div className="rounded-sm border border-qs-danger/30 bg-qs-danger/10 px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-qs-danger mt-0.5 flex-shrink-0" />
                <div className="text-xs text-fg-muted leading-snug">{error}</div>
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              className="w-full bg-fg-accent text-qs-ink-900 hover:bg-qs-gold-400"
              loading={submitting}
              disabled={submitting || isCooldownActive || !authAvailable}
              onClick={() => void submit()}
            >
              {submitting
                ? 'Please wait...'
                : isCooldownActive
                  ? `Try again in ${cooldownSecondsRemaining}s`
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
            </Button>
          </div>
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
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid email or password') ||
    normalized.includes('invalid email') ||
    normalized.includes('invalid password')
  ) {
    return { type: 'invalid_credentials', message: 'Invalid email or password.' };
  }
  if (normalized.includes('timed out') || normalized.includes('network error') || normalized.includes('fetch failed')) {
    return { type: 'network', message: 'Network issue detected. Check your connection and try again.' };
  }
  return { type: 'generic', message: clean || 'Authentication failed.' };
}
