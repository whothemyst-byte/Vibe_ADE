import { convertFileSrc } from "@tauri-apps/api/core";
import { supabase } from "../supabase/client";

const BUCKET = "avatars";
const MAX_BYTES = 512 * 1024; // keep avatars tiny / free-tier friendly

/** Storage key for a user's avatar: `<userId>/avatar.<ext>`. */
export function avatarPath(userId: string, sourceName: string): string {
  const dotIndex = sourceName.lastIndexOf(".");
  const ext = dotIndex !== -1 ? sourceName.slice(dotIndex + 1).toLowerCase() : "";
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
