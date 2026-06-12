import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRequest, overQuota, DAILY_LIMIT } from "./rules.ts";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const ROUTES: Record<string, string> = {
  chat: "/chat/completions",
  transcribe: "/audio/transcriptions",
};

// The Tauri webview enforces CORS like a browser; allow the headers the app sends.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function reject(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reject(405, "method not allowed");

  const route = new URL(req.url).pathname.split("/").pop() ?? "";
  const deviceId = req.headers.get("x-device-id");

  // Pull the model out of the body (JSON for chat, multipart for transcribe)
  // and rebuild the body to forward.
  let body: BodyInit;
  let model: string | null = null;
  let contentHeaders: Record<string, string> = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const json = await req.json();
      model = typeof json.model === "string" ? json.model : null;
      body = JSON.stringify(json);
      contentHeaders = { "Content-Type": "application/json" };
    } else {
      const form = await req.formData(); // re-sending FormData regenerates the multipart boundary
      const m = form.get("model");
      model = typeof m === "string" ? m : null;
      body = form;
    }
  } catch {
    return reject(400, "unreadable body");
  }

  const rejected = checkRequest(route, model, deviceId);
  if (rejected) return reject(rejected.status, rejected.message);

  const { data: count, error } = await supabase.rpc("bump_groq_usage", {
    p_device_id: deviceId,
  });
  if (error) return reject(500, "usage tracking failed");
  if (overQuota(count as number)) {
    return reject(429, `daily limit of ${DAILY_LIMIT} requests reached`);
  }

  const res = await fetch(`${GROQ_BASE}${ROUTES[route]}`, {
    method: "POST",
    headers: { ...contentHeaders, Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}` },
    body,
  });
  return new Response(res.body, {
    status: res.status,
    headers: {
      ...CORS,
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
});
