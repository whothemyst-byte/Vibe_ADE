# Vibe Space Tiers — Plan 1: Gating Foundation + Free-Board Modernization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the Free/Pro/Team entitlements contract and modernize the Free task board (priority, due date, labels, intra/inter-column reorder), with locked "Pro" affordances wired off real entitlements.

**Architecture:** A single pure `entitlements` module maps a Clerk `publicMetadata.tier` claim to a typed capability object; a `useEntitlements()` hook reads it from the Clerk session. The task store gains additive, backward-compatible fields (`order`, `priority`, `dueAt`, `labels`) plus a `reorder` action and a pure `normalizeTasks` loader. The board renders the new fields and gates upcoming Pro controls behind an `<UpgradePill>` driven by entitlements.

**Tech Stack:** React 18 + TypeScript, zustand, @clerk/clerk-react, Vitest (node env), Tauri 2.

**Spec:** `docs/superpowers/specs/2026-06-15-vibe-space-tiers-design.md`

**Builds on:** existing `src/tasks/taskStore.ts`, `src/tasks/TaskBoard.tsx`, `src/store/persistence.ts`, Clerk auth (`@clerk/clerk-react`, `useUser`).

**Out of scope (own later plans):** CSV/JSON import-export (Plan 2), Pro task fields — subtasks/dependencies/recurring/saved views (Plan 3), external import connectors (Plan 4), AI task tools (Plan 5), Team cloud sync + real billing (deferred specs).

---

### Task 1: Tier entitlements module (TDD)

**Files:**
- Create: `src/entitlements.ts`
- Test: `src/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/entitlements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { coerceTier, entitlementsFor } from "./entitlements";

describe("coerceTier", () => {
  it("passes through valid tiers", () => {
    expect(coerceTier("free")).toBe("free");
    expect(coerceTier("pro")).toBe("pro");
    expect(coerceTier("team")).toBe("team");
  });
  it("defaults unknown/missing values to free", () => {
    expect(coerceTier(undefined)).toBe("free");
    expect(coerceTier(null)).toBe("free");
    expect(coerceTier("enterprise")).toBe("free");
    expect(coerceTier(42)).toBe("free");
  });
});

describe("entitlementsFor", () => {
  it("free is the most limited", () => {
    const e = entitlementsFor("free");
    expect(e.tier).toBe("free");
    expect(e.canUseSubtasks).toBe(false);
    expect(e.canUseDependencies).toBe(false);
    expect(e.canUseSavedViews).toBe(false);
    expect(e.canImportExternal).toBe(false);
    expect(e.canUseAiTaskTools).toBe(false);
    expect(e.aiAllowance).toBe(300);
    expect(e.maxDevices).toBe(1);
    expect(e.settingsSync).toBe(false);
  });
  it("pro unlocks power features and hosted AI", () => {
    const e = entitlementsFor("pro");
    expect(e.canUseSubtasks).toBe(true);
    expect(e.canUseDependencies).toBe(true);
    expect(e.canUseSavedViews).toBe(true);
    expect(e.canImportExternal).toBe(true);
    expect(e.canUseAiTaskTools).toBe(true);
    expect(e.aiAllowance).toBe("unlimited");
    expect(e.settingsSync).toBe(true);
    expect(e.maxDevices).toBeGreaterThan(1);
  });
  it("team is a superset of pro", () => {
    const e = entitlementsFor("team");
    expect(e.canImportExternal).toBe(true);
    expect(e.canUseAiTaskTools).toBe(true);
    expect(e.aiAllowance).toBe("unlimited");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/entitlements.test.ts`
Expected: FAIL — cannot resolve `./entitlements`.

- [ ] **Step 3: Implement the module**

Create `src/entitlements.ts`:

```ts
import { useUser } from "@clerk/clerk-react";

export type Tier = "free" | "pro" | "team";

export type Entitlements = {
  tier: Tier;
  canUseSubtasks: boolean;
  canUseDependencies: boolean;
  canUseSavedViews: boolean;
  canImportExternal: boolean;
  canUseAiTaskTools: boolean;
  aiAllowance: number | "unlimited";
  maxDevices: number;
  settingsSync: boolean;
};

export const TIERS: Record<Tier, Entitlements> = {
  free: {
    tier: "free",
    canUseSubtasks: false,
    canUseDependencies: false,
    canUseSavedViews: false,
    canImportExternal: false,
    canUseAiTaskTools: false,
    aiAllowance: 300,
    maxDevices: 1,
    settingsSync: false,
  },
  pro: {
    tier: "pro",
    canUseSubtasks: true,
    canUseDependencies: true,
    canUseSavedViews: true,
    canImportExternal: true,
    canUseAiTaskTools: true,
    aiAllowance: "unlimited",
    maxDevices: 5,
    settingsSync: true,
  },
  team: {
    tier: "team",
    canUseSubtasks: true,
    canUseDependencies: true,
    canUseSavedViews: true,
    canImportExternal: true,
    canUseAiTaskTools: true,
    aiAllowance: "unlimited",
    maxDevices: 25,
    settingsSync: true,
  },
};

export function coerceTier(value: unknown): Tier {
  return value === "pro" || value === "team" ? value : "free";
}

export function entitlementsFor(tier: Tier): Entitlements {
  return TIERS[tier];
}

/** Reads the current user's tier from the Clerk session. Defaults to free. */
export function useEntitlements(): Entitlements {
  const { user } = useUser();
  const tier = coerceTier(user?.publicMetadata?.tier);
  return entitlementsFor(tier);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/entitlements.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/entitlements.ts src/entitlements.test.ts
git commit -m "feat: tier entitlements module (Free/Pro/Team) with Clerk-backed hook"
```

### Task 2: UpgradePill component + styles

A tiny inline badge shown next to locked Pro controls. Placed in `src/tasks/`
(its only consumer in this plan); it can graduate to a shared folder when reused.

**Files:**
- Create: `src/tasks/UpgradePill.tsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Implement the component**

Create `src/tasks/UpgradePill.tsx`:

```tsx
/** Small "Pro" badge marking a feature locked behind a paid tier. */
export function UpgradePill({ feature }: { feature: string }) {
  return (
    <span className="upgrade-pill" title={`${feature} — available on Pro`}>
      Pro
    </span>
  );
}
```

- [ ] **Step 2: Append styles**

Append to `src/App.css`:

```css
.upgrade-pill {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 999px;
  padding: 2px 6px;
  user-select: none;
}
.tb-locked {
  opacity: 0.55;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean (no TS errors). The component is unused until Task 6 — that is fine; it is exported and self-contained.

- [ ] **Step 4: Commit**

```bash
git add src/tasks/UpgradePill.tsx src/App.css
git commit -m "feat: UpgradePill badge for locked Pro features"
```

### Task 3: Task model deltas + store actions (TDD)

Add additive fields (`order`, `priority`, `dueAt`, `labels`), a `reorder` action,
and a pure `normalizeTasks` loader. `priority`/`dueAt`/`labels` are edited via the
existing `update` action (no new setters — YAGNI). Existing tests stay green.

**Files:**
- Modify: `src/tasks/taskStore.ts`
- Modify: `src/tasks/taskStore.test.ts`

- [ ] **Step 1: Write the failing tests (append)**

Append to `src/tasks/taskStore.test.ts` (inside the file, after the existing `describe` block):

```ts
import { normalizeTasks, type Task } from "./taskStore";

describe("taskStore ordering", () => {
  it("add appends with increasing order within the backlog column", () => {
    useTaskStore.getState().add("A");
    useTaskStore.getState().add("B");
    const [a, b] = useTaskStore.getState().tasks;
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
  });

  it("reorder moves a task to a column at a given index and renumbers", () => {
    useTaskStore.getState().add("A"); // backlog 0
    useTaskStore.getState().add("B"); // backlog 1
    useTaskStore.getState().add("C"); // backlog 2
    const ids = useTaskStore.getState().tasks.map((t) => t.id);
    // move C (index 2) to top of in-progress
    useTaskStore.getState().reorder(ids[2], "in-progress", 0);
    const c = useTaskStore.getState().tasks.find((t) => t.id === ids[2])!;
    expect(c.status).toBe("in-progress");
    expect(c.order).toBe(0);
    // move A to index 1 within backlog (after B)
    useTaskStore.getState().reorder(ids[0], "backlog", 1);
    const backlog = useTaskStore.getState().tasks
      .filter((t) => t.status === "backlog")
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
      .map((t) => t.title);
    expect(backlog).toEqual(["B", "A"]);
  });
});

describe("normalizeTasks", () => {
  it("assigns sequential order per column, preserving prior order then createdAt", () => {
    const input: Task[] = [
      { id: "1", title: "older", description: "", status: "backlog", createdAt: 1, updatedAt: 1 },
      { id: "2", title: "newer", description: "", status: "backlog", createdAt: 9, updatedAt: 9, order: 0 },
      { id: "3", title: "done1", description: "", status: "done", createdAt: 5, updatedAt: 5 },
    ];
    const out = normalizeTasks(input);
    const backlog = out.filter((t) => t.status === "backlog");
    // "2" had order 0; "1" had none → sorts after by createdAt
    expect(backlog.map((t) => t.id)).toEqual(["2", "1"]);
    expect(backlog.map((t) => t.order)).toEqual([0, 1]);
    expect(out.find((t) => t.id === "3")!.order).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/tasks/taskStore.test.ts`
Expected: FAIL — `normalizeTasks` and `reorder` do not exist; `order` is not set by `add`.

- [ ] **Step 3: Rewrite the store**

Replace the entire contents of `src/tasks/taskStore.ts` with:

```ts
import { create } from "zustand";

export type TaskStatus = "backlog" | "in-progress" | "in-review" | "done";
export type Priority = "p0" | "p1" | "p2" | "p3";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  wallId?: string;
  createdAt: number;
  updatedAt: number;
  order?: number;
  priority?: Priority;
  dueAt?: number;
  labels?: string[];
};

type TaskStore = {
  tasks: Task[];
  setAll: (tasks: Task[]) => void;
  add: (title: string) => void;
  update: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  remove: (id: string) => void;
  reorder: (id: string, status: TaskStatus, index: number) => void;
};

/** Assigns a stable sequential `order` per column (existing order wins, then createdAt). */
export function normalizeTasks(tasks: Task[]): Task[] {
  const byStatus = new Map<TaskStatus, Task[]>();
  for (const t of tasks) {
    const list = byStatus.get(t.status) ?? [];
    list.push(t);
    byStatus.set(t.status, list);
  }
  const out: Task[] = [];
  for (const list of byStatus.values()) {
    list
      .slice()
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt - b.createdAt)
      .forEach((t, i) => out.push({ ...t, order: i }));
  }
  return out;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  setAll: (tasks) => set({ tasks }),
  add: (title) =>
    set((s) => {
      const maxOrder = s.tasks
        .filter((t) => t.status === "backlog")
        .reduce((m, t) => Math.max(m, t.order ?? 0), -1);
      return {
        tasks: [
          ...s.tasks,
          {
            id: crypto.randomUUID(),
            title,
            description: "",
            status: "backlog",
            order: maxOrder + 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      };
    }),
  update: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    })),
  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  reorder: (id, status, index) =>
    set((s) => {
      const moving = s.tasks.find((t) => t.id === id);
      if (!moving) return {};
      const col = s.tasks
        .filter((t) => t.status === status && t.id !== id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const clamped = Math.max(0, Math.min(index, col.length));
      col.splice(clamped, 0, { ...moving, status });
      const orderById = new Map(col.map((t, i) => [t.id, i]));
      return {
        tasks: s.tasks.map((t) => {
          if (t.id === id) return { ...t, status, order: orderById.get(id)!, updatedAt: Date.now() };
          if (orderById.has(t.id)) return { ...t, order: orderById.get(t.id)! };
          return t;
        }),
      };
    }),
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/tasks/taskStore.test.ts`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Normalize on load**

In `src/tasks/TaskBoard.tsx`, update the import and the load call.

Change the import line:

```tsx
import { useTaskStore, type Task, type TaskStatus } from "./taskStore";
```

to:

```tsx
import { useTaskStore, normalizeTasks, type Task, type TaskStatus } from "./taskStore";
```

In the `useEffect` load block, change:

```tsx
      useTaskStore.getState().setAll(t);
```

to:

```tsx
      useTaskStore.getState().setAll(normalizeTasks(t));
```

- [ ] **Step 6: Verify + commit**

Run: `npm test` → all pass. `npm run build` → clean.

```bash
git add src/tasks/taskStore.ts src/tasks/taskStore.test.ts src/tasks/TaskBoard.tsx
git commit -m "feat: task ordering + priority/due/labels fields, normalize on load"
```

### Task 4: Card fields UI — priority, due date, labels

Add a meta row to each card: a priority picker, a due-date input, and label chips
with an inline add field. All edits go through the existing `update` action.

**Files:**
- Modify: `src/tasks/TaskBoard.tsx` (the `TaskCard` component + the `Priority` import)
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Import Priority and add date helpers**

In `src/tasks/TaskBoard.tsx`, change the taskStore import to also bring in `Priority`:

```tsx
import { useTaskStore, normalizeTasks, type Task, type TaskStatus, type Priority } from "./taskStore";
```

Add these helpers near the top of the file, just below the `COLUMNS` constant:

```tsx
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "p0", label: "P0" },
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
];

function dueToInput(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inputToDue(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}
```

- [ ] **Step 2: Replace the TaskCard body with the meta row**

In `src/tasks/TaskBoard.tsx`, replace the existing `<textarea className="tb-card-desc" … />` element and the `<div className="tb-card-link"> … </div>` block with the following (keep everything above the textarea — the `tb-card-top` row — unchanged):

```tsx
      <textarea
        className="tb-card-desc"
        value={task.description}
        placeholder="Add notes…"
        onChange={(e) => update(task.id, { description: e.target.value })}
      />
      <div className="tb-card-meta">
        <select
          className={`tb-prio${task.priority ? ` ${task.priority}` : ""}`}
          value={task.priority ?? ""}
          onChange={(e) =>
            update(task.id, { priority: (e.target.value || undefined) as Priority | undefined })
          }
          title="Priority"
        >
          <option value="">Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <input
          className="tb-due"
          type="date"
          value={dueToInput(task.dueAt)}
          onChange={(e) => update(task.id, { dueAt: inputToDue(e.target.value) })}
          title="Due date"
        />
      </div>
      <div className="tb-card-labels">
        {(task.labels ?? []).map((label) => (
          <button
            key={label}
            className="tb-label"
            title="Remove label"
            onClick={() =>
              update(task.id, { labels: (task.labels ?? []).filter((l) => l !== label) })
            }
          >
            {label} ×
          </button>
        ))}
        <input
          className="tb-label-add"
          placeholder="+ label"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const value = e.currentTarget.value.trim();
            if (!value) return;
            const existing = task.labels ?? [];
            if (!existing.includes(value)) update(task.id, { labels: [...existing, value] });
            e.currentTarget.value = "";
          }}
        />
      </div>
      <div className="tb-card-link">
        {linkedWall && (
          <button className="tb-chip" onClick={() => onOpenWall(linkedWall.id)} title="Open wall">
            <GridIcon /> {linkedWall.name}
          </button>
        )}
        <select
          className="tb-link-select"
          value={task.wallId ?? ""}
          onChange={(e) => update(task.id, { wallId: e.target.value || undefined })}
        >
          <option value="">{linkedWall ? "Change wall…" : "Link wall…"}</option>
          {walls.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
```

- [ ] **Step 3: Append styles**

Append to `src/App.css`:

```css
.tb-card-meta { display: flex; gap: 6px; align-items: center; }
.tb-prio, .tb-due {
  background: var(--surface-2, #0e1220);
  color: var(--text-muted);
  border: 1px solid var(--border, #232a3d);
  border-radius: 6px;
  font-size: 11px;
  padding: 3px 6px;
}
.tb-prio.p0 { color: #ff6b6b; border-color: #ff6b6b66; }
.tb-prio.p1 { color: #ffa94d; border-color: #ffa94d66; }
.tb-prio.p2 { color: #ffd43b; border-color: #ffd43b66; }
.tb-prio.p3 { color: var(--text-muted); }
.tb-card-labels { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tb-label {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  border: none; border-radius: 999px; cursor: pointer;
  font-size: 10px; padding: 2px 7px;
}
.tb-label-add {
  background: transparent; border: 1px dashed var(--border, #232a3d);
  color: var(--text-muted); border-radius: 999px;
  font-size: 10px; padding: 2px 7px; width: 64px; outline: none;
}
```

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → clean. `npm test` → all pass.

```bash
git add src/tasks/TaskBoard.tsx src/App.css
git commit -m "feat: priority, due date, and labels on task cards"
```

### Task 5: Reorder within and between columns (drag to position)

Today dropping only changes a card's column (`update({ status })`). Replace that
with position-aware reordering: the drop point's vertical position decides the
insertion index, and the store's `reorder` action renumbers the column.

**Files:**
- Modify: `src/tasks/TaskBoard.tsx`

- [ ] **Step 1: Tag each card with its id**

In the `TaskCard` component, add a `data-id` attribute to the card root so the
drop handler can exclude the dragged card when computing the index. Change:

```tsx
    <div className="tb-card">
```

to:

```tsx
    <div className="tb-card" data-id={task.id}>
```

- [ ] **Step 2: Sort each column by order**

In the `TaskBoard` render, change the per-column items line:

```tsx
          const items = tasks.filter((t) => t.status === col.key);
```

to:

```tsx
          const items = tasks
            .filter((t) => t.status === col.key)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
```

- [ ] **Step 3: Replace the drop handler with index computation**

Replace the existing `onDrop` definition:

```tsx
  const onDrop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) useTaskStore.getState().update(id, { status });
  };
```

with:

```tsx
  const onDrop = (status: TaskStatus) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const body = e.currentTarget.querySelector(".tb-col-body");
    const cards = body
      ? Array.from(body.querySelectorAll<HTMLElement>(".tb-card")).filter((c) => c.dataset.id !== id)
      : [];
    let index = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (index === -1) index = cards.length;
    useTaskStore.getState().reorder(id, status, index);
  };
```

(The `DragEvent` type already imported at the top of the file now needs its
generic — it is imported from `react`, so `DragEvent<HTMLDivElement>` is valid.)

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → clean. `npm test` → all pass.

Manual check (during the Task 6 dogfood, or now via `npm run tauri dev`): drag a
card to a specific position within a column and across columns; the order holds
after reopening the board.

```bash
git add src/tasks/TaskBoard.tsx
git commit -m "feat: drag tasks to a specific position within and across columns"
```

### Task 6: Wire entitlements into the board — locked Pro affordances

Make the gating visibly real: the board toolbar gains an "Import" and a "Saved
views" control, both driven by `useEntitlements()`. Free users see them disabled
with a `Pro` pill; Pro/Team users see them enabled with intentional stub handlers
(the real behavior arrives in Plans 2–4). This is a complete, shippable state —
the locked experience IS the Free deliverable.

**Files:**
- Modify: `src/tasks/TaskBoard.tsx`

- [ ] **Step 1: Import the hook and the pill**

Add to the imports at the top of `src/tasks/TaskBoard.tsx`:

```tsx
import { useEntitlements } from "../entitlements";
import { UpgradePill } from "./UpgradePill";
```

- [ ] **Step 2: Read entitlements in the component**

Inside the `TaskBoard` function, add near the other hooks (e.g. right after
`const tasks = useTaskStore((s) => s.tasks);`):

```tsx
  const ent = useEntitlements();
```

- [ ] **Step 3: Add the gated toolbar controls**

In the `tb-bar` block, immediately after the existing
`<button className="tb-add" …>+ Task</button>`, add:

```tsx
        <button
          className={`tb-add${ent.canImportExternal ? "" : " tb-locked"}`}
          disabled={!ent.canImportExternal}
          title={
            ent.canImportExternal
              ? "Import from Jira, Linear, Trello… (ships with the connectors update)"
              : "Importing from external tools is a Pro feature"
          }
          onClick={() => {
            if (ent.canImportExternal) alert("External imports ship with the connectors update.");
          }}
        >
          Import ▾ {!ent.canImportExternal && <UpgradePill feature="External import" />}
        </button>
        <button
          className={`tb-add${ent.canUseSavedViews ? "" : " tb-locked"}`}
          disabled={!ent.canUseSavedViews}
          title={
            ent.canUseSavedViews
              ? "Saved views & filters (ships with the Pro task update)"
              : "Saved views are a Pro feature"
          }
          onClick={() => {
            if (ent.canUseSavedViews) alert("Saved views ship with the Pro task update.");
          }}
        >
          Saved views {!ent.canUseSavedViews && <UpgradePill feature="Saved views" />}
        </button>
```

- [ ] **Step 4: Verify**

Run: `npm run build` → clean. `npm test` → all pass.

- [ ] **Step 5: Human dogfood (run the app)**

Run `npm run tauri dev` and open the Taskboard:
1. As a **Free** user (no `publicMetadata.tier`, or `"free"`), the **Import ▾** and
   **Saved views** buttons are disabled and show a `Pro` pill.
2. Create tasks; set priority, due date, and labels — all persist after reopening.
3. Drag a card to a specific position within a column and to another column; the
   order holds after closing and reopening the board.
4. (Optional) In the Clerk dashboard set your user's `publicMetadata` to
   `{ "tier": "pro" }`, restart, reopen the board → the two buttons are now
   enabled (clicking shows the stub notice). No pill.

- [ ] **Step 6: Commit (and any dogfood fix)**

```bash
git add src/tasks/TaskBoard.tsx
git commit -m "feat: gate Import & Saved views behind entitlements with Pro pill"
```

---

## Done when

- `entitlementsFor("free"|"pro"|"team")` returns the correct capability object; unknown/missing → free.
- `useEntitlements()` reads `publicMetadata.tier` from the Clerk session.
- Tasks support `order`, `priority`, `dueAt`, `labels`; legacy `tasks.json` loads via `normalizeTasks` with stable per-column order.
- Cards show a priority picker, due date, and label chips; edits persist.
- Tasks can be dragged to a specific position within and across columns.
- A Free user sees disabled "Import" / "Saved views" controls with a `Pro` pill; Pro/Team users see them enabled (stub handlers).
- `npm test` green; `npm run build` clean.
