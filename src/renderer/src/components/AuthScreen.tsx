import { useEffect, useMemo, useState } from 'react';
import type { AuthSession } from '@shared/ipc';
import { Button, Input, Label, Icon, BrandMark, cn } from './ui';

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
    <div className="fixed inset-0 flex items-center justify-center p-3 bg-bg-page">
      <section
        className="w-full max-w-[320px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-bg-panel border border-line rounded shadow-premium overflow-hidden">
          <header className="px-3 h-7 border-b border-line bg-bg-panel-2 flex items-center gap-2">
            <BrandMark size={14} />
            <h2 className="text-xs font-medium text-fg">
              {mode === 'login' ? 'Sign in to Vibe-ADE' : 'Create Vibe-ADE account'}
            </h2>
          </header>

          <div className="p-3 space-y-2.5">
            <div className="flex p-0.5 bg-bg-panel-2 border border-line rounded">
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={submitting || isCooldownActive || !authAvailable}
                  className={cn(
                    'flex-1 h-6 text-[11px] font-medium rounded-sm transition-colors',
                    mode === m ? 'bg-bg-elev text-fg' : 'text-fg-muted hover:text-fg',
                    (submitting || isCooldownActive || !authAvailable) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

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
                leftIcon={<Icon name="mail_outline" size="xs" />}
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
                leftIcon={<Icon name="lock_outline" size="xs" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={submitting || !authAvailable}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="h-6 w-6 rounded-sm grid place-items-center text-fg-muted hover:text-fg transition-colors"
                  >
                    <Icon name={showPassword ? 'visibility_off' : 'visibility'} size="xs" />
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
              <div className="rounded-sm border border-warn/30 bg-warn/10 px-2 py-1.5 text-[11px] text-warn">
                Authentication service is not configured. Please contact support.
              </div>
            )}
            {isCooldownActive && (
              <div className="rounded-sm border border-warn/30 bg-warn/10 px-2 py-1.5 text-[11px] text-warn">
                Rate limit active. Try again in {cooldownSecondsRemaining}s.
              </div>
            )}
            {error && (
              <div className="rounded-sm border border-danger/30 bg-danger/10 px-2 py-1.5 flex items-start gap-1.5">
                <Icon name="error_outline" size="xs" className="text-danger mt-0.5" />
                <div className="text-[11px] text-fg-muted leading-snug">{error}</div>
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              className="w-full"
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
