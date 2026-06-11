# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Vibe — voice companion

Vibe is the floating ghost that controls the app by voice. Enable it in
Settings → Vibe. It needs:

- A free Groq API key (https://console.groq.com/keys) — speech-to-text + brain.
  Any email works; no card required.
- The offline wake-word model (~40MB, not committed to git). Download
  https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz
  and save it as `public/vosk-model-small-en-us.tar.gz`. No account needed —
  the "Vibe" wake word runs fully locally via Vosk (Apache-2.0).

Say **"Vibe"**, wait for the orb to pulse, then speak — or press **Ctrl+Shift+V**,
or click the pet. Without the model file the hotkey/click still works. Phase 1
controls the UI only; it never types into terminals.
