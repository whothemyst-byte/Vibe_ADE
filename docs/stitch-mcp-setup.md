# Stitch MCP Setup (Codex)

This project includes:

- `docs/stitch-mcp.example.json` (generic MCP JSON example)
- This file with Codex-specific setup

## Where to configure in Codex

Edit the active Codex config file:

- Windows (typical): `C:\Users\<your-user>\.codex\config.toml`
- macOS/Linux: `~/.codex/config.toml`

Add this block:

```toml
[mcp_servers.stitch]
url = "https://stitch.withgoogle.com/api/mcp/sse"
bearer_token_env_var = "STITCH_API_KEY"

[mcp_servers.stitch.env]
# Put your real key here (raw key, no "Bearer " prefix):
STITCH_API_KEY = "YOUR_STITCH_API_KEY"
```

## One-command setup (Codex CLI)

```powershell
codex.cmd mcp add stitch --url https://stitch.withgoogle.com/api/mcp/sse --bearer-token-env-var STITCH_API_KEY
```

## API key placement

Your Stitch API key goes here:

- `STITCH_API_KEY = "YOUR_STITCH_API_KEY"` in `~/.codex/config.toml`

Replace `YOUR_STITCH_API_KEY` with your real key.

## Why your MCP can fail even with correct config

If `codex mcp list` shows no servers, you may be editing the wrong config path.

In my diagnostic run, Codex tried to read/write:

- `C:\Users\CodexSandboxOffline\.codex\config.toml`

not:

- `C:\Users\admin\.codex\config.toml`

So update the config file in the path your Codex process is actually using.

## Optional OAuth path

If your Stitch/Codex flow supports OAuth, you can use a no-header setup and complete login when prompted. API key mode above is the explicit fallback when OAuth is not available.

## Verify

Run:

```powershell
codex mcp list
```

Then start Codex and ask it to use the `stitch` server.

## Notes

- Requires Node.js and `npx`.
- Stitch endpoint: `https://stitch.withgoogle.com/api/mcp/sse`.
- Keep API keys out of git-tracked project files. Store them only in `~/.codex/config.toml`.
