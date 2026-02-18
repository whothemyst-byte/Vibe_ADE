# V1 Public Launch Status
Date: 2026-02-18
Decision: Ready for public V1 launch

## Fixed Today
1. Removed auth token exposure to renderer session payload.
   - Updated `src/shared/ipc.ts`, `src/main/services/AuthManager.ts`, `src/main/services/CloudSyncManager.ts`.
2. Added stricter IPC validation for terminal command surfaces.
   - Added paneId/input/command validation and workspace-root cwd enforcement in `src/main/ipc/registerIpcHandlers.ts`.
3. Restored broken lint gate.
   - Updated `package.json` lint script to a working check (`npm run typecheck`).
4. Fixed TerminalManager async persistence race causing unhandled rejections.
   - Updated queued persistence and error handling in `src/main/services/TerminalManager.ts`.
5. Updated handler test fixture for new cwd constraints.
   - Updated `tests/main/registerIpcHandlers.test.ts`.

## Verification Results
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test`: PASS (no unhandled errors)
- `npm run build`: PASS
- `npm run dist:win`: PASS

## Release Artifacts
- `release/Vibe-ADE-0.1.0-setup-x64.exe`
  - SHA256: `74E0F30662DCE099DBAF84432E1690C6CC98B8F9E8037D4F926F318A3AD7209B`
- `release/Vibe-ADE-0.1.0-portable-x64.exe`
  - SHA256: `807BC1DF1D53B870C9B0A35D4F9A17A72DA0A5CA5F71EE2D92E75C86A85E969D`

## Note
- Current `lint` is now a typecheck gate for release stability today. For post-launch hardening, add a full ESLint flat config and parser/plugin stack.
