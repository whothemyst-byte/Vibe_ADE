# Vibe Space v1.0.0 — Migration & Rename Design

**Date:** 2026-06-13
**Status:** Approved (design), pending implementation plan

## Summary

Vibe Walls is being promoted to **v1.0.0 of Vibe ADE** and renamed to **Vibe Space**. This involves three independent workstreams:

1. **Git** — publish the local `vibe-walls` repo (currently no remote) onto the `whothemyst-byte/Vibe_ADE` GitHub repo as a new branch `V1.0.0`, preserving full commit history.
2. **Rename** — a full "Vibe Wall" → "Vibe Space" rename across user-visible strings, package/bundle identifiers, Rust crate names, the internal "wall" domain vocabulary, and the local folder (`vibe-walls` → `vibe-space`).
3. **Supabase** — move the `groq-proxy` edge function and `groq_usage` table from the old FlowMate project (`cvithwrsgmtdajaddsab`) to the target project `tfaouguiyvmfarfqungk`, and repoint the app.

## Context

- The `vibe-walls` local repo has linear history; the working tip is commit `412bc09` on branch `feat/embedded-browser`. It has **no git remote** configured.
- `Vibe_ADE` (`https://github.com/whothemyst-byte/Vibe_ADE.git`) currently holds the older Vibe ADE planning history on `main`. The `V1.0.0` branch will carry the vibe-walls history, which is **unrelated** to `main` — this is intentional: v1.0.0 is a rewrite, not a fast-forward continuation.
- The local Vibe_ADE checkout has two uncommitted files (`package-lock.json`, `src/main/windows/mainWindow.ts`); they are not touched by this work.
- The groq proxy currently points at `https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy` (hardcoded in `src/vibe/groq.ts`). The Supabase MCP in this session is scoped to that **old** project, so steps that write to `tfaouguiyvmfarfqungk` require either repointing the MCP config or using the Supabase CLI with a user-provided access token.
- Disk on C: is tight (Tauri build artifacts). The migration is done in-place in the existing `vibe-walls` working tree to reuse `node_modules` and the Rust `target/` cache; no second clone/worktree is created.

## 1. Git migration (vibe-walls → Vibe_ADE `V1.0.0`)

**Approach:** rename in the local `vibe-walls` repo, add the Vibe_ADE remote, push the tip as `V1.0.0`.

Ordering note: the rename (section 2) and the Supabase repoint (section 3) are committed **first**, on the local branch, so the very first `V1.0.0` commit on GitHub is already "Vibe Space". The push happens after.

Steps:
1. From the `vibe-walls` working tree, ensure the working tip (`412bc09` + the new rename/supabase commits) is the branch to publish.
2. `git remote add vibe-ade https://github.com/whothemyst-byte/Vibe_ADE.git`
3. `git fetch vibe-ade` (so we have `main` for reference; we do **not** merge or rebase onto it).
4. Create the publish branch: `git branch V1.0.0` at the current tip (or push the current branch under that name).
5. `git push -u vibe-ade HEAD:V1.0.0`.
6. Confirm on GitHub that `V1.0.0` exists with full history and the head commit is the Vibe Space rename.

The `main` branch on Vibe_ADE is left untouched. No PR is opened by this work — `V1.0.0` is a standalone branch the user can later choose to promote.

## 2. Rename: Vibe Wall → Vibe Space

Full rename. Concrete changes, grouped:

**Identity / packaging**
- `package.json`: `"name": "vibe-walls"` → `"vibe-space"`; bump `"version": "0.1.0"` → `"1.0.0"`.
- `src-tauri/tauri.conf.json`: `productName` → `"Vibe Space"`; `identifier` `com.admin.vibe-walls` → `com.admin.vibe-space`; window `title` → `"Vibe Space"`.
- `src-tauri/Cargo.toml`: package `name` `vibe-walls` → `vibe-space`; lib `name` `vibe_walls_lib` → `vibe_space_lib`. Also `Cargo.lock`.
- `src-tauri/src/main.rs`: `vibe_walls_lib::run()` → `vibe_space_lib::run()`.
- `index.html`: `<title>Tauri + React + Typescript</title>` → `<title>Vibe Space</title>`.

**User-visible strings**
- `src/settings/SettingsModal.tsx:308`: "**Vibe Walls** v0.1.0 — an infinite canvas for commanding a wall of…" → "**Vibe Space** v1.0.0 — …". Reword the "wall of" phrasing to fit "Space".
- `README.md`: title and body references.

**Internal "wall" domain vocabulary**
- Rust Tauri commands `wall_load` / `wall_save` / `wall_delete` (`src-tauri/src/store/commands.rs`, registered in `lib.rs`) → `space_load` / `space_save` / `space_delete`. Update the matching `invoke()` call sites in `src/store/persistence.ts`.
- Storage path helpers in `src-tauri/src/store/paths.rs`: the `walls/` subdirectory and `walls_dir()` helper → `spaces/` and `spaces_dir()`.
- Frontend store/types/components that use "wall" as a noun for a saved canvas (`src/store/types.ts`, `src/start/StartPage.tsx`, `src/tasks/*`, `src/vibe/*`, `src/App.tsx`): rename the user-facing concept to "space". Variable-level renames are done where they aid clarity but are not exhaustive busywork — the test is that no user-visible text or persisted/IPC contract still says "wall".

**Persistence consequence (accepted):** the app's data directory is derived from the Tauri `identifier`. Changing it to `com.admin.vibe-space` already points the app at a fresh data dir, so previously saved walls would not load regardless. Renaming the internal `walls/` dir to `spaces/` is therefore consistent and loses nothing pre-release. No migration shim is written.

**Folder rename:** after commits are pushed, rename the working directory `vibe-walls` → `vibe-space` (done last so in-flight git/build paths stay valid until the end).

**Exclusions:** `src-tauri/target/` fingerprint JSON files that contain "vibe-walls" are build cache and are ignored — they regenerate on next build. The `firewall`/`omnibox` etc. uses of the substring "wall" are unrelated and left alone.

## 3. Supabase transfer (old FlowMate project → tfaouguiyvmfarfqungk)

**Target:** `https://tfaouguiyvmfarfqungk.supabase.co` (project ref `tfaouguiyvmfarfqungk`).

Assets to move (from `cvithwrsgmtdajaddsab`):
- Edge function `groq-proxy` — source in `supabase/functions/groq-proxy/` (`index.ts` entrypoint + `rules.ts`), deployed with JWT verification **off**.
- Table `groq_usage` + its atomic bump function — migration `supabase/migrations/20260612_groq_usage.sql`.
- Secret `GROQ_API_KEY` — **cannot be exported**; must be re-entered on the target.

Steps:
1. **Apply schema:** run `supabase/migrations/20260612_groq_usage.sql` against `tfaouguiyvmfarfqungk` (MCP `apply_migration` or CLI `supabase db push`).
2. **Deploy function:** deploy `groq-proxy` to `tfaouguiyvmfarfqungk` with `--no-verify-jwt`.
3. **Set secret:** set `GROQ_API_KEY` on the target project (user supplies the value; not in the repo).
4. **Repoint app:** update `PROXY_BASE` in `src/vibe/groq.ts:5` and the two URLs in `src/vibe/groq.test.ts` (lines 64, 98) to `https://tfaouguiyvmfarfqungk.supabase.co/functions/v1/groq-proxy`. Update the doc references in `docs/superpowers/plans/*` that name the old ref.
5. **Smoke test:** `curl -s -X POST "https://tfaouguiyvmfarfqungk.supabase.co/functions/v1/groq-proxy/chat" -H "Content-Type: application/json" -H "x-device-id: migrate-verify" -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"say ok"}]}'` → expect a 200 with a completion.
6. **Decommission old:** only after the smoke test passes, drop `groq-proxy` and `groq_usage` from `cvithwrsgmtdajaddsab` (this also frees the FlowMate project per the existing memory note).

**Execution dependency:** the session's Supabase MCP is bound to `cvithwrsgmtdajaddsab`. For steps 1–3 against the target, either repoint the MCP project binding to `tfaouguiyvmfarfqungk` or use the Supabase CLI with a personal access token. This is flagged in the plan as a prerequisite the user must satisfy before those steps run.

## 4. Verification

- `npm test` (vitest) green after the rename, including the updated `src/vibe/groq.test.ts` URLs.
- `cargo check` (or `cargo build`) succeeds with the renamed crate/lib (`vibe_space_lib`) and command names. A full Tauri bundle is **not** required for verification (saves disk).
- Proxy smoke test (section 3, step 5) returns 200 against the **new** URL before the old project is decommissioned.
- `git ls-remote vibe-ade` shows the `V1.0.0` branch with the expected head commit.
- A grep for user-visible/contract "wall" (excluding `firewall`, omnibox, `target/`) returns nothing.

## Out of scope

- Opening a PR to merge `V1.0.0` into Vibe_ADE `main` (left to the user).
- Migrating any existing saved walls/user data to the new identifier (accepted data-dir reset, pre-release).
- Rewriting the old Vibe ADE (Electron) codebase on `main`.
- Producing a packaged/signed Vibe Space installer.
- Exporting the `GROQ_API_KEY` secret (impossible; re-entered manually).
