import { create } from "zustand";
import { supabase } from "../supabase/client";
import type { Tables } from "../supabase/types";
import { resolveCurrentOrg } from "./orgHelpers";
import { currentProfile, currentUserId } from "./identity";

export type Org = Tables<"org">;
export type Member = Tables<"org_member">;
export type Invite = Tables<"org_invite">;

const CURRENT_ORG_KEY = "vibe.teams.currentOrg";

type OrgStore = {
  orgs: Org[];
  currentOrgId: string | null;
  members: Member[];
  invites: Invite[];
  loading: boolean;
  error: string | null;

  loadMyOrgs: () => Promise<void>;
  setCurrentOrg: (id: string | null) => void;
  createOrg: (name: string, logoUrl?: string | null) => Promise<string>;
  joinByCode: (code: string) => Promise<string>;
  claimInvites: () => Promise<number>;
  loadMembers: (orgId: string) => Promise<void>;
  loadInvites: (orgId: string) => Promise<void>;
  invite: (orgId: string, email: string, role: "admin" | "member") => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  setRole: (orgId: string, userId: string, role: "owner" | "admin" | "member") => Promise<void>;
  removeMember: (orgId: string, userId: string) => Promise<void>;
  recordSpaceActivity: (spaceId: string, spaceName: string) => Promise<void>;
  setMyStatus: (text: string | null, emoji: string | null) => Promise<void>;
};

function throwIf<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const useOrgStore = create<OrgStore>((set, get) => ({
  orgs: [],
  currentOrgId: localStorage.getItem(CURRENT_ORG_KEY),
  members: [],
  invites: [],
  loading: false,
  error: null,

  loadMyOrgs: async () => {
    set({ loading: true, error: null });
    try {
      const data = throwIf(await supabase.from("org").select("*").order("created_at"));
      const orgs = data ?? [];
      const current = resolveCurrentOrg(orgs, get().currentOrgId);
      set({ orgs, currentOrgId: current?.id ?? null, loading: false });
      if (current) {
        await get().loadMembers(current.id);
        await get().loadInvites(current.id);
      } else {
        set({ members: [], invites: [] });
      }
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  setCurrentOrg: (id) => {
    if (id) localStorage.setItem(CURRENT_ORG_KEY, id);
    else localStorage.removeItem(CURRENT_ORG_KEY);
    set({ currentOrgId: id });
    if (id) {
      void get().loadMembers(id);
      void get().loadInvites(id);
    } else {
      set({ members: [], invites: [] });
    }
  },

  createOrg: async (name, logoUrl = null) => {
    const { displayName, avatarUrl } = currentProfile();
    const id = throwIf(
      await supabase.rpc("create_org", {
        p_name: name,
        p_logo_url: logoUrl ?? undefined,
        p_display_name: displayName ?? undefined,
        p_avatar_url: avatarUrl ?? undefined,
      }),
    );
    if (id == null) throw new Error("create_org returned no id");
    await get().loadMyOrgs();
    get().setCurrentOrg(id);
    return id;
  },

  joinByCode: async (code) => {
    const { displayName, avatarUrl } = currentProfile();
    const id = throwIf(
      await supabase.rpc("join_org_by_code", {
        p_code: code,
        p_display_name: displayName ?? undefined,
        p_avatar_url: avatarUrl ?? undefined,
      }),
    );
    if (id == null) throw new Error("join_org_by_code returned no id");
    await get().loadMyOrgs();
    get().setCurrentOrg(id);
    return id;
  },

  claimInvites: async () => {
    const { displayName, avatarUrl } = currentProfile();
    const count = throwIf(
      await supabase.rpc("accept_invites", {
        p_display_name: displayName ?? undefined,
        p_avatar_url: avatarUrl ?? undefined,
      }),
    );
    if ((count ?? 0) > 0) await get().loadMyOrgs();
    return count ?? 0;
  },

  loadMembers: async (orgId) => {
    const data = throwIf(
      await supabase.from("org_member").select("*").eq("org_id", orgId),
    );
    set({ members: data ?? [] });
  },

  loadInvites: async (orgId) => {
    const data = throwIf(
      await supabase.from("org_invite").select("*").eq("org_id", orgId).eq("status", "pending"),
    );
    set({ invites: data ?? [] });
  },

  invite: async (orgId, email, role) => {
    throwIf(await supabase.rpc("invite_member", { p_org: orgId, p_email: email, p_role: role }));
    await get().loadInvites(orgId);
  },

  revokeInvite: async (inviteId) => {
    throwIf(await supabase.rpc("revoke_invite", { p_invite: inviteId }));
    const cur = get().currentOrgId;
    if (cur) await get().loadInvites(cur);
  },

  setRole: async (orgId, userId, role) => {
    throwIf(await supabase.rpc("set_member_role", { p_org: orgId, p_user: userId, p_role: role }));
    await get().loadMembers(orgId);
  },

  removeMember: async (orgId, userId) => {
    throwIf(await supabase.rpc("remove_member", { p_org: orgId, p_user: userId }));
    await get().loadMyOrgs();
  },

  recordSpaceActivity: async (spaceId, spaceName) => {
    const orgId = get().currentOrgId;
    const me = currentUserId();
    if (!orgId || !me) return;
    // best-effort; never block opening a space on a presence write
    await supabase
      .from("org_member")
      .update({ last_space_id: spaceId, last_space_name: spaceName, last_active_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("user_id", me);
  },

  setMyStatus: async (text, emoji) => {
    const orgId = get().currentOrgId;
    const me = currentUserId();
    if (!orgId || !me) return;
    const { error } = await supabase
      .from("org_member")
      .update({ manual_status: text, manual_status_emoji: emoji })
      .eq("org_id", orgId)
      .eq("user_id", me);
    if (error) throw new Error(error.message);
    await get().loadMembers(orgId);
  },
}));
