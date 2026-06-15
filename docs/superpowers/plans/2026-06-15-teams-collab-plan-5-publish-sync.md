# Teams Collaboration — Plan 5: Publish & Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Figma-like loop — **"Share a space"** publishes a local space (canvas scene + terminal layout + background + thumbnail) to the org, the **Projects panel** lists shared spaces, **Open** clones/links a shared space locally and renders it (background via a signed URL), and edits **push back with a last-write-wins version guard** so concurrent saves never silently clobber.

**Architecture:** No Rust changes. The canvas scene + terminal layout go to the `org-space-content` bucket as `content.json`; the background descriptor lives in `org_space.background` (binary image/video bytes go to `org-space-assets`, read on the client via `fetch(convertFileSrc(path))` and rendered back via a signed URL). A local space is linked to its `org_space` row through new `WallMeta` fields (`sharedOrgSpaceId`, `cloudVersion`). `WallView` pushes on save: it reads the remote `version`; if it advanced, it pulls the newer scene into the open canvas and shows a notice instead of overwriting.

**Tech Stack:** Supabase Storage + the `org_space` table/RPC-free table writes (RLS from Plan 1), the typed client, the existing Tauri persistence commands, React/zustand. All Supabase ops via the **`supabase-vibespace`** MCP where DB work is needed (none new here — tables/buckets exist).

**Spec:** `docs/superpowers/specs/2026-06-15-vibe-space-teams-collab-design.md` (Section 3 — publish, open, last-write-wins).

**Prerequisite:** Plans 1–4 complete (org_space table + storage buckets + policies, TeamsView Projects panel placeholder, orgStore).

**Scope note:** terminal **layout/presets** travel but `cwd` is cleared on open (it's publisher-specific); live PTY output never syncs. Video backgrounds upload the same way as images but are large — a per-file size cap guards the free-tier quota.

---

### Task 1: Cloud-background helpers + remote-URL rendering (TDD)

A shared space's background is either a color (travels in JSON) or an uploaded asset
(stored by storage key, rendered from a signed URL). Isolate the mapping as pure helpers
and teach `WallBackground` to render a remote URL.

**Files:**
- Modify: `src/store/types.ts`
- Modify: `src/wall/WallBackground.tsx`
- Create: `src/teams/cloudSpace.ts`
- Create: `src/teams/cloudSpace.test.ts`

- [ ] **Step 1: Allow a remote URL on image/video backgrounds**

In `src/store/types.ts`, change the `Background` union to make `path` optional and add `url`:

```ts
export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; path?: string; url?: string }
  | { kind: "video"; path?: string; url?: string };
```

- [ ] **Step 2: Render a remote URL when present**

Replace the body of `src/wall/WallBackground.tsx`:

```tsx
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Background } from "../store/types";

function srcOf(bg: { path?: string; url?: string }): string {
  return bg.url ?? (bg.path ? convertFileSrc(bg.path) : "");
}

export function WallBackground({ background }: { background: Background }) {
  if (background.kind === "color") {
    return <div className="wall-bg" style={{ background: background.color }} />;
  }
  if (background.kind === "image") {
    return (
      <div
        className="wall-bg"
        style={{ backgroundImage: `url(${srcOf(background)})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
    );
  }
  return <video className="wall-bg" src={srcOf(background)} autoPlay loop muted playsInline />;
}
```

- [ ] **Step 3: Write the failing test for the cloud-background helpers**

Create `src/teams/cloudSpace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extOf, fromCloudBackground, toCloudBackground } from "./cloudSpace";

describe("extOf", () => {
  it("extracts a lowercased extension", () => {
    expect(extOf("C:/x/cat.PNG")).toBe("png");
    expect(extOf("/a/b/clip.webm")).toBe("webm");
    expect(extOf("noext")).toBe("bin");
  });
});

describe("toCloudBackground", () => {
  it("passes colors through with no upload", () => {
    expect(toCloudBackground({ kind: "color", color: "#123" }, "k")).toEqual({
      cloud: { kind: "color", color: "#123" }, upload: null,
    });
  });
  it("maps an image to a storage key + upload directive", () => {
    expect(toCloudBackground({ kind: "image", path: "C:/p/bg.jpg" }, "org/space")).toEqual({
      cloud: { kind: "image", key: "org/space/bg.jpg" },
      upload: { key: "org/space/bg.jpg", path: "C:/p/bg.jpg" },
    });
  });
});

describe("fromCloudBackground", () => {
  it("returns the color directly", () => {
    expect(fromCloudBackground({ kind: "color", color: "#123" }, null)).toEqual({ kind: "color", color: "#123" });
  });
  it("returns a url-backed image", () => {
    expect(fromCloudBackground({ kind: "image", key: "k/bg.jpg" }, "https://signed")).toEqual({
      kind: "image", url: "https://signed",
    });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/teams/cloudSpace.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the helpers**

Create `src/teams/cloudSpace.ts`:

```ts
import type { Background } from "../store/types";

export type CloudBg =
  | { kind: "color"; color: string }
  | { kind: "image"; key: string }
  | { kind: "video"; key: string };

export function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "bin";
}

/** Local Background -> cloud descriptor (+ optional asset to upload). */
export function toCloudBackground(
  bg: Background,
  keyBase: string,
): { cloud: CloudBg; upload: { key: string; path: string } | null } {
  if (bg.kind === "color") return { cloud: { kind: "color", color: bg.color }, upload: null };
  const path = bg.path ?? "";
  const key = `${keyBase}/bg.${extOf(path)}`;
  return { cloud: { kind: bg.kind, key }, upload: path ? { key, path } : null };
}

/** Cloud descriptor (+ resolved signed url) -> Background for rendering. */
export function fromCloudBackground(cloud: CloudBg, signedUrl: string | null): Background {
  if (cloud.kind === "color") return { kind: "color", color: cloud.color };
  return { kind: cloud.kind, url: signedUrl ?? undefined };
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run src/teams/cloudSpace.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/types.ts src/wall/WallBackground.tsx src/teams/cloudSpace.ts src/teams/cloudSpace.test.ts
git commit -m "feat(teams): cloud-background helpers + remote-url rendering"
```


### Task 2: Link local spaces to org spaces (`WallMeta`)

**Files:**
- Modify: `src/store/types.ts`

- [ ] **Step 1: Add cloud-link fields to `WallMeta`**

```ts
export type WallMeta = {
  id: string;
  name: string;
  path: string;
  updatedAt: number;
  isCurrent: boolean;
  /** Set when this local space is linked to a shared org project. */
  sharedOrgSpaceId?: string;
  /** The org_space.version this local copy is based on (for last-write-wins). */
  cloudVersion?: number;
};
```

(Both are optional, so existing `index.json` files load unchanged.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/store/types.ts
git commit -m "feat(teams): WallMeta cloud-link fields"
```


### Task 3: Sync engine (`spaceSync.ts`)

Publishes/opens/pushes/unpublishes shared spaces against Storage + the `org_space` table.

**Files:**
- Modify: `src/store/persistence.ts`
- Create: `src/teams/spaceSync.ts`

- [ ] **Step 1: Add a thumbnail-bytes loader to persistence**

Append to `src/store/persistence.ts`:

```ts
export async function loadThumbnailBytes(id: string): Promise<Uint8Array | null> {
  const bytes = await invoke<number[] | null>("thumb_load", { id });
  return bytes ? new Uint8Array(bytes) : null;
}
```

- [ ] **Step 2: Create `src/teams/spaceSync.ts`**

```ts
import { convertFileSrc } from "@tauri-apps/api/core";
import { supabase } from "../supabase/client";
import type { Json, Tables } from "../supabase/types";
import { loadIndex, saveIndex, loadWall, saveWall, loadThumbnailBytes } from "../store/persistence";
import type { WallDoc, WallMeta, Background } from "../store/types";
import { currentUserId } from "./identity";
import { toCloudBackground, fromCloudBackground, type CloudBg } from "./cloudSpace";

export type OrgSpace = Tables<"org_space">;

const CONTENT = "org-space-content";
const ASSETS = "org-space-assets";
const MAX_BG_BYTES = 25 * 1024 * 1024;
const FALLBACK_BG: CloudBg = { kind: "color", color: "#12110f" };

const emptyScene = (): WallDoc["scene"] => ({ elements: [], appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } } });

async function fileBlob(path: string): Promise<Blob | null> {
  try { const res = await fetch(convertFileSrc(path)); return res.ok ? await res.blob() : null; } catch { return null; }
}

/** Uploads scene+terminals to content, the background asset to assets, returns the cloud bg. */
async function uploadDoc(orgId: string, spaceId: string, doc: WallDoc): Promise<CloudBg> {
  const keyBase = `${orgId}/${spaceId}`;
  const { cloud, upload } = toCloudBackground(doc.background, keyBase);
  let cloudBg: CloudBg = cloud;
  if (upload) {
    const blob = await fileBlob(upload.path);
    if (blob && blob.size <= MAX_BG_BYTES) {
      const { error } = await supabase.storage.from(ASSETS).upload(upload.key, blob, { upsert: true });
      if (error) cloudBg = FALLBACK_BG;
    } else {
      cloudBg = FALLBACK_BG; // unreadable or over the size cap
    }
  }
  const content = { scene: doc.scene, terminals: doc.terminals, gridAnchor: doc.gridAnchor, browser: doc.browser };
  const { error } = await supabase.storage
    .from(CONTENT)
    .upload(`${keyBase}/content.json`, new Blob([JSON.stringify(content)], { type: "application/json" }), { upsert: true });
  if (error) throw new Error(error.message);
  return cloudBg;
}

/** Rebuild a local WallDoc from an org_space row (signed url for the background). */
async function downloadSharedDoc(row: OrgSpace): Promise<WallDoc> {
  const { data: blob } = await supabase.storage.from(CONTENT).download(row.content_path);
  const content = blob
    ? (JSON.parse(await blob.text()) as Partial<WallDoc>)
    : { scene: emptyScene(), terminals: [] };
  const cloudBg = (row.background as CloudBg | null) ?? FALLBACK_BG;
  let signed: string | null = null;
  if (cloudBg.kind !== "color") {
    const { data } = await supabase.storage.from(ASSETS).createSignedUrl(cloudBg.key, 3600);
    signed = data?.signedUrl ?? null;
  }
  const background: Background = fromCloudBackground(cloudBg, signed);
  // cwd is publisher-specific; clear it so the opener's terminals start fresh.
  const terminals = (content.terminals ?? []).map((t) => ({ ...t, cwd: "" }));
  return {
    scene: content.scene ?? emptyScene(),
    terminals,
    background,
    gridAnchor: content.gridAnchor,
    browser: content.browser,
  };
}

/** Publish a local space to an org. Links the local meta and returns the org_space id. */
export async function publishLocalSpace(localId: string, orgId: string): Promise<string> {
  const me = currentUserId();
  if (!me) throw new Error("not signed in");
  const index = await loadIndex();
  const meta = index.find((w) => w.id === localId);
  if (!meta) throw new Error("space not found");
  const doc = await loadWall(localId);
  if (!doc) throw new Error("space has no content yet — open it once first");

  const spaceId = meta.sharedOrgSpaceId ?? crypto.randomUUID();
  const cloudBg = await uploadDoc(orgId, spaceId, doc);

  let thumbUrl: string | null = null;
  const thumb = await loadThumbnailBytes(localId);
  if (thumb) {
    const key = `${orgId}/${spaceId}/thumb.png`;
    await supabase.storage.from(ASSETS).upload(key, new Blob([thumb], { type: "image/png" }), { upsert: true });
    thumbUrl = key;
  }

  const baseVersion = meta.cloudVersion ?? 0;
  const version = baseVersion + 1;
  const { error } = await supabase.from("org_space").upsert({
    id: spaceId,
    org_id: orgId,
    local_origin_id: localId,
    name: meta.name,
    owner_user_id: me,
    thumb_url: thumbUrl,
    content_path: `${orgId}/${spaceId}/content.json`,
    background: cloudBg as unknown as Json,
    version,
    updated_at: new Date().toISOString(),
    updated_by: me,
  });
  if (error) throw new Error(error.message);

  await saveIndex(index.map((w) => (w.id === localId ? { ...w, sharedOrgSpaceId: spaceId, cloudVersion: version } : w)));
  return spaceId;
}

/** Open a shared space: download it into a linked local space and return the local id. */
export async function openSharedSpace(orgSpaceId: string): Promise<string> {
  const { data: row, error } = await supabase.from("org_space").select("*").eq("id", orgSpaceId).single();
  if (error || !row) throw new Error(error?.message ?? "shared space not found");
  const index = await loadIndex();
  const existing = index.find((w) => w.sharedOrgSpaceId === orgSpaceId);
  const localId = existing?.id ?? crypto.randomUUID();

  const doc = await downloadSharedDoc(row);
  await saveWall(localId, doc);

  const linked: WallMeta = {
    id: localId,
    name: row.name,
    path: existing?.path ?? "",
    updatedAt: Date.now(),
    isCurrent: true,
    sharedOrgSpaceId: orgSpaceId,
    cloudVersion: row.version,
  };
  const next = index.some((w) => w.id === localId)
    ? index.map((w) => (w.id === localId ? { ...w, ...linked } : { ...w, isCurrent: false }))
    : [...index.map((w) => ({ ...w, isCurrent: false })), linked];
  await saveIndex(next);
  return localId;
}

export type PushResult =
  | { status: "pushed"; version: number }
  | { status: "reloaded"; doc: WallDoc; version: number; by: string };

/** Push a local edit to the shared space, guarding against stale overwrites. */
export async function pushSharedScene(orgSpaceId: string, baseVersion: number, doc: WallDoc): Promise<PushResult> {
  const me = currentUserId();
  const { data: row, error } = await supabase.from("org_space").select("*").eq("id", orgSpaceId).single();
  if (error || !row) throw new Error(error?.message ?? "shared space gone");

  if ((row.version ?? 0) > baseVersion) {
    return { status: "reloaded", doc: await downloadSharedDoc(row), version: row.version, by: row.updated_by };
  }

  const cloudBg = await uploadDoc(row.org_id, orgSpaceId, doc);
  const version = baseVersion + 1;
  const { error: upErr } = await supabase
    .from("org_space")
    .update({ background: cloudBg as unknown as Json, version, updated_at: new Date().toISOString(), updated_by: me })
    .eq("id", orgSpaceId)
    .eq("version", row.version); // optimistic lock
  if (upErr) throw new Error(upErr.message);
  return { status: "pushed", version };
}

/** Unpublish: delete the row + its storage objects, and unlink local copies. */
export async function unpublishSharedSpace(orgSpaceId: string): Promise<void> {
  const { data: row } = await supabase
    .from("org_space")
    .select("org_id, background, thumb_url")
    .eq("id", orgSpaceId)
    .single();
  if (row) {
    const keyBase = `${row.org_id}/${orgSpaceId}`;
    await supabase.storage.from(CONTENT).remove([`${keyBase}/content.json`]);
    const assetKeys = [`${keyBase}/thumb.png`];
    const bg = row.background as CloudBg | null;
    if (bg && bg.kind !== "color") assetKeys.push(bg.key);
    await supabase.storage.from(ASSETS).remove(assetKeys);
  }
  const { error } = await supabase.from("org_space").delete().eq("id", orgSpaceId);
  if (error) throw new Error(error.message);
  const index = await loadIndex();
  await saveIndex(index.map((w) => (w.sharedOrgSpaceId === orgSpaceId ? { ...w, sharedOrgSpaceId: undefined, cloudVersion: undefined } : w)));
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/store/persistence.ts src/teams/spaceSync.ts
git commit -m "feat(teams): space publish/open/push/unpublish sync engine"
```


### Task 4: Projects in the store + Projects panel + App wiring

**Files:**
- Modify: `src/teams/orgStore.ts`
- Modify: `src/teams/TeamsView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add `projects` + `loadProjects` to the store**

In `src/teams/orgStore.ts`:
- Add the type alias near the others:

```ts
export type Project = Tables<"org_space">;
```

- Add to the store state/type: `projects: Project[];` and `loadProjects: (orgId: string) => Promise<void>;`
- Initialize `projects: [],` in the store body.
- Implement (place beside `loadInvites`):

```ts
  loadProjects: async (orgId) => {
    const data = throwIf(
      await supabase.from("org_space").select("*").eq("org_id", orgId).order("updated_at", { ascending: false }),
    );
    set({ projects: data ?? [] });
  },
```

- Call it wherever members/invites load. In `loadMyOrgs`, inside the `if (current)` block:

```ts
      if (current) {
        await get().loadMembers(current.id);
        await get().loadInvites(current.id);
        await get().loadProjects(current.id);
      } else {
        set({ members: [], invites: [], projects: [] });
      }
```

And in `setCurrentOrg`, mirror it: when `id` is set, also `void get().loadProjects(id);`, and in the else branch set `projects: []` too.

- [ ] **Step 2: Rewrite the Projects panel in `TeamsView.tsx`**

Add imports at the top of `TeamsView.tsx`:

```tsx
import { loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";
import { publishLocalSpace, openSharedSpace, unpublishSharedSpace } from "./spaceSync";
```

Change the `TeamsView` signature to accept `onOpenWall`:

```tsx
export function TeamsView({ onBack, onOpenWall }: { onBack: () => void; onOpenWall: (id: string) => void }) {
```

In the body, pass the new props to the panel:

```tsx
          {isAdmin && <InvitesPanel orgId={currentOrg.id} invites={invites} />}
          <ProjectsPanel orgId={currentOrg.id} myId={myId} isAdmin={isAdmin} onOpenWall={onOpenWall} />
```

Replace the whole `ProjectsPanel` function with:

```tsx
function ProjectsPanel({
  orgId, myId, isAdmin, onOpenWall,
}: { orgId: string; myId: string | null; isAdmin: boolean; onOpenWall: (id: string) => void }) {
  const projects = useOrgStore((s) => s.projects);
  const loadProjects = useOrgStore((s) => s.loadProjects);
  const [locals, setLocals] = useState<WallMeta[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadIndex().then((idx) => setLocals(idx.filter((w) => w.sharedOrgSpaceId == null)));
  }, [projects]);

  const share = async () => {
    if (!pick) return;
    setBusy(true);
    try { await publishLocalSpace(pick, orgId); await loadProjects(orgId); setPick(""); }
    finally { setBusy(false); }
  };
  const open = async (id: string) => {
    setBusy(true);
    try { onOpenWall(await openSharedSpace(id)); } finally { setBusy(false); }
  };
  const unpublish = async (id: string) => {
    setBusy(true);
    try { await unpublishSharedSpace(id); await loadProjects(orgId); } finally { setBusy(false); }
  };

  return (
    <section className="teams-panel">
      <h3 className="teams-panel-title">Projects</h3>
      <div className="teams-form-row">
        <select className="teams-input" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Share a space…</option>
          {locals.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="teams-btn primary" disabled={busy || !pick} onClick={() => void share()}>Share</button>
      </div>
      {projects.length === 0 ? (
        <p className="teams-placeholder">No shared projects yet. Share one of your spaces above.</p>
      ) : (
        <ul className="teams-projects">
          {projects.map((p) => (
            <li key={p.id} className="teams-project">
              <span className="teams-proj-mono">{p.name.charAt(0).toUpperCase() || "?"}</span>
              <span className="teams-proj-name">{p.name}</span>
              <button className="teams-btn" disabled={busy} onClick={() => void open(p.id)}>Open</button>
              {(isAdmin || p.owner_user_id === myId) && (
                <button className="teams-remove" title="Unpublish" disabled={busy} onClick={() => void unpublish(p.id)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Pass `onOpenWall` from `App.tsx`**

Update the teams branch:

```tsx
  } else if (view.kind === "teams") {
    page = <TeamsView onBack={() => setView(view.from)} onOpenWall={(id) => setView({ kind: "wall", id })} />;
```

- [ ] **Step 4: Add Projects-list styles to `src/App.css`**

```css
.teams-projects { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.teams-project { display: flex; align-items: center; gap: 10px; }
.teams-proj-mono {
  display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; flex: none;
  background: color-mix(in srgb, var(--accent) 22%, var(--surface-2)); font-weight: 600; font-size: 13px;
}
.teams-proj-name { flex: 1; font-size: 14px; }
```

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add src/teams/orgStore.ts src/teams/TeamsView.tsx src/App.tsx src/App.css
git commit -m "feat(teams): Projects panel — share, open, unpublish"
```


### Task 5: Push-on-save + conflict reload in `WallView`

When the open space is shared, every (debounced) save also pushes to the cloud under the
version guard; if a teammate's save landed first, we pull their scene into the canvas and
show a notice instead of overwriting.

**Files:**
- Modify: `src/wall/WallView.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Import the push function**

Add to `WallView.tsx` imports:

```tsx
import { pushSharedScene } from "../teams/spaceSync";
```

- [ ] **Step 2: Add shared-state refs**

Near the other refs at the top of `WallView` (e.g. after `const [wallPath, setWallPath] = useState("");`):

```tsx
  const sharedRef = useRef<{ orgSpaceId: string; version: number } | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [sharedNotice, setSharedNotice] = useState<string | null>(null);
```

- [ ] **Step 3: Detect shared link on load**

In the main load effect, replace:

```tsx
      const index = await loadIndex();
      if (!cancelled) setWallPath(index.find((w) => w.id === wallId)?.path ?? "");
```

with:

```tsx
      const index = await loadIndex();
      const meta = index.find((w) => w.id === wallId);
      if (!cancelled) {
        setWallPath(meta?.path ?? "");
        if (meta?.sharedOrgSpaceId) {
          sharedRef.current = { orgSpaceId: meta.sharedOrgSpaceId, version: meta.cloudVersion ?? 0 };
          setIsShared(true);
        } else {
          sharedRef.current = null;
          setIsShared(false);
        }
      }
```

- [ ] **Step 4: Add the push helper + local version bump**

Add these inside the `WallView` component (e.g. right above `const doSave = …`):

```tsx
  const bumpLocalCloudVersion = async (version: number) => {
    const index = await loadIndex();
    await saveIndex(index.map((w) => (w.id === wallId ? { ...w, cloudVersion: version } : w)));
  };

  const pushShared = async (doc: WallDoc) => {
    const s = sharedRef.current;
    if (!s) return;
    try {
      const res = await pushSharedScene(s.orgSpaceId, s.version, doc);
      sharedRef.current = { orgSpaceId: s.orgSpaceId, version: res.version };
      await bumpLocalCloudVersion(res.version);
      if (res.status === "reloaded") {
        const api = apiRef.current;
        if (api) applyScene(api, { elements: res.doc.scene.elements, appState: res.doc.scene.appState as AppStateLike });
        backgroundRef.current = res.doc.background;
        setBackground(res.doc.background);
        applyAccent(accentForBackground(res.doc.background));
        await saveWall(wallId, res.doc);
        setSharedNotice("Updated by a teammate — reloaded.");
        window.setTimeout(() => setSharedNotice(null), 4000);
      }
    } catch {
      /* sync is best-effort; local save already succeeded */
    }
  };
```

- [ ] **Step 5: Call the push at the end of `doSave`**

In `doSave`, after the existing index `updatedAt` update (the `await saveIndex(index.map(...))` line near the end), add:

```tsx
    if (sharedRef.current) await pushShared(doc);
```

(`doc` is the local variable already built at the top of `doSave`.)

- [ ] **Step 6: Render the badge + notice**

In the `WallView` return, just inside the root `<div className="wall-root">`, add after `<WallBackground … />`:

```tsx
      {isShared && <div className="wall-shared-badge">Shared</div>}
      {sharedNotice && <div className="wall-shared-notice">{sharedNotice}</div>}
```

- [ ] **Step 7: Styles**

Append to `src/App.css`:

```css
.wall-shared-badge {
  position: absolute; top: 12px; right: 16px; z-index: 20;
  background: var(--surface-2); border: 1px solid var(--rule); color: var(--accent);
  font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 4px 10px; border-radius: 999px;
}
.wall-shared-notice {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 20;
  background: var(--surface-2); border: 1px solid var(--rule); color: var(--text);
  padding: 8px 14px; border-radius: var(--radius-sm); font-size: 13px;
}
```

- [ ] **Step 8: Type-check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add src/wall/WallView.tsx src/App.css
git commit -m "feat(teams): push shared-space edits on save with version guard"
```


### Task 6: Verify

**Files:** none.

- [ ] **Step 1: Type-check + tests + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → all pass (212 + the new cloudSpace cases).
Run: `npm run build` → succeeds.

- [ ] **Step 2: Security advisor re-check (no new findings)**

MCP `mcp__supabase-vibespace__get_advisors` with `type: "security"`.
Expected: no new RLS/storage issues for `org_space` or the buckets (writes go through the
Plan 1 policies).

- [ ] **Step 3: Manual smoke test (two accounts)**

Start the app (`npm run tauri dev`).
1. Account A: open a local space, draw something, then **Teams → Projects → Share a space**
   → pick it → it appears under Projects.
2. Account B (other machine/profile, same org): **Teams → Projects → Open** that project →
   the canvas + background load; the toolbar shows a **Shared** badge.
3. B edits and it saves → A opens the same project (or has it open) and on next save sees
   the **"Updated by a teammate — reloaded"** notice rather than losing work.
4. Owner: **Unpublish** (×) → the project disappears for everyone and its storage objects
   are removed.

Expected: publish → open → edit → last-write-wins all round-trip through Supabase.


## Done criteria (Plan 5)

- "Share a space" publishes a local space (scene + terminal layout + background +
  thumbnail) to the org; it appears in the Projects panel for all members.
- "Open" downloads a shared space into a linked local copy and renders it (background via
  signed URL); the wall shows a "Shared" badge.
- Editing a shared space pushes on save with a version guard; a concurrent remote save
  triggers a pull + notice instead of silent data loss.
- Unpublish removes the row and storage objects and unlinks local copies.
- `tsc`, tests, and build are green.

**This completes the team-collaboration workstream (Plans 1–5).** Documented follow-ups
(own specs): real email invites (Resend/Postmark), live multiplayer cursors (CRDT),
project thumbnails in the panel via signed URLs, and the hover "Open space" affordance in
the solar system.

