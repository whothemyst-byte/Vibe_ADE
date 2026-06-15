# Teams: My Card Photo Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member set a photo on their org card (My Card pane), stored in
Supabase Storage and rendered as their orbit avatar for teammates.

**Architecture:** A new Storage bucket holds avatars at `<user_id>/avatar.<ext>`.
A small upload util reads the picked file as a blob, caps its size, uploads
(upsert), and writes the resulting URL to `org_member.avatar_url` via the
existing `setMyCard` store action. The My Card pane gains a photo row.

**Tech Stack:** Supabase Storage + RLS (via the **`supabase-vibespace`** MCP),
`@tauri-apps/api` file conversion, existing `useOrgStore` / persistence pickers.

Implements phase 4 of
`docs/superpowers/specs/2026-06-15-teams-orbit-settings-and-invites-design.md`.
**Depends on** the orbit/settings plan (`setMyCard`, the My Card pane).

> **Deviation flagged for confirmation:** the spec said a *private* `avatars`
> bucket. Private objects need signed URLs that expire, which would make a stored
> `avatar_url` go stale. This plan uses a **public-read** bucket (writes still
> RLS-restricted to the owner's own path) so `avatar_url` is a stable public URL.
> Avatars are low-sensitivity; confirm this is acceptable before applying Task 1.

---

### Task 1: Create the `avatars` storage bucket + policies

**Files:**
- Apply via MCP: `mcp__supabase-vibespace__apply_migration` (name: `avatars_bucket`)

- [ ] **Step 1: Apply the migration**

Run `mcp__supabase-vibespace__apply_migration` with this SQL:

```sql
-- Public-read avatars bucket; writes restricted to the owner's own path.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Path convention: <clerk_user_id>/avatar.<ext>. The first path segment is the
-- owner; only that user may write/replace/delete their own object.
create policy "avatars owner write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.jwt()->>'sub');

create policy "avatars owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.jwt()->>'sub');

create policy "avatars owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.jwt()->>'sub');
```

- [ ] **Step 2: Verify the bucket exists**

Run `mcp__supabase-vibespace__execute_sql` with:

```sql
select id, public from storage.buckets where id = 'avatars';
```

Expected: one row, `public = true`.

- [ ] **Step 3: Commit (migration record only — no app code yet)**

No repo files change in this task; the migration lives in Supabase. Proceed to
Task 2.

---

### Task 2: Avatar upload util + extend `setMyCard`

**Files:**
- Create: `src/teams/avatarUpload.ts`
- Test: `src/teams/avatarUpload.test.ts`
- Modify: `src/teams/orgStore.ts`

- [ ] **Step 1: Extend the `setMyCard` patch type to accept `avatar_url`**

In `src/teams/orgStore.ts`, change the `setMyCard` signature in the `OrgStore`
type to include `avatar_url`:

```ts
  setMyCard: (patch: { display_name?: string; avatar_url?: string | null; manual_status?: string | null; manual_status_emoji?: string | null }) => Promise<void>;
```

The implementation needs no change — it spreads `patch` into the update.

- [ ] **Step 2: Write the failing test (path builder)**

`src/teams/avatarUpload.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avatarPath } from "./avatarUpload";

describe("avatarPath", () => {
  it("namespaces the object under the user id with the file extension", () => {
    expect(avatarPath("user_123", "pic.PNG")).toBe("user_123/avatar.png");
  });
  it("defaults the extension when missing", () => {
    expect(avatarPath("u", "noext")).toBe("u/avatar.png");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/teams/avatarUpload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the util**

`src/teams/avatarUpload.ts`:

```ts
import { convertFileSrc } from "@tauri-apps/api/core";
import { supabase } from "../supabase/client";

const BUCKET = "avatars";
const MAX_BYTES = 512 * 1024; // keep avatars tiny / free-tier friendly

/** Storage key for a user's avatar: `<userId>/avatar.<ext>`. */
export function avatarPath(userId: string, sourceName: string): string {
  const ext = (sourceName.split(".").pop() ?? "").toLowerCase();
  const safe = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "png";
  return `${userId}/avatar.${safe}`;
}

/**
 * Upload a picked image file to the avatars bucket and return a cache-busted
 * public URL. Throws if the file is unreadable or over the size cap.
 */
export async function uploadAvatar(userId: string, sourcePath: string): Promise<string> {
  const res = await fetch(convertFileSrc(sourcePath));
  if (!res.ok) throw new Error("could not read the selected image");
  const blob = await res.blob();
  if (blob.size > MAX_BYTES) throw new Error("image is too large (max 512 KB)");
  const key = avatarPath(userId, sourcePath);
  const { error } = await supabase.storage.from(BUCKET).upload(key, blob, { upsert: true, contentType: blob.type || "image/png" });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return `${data.publicUrl}?v=${Date.now()}`; // bust the CDN cache after re-upload
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/teams/avatarUpload.test.ts`
Expected: PASS (the pure `avatarPath` cases; `uploadAvatar` is exercised manually).

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/teams/avatarUpload.ts src/teams/avatarUpload.test.ts src/teams/orgStore.ts
git commit -m "feat(teams): avatar upload util + avatar_url in setMyCard"
```

---

### Task 3: Photo row in the My Card pane

**Files:**
- Modify: `src/settings/SettingsModal.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add imports to SettingsModal**

```tsx
import { pickBackgroundFile } from "../store/persistence";
import { uploadAvatar } from "../teams/avatarUpload";
```

- [ ] **Step 2: Add photo state + handlers in `MyCardPane`**

Inside `MyCardPane`, after the existing `useState` hooks, add:

```tsx
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const choosePhoto = async () => {
    const src = await pickBackgroundFile();
    if (!src) return;
    setPhotoErr(null); setBusy(true);
    try {
      const url = await uploadAvatar(me.user_id, src);
      await setMyCard({ avatar_url: url });
    } catch (e) {
      setPhotoErr((e as Error).message);
    } finally { setBusy(false); }
  };
  const clearPhoto = async () => {
    setBusy(true);
    try { await setMyCard({ avatar_url: null }); } finally { setBusy(false); }
  };
```

- [ ] **Step 3: Render the photo row at the top of the pane body**

Immediately after the `<p className="set-sub">…</p>` line in `MyCardPane`, add:

```tsx
      <div className="set-row mycard-photo-row">
        <span className="mycard-photo">
          {me.avatar_url ? <img src={me.avatar_url} alt="" /> : <span>{emoji || (me.display_name || "?").trim().charAt(0).toUpperCase()}</span>}
        </span>
        <div className="mycard-photo-actions">
          <button className="set-btn" disabled={busy} onClick={() => void choosePhoto()}>Choose photo…</button>
          {me.avatar_url && <button className="set-btn" disabled={busy} onClick={() => void clearPhoto()}>Remove</button>}
          {photoErr && <span className="set-hint" style={{ color: "var(--danger)" }}>{photoErr}</span>}
        </div>
      </div>
```

- [ ] **Step 4: Add styles**

In `src/App.css`, append:

```css
.mycard-photo-row { align-items: center; }
.mycard-photo {
  display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%;
  overflow: hidden; flex: none; font-size: 24px;
  background: color-mix(in srgb, var(--accent) 25%, var(--surface-2));
}
.mycard-photo img { width: 100%; height: 100%; object-fit: cover; }
.mycard-photo-actions { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

```bash
git add src/settings/SettingsModal.tsx src/App.css
git commit -m "feat(teams): My Card photo upload"
```

---

## Self-review notes

- **Spec coverage:** §3 (My Card photo) → Tasks 1–3. Falls back to emoji/monogram
  when no photo, matching existing avatar rendering.
- **Manual verification:** in `npm run tauri dev`, open Settings → My Card →
  Choose photo; confirm a teammate's client shows the new avatar in the orbit;
  Remove falls back to emoji/monogram.
- **GC note (follow-up, not blocking):** removing a member doesn't delete their
  avatar object; a later cleanup job can prune `avatars/<user_id>/` — out of scope
  here, avatars are tiny.
