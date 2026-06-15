# Teams: Invite Links (Deep Link + Landing Page) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `https://quansynd.com/join/<code>` (and `vibespace://join/<code>`)
join the user's org — at $0 and no backend — with a static landing-page fallback
for users without the app.

**Architecture:** Register a custom `vibespace` scheme via
`tauri-plugin-deep-link` + `tauri-plugin-single-instance`. A frontend hook parses
incoming `…/join/<code>` URLs and calls the existing `joinByCode` (stashing the
code to claim after sign-in if needed). A static landing page deep-links into the
app and shows the code as a manual fallback.

**Tech Stack:** Tauri v2 plugins (Rust), `@tauri-apps/plugin-deep-link` (JS),
Clerk auth state, existing `useOrgStore.joinByCode`, static HTML.

Implements phase 5 of
`docs/superpowers/specs/2026-06-15-teams-orbit-settings-and-invites-design.md`.
The **copy-invite-link** buttons already ship in the orbit/settings plan
(`inviteLinkFor`). **Windows-first:** macOS needs an Info.plist scheme entry (not
done here); the landing page's manual code covers mac users until then.

---

### Task 1: Register the `vibespace` scheme (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add the plugin dependencies**

In `src-tauri/Cargo.toml`, under `[dependencies]` add:

```toml
tauri-plugin-deep-link = "2"
```

and at the end of the file add the desktop-only single-instance dep with the
deep-link integration feature:

```toml
[target.'cfg(any(target_os = "windows", target_os = "linux"))'.dependencies]
tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }
```

- [ ] **Step 2: Declare the scheme in tauri.conf.json**

In `src-tauri/tauri.conf.json`, add a top-level `"plugins"` key (sibling of
`"app"` and `"bundle"`):

```json
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["vibespace"]
      }
    }
  },
```

- [ ] **Step 3: Allow the deep-link permission**

In `src-tauri/capabilities/default.json`, add `"deep-link:default"` to the
`"permissions"` array.

- [ ] **Step 4: Wire the plugins in lib.rs**

In `src-tauri/src/lib.rs`, register single-instance **first** (Tauri requires it
to be the first plugin), then deep-link, and register the scheme at runtime on
Windows/Linux. Replace the builder head:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Focus the existing window; the deep-link plugin re-emits the URL via onOpenUrl.
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("vibespace");
            }
            Ok(())
        })
        .manage(pty::registry::PtyRegistry::new())
        .manage(browser::BrowserState::default())
        .invoke_handler(tauri::generate_handler![
```

Leave the rest of the `invoke_handler!` list and `.run(...)` unchanged.

> Note: the default window `label` is `"main"`. If `get_webview_window("main")`
> returns `None` in testing, confirm the label via
> `app.webview_windows().keys()`.

- [ ] **Step 5: Build the Rust side**

Run: `npm run tauri build -- --debug` (or `cargo check` in `src-tauri`)
Expected: compiles; `vibespace` scheme registers on launch.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(teams): register vibespace:// deep-link scheme"
```

---

### Task 2: Parse join URLs (util + test)

**Files:**
- Create: `src/teams/joinUrl.ts`
- Test: `src/teams/joinUrl.test.ts`

- [ ] **Step 1: Write the failing test**

`src/teams/joinUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseJoinUrl } from "./joinUrl";

describe("parseJoinUrl", () => {
  it("reads the code from a custom-scheme link", () => {
    expect(parseJoinUrl("vibespace://join/AB12CD")).toBe("AB12CD");
  });
  it("reads the code from the https landing link", () => {
    expect(parseJoinUrl("https://quansynd.com/join/AB12CD")).toBe("AB12CD");
  });
  it("supports a ?code= query form", () => {
    expect(parseJoinUrl("vibespace://join?code=XYZ")).toBe("XYZ");
  });
  it("url-decodes the code", () => {
    expect(parseJoinUrl("vibespace://join/a%20b")).toBe("a b");
  });
  it("returns null for unrelated urls", () => {
    expect(parseJoinUrl("https://quansynd.com/")).toBeNull();
    expect(parseJoinUrl("not a url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/teams/joinUrl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

`src/teams/joinUrl.ts`:

```ts
/** Extract the org join code from a vibespace://join/<code> or
 *  https://…/join/<code> link (also supports ?code=). Returns null if absent. */
export function parseJoinUrl(url: string): string | null {
  const path = url.match(/(?:vibespace:\/\/join\/|\/join\/)([^/?#]+)/i);
  if (path && path[1]) return decodeURIComponent(path[1]);
  const query = url.match(/[?&]code=([^&#]+)/i);
  if (query && query[1]) return decodeURIComponent(query[1]);
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/teams/joinUrl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/teams/joinUrl.ts src/teams/joinUrl.test.ts
git commit -m "feat(teams): parse invite-link join codes"
```

---

### Task 3: Handle incoming deep links in the app

**Files:**
- Add dependency: `@tauri-apps/plugin-deep-link`
- Create: `src/teams/useDeepLinkJoin.ts`
- Modify: `src/teams/TeamsBootstrap.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Install the JS plugin**

Run: `npm i @tauri-apps/plugin-deep-link`
Expected: added to `package.json` dependencies.

- [ ] **Step 2: Create the deep-link hook**

`src/teams/useDeepLinkJoin.ts`:

```ts
import { useEffect, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { onOpenUrl, getCurrent } from "@tauri-apps/plugin-deep-link";
import { useOrgStore } from "./orgStore";
import { parseJoinUrl } from "./joinUrl";

const PENDING_JOIN_KEY = "vibe.teams.pendingJoin";

/** Open Teams once a join succeeds (App listens for this). */
function openTeams() {
  window.dispatchEvent(new CustomEvent("vibe:open-teams"));
}

async function joinNow(code: string) {
  try {
    await useOrgStore.getState().joinByCode(code);
    openTeams();
  } catch {
    /* invalid/expired code — silently ignore; user can retry from Teams */
  }
}

/** Listen for vibespace://join/<code> deep links; join now or after sign-in. */
export function useDeepLinkJoin(): void {
  const { isSignedIn } = useUser();
  const signedInRef = useRef(isSignedIn);
  signedInRef.current = isSignedIn;

  // Incoming URLs (cold-start + while running).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const handle = (urls: string[] | null) => {
      for (const u of urls ?? []) {
        const code = parseJoinUrl(u);
        if (!code) continue;
        if (signedInRef.current) void joinNow(code);
        else localStorage.setItem(PENDING_JOIN_KEY, code);
      }
    };
    void getCurrent().then(handle).catch(() => {});
    void onOpenUrl((urls) => handle(urls)).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => unlisten?.();
  }, []);

  // Claim a stashed code once the user signs in.
  useEffect(() => {
    if (!isSignedIn) return;
    const pending = localStorage.getItem(PENDING_JOIN_KEY);
    if (pending) { localStorage.removeItem(PENDING_JOIN_KEY); void joinNow(pending); }
  }, [isSignedIn]);
}
```

- [ ] **Step 3: Run the hook from TeamsBootstrap**

In `src/teams/TeamsBootstrap.tsx`:

```tsx
import { useClaimInvites } from "./useClaimInvites";
import { usePresenceLifecycle } from "./usePresenceLifecycle";
import { useDeepLinkJoin } from "./useDeepLinkJoin";

/** Renders nothing; runs invite-claim + org load + presence + deep-link joins. */
export function TeamsBootstrap() {
  useClaimInvites();
  usePresenceLifecycle();
  useDeepLinkJoin();
  return null;
}
```

- [ ] **Step 4: Navigate to Teams when a join fires**

In `src/App.tsx`, add an effect inside `App` (after the `view` state is declared)
that opens Teams on the custom event:

```tsx
  useEffect(() => {
    const open = () => setView((v) => (v.kind === "teams" ? v : { kind: "teams", from: v }));
    window.addEventListener("vibe:open-teams", open);
    return () => window.removeEventListener("vibe:open-teams", open);
  }, []);
```

- [ ] **Step 5: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 6: Manual verification**

In `npm run tauri dev`, with the app running and signed in, run from a terminal:
`start vibespace://join/<a-real-join-code>` (Windows). Expected: the app focuses,
joins the org, and switches to the Teams view. Signed out: it joins after the
next sign-in.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/teams/useDeepLinkJoin.ts src/teams/TeamsBootstrap.tsx src/App.tsx
git commit -m "feat(teams): handle vibespace://join deep links"
```

---

### Task 4: Static landing page for quansynd.com/join

A no-backend page that deep-links into the app and shows the code to paste. It
reads the code from the last path segment (host must serve this file for
`/join/*`) or a `?code=` query.

**Files:**
- Create: `landing/join/index.html`

- [ ] **Step 1: Create the landing page**

`landing/join/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Join on Vibe Space</title>
<style>
  :root { --bg:#12110f; --surface:#1b1916; --text:#f3eee5; --muted:#b1a692; --accent:#d79a3d; --rule:#322e29; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    font-family: ui-sans-serif, system-ui, "Geist", sans-serif; background:var(--bg); color:var(--text); }
  .card { width:min(440px,calc(100vw - 40px)); background:var(--surface);
    border:1px solid var(--rule); border-radius:14px; padding:32px; text-align:center; }
  h1 { font-family: "Instrument Serif", Georgia, serif; font-weight:400; font-size:30px; margin:0 0 6px; }
  p { color:var(--muted); font-size:14px; line-height:1.55; margin:0 0 22px; }
  .btn { display:inline-block; background:var(--accent); color:#1a1408; text-decoration:none;
    font-weight:600; padding:12px 22px; border-radius:10px; }
  .code { margin:22px 0 0; font-family: "Geist Mono", ui-monospace, monospace; font-size:13px; color:var(--muted); }
  .code b { color:var(--accent); letter-spacing:2px; font-size:18px; }
  .dl { display:block; margin-top:18px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>You're invited</h1>
    <p>Open this invite in Vibe Space to join the team.</p>
    <a id="open" class="btn" href="#">Open in Vibe Space</a>
    <p class="code">Don't have it open? Paste this join code in Vibe&nbsp;Space →
      <b id="code">—</b></p>
    <a class="dl" href="https://quansynd.com/vibe-space">Download Vibe Space</a>
  </div>
  <script>
    // Code is the last path segment (/join/<code>) or ?code=<code>.
    var parts = location.pathname.replace(/\/+$/, "").split("/");
    var code = new URLSearchParams(location.search).get("code") || parts[parts.length - 1];
    if (code && code !== "join") {
      document.getElementById("code").textContent = code;
      document.getElementById("open").href = "vibespace://join/" + encodeURIComponent(code);
      // Best-effort auto-open.
      setTimeout(function () { location.href = "vibespace://join/" + encodeURIComponent(code); }, 400);
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add landing/join/index.html
git commit -m "feat(teams): static invite landing page for quansynd.com/join"
```

- [ ] **Step 3: Deployment note (manual, outside this repo)**

Deploy `landing/join/index.html` to quansynd.com so that **`/join/<code>`** serves
it (a catch-all rewrite `/join/* → /join/index.html`, the same way SPA hosting
works). On Vercel/Netlify static hosting this is a single rewrite rule. Verify
`https://quansynd.com/join/TESTCODE` shows `TESTCODE` and the "Open in Vibe Space"
button points to `vibespace://join/TESTCODE`.

---

## Self-review notes

- **Spec coverage:** §4 — scheme registration (Task 1), URL parsing (Task 2),
  in-app handling + pending-after-sign-in + navigation (Task 3), landing page
  (Task 4). Copy-link buttons ship in the orbit/settings plan.
- **Risks verified in-task:** single-instance registered first (Task 1 Step 4)
  and URL forwarded on second launch (Task 3 Step 6 manual check) — addresses
  tauri #12726.
- **Type consistency:** `parseJoinUrl` (Task 2) is the only new exported symbol
  consumed by `useDeepLinkJoin` (Task 3); `joinByCode` is the existing store
  action (unchanged).
- **macOS:** scheme registration is Windows/Linux only here; the landing page's
  manual code is the mac fallback until an Info.plist entry is added.
