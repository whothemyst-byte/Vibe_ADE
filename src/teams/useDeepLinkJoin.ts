import { useEffect, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { onOpenUrl, getCurrent } from "@tauri-apps/plugin-deep-link";
import { useOrgStore } from "./orgStore";
import { parseJoinUrl } from "./joinUrl";

const PENDING_JOIN_KEY = "vibe.teams.pendingJoin";

/** Open Teams once a join succeeds (App listens for this). */
function openTeams() {
  window.dispatchEvent(new CustomEvent("vibe:open-teams"));
}

async function joinNow(code: string) {
  try {
    await useOrgStore.getState().joinByCode(code);
    openTeams();
  } catch {
    /* invalid/expired code — silently ignore; user can retry from Teams */
  }
}

/** Listen for vibespace://join/<code> deep links; join now or after sign-in. */
export function useDeepLinkJoin(): void {
  const { isSignedIn } = useUser();
  const signedInRef = useRef(isSignedIn);
  signedInRef.current = isSignedIn;

  // Incoming URLs (cold-start + while running).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const handle = (urls: string[] | null) => {
      for (const u of urls ?? []) {
        const code = parseJoinUrl(u);
        if (!code) continue;
        if (signedInRef.current) void joinNow(code);
        else localStorage.setItem(PENDING_JOIN_KEY, code);
      }
    };
    void getCurrent().then(handle).catch(() => {});
    void onOpenUrl((urls) => handle(urls)).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => unlisten?.();
  }, []);

  // Claim a stashed code once the user signs in.
  useEffect(() => {
    if (!isSignedIn) return;
    const pending = localStorage.getItem(PENDING_JOIN_KEY);
    if (pending) { localStorage.removeItem(PENDING_JOIN_KEY); void joinNow(pending); }
  }, [isSignedIn]);
}
