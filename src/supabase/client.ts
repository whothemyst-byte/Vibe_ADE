import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getClerkToken } from "./clerkToken";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.",
  );
}

/**
 * App-wide Supabase client. The `accessToken` callback hands Supabase a live
 * Clerk JWT on every REST and Realtime request, so RLS sees the Clerk user id as
 * auth.jwt()->>'sub'. We disable Supabase's own auth persistence — Clerk is the
 * sole identity provider; Supabase never holds its own session here.
 */
export const supabase = createClient<Database>(url, anonKey, {
  accessToken: getClerkToken,
  auth: { persistSession: false, autoRefreshToken: false },
});
