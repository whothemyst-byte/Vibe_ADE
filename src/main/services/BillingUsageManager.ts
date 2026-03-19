import type { AuthManager } from './AuthManager';

export class BillingUsageManager {
  private static readonly REQUEST_TIMEOUT_MS = 8_000;
  private readonly authManager: AuthManager;
  private readonly supabaseUrl: string | null;
  private readonly supabaseAnonKey: string | null;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
    this.supabaseUrl = process.env.SUPABASE_URL ?? null;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? null;
  }

  async recordUsage(eventType: 'task' | 'swarm', amount = 1): Promise<void> {
    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      return;
    }
    const session = await this.authManager.getSessionWithToken();
    if (!session) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BillingUsageManager.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/record_usage_event`, {
        method: 'POST',
        headers: {
          apikey: this.supabaseAnonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ event_type: eventType, amount }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        console.warn('Failed to record usage event:', text);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Usage event timed out.');
        return;
      }
      console.warn('Failed to record usage event:', error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
