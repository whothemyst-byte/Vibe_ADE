# Vibe Space — Team Collaboration (Orgs, Presence & Shared Spaces)

**Date:** 2026-06-15
**Status:** Approved (design), pending implementation plan
**Implements:** the deferred **Team tier** collaboration workstream from
`2026-06-15-vibe-space-tiers-design.md` ("TEAM — requires a cloud backend
(Supabase) and gets its own spec").
**Operational note:** all Supabase work for this feature uses the
**`supabase-vibespace`** MCP / project — not the generic `supabase` server.

## Summary

Vibe Space is a local-first desktop (Tauri) app: spaces persist as local files
through Rust commands, and Supabase is currently touched only by two edge
functions (groq-proxy, clerk-ticket), neither using a real per-user identity.

This design adds **team collaboration** as the Team-tier feature: a **custom
Supabase-backed organization model** (orgs, members, invites, roles) keyed to the
Clerk user id, **shared "projects"** (local spaces a member explicitly publishes
to an org, content + backgrounds synced to Supabase Storage with last-write-wins),
and a **live presence layer** rendered as a **"solar system"** view — the org
logo at the center, member avatars orbiting, each hover revealing the member's
status and the space they're working in now (or last worked in).

Identity stays with Clerk; orgs/membership/spaces/presence live in Supabase with
row-level security keyed to the Clerk `sub`. The client talks to Supabase
**directly under RLS** (including Realtime presence) via Clerk-as-third-party-auth
— no per-operation edge functions.

## Goals & non-goals

**Goals**
- Let a Team-tier user create/join an **organization** and manage members.
- Let members **publish a local space** as a shared org **project** and **open**
  any org project on their own machine (canvas + uploaded backgrounds + terminal
  layout), with **last-write-wins** sync and a stale-write guard.
- Show a **live solar-system Teams view**: org logo center, member avatars in
  orbit, hover reveals **auto presence + manual custom status** and the member's
  **current / last-worked-in space**.
- Add a **Teams entry point** beside the task-board button in the wall toolbar
  (and on the start page), gated to the Team tier.

**Non-goals (this round)**
- Real-time co-editing / live multiplayer cursors (CRDT). Sync is whole-scene,
  per-save, last-write-wins.
- Live sharing of terminal (PTY) output — only terminal **layout/presets** travel.
- Comments / @mentions / assignees on spaces, SSO, real billing/checkout.

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Collaboration depth | **Shared registry + content sync** (last-write-wins; no live cursors). |
| 2 | Org/team model | **Custom Supabase orgs** (not Clerk Organizations), keyed to Clerk user id. Flat: one org = one team. |
| 3 | Status model | **Auto presence** (online/idle/offline + current/last space) **+ manual custom status**. |
| 4 | Sync scope | **Canvas scene + terminal layout/presets + uploaded backgrounds** (images/videos to Storage). Live PTY output stays local. |
| 5 | Publish model | **Explicit "Share to org"** — spaces are local/private by default; publishing makes one an org project. |
| 6 | Joining | **Email invite + join code/link.** |
| 7 | Roles | **Owner / Admin / Member.** |
| 8 | Identity bridge | **Clerk as Supabase third-party auth**; RLS keys off `auth.jwt()->>'sub'`. Client talks to Supabase directly. |
| 9 | Gating | Whole feature is **Team tier** (`canUseTeams` in `entitlements.ts`); inline upgrade affordance for free/pro. |

## Section 1 — Architecture & the identity bridge

Teams needs genuine multi-tenant data with **per-user row-level security**, so
Supabase must know the Clerk user's identity. Today nothing bridges Clerk →
Supabase (groq-proxy authorizes by `x-device-id`).

**Approach — Clerk as a Supabase third-party auth provider.**
- Add `@supabase/supabase-js` to the frontend.
- `src/supabase/client.ts` builds a Supabase client with an `accessToken`
  callback returning the **live Clerk session token** (from
  `window.Clerk.session.getToken()` / Clerk SDK). The same token authorizes
  Realtime, so presence runs under RLS too.
- Configure Clerk as a **third-party auth integration** in the `supabase-vibespace`
  dashboard (one-time; documented in the plan). Supabase then accepts Clerk JWTs
  and exposes the Clerk user id as `auth.jwt()->>'sub'`.
- Every org/member/space/presence row carries the Clerk user id as `text`; **RLS
  keys off `sub`**. Reads, writes, and Realtime presence are **direct
  client→Supabase under RLS** — no per-operation edge function.

**Rejected alternative:** routing all operations through service-role edge
functions that verify the Clerk token per call. It matches the existing
edge-function pattern but makes Realtime presence and live queries painful and
multiplies function code. Not used.

**Local persistence is unchanged** for local spaces (the Tauri Rust file layer).
We add a small **local cache** for opened shared spaces so they work offline and
re-sync on save.

## Section 2 — Data model (Supabase schema + storage)

All tables carry the Clerk user id as `text` and are RLS-protected.

**`org`** — `id uuid pk`, `name`, `slug`, `logo_url` (center of the solar
system), `created_by` (Clerk id), `join_code` (random, rotatable), `created_at`.

**`org_member`** — `org_id`, `user_id` (Clerk id), `role` (`owner|admin|member`),
`display_name`, `avatar_url` (snapshotted from Clerk so members render without
per-user Clerk calls), `manual_status` (text, nullable), `manual_status_emoji`
(nullable), `last_space_id` (nullable), `last_space_name` (nullable),
`last_active_at`. **PK `(org_id, user_id)`.** Source of truth for **offline**
members' status + "last worked in"; live status comes from Realtime presence.

**`org_invite`** — `org_id`, `email` (lowercased), `role`, `invited_by`,
`created_at`, `status` (`pending|accepted`). On sign-in the app claims any
pending invite matching the user's Clerk email → inserts `org_member`, marks
the invite accepted.

**`org_space`** — shared-project registry + content pointer. `id uuid` (org-side
id), `org_id`, `local_origin_id` (publisher's local space id, for re-publish
matching), `name`, `owner_user_id`, `thumb_url`, `content_path` (Storage key for
`scene.json`), `background` (jsonb: uploaded-asset pointer **or** solid color),
`version int`, `updated_at`, `updated_by`. **`version` + `updated_at` drive
last-write-wins** with a stale-write guard.

**Storage buckets** (private, RLS-scoped by org membership):
- `org-space-content` — scene JSON: `<org_id>/<space_id>/scene.json`.
- `org-space-assets` — uploaded backgrounds + thumbnails:
  `<org_id>/<space_id>/bg.<ext>`, `…/thumb.png`.

**RLS rules:**
- `org_member`: a user sees rows for any org they belong to (membership tested via
  a `SECURITY DEFINER` helper `is_org_member(org_id, sub)` to avoid recursive
  policies); can update **only their own row** (status/last-space fields).
- `org`: readable by members; mutable by `owner|admin`.
- `org_space`: readable by all members of its org; insertable by any member
  (publishing their own); updatable by the space `owner_user_id` or org admins.
- `org_invite`: managed by `owner|admin`; a signing-in user may read/accept
  invites matching their own Clerk email.
- Storage objects: read/write gated by membership in the path's `<org_id>`.

**Entitlements:** add `canUseTeams: boolean` to `src/entitlements.ts`
(`false` for free/pro, `true` for team).

## Section 3 — Publish & open-shared-space flow

**Publishing (local → org project)** — a "Share to <org>" action on a local space:
1. Read the local `WallDoc` (scene + terminals layout + background).
2. If the background is a local-file image/video, upload it to `org-space-assets`
   and rewrite `background` to an asset pointer. Solid colors need no upload.
3. Upload `scene.json` (Excalidraw elements + appState) to `org-space-content`.
   **Terminal layout/presets travel** (positions + preset ids); **live PTY output
   does not** — each member spawns their own.
4. Upload the thumbnail to assets.
5. Insert/update the `org_space` row (`version=1`, set `local_origin_id`). The
   space now appears as an org project for all members.

**Opening a shared space (org → local cache → canvas):**
1. Download `scene.json` + background asset into a local cache dir via new Rust
   commands `org_space_cache_load` / `org_space_cache_save` (mirroring the
   existing `space_load`/`space_save`).
2. Open it in the normal `WallView`, badged "Shared · <org>" with the owner shown.
3. Background resolves from the downloaded asset; terminals render as layout
   placeholders the member can activate locally.

**Saving a shared space (last-write-wins + guard).** The existing debounced save
additionally, for shared spaces:
1. Re-uploads `scene.json` and bumps `org_space.version` **only if** the row's
   current `version` still equals the base version loaded. If it advanced
   (someone else saved), **pull the newer version and show a non-blocking
   "updated by <name> — reloaded" notice** instead of clobbering.
2. Throttled background/thumbnail re-upload (same cadence as the local thumbnail
   throttle, `THUMB_INTERVAL_MS`).

**Unpublish** deletes the `org_space` row and its Storage objects; the space
reverts to local-only for the owner.

Conflict scope is deliberately coarse (whole-scene, per-save). Real-time
co-editing later **replaces** this layer with a CRDT channel rather than
extending it.

## Section 4 — Presence & the solar-system Teams view

**Presence.** On entering an org, the client joins a Supabase Realtime presence
channel `org:<id>`, tracking `{ userId, displayName, avatarUrl, status,
manualStatus, manualStatusEmoji, currentSpaceId, currentSpaceName }`.
- **`status` auto-derived:** `online` (window focused/active), `idle` (open but no
  input ~5 min), `offline` (not in channel).
- **`currentSpace`** updates on space open/close/switch (hooked into `App` view
  changes and `WallView`).
- On every space open and on disconnect, also write `last_space_id/name` +
  `last_active_at` to the member's `org_member` row, so **offline** members still
  show "last worked in <space>".
- Manual custom status (+ optional emoji) is set from the Teams view, stored on
  `org_member`, merged into the presence payload.

**Resolved hover line, per member:**
- Online/idle + in a space → "Online · in *Redesign*"
- Online/idle, no space → "Online · last worked in *Redesign*"
- Offline → "Offline · last seen 2h ago · last in *Redesign*"
- Manual status prefixes when set → "🎧 Heads-down · in *Redesign*"

**The solar-system view** (`src/teams/TeamsView.tsx`, `src/teams/SolarSystem.tsx`):
- **Center:** org logo in a softly glowing core (monogram fallback). Click → org
  settings (admins) / org info.
- **Orbit:** member avatars on one or more concentric rings (ring count scales with
  member count; even angular distribution; gentle continuous rotation via a
  transform on rAF, **paused on hover and `prefers-reduced-motion`**). A status
  ring (green/amber/grey) encircles each avatar.
- **Hover:** avatar lifts, orbit pauses, tooltip card shows name, role, the
  resolved status line, and — if the member is in an accessible space — an
  "Open *space*" affordance.
- **Click a member:** profile popover (their published projects, last activity).
- **Side rail:** org switcher (multi-org), **Members** (pending invites +
  invite-by-email + copy-join-code for owner/admin), **Projects** (the `org_space`
  list with thumbnails → open shared space). The playful orbit is the hero; real
  actions live in the clean rail (warm-amber desktop-software feel, not a SaaS
  landing page).

**Entry points.** A **Teams button in the wall `Toolbar`** beside the task-board
button (new `TeamsIcon`), plus a start-page entry. New `App` view state
`{ kind: "teams"; from }`, mirroring the `tasks` view. The Vibe agent gains an
`open_teams` command for parity.

**Gating & empty states.** Whole feature is Team-tier via `canUseTeams`.
Free/pro users see the Teams button with a small "Team" pill → inline upgrade
affordance (per the tiers spec), never a hard modal. A Team-tier user with no org
sees a "Create your organization" card (name + optional logo upload) and a
"Join with a code" field.

## Section 5 — Phasing

Each phase is independently verifiable; the writing-plans plan breaks these into
tasks.

1. **Foundation** — add `@supabase/supabase-js`; `src/supabase/client.ts` with the
   Clerk `accessToken` bridge; configure Clerk third-party auth in the
   `supabase-vibespace` project; schema migration (all tables + RLS + the
   `is_org_member` `SECURITY DEFINER` helper); Storage buckets + policies.
   *Verify:* a signed-in user can read/write only their own org rows via RLS.
2. **Orgs & membership** — `src/teams/orgStore.ts` (create/join/switch org,
   invites by email + join code, roles); invite-claim-on-sign-in; `canUseTeams`
   in entitlements. *Verify:* create org, invite, accept, role checks (unit +
   manual).
3. **Teams view shell** — Toolbar/StartPage entry points, `App` view state, side
   rail (Members/Projects/org switcher), empty state, gating affordance.
   *Verify:* navigation + rail render with seeded data.
4. **Presence + solar system** — Realtime presence channel, status derivation,
   `last_space` writes, the orbit visualization + hover/profile interactions.
   *Verify:* two signed-in clients see each other's live status and current space.
5. **Publish & sync** — Share-to-org, open-shared-space (local cache + new Rust
   cache commands), last-write-wins save guard, background/thumbnail upload,
   unpublish. *Verify:* publish on machine A, open + edit on machine B, conflict
   notice on concurrent save.

## Deferred & out of scope

**Deferred (own specs later):** real-time co-editing / live cursors (CRDT);
comments / @mentions / assignees on spaces; SSO; real billing/checkout for the
Team tier; cross-org discovery; two-way external sync.

**Out of scope:** changing how local spaces, terminals, or the embedded browser
work; remote PTY sharing; server-side entitlement enforcement (gating stays
client-side off the Clerk claim, consistent with the tiers spec).

## Risks

- **Clerk↔Supabase third-party auth** is a one-time dashboard configuration that
  must be done before RLS works end-to-end; the plan front-loads it in Phase 1.
- **Realtime under RLS:** the Realtime client must carry the Clerk JWT (same
  `accessToken`) so presence is authorized; verify the channel rejects
  non-members.
- **Storage cost:** uploaded video backgrounds vs. the Supabase free-tier 1 GB
  limit — cap uploaded background size and document the quota; GC Storage objects
  on unpublish.
- **Recursive RLS:** membership checks must go through the `SECURITY DEFINER`
  helper, not a self-referential `org_member` policy, to avoid infinite recursion.
- **Avatar staleness:** `avatar_url`/`display_name` are snapshotted into
  `org_member`; refresh them on sign-in so they don't drift from Clerk.
