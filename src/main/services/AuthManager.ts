import fs from 'node:fs/promises';
import path from 'node:path';

interface SupabaseUser {
  id: string;
  email?: string;
}

interface SupabaseSessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SupabaseUser;
}

interface PersistedAuthState {
  version: 1;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string | null;
  };
}

export interface AuthSessionView {
  user: {
    id: string;
    email: string | null;
  };
  expiresAt: number;
}

export interface AuthSessionWithToken extends AuthSessionView {
  accessToken: string;
}

export class AuthManager {
  private static readonly REQUEST_TIMEOUT_MS = 12_000;
  private readonly statePath: string;
  private readonly supabaseUrl: string | null;
  private readonly supabaseAnonKey: string | null;

  constructor(userDataDir: string) {
    this.statePath = path.join(userDataDir, 'vibe-ade-auth.json');
    this.supabaseUrl = process.env.SUPABASE_URL ?? null;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? null;
  }

  async getSession(): Promise<AuthSessionView | null> {
    const session = await this.getSessionWithToken();
    if (!session) {
      return null;
    }
    return {
      user: session.user,
      expiresAt: session.expiresAt
    };
  }

  async getSessionWithToken(): Promise<AuthSessionWithToken | null> {
    this.ensureConfigured();
    const state = await this.readState();
    if (!state) {
      return null;
    }

    if (Date.now() >= state.expiresAt - 30_000) {
      const refreshed = await this.refreshSession(state.refreshToken).catch(() => null);
      if (!refreshed) {
        await this.clearState();
        return null;
      }
      return this.toView(refreshed);
    }

    const valid = await this.validateToken(state.accessToken).catch(() => false);
    if (!valid) {
      const refreshed = await this.refreshSession(state.refreshToken).catch(() => null);
      if (!refreshed) {
        await this.clearState();
        return null;
      }
      return this.toView(refreshed);
    }

    return this.toView(state);
  }

  async login(email: string, password: string): Promise<AuthSessionView> {
    this.ensureConfigured();
    const payload = await this.requestSupabaseSession('password', { email, password });
    const state = this.fromSessionPayload(payload);
    await this.persistState(state);
    return this.toView(state);
  }

  async signup(email: string, password: string): Promise<AuthSessionView> {
    this.ensureConfigured();
    const response = await this.fetchJson('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    const sessionPayload = (response.session ?? response) as Partial<SupabaseSessionResponse>;
    const accessToken = sessionPayload.access_token as string | undefined;
    const refreshToken = sessionPayload.refresh_token as string | undefined;
    const expiresIn = sessionPayload.expires_in as number | undefined;
    const user = (response.user ?? sessionPayload.user) as SupabaseUser | undefined;

    if (accessToken && refreshToken && expiresIn && user?.id) {
      const state: PersistedAuthState = {
        version: 1,
        accessToken,
        refreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
        user: {
          id: user.id,
          email: user.email ?? null
        }
      };
      await this.persistState(state);
      return this.toView(state);
    }

    // If email confirmation is enabled, signup may not return a session.
    // In that case, do not attempt immediate login (it fails with "Email not confirmed").
    if (user?.id && !accessToken) {
      throw new Error('Signup successful. Please confirm your email, then log in.');
    }

    const apiMessage =
      (response as { message?: string; msg?: string; error_description?: string }).message
      ?? (response as { message?: string; msg?: string; error_description?: string }).msg
      ?? (response as { message?: string; msg?: string; error_description?: string }).error_description;
    throw new Error(apiMessage ?? 'Signup failed. Please try again.');
  }

  async logout(): Promise<void> {
    const state = await this.readState();
    if (!state) {
      return;
    }
    this.ensureConfigured();
    try {
      await this.fetchJson('/auth/v1/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.accessToken}`
        }
      });
    } catch {
      // Best-effort revoke; always clear local auth state.
    }
    await this.clearState();
  }

  private ensureConfigured(): void {
    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
    }
  }

  private async requestSupabaseSession(
    grantType: 'password' | 'refresh_token',
    payload: { email?: string; password?: string; refresh_token?: string }
  ): Promise<SupabaseSessionResponse> {
    const response = await this.fetchJson(`/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!response.access_token || !response.refresh_token || !response.expires_in || !response.user?.id) {
      throw new Error('Invalid auth response from Supabase.');
    }

    return response as SupabaseSessionResponse;
  }

  private fromSessionPayload(payload: SupabaseSessionResponse): PersistedAuthState {
    return {
      version: 1,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + payload.expires_in * 1000,
      user: {
        id: payload.user.id,
        email: payload.user.email ?? null
      }
    };
  }

  private async refreshSession(refreshToken: string): Promise<PersistedAuthState> {
    const payload = await this.requestSupabaseSession('refresh_token', { refresh_token: refreshToken });
    const state = this.fromSessionPayload(payload);
    await this.persistState(state);
    return state;
  }

  private async validateToken(accessToken: string): Promise<boolean> {
    const response = await this.fetchJson('/auth/v1/user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return Boolean(response?.id);
  }

  private async fetchJson(endpoint: string, init: RequestInit): Promise<any> {
    this.ensureConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AuthManager.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.supabaseUrl}${endpoint}`, {
        ...init,
        headers: {
          apikey: this.supabaseAnonKey as string,
          'Content-Type': 'application/json',
          ...(init.headers ?? {})
        },
        signal: controller.signal
      });

      const contentType = response.headers.get('content-type');
      const payload = contentType?.includes('application/json') ? await response.json() : await response.text();

      if (!response.ok) {
        const message = this.extractApiMessage(payload);
        throw new Error(this.toFriendlyAuthError(message, response.status));
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out. Check your connection and try again.');
      }
      if (error instanceof TypeError) {
        throw new Error('Network error. Check your internet connection and try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractApiMessage(payload: unknown): string | null {
    if (payload && typeof payload === 'object') {
      const authPayload = payload as { error_description?: string; msg?: string; message?: string; error?: string };
      return authPayload.error_description ?? authPayload.msg ?? authPayload.message ?? authPayload.error ?? null;
    }
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim();
    }
    return null;
  }

  private toFriendlyAuthError(message: string | null, status: number): string {
    const normalized = (message ?? '').toLowerCase();

    if (status === 429 || normalized.includes('rate limit')) {
      return 'Too many attempts. Please wait a minute and try again.';
    }

    if (
      status === 400
      && (
        normalized.includes('invalid login credentials')
        || normalized.includes('invalid email')
        || normalized.includes('invalid password')
        || normalized.includes('invalid grant')
      )
    ) {
      return 'Invalid email or password.';
    }

    if (normalized.includes('email not confirmed')) {
      return 'Email not confirmed. Please confirm your email, then log in.';
    }

    if (status >= 500) {
      return 'Auth service is temporarily unavailable. Please try again.';
    }

    return message ?? `Supabase request failed with ${status}`;
  }

  private toView(state: PersistedAuthState): AuthSessionWithToken {
    return {
      user: state.user,
      accessToken: state.accessToken,
      expiresAt: state.expiresAt
    };
  }

  private async readState(): Promise<PersistedAuthState | null> {
    try {
      const raw = await fs.readFile(this.statePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedAuthState;
      if (
        parsed.version !== 1
        || !parsed.accessToken
        || !parsed.refreshToken
        || !parsed.expiresAt
        || !parsed.user?.id
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async persistState(state: PersistedAuthState): Promise<void> {
    const tempPath = `${this.statePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tempPath, this.statePath);
  }

  private async clearState(): Promise<void> {
    try {
      await fs.unlink(this.statePath);
    } catch {
      // Ignore missing file.
    }
  }
}
