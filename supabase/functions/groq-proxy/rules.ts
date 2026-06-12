/** Pure request rules for the groq-proxy edge function (no Deno APIs — vitest-testable). */

export const DAILY_LIMIT = 300;
export const CHAT_MODEL = "openai/gpt-oss-120b";
export const STT_MODEL = "whisper-large-v3-turbo";

export type Rejection = { status: number; message: string };

/** null = allowed. Only the app's two models pass, and a device id is mandatory. */
export function checkRequest(
  route: string,
  model: string | null,
  deviceId: string | null
): Rejection | null {
  if (!deviceId) return { status: 400, message: "missing x-device-id" };
  if (route === "chat")
    return model === CHAT_MODEL ? null : { status: 400, message: "model not allowed" };
  if (route === "transcribe")
    return model === STT_MODEL ? null : { status: 400, message: "model not allowed" };
  return { status: 404, message: "unknown route" };
}

/** True once a device's daily count exceeds the allowance. */
export function overQuota(count: number, limit = DAILY_LIMIT): boolean {
  return count > limit;
}
