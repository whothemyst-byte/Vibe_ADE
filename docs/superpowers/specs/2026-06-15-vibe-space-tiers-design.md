# Vibe Space — Three-Tier Plan (Free / Pro / Team)

**Date:** 2026-06-15
**Status:** Approved (design), pending implementation plan
**Supersedes:** the ad-hoc, ungated task board carried over from Vibe ADE / Vibe Walls.

## Summary

Vibe Space currently ships every capability ungated. This design introduces a
**three-tier product packaging** — **Free ("Solo") / Pro / Team** — that gates
features by subscription level. The plan is **task-led** (the task board and its
roadmap are the center of gravity) but **product-aware** (the canvas, terminals,
embedded browser, and Vibe AI agent are slotted into the tiers so the packaging
is coherent).

This round delivers a **feature → tier map with suggested price points** and the
**in-app gating contract**. It does **not** include billing/payment code, and the
**Team tier is documented as a future workstream** (its cloud sync / collaboration
backend gets its own spec).

## Philosophy

Vibe Space is a **local-first desktop app**, so **Free must be genuinely useful
on its own**: the whole canvas, terminals, embedded browser, and a real task
board work offline, solo, at no cost. Paid tiers sell **convenience** (hosted AI
with no BYO key), **external integrations** (Jira and friends), and eventually
**collaboration** — never the basic app. This preserves the desktop-tool feel
(design like VS Code, not a SaaS landing page) while giving honest upgrade
reasons.

## Current baseline (what exists today, ungated)

- **Spaces** — infinite canvas (tldraw v5), 6 themes (Ember, Midnight, Parchment,
  Moss, Plum, Slate), per-space persistence (`spaces/*.json`, atomic writes).
- **Terminals** — PTY grid; launch Claude Code / Codex / plain terminals.
- **Embedded browser** — in-canvas browser windows + omnibox.
- **Vibe** — floating voice companion + AI agent. Routes through a hosted groq
  proxy with a **300 requests/day per-device** free allowance, or a **BYO Groq
  key** for unlimited. Local wake word (Vosk). Controls the UI only.
- **Vibe agent harness** — autonomous agent loop.
- **Task Board** — four columns (Backlog / In progress / In review / Done); cards
  with title, notes, link-to-space; drag-drop; delete; Vibe AI `create_task` /
  `move_task` commands; persisted to `tasks.json`.
- **Auth** — Clerk hard-gate; Google/GitHub via system-browser sign-in handoff.

The task board today has **no** priority, due date, label, subtask, reorder,
filter, or external-import capability. Those are net-new and distributed across
the tiers below.

## The three tiers

### FREE — "Solo" · $0

A genuinely useful, fully local, single-user app.

**Tasks**
- Full local board (Backlog / In progress / In review / Done).
- Card title, notes, link-to-space, drag-drop between columns, delete.
- **Reorder within a column** (new — explicit `order` field).
- **Priority** (P0–P3), **due date**, and **labels** (the core modernization, so
  the free board is actually good).
- **CSV / JSON import & export** (get data in and out without paying — no
  live external connectors).
- Vibe AI `create_task` / `move_task` on the shared 300 req/day allowance or BYO key.

**Product**
- Unlimited local spaces, terminals, embedded browser.
- All 6 themes.
- 1 device; local-only persistence.
- Shared **300 req/day** AI allowance **or** BYO Groq key (unlimited).

### PRO — "Pro" · ~$8/mo or ~$80/yr

Everything in Free, plus power features, external integrations, and hosted AI.
This is the **"import from Jira"** tier.

**Tasks**
- **Live external imports** via a pluggable connector framework — **Jira,
  Linear, Trello, Asana, GitHub Issues**. **One-way pull** in v1 (read external
  issues into a Vibe Space board; no write-back).
- **Subtasks / checklists**, **task dependencies**, **recurring tasks**.
- **Saved filters & board views**, **swimlanes**.
- **AI task breakdown** ("split this into subtasks") and **AI standup / sprint
  summaries**, using hosted AI.

**Product**
- **Hosted AI with a high / unlimited allowance** — no BYO Groq key required.
- **Settings sync across your own devices** (configuration only; not collaborative
  — no shared boards).
- Early-access features.

### TEAM — "Team" · ~$18/user/mo · *documented future*

Everything in Pro, plus collaboration. **Promised here, not designed in detail
this round** — it requires a cloud backend (Supabase) and gets its own spec.

**Tasks**
- Cloud-synced **shared boards** (real-time), **assignees**, **comments / @mentions**.
- **Two-way sync** back to Jira / Linear (write changes back).
- Shared spaces + presence.
- Roles / permissions.

**Product**
- Org workspace, SSO, centralized billing.

## Feature → tier matrix

| Capability | Free | Pro | Team |
|---|:--:|:--:|:--:|
| Local board (4 columns), cards, drag-drop, delete | ✓ | ✓ | ✓ |
| Reorder within column | ✓ | ✓ | ✓ |
| Priority / due date / labels | ✓ | ✓ | ✓ |
| CSV / JSON import & export | ✓ | ✓ | ✓ |
| Vibe AI create/move task | ✓ (300/day) | ✓ (hosted, high) | ✓ |
| Subtasks / dependencies / recurring | — | ✓ | ✓ |
| Saved filters / views / swimlanes | — | ✓ | ✓ |
| Live external import (Jira/Linear/Trello/Asana/GitHub) | — | ✓ (one-way) | ✓ (two-way) |
| AI breakdown / standup summaries | — | ✓ | ✓ |
| Hosted AI, no BYO key | — | ✓ | ✓ |
| Settings sync (own devices) | — | ✓ | ✓ |
| Shared boards / assignees / comments | — | — | ✓ |
| Org / SSO / roles | — | — | ✓ |
| Spaces, terminals, embedded browser, themes | ✓ | ✓ | ✓ |

Note: the core app surfaces (spaces, terminals, browser, themes) stay **ungated
in all tiers** by design — they are the reason the app is good for free.

## Gating enforcement (no billing code this round)

Tier rides on the **existing Clerk auth** (the app already hard-gates on Clerk).

- **Tier claim:** `publicMetadata.tier` on the Clerk user, value `free | pro |
  team`. Defaults to `free` when absent. Set **manually in the Clerk dashboard**
  for now; real billing (Clerk Billing or Stripe-via-Supabase) is a later spec.
- **Single source of truth:** a new `src/entitlements.ts` module exporting:
  - a `TIERS` table mapping each tier to its limits/flags, and
  - a `useEntitlements()` hook that reads the tier from the Clerk session and
    returns a typed entitlements object — booleans and limits such as
    `canImportExternal`, `canUseSubtasks`, `canUseSavedViews`, `aiAllowance`
    (`number | "unlimited"`), `maxDevices`, `settingsSync`.
  - All gates read from this module; **no component reads the raw Clerk claim
    directly**.
- **Gate behavior in UI:** locked features render an inline, non-blocking
  **upgrade affordance** (a small "Pro" pill / disabled control with a tooltip),
  not a modal wall. Free stays fully functional.
- **No payment flow** is built this round. The upgrade affordance links to a
  placeholder upgrade target; the actual checkout is wired in the billing spec.

## Data model deltas (task store)

The current `Task` type gains optional, backward-compatible fields so legacy
`tasks.json` files load unchanged:

```ts
type Task = {
  // existing
  id: string; title: string; description: string;
  status: TaskStatus; wallId?: string; createdAt: number; updatedAt: number;
  // new (Free)
  order?: number;                 // position within its column
  priority?: "p0" | "p1" | "p2" | "p3";
  dueAt?: number;                 // epoch ms
  labels?: string[];
  // new (Pro)
  subtasks?: { id: string; title: string; done: boolean }[];
  dependsOn?: string[];           // task ids
  recurrence?: string;            // rule string; shape defined in Pro plan
  source?: {                      // present when imported
    provider: "jira" | "linear" | "trello" | "asana" | "github";
    externalId: string;
    url?: string;
  };
};
```

Normalization on load assigns a stable `order` to legacy tasks (by array index
within each column) so reordering is deterministic from day one.

## Suggested price points (adjustable)

- **Free:** $0.
- **Pro:** $8/mo or $80/yr (~17% annual discount).
- **Team:** $18/user/mo (billed annually cheaper), minimum 2 seats.

These are starting points for an indie desktop dev tool; not committed pricing.

## Explicitly deferred (own specs later)

- **Team cloud backend** — Supabase task sync, real-time shared boards, presence.
- **Two-way external sync** (write-back to Jira/Linear).
- **Comments / @mentions / assignees / roles / SSO.**
- **Real billing integration** (Clerk Billing or Stripe via Supabase) and the
  upgrade/checkout flow.

## Out of scope

- Changing how spaces, terminals, the embedded browser, or Vibe voice work.
- Migrating existing `tasks.json` data beyond additive normalization.
- Any server-side enforcement of entitlements (this round gates client-side off
  the Clerk claim; server enforcement arrives with the cloud backend).
