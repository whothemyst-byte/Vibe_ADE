# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Vibe — voice companion

Vibe is the floating ghost that controls the app by voice. Enable it in
Settings → Vibe. It needs:

- A free Groq API key (https://console.groq.com/keys) — speech-to-text + brain.
- A free Picovoice AccessKey (https://console.picovoice.ai) — the "Vibe" wake word.
- Two files in `public/` (see docs/superpowers/specs/2026-06-11-vibe-pet-voice-agent-design.md):
  `vibe_wake.ppn` (train "Vibe" for Web/WASM in the Picovoice console) and
  `porcupine_params.pv` (from the Porcupine repo, lib/common).

Say **"Vibe"**, wait for the orb to pulse, then speak — or press **Ctrl+Shift+V**.
Without the Picovoice files the hotkey still works. Phase 1 controls the UI only;
it never types into terminals.
