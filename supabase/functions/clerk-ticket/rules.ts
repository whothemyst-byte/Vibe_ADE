// Pure, runtime-agnostic helpers for the clerk-ticket edge function.
// Kept free of Deno/jose imports so they can be unit-tested under vitest (Node).

/** Origins allowed to call the ticket endpoint (the hosted sign-in helper page). */
export const ALLOWED_ORIGINS = [
  "https://www.quansynd.com",
  "https://quansynd.com",
  "http://localhost:8080",
] as const;

const DEFAULT_ORIGIN = "https://www.quansynd.com";

/** Echo the request origin only if it is allow-listed, else fall back to the canonical one. */
export function corsAllowOrigin(origin: string | null | undefined): string {
  return origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : DEFAULT_ORIGIN;
}

/** Build the CORS headers for a given request origin. */
export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": corsAllowOrigin(origin),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** Extract a bearer token from an Authorization header, or null if absent/malformed. */
export function parseBearer(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}
