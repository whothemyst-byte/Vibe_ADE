# Vibe-ADE

Windows-native Agent Development Environment built with Electron + React + TypeScript.

## Run

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

## Package (Windows)

```powershell
npm run dist:win
```

Packaging prerequisite:

- Install Visual Studio Build Tools with C++ workload so `node-pty` can rebuild for Electron during `electron-builder`.

## Test

```powershell
npm test
```

## Smoke Test

- Use `docs/SMOKE_TEST_CHECKLIST.md` for release-critical auth/session/cloud sync validation.

## Notes

- Windows-only shell orchestration uses `powershell.exe` and `cmd.exe`.
- Local persistence is JSON under Electron `userData`.
- AI agent execution is local through `ollama run <model>`.
