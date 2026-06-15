# Vibe Space — Teams: Full-bleed Orbit, Settings-housed Management & Invite Links

**Date:** 2026-06-15
**Status:** Approved (design), pending implementation plan
**Builds on:** `2026-06-15-vibe-space-teams-collab-design.md` (orgs, presence,
solar-system view, shared spaces). This is an iteration on the **already-shipped**
Teams view, not a new subsystem.
**Operational note:** all Supabase work uses the **`supabase-vibespace`** MCP /
project — not the generic `supabase` server.

## Summary

The Teams view today renders the solar-system **orbit** plus five stacked
management panels (`OrgHero`, `MyStatusBar`, `MembersPanel`, `InvitesPanel`,
`ProjectsPanel`) inside a centered 720px column. This iteration:

1. **Promotes the orbit to a full-bleed "space"** — it fills the viewport and
   scales like the wall canvas, instead of sitting in a narrow column.
2. **Moves all management UI into the existing app Settings modal** as new,
   gated sections (Organization, Members, Invites, Projects, My Card). The
   orbit page becomes purely the live visualization + a toolbar.
3. **Adds an "Open <space>" hover affordance** to each orbiting member whose
   current/last space is a published org project.
4. **Adds a free, low-maintenance invite link** — a custom-scheme deep link
   (`vibespace://join/<code>`) with a static `quansynd.com/join/<code>` landing
   page fallback, reusing the existing reusable org join code.

No schema changes are required except an **optional** new `avatars` storage
bucket for My Card photo upload (see §3, decision flagged).

## Goals & non-goals

**Goals**
- Make the Teams orbit a full-screen, responsive visualization sized like a wall.
- House org/member/invite/project/self-status management in the main Settings
  modal, gated to Team-tier users who are in an org.
- Let a viewer open a teammate's space directly from the orbit when that space
  is shared to the org.
- Give admins a shareable invite **link** that works at $0 with no backend and
  no recurring maintenance, with a graceful fallback when the app isn't installed.

**Non-goals (this round)**
- Changing the presence/sync model, RLS, or the org data model (beyond the
  optional avatars bucket).
- Per-invite single-use tokens or role-bearing links — the link carries the
  reusable org join code (default *member* role). Role-specific invites stay on
  the existing email path.
- macOS deep-link registration (Info.plist build-time) — Windows-first this round.
- Real-time co-editing, comments, billing (still deferred per the parent spec).

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Management UI home | **Add sections to the existing main Settings modal** (not a separate Team modal). |
| 2 | Invite link | **Deep link (`vibespace://join/<code>`) + static `quansynd.com/join/<code>` landing fallback**, reusing the reusable org join code. |
| 3 | "Open space" gating | **Only when the member's current/last space is a published org project.** Hidden otherwise. |
| 4 | Orbit sizing | **Responsive, full-bleed** — scales to the viewport via a measured container. |
| 5 | My Card photo upload | **Ship it** via a new private `avatars` bucket (free-tier sized). Falls back to Clerk avatar + emoji if deferred. |

## Section 1 — The orbit as a full-bleed space

`TeamsView` keeps the floating `.cnvs-toolbar` (Back · "Teams" · org switcher)
and **adds a gear button** mirroring the wall's `onGear` pattern. The body
changes from a 720px centered column to a **full-bleed orbit stage**:

- A full-size container (`position: absolute; inset: 0`) holds only the
  `SolarSystem`. The five management panels are removed from `TeamsView`.
- `SolarSystem` becomes **responsive**. A `ResizeObserver` on the stage measures
  available space; the component derives `size = min(width, height) - margin`
  and passes it down. Ring radii, today hard-coded for a 560px box
  (`RING_RADIUS = [110, 180, 250]` in `orbit.ts`), become **fractions of
  `size/2`** so the rings always fill the stage. `orbit.ts` keeps returning
  ring/angle assignments; only the radius scaling moves into `SolarSystem`
  (or `orbit.ts` gains a `scale` parameter). Core, avatar sizes, the 140s
  rotation, and hover-pause are unchanged in behavior, just centered on the
  larger stage.
- The **empty state stays in `TeamsView`**: with no org, it shows the existing
  full-screen "Create your organization" / "Join with a code" cards. The orbit
  stage only renders once `currentOrg` exists.
- **Entry to settings:** the toolbar **gear** and **clicking the org core**
  both open the Settings modal (the parent spec calls for "core → org
  settings"). Clicking the core opens it at the **Organization** section.

**Verify:** the orbit fills the window at multiple sizes, rotates, pauses on
hover; the toolbar gear and the core both open settings.

## Section 2 — Management UI in the main Settings modal

The panels' logic moves into **new panes** in `src/settings/SettingsModal.tsx`,
added to the `SECTIONS` list and `Section` union:

- **Organization** — org name, logo, and the **join code** (copy), plus the
  **copy invite link** action (§4). Admin-only edit; members see read-only.
  (Replaces `OrgHero`.)
- **Members** — roster with role management + remove. (Replaces `MembersPanel`.)
- **Invites** — invite-by-email + role, pending list, revoke, **copy invite
  link**. (Replaces `InvitesPanel`.)
- **Projects** — share a local space, open/unpublish org projects. (Replaces
  `ProjectsPanel`.) "Open" still calls `openSharedSpace` → `onOpenWall`.
- **My Card** — the self-status editor, styled after the reference screenshot's
  "Community" pane (IDENTITY + VIBE groups): **photo**, **username**, **emoji
  fallback** grid, **status line**, **mood** emoji. Maps to `org_member`
  `avatar_url` / `display_name` / `manual_status` / `manual_status_emoji`.
  (Replaces `MyStatusBar`, expanded.)

**Gating & wiring**
- The Team sections render only when `canUseTeams` **and** the store has a
  current org. They read `useOrgStore` directly — no new prop drilling.
- `SettingsModal` gains `initialSection?: Section` (gear → `agents` as today;
  teams gear / org-core → `organization`).
- `SettingsModal`'s `background` / `onChangeBackground` become **optional**.
  When opened with no active wall (from the teams view), the **space-scoped
  Themes and Canvas** sections are **hidden** (they edit "this space"); global
  sections (Account, Agents, Terminal, Vibe, About) and the Team sections show.
  The wall keeps passing `background`, so its settings are unchanged.
- `TeamsView` mounts its own `<SettingsModal initialSection="organization" />`
  (no `background`), toggled by the gear / core click.

**Verify:** from the wall, settings look unchanged (no Team sections unless in
an org); from the teams view, the gear opens settings with Team sections and no
space-only sections; editing My Card updates presence + the `org_member` row.

## Section 3 — My Card photo upload (optional bucket)

My Card lets a member set a **photo** that overrides the Clerk avatar for their
org card. Implementation (the "ship it" choice — Decisions table, #5):

- New **private** Storage bucket **`avatars`**, path `<user_id>/avatar.<ext>`,
  RLS: a user may read any avatar in their orgs and write only their own path.
- Photo picker uploads (size-capped, e.g. ≤ 512 KB after the existing image
  pipeline), writes the public-ish signed/derived URL into `org_member.avatar_url`
  for the current org, and refreshes presence.
- **Emoji fallback** + **mood** continue to use `manual_status_emoji`; the card
  renders the photo when set, else the emoji, else a monogram (today's behavior).

**Fallback if deferred:** drop the bucket; My Card shows the read-only Clerk
avatar plus editable emoji/username/status. Nothing else in the design depends
on the bucket.

**Verify:** uploading a photo updates the member's orbit avatar for teammates;
removing it falls back to emoji/monogram.

## Section 4 — Invite link (deep link + landing fallback)

**Client (Tauri).**
- Add `tauri-plugin-deep-link` and the single-instance integration; register the
  **`vibespace`** scheme (runtime-register on Windows; macOS Info.plist deferred).
- A deep-link handler parses `vibespace://join/<code>`. On receipt:
  - If signed in → `useOrgStore.joinByCode(code)` and navigate to the new org's
    teams view.
  - If **not** signed in → stash the pending code (e.g. `localStorage`
    `vibe.teams.pendingJoin`) and claim it after sign-in, extending the existing
    `TeamsBootstrap` / `useClaimInvites` flow.
- Single-instance forwards a second launch's URL to the running window rather
  than opening a new instance (known sharp edges — verified in the plan).

**Invite link generation.**
- The **"Copy invite link"** action (Organization + Invites panes) produces
  **`https://quansynd.com/join/<join_code>`** using the org's existing reusable
  `join_code`. No new table, no per-link state.

**Landing page (`quansynd.com/join/<code>`).**
- Static HTML on the existing free quansynd.com hosting. Shows the org-join
  call to action: **"Open in Vibe Space"** → `vibespace://join/<code>`, the code
  displayed for **manual paste** as a fallback, and a **download link** for users
  without the app. No server logic; the code is read from the path/query and
  injected into the button + display.

**Why this is $0 / low-maintenance:** static page (no backend), custom scheme
(no domain verification, no Universal Links entitlement), and it reuses the
already-built `join_org_by_code` RPC and reusable join code. Per-email,
role-bearing invites remain on the existing path unchanged.

**Verify:** copy link from an admin; opening it on a machine with the app
installed joins the org (signed in) or after the next sign-in (signed out);
opening it without the app shows the landing page with a working manual code.

## Section 5 — Phasing

Each phase is independently verifiable; writing-plans breaks these into tasks.

1. **Full-bleed orbit** — responsive `SolarSystem` sizing + `TeamsView` stage +
   toolbar gear; remove panels from `TeamsView` (temporarily losing management
   UI until phase 2 lands, or land 1+2 together). *Verify:* orbit fills and scales with the window.
2. **Settings panes** — Organization / Members / Invites / Projects / My Card
   panes; `SECTIONS` gating; optional `background` + `initialSection`; mount in
   `TeamsView`; core-click → settings. *Verify:* §2 checks.
3. **Open-space affordance** — match member current/last space to an `org_space`;
   render "Open <space>" in the tooltip; wire to `openSharedSpace`. *Verify:* §C.
4. **My Card photo** — `avatars` bucket + RLS + upload in My Card. *Verify:* §3.
5. **Invite link** — deep-link plugin + scheme + single-instance; handler +
   pending-join; copy-link actions; `quansynd.com/join` landing page.
   *Verify:* §4.

Phases 1 and 2 are tightly coupled (panels move out as panes move in) and may
land together; 3–5 are independent.

## Risks

- **Single-instance × deep-link** has known issues (tauri #12726): verify a
  second launch forwards the URL to the existing window.
- **Optional `background`**: making space-scoped sections conditional must not
  regress the wall's settings — keep the wall passing `background` so all its
  sections render exactly as today.
- **Avatar staleness / cost**: avatars are tiny; GC on member removal; keep the
  size cap to stay within the Supabase free tier.
- **Orbit scaling**: ring radii must scale without overlapping the core or
  clipping outer avatars at small window sizes — clamp `size` to a sensible min.
- **macOS**: the `vibespace` scheme won't register without an Info.plist entry;
  the landing page's manual-code fallback covers mac users until that lands.
