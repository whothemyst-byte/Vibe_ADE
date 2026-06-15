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
  try {
    const res = await fetch(convertFileSrc(path));
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
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
    .update({ background: cloudBg as unknown as Json, version, updated_at: new Date().toISOString(), updated_by: me ?? undefined })
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
