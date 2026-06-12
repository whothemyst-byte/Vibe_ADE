# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Vibe — voice companion

Vibe is the floating ghost that controls the app by voice. Enable it in
Settings → Vibe.

Speech recognition and the agent brain work out of the box: they run through a
hosted gateway with a free daily allowance per device (300 requests/day). For
unlimited usage, grab a free API key at https://console.groq.com/keys (any
email works; no card required) and paste it in Settings → Vibe — the app then
talks to Groq directly and skips the shared allowance.

One asset is still needed locally:

- The offline wake-word model (~40MB, not committed to git). Download
  https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz
  and save it as `public/vosk-model-small-en-us.tar.gz`. No account needed —
  the "Vibe" wake word runs fully locally via Vosk (Apache-2.0).

Say **"Vibe"**, wait for the orb to pulse, then speak — or press **Ctrl+Shift+V**,
or click the pet. Without the model file the hotkey/click still works. Vibe
controls the UI only; it never types into terminals.

It can: open Claude Code / Codex / plain terminals, close or focus them, change
the wall background or apply a theme (Ember, Midnight, Parchment, Moss, Plum,
Slate), zoom to fit, switch or CREATE walls (it asks where, or opens the folder
picker), open the task board, create/move tasks, and answer questions. If it
needs missing info it asks and listens for your answer. Say **"go to sleep"**
to silence the wake word (click it or press the hotkey to wake it). Pick its
speaking voice in Settings → Vibe.
