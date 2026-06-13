// clerk-ticket: mints a single-use Clerk sign-in token for the user proven by a
// valid Clerk session JWT. Used by the hosted sign-in helper page to hand a
// browser-completed OAuth session back into the Vibe Space desktop app.
//
// Required env secret: CLERK_SECRET_KEY (sk_test_… / sk_live_…). Set it in the
// Supabase dashboard (Edge Functions → Secrets) — never commit it.
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { corsHeaders, parseBearer } from "./rules.ts";

// Clerk Frontend API origin for this instance (issuer + JWKS live here).
const CLERK_ISSUER = "https://cosmic-shiner-55.clerk.accounts.dev";
const JWKS = createRemoteJWKSet(new URL(`${CLERK_ISSUER}/.well-known/jwks.json`));
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY") ?? "";

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, cors);
  if (!CLERK_SECRET_KEY) return json({ error: "server not configured" }, 500, cors);

  const token = parseBearer(req.headers.get("authorization"));
  if (!token) return json({ error: "missing bearer token" }, 401, cors);

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: CLERK_ISSUER });
    if (!payload.sub) return json({ error: "token has no subject" }, 401, cors);
    userId = payload.sub;
  } catch {
    return json({ error: "invalid session token" }, 401, cors);
  }

  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId, expire_in_seconds: 600 }),
  });

  if (!res.ok) {
    return json({ error: "failed to mint sign-in token", detail: await res.text() }, 502, cors);
  }

  const data = await res.json();
  return json({ ticket: data.token }, 200, cors);
});
