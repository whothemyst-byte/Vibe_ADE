import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { getClerkToken } from "../supabase/clerkToken";
import { currentUserId } from "./identity";
import { deriveSelfStatus, type LiveStatus } from "./presenceHelpers";

export type RosterEntry = {
  status: LiveStatus;
  spaceId: string | null;
  spaceName: string | null;
  orgSpaceId: string | null;
  manualStatus: string | null;
  manualEmoji: string | null;
};

type PresenceStore = { roster: Record<string, RosterEntry> };
export const usePresenceStore = create<PresenceStore>(() => ({ roster: {} }));

let channel: RealtimeChannel | null = null;
let subscribed = false;
let userId: string | null = null;
let joiningOrg: string | null = null;

const self = {
  spaceId: null as string | null,
  spaceName: null as string | null,
  orgSpaceId: null as string | null,
  manualStatus: null as string | null,
  manualEmoji: null as string | null,
};
let lastActivity = Date.now();
let visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
let statusTimer: number | null = null;

function selfPayload(): RosterEntry {
  return {
    status: deriveSelfStatus(visible, lastActivity, Date.now()),
    spaceId: self.spaceId,
    spaceName: self.spaceName,
    orgSpaceId: self.orgSpaceId,
    manualStatus: self.manualStatus,
    manualEmoji: self.manualEmoji,
  };
}

function retrack() {
  if (channel && subscribed) void channel.track(selfPayload());
}

function syncRoster() {
  if (!channel) return;
  const state = channel.presenceState() as Record<string, RosterEntry[]>;
  const roster: Record<string, RosterEntry> = {};
  for (const [key, metas] of Object.entries(state)) {
    if (metas[0]) roster[key] = metas[0];
  }
  usePresenceStore.setState({ roster });
}

const onActivity = () => { lastActivity = Date.now(); };
const onVisibility = () => {
  visible = document.visibilityState === "visible";
  if (visible) lastActivity = Date.now();
  retrack();
};

function attachActivityListeners() {
  window.addEventListener("pointerdown", onActivity, { passive: true });
  window.addEventListener("keydown", onActivity, { passive: true });
  window.addEventListener("focus", onVisibility);
  window.addEventListener("blur", onVisibility);
  document.addEventListener("visibilitychange", onVisibility);
  // Slow tick so a quiet window flips online -> idle without any event.
  statusTimer = window.setInterval(retrack, 30_000);
}
function detachActivityListeners() {
  window.removeEventListener("pointerdown", onActivity);
  window.removeEventListener("keydown", onActivity);
  window.removeEventListener("focus", onVisibility);
  window.removeEventListener("blur", onVisibility);
  document.removeEventListener("visibilitychange", onVisibility);
  if (statusTimer) { window.clearInterval(statusTimer); statusTimer = null; }
}

/** Join (or re-join) the presence channel for an org. */
export async function joinOrgPresence(orgId: string): Promise<void> {
  // Re-entrancy guard. React StrictMode (and rapid org switches) can fire this
  // twice for the same org before the first subscribe settles; supabase-js then
  // hands back the already-subscribed channel for the duplicate topic, and the
  // `channel.on(...)` below throws "cannot add presence callbacks after subscribe()".
  if (joiningOrg === orgId) return;
  joiningOrg = orgId;
  try {
    await leavePresence();
    userId = currentUserId();
    if (!userId) return; // not signed in yet

    // Make sure Realtime carries the Clerk JWT so the channel is authorized.
    const token = await getClerkToken();
    if (token) supabase.realtime.setAuth(token);

    lastActivity = Date.now();
    visible = document.visibilityState === "visible";

    channel = supabase.channel(`org:${orgId}`, {
      config: { presence: { key: userId } },
    });
    channel.on("presence", { event: "sync" }, syncRoster);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
        void channel!.track(selfPayload());
      }
    });
    attachActivityListeners();
  } finally {
    joiningOrg = null;
  }
}

/** Leave the current presence channel and clear the roster. */
export async function leavePresence(): Promise<void> {
  detachActivityListeners();
  if (channel) {
    try { await channel.untrack(); } catch { /* ignore */ }
    await supabase.removeChannel(channel);
  }
  channel = null;
  subscribed = false;
  usePresenceStore.setState({ roster: {} });
}

/** Update the space the user is currently in (null when not in a space). */
export function setPresenceSpace(
  spaceId: string | null,
  spaceName: string | null,
  orgSpaceId: string | null = null,
): void {
  self.spaceId = spaceId;
  self.spaceName = spaceName;
  self.orgSpaceId = orgSpaceId;
  lastActivity = Date.now();
  retrack();
}

/** Update the manual custom status shown to teammates. */
export function setPresenceManualStatus(text: string | null, emoji: string | null): void {
  self.manualStatus = text && text.trim() ? text.trim() : null;
  self.manualEmoji = emoji && emoji.trim() ? emoji.trim() : null;
  retrack();
}
