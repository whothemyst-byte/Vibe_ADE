import { invoke } from "@tauri-apps/api/core";
import { once } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Hosted sign-in helper page; overridable for local testing via VITE_VIBE_SIGNIN_URL. */
const SIGNIN_BASE =
  import.meta.env.VITE_VIBE_SIGNIN_URL ?? "https://www.quansynd.com/vibe-space-signin.html";

const OAUTH_TIMEOUT_MS = 300_000;

type OauthCallback = { ticket: string; state: string };

/** Minimal structural shapes from Clerk's useSignIn(), to avoid importing internal types. */
type TicketSignIn = {
  create: (params: { strategy: "ticket"; ticket: string }) => Promise<{
    status: string | null;
    createdSessionId: string | null;
  }>;
};
type SetActive = (opts: { session: string }) => Promise<unknown>;

/** Build the helper-page URL that the system browser opens. Pure for testing. */
export function buildSignInUrl(base: string, provider: string, port: number, state: string): string {
  const redirect = `http://127.0.0.1:${port}`;
  return (
    `${base}?provider=${encodeURIComponent(provider)}` +
    `&redirect=${encodeURIComponent(redirect)}` +
    `&state=${encodeURIComponent(state)}`
  );
}

/**
 * Drive an external-browser OAuth sign-in:
 * open the system browser to the hosted page, wait for the loopback callback with the
 * minted Clerk sign-in token, then redeem it in this webview's Clerk client.
 */
export async function signInWithProvider(
  provider: "google" | "github",
  signIn: TicketSignIn,
  setActive: SetActive,
): Promise<void> {
  const port = await invoke<number>("start_oauth_loopback");
  const state = crypto.randomUUID();
  const url = buildSignInUrl(SIGNIN_BASE, provider, port, state);

  const payload = await new Promise<OauthCallback>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Sign-in timed out. Please try again."));
    }, OAUTH_TIMEOUT_MS);

    void once<OauthCallback>("oauth-callback", (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(event.payload);
    });

    void openUrl(url).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  if (payload.state !== state) {
    throw new Error("Sign-in could not be verified. Please try again.");
  }

  const res = await signIn.create({ strategy: "ticket", ticket: payload.ticket });
  if (res.status !== "complete" || !res.createdSessionId) {
    throw new Error("Sign-in did not complete. Please try again.");
  }
  await setActive({ session: res.createdSessionId });
}
