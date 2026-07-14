# Graph Report - .  (2026-06-16)

## Corpus Check
- 204 files · ~156,450 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1049 nodes · 1937 edges · 75 communities (68 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.78)
- Token cost: 420,203 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Browser Client + Agent Names|Browser Client + Agent Names]]
- [[_COMMUNITY_Settings + App Shell|Settings + App Shell]]
- [[_COMMUNITY_Vibe Agent Loop + Commands|Vibe Agent Loop + Commands]]
- [[_COMMUNITY_Rust Atomic Store|Rust Atomic Store]]
- [[_COMMUNITY_PTY Client + Agent Status|PTY Client + Agent Status]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Teams Collab Plans|Teams Collab Plans]]
- [[_COMMUNITY_Rust PTY Actor|Rust PTY Actor]]
- [[_COMMUNITY_CanvasTools + Teams Specs|Canvas/Tools + Teams Specs]]
- [[_COMMUNITY_Tauri Config|Tauri Config]]
- [[_COMMUNITY_Rust BrowserPTY Registry|Rust Browser/PTY Registry]]
- [[_COMMUNITY_Rust Browser Commands|Rust Browser Commands]]
- [[_COMMUNITY_Voice Agent + Browser Specs|Voice Agent + Browser Specs]]
- [[_COMMUNITY_Realtime Presence|Realtime Presence]]
- [[_COMMUNITY_Supabase Client + Clerk Token|Supabase Client + Clerk Token]]
- [[_COMMUNITY_Voice Pipeline + Groq Plans|Voice Pipeline + Groq Plans]]
- [[_COMMUNITY_Settings Modal Panes|Settings Modal Panes]]
- [[_COMMUNITY_Canvas Tool Icons|Canvas Tool Icons]]
- [[_COMMUNITY_TypeScript Config (app)|TypeScript Config (app)]]
- [[_COMMUNITY_Silence Detector + WAV|Silence Detector + WAV]]
- [[_COMMUNITY_Org Store + Identity|Org Store + Identity]]
- [[_COMMUNITY_Desktop Schema (defs)|Desktop Schema (defs)]]
- [[_COMMUNITY_Windows Schema (defs)|Windows Schema (defs)]]
- [[_COMMUNITY_Entitlements + Teams Bootstrap|Entitlements + Teams Bootstrap]]
- [[_COMMUNITY_Teams View + Settings Panes|Teams View + Settings Panes]]
- [[_COMMUNITY_Perf Overhaul + Browser Specs|Perf Overhaul + Browser Specs]]
- [[_COMMUNITY_Browser OAuth Sign-In|Browser OAuth Sign-In]]
- [[_COMMUNITY_Vibe Pet Positioning|Vibe Pet Positioning]]
- [[_COMMUNITY_Groq Proxy Edge Function|Groq Proxy Edge Function]]
- [[_COMMUNITY_PerfGrid Layout Plans|Perf/Grid Layout Plans]]
- [[_COMMUNITY_Desktop Schema (permissions)|Desktop Schema (permissions)]]
- [[_COMMUNITY_Desktop Schema (webviews)|Desktop Schema (webviews)]]
- [[_COMMUNITY_Windows Schema (permissions)|Windows Schema (permissions)]]
- [[_COMMUNITY_Windows Schema (webviews)|Windows Schema (webviews)]]
- [[_COMMUNITY_Clerk Ticket Edge Function|Clerk Ticket Edge Function]]
- [[_COMMUNITY_Desktop Schema (identifier)|Desktop Schema (identifier)]]
- [[_COMMUNITY_Windows Schema (identifier)|Windows Schema (identifier)]]
- [[_COMMUNITY_Rust OAuth Loopback|Rust OAuth Loopback]]
- [[_COMMUNITY_Desktop Schema (capability remote)|Desktop Schema (capability remote)]]
- [[_COMMUNITY_Windows Schema (capability remote)|Windows Schema (capability remote)]]
- [[_COMMUNITY_Theme Accents|Theme Accents]]
- [[_COMMUNITY_TypeScript Config (node)|TypeScript Config (node)]]
- [[_COMMUNITY_Account Profile Providers|Account Profile Providers]]
- [[_COMMUNITY_Org Invites Pane|Org Invites Pane]]
- [[_COMMUNITY_Orbit Layout Math|Orbit Layout Math]]
- [[_COMMUNITY_Tools Island Definitions|Tools Island Definitions]]
- [[_COMMUNITY_Capabilities Default|Capabilities Default]]
- [[_COMMUNITY_Deep-Link Join URL|Deep-Link Join URL]]
- [[_COMMUNITY_Canvas Engine Plan|Canvas Engine Plan]]
- [[_COMMUNITY_Vibe Pet Voice Plan|Vibe Pet Voice Plan]]
- [[_COMMUNITY_Desktop Schema (capability)|Desktop Schema (capability)]]
- [[_COMMUNITY_Desktop Schema (default A)|Desktop Schema (default A)]]
- [[_COMMUNITY_Desktop Schema (default B)|Desktop Schema (default B)]]
- [[_COMMUNITY_Windows Schema (capability)|Windows Schema (capability)]]
- [[_COMMUNITY_Windows Schema (default A)|Windows Schema (default A)]]
- [[_COMMUNITY_Windows Schema (default B)|Windows Schema (default B)]]
- [[_COMMUNITY_Desktop Schema (number)|Desktop Schema (number)]]
- [[_COMMUNITY_Desktop Schema (permission entry)|Desktop Schema (permission entry)]]
- [[_COMMUNITY_Windows Schema (number)|Windows Schema (number)]]
- [[_COMMUNITY_Windows Schema (permission entry)|Windows Schema (permission entry)]]
- [[_COMMUNITY_Set Team Tier Script|Set Team Tier Script]]
- [[_COMMUNITY_Vite Env Types|Vite Env Types]]
- [[_COMMUNITY_Invite Link Builder|Invite Link Builder]]
- [[_COMMUNITY_Preset Tier Color|Preset Tier Color]]
- [[_COMMUNITY_PTY Transport Plan|PTY Transport Plan]]
- [[_COMMUNITY_V1 Rename Migration|V1 Rename Migration]]
- [[_COMMUNITY_Agent Activity Tracker|Agent Activity Tracker]]

## God Nodes (most connected - your core abstractions)
1. `base()` - 18 edges
2. `useOrgStore` - 18 edges
3. `compilerOptions` - 16 edges
4. `Result` - 15 edges
5. `String` - 15 edges
6. `useEntitlements()` - 15 edges
7. `String` - 14 edges
8. `AppHandle` - 14 edges
9. `currentUserId()` - 13 edges
10. `Result` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Vibe Voice Companion` --conceptually_related_to--> `Vibe Pet Mascot UI`  [INFERRED]
  README.md → docs/superpowers/plans/2026-06-11-vibe-pet-voice-agent.md
- `Vibe Space App Shell (index.html)` --references--> `Wall to Space Rename`  [INFERRED]
  index.html → docs/superpowers/specs/2026-06-13-vibe-space-v1-migration-design.md
- `App-State Context Registry` --semantically_similar_to--> `Vibe Command Registry`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-06-12-vibe-agent-harness.md → docs/superpowers/plans/2026-06-11-vibe-pet-voice-agent.md
- `Clerk publicMetadata.tier Claim` --semantically_similar_to--> `Clerk-to-Supabase Token Bridge`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-06-15-vibe-space-tiers-1-foundation.md → docs/superpowers/plans/2026-06-15-teams-collab-plan-1-foundation.md
- `Desktop-Software Design Guardrails` --semantically_similar_to--> `Solar-System Teams View`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-06-03-canvas-tools-redesign-design.md → docs/superpowers/specs/2026-06-15-vibe-space-teams-collab-design.md

## Import Cycles
- 1-file cycle: `src-tauri/src/pty/registry.rs -> src-tauri/src/pty/registry.rs`
- 1-file cycle: `src-tauri/src/browser/read.rs -> src-tauri/src/browser/read.rs`
- 1-file cycle: `src-tauri/src/store/atomic.rs -> src-tauri/src/store/atomic.rs`
- 1-file cycle: `src-tauri/src/store/paths.rs -> src-tauri/src/store/paths.rs`

## Hyperedges (group relationships)
- **Vibe Voice Agent Pipeline (wake to speak)** — plans_2026_06_11_vibe_pet_voice_agent_voice_pipeline, plans_2026_06_11_vibe_pet_voice_agent_groq_client, plans_2026_06_11_vibe_pet_voice_agent_agent_loop, plans_2026_06_11_vibe_pet_voice_agent_command_registry [EXTRACTED 0.90]
- **Teams Collaboration Workstream (Plans 1-5)** — plans_2026_06_15_teams_collab_plan_1_foundation_org_schema, plans_2026_06_15_teams_collab_plan_2_orgs_membership_org_store, plans_2026_06_15_teams_collab_plan_3_view_shell_teams_view, plans_2026_06_15_teams_collab_plan_4_presence_solar_system_solar_system_view, plans_2026_06_15_teams_collab_plan_5_publish_sync_space_sync [EXTRACTED 0.90]
- **Shared Space Publish/Open/Sync Loop** — plans_2026_06_15_teams_collab_plan_5_publish_sync_space_sync, plans_2026_06_15_teams_collab_plan_5_publish_sync_projects_panel, plans_2026_06_15_teams_collab_plan_5_publish_sync_last_write_wins, plans_2026_06_15_teams_collab_plan_1_foundation_storage_buckets [EXTRACTED 0.85]
- **Vibe Voice Agent Pipeline** — specs_2026_06_11_vibe_pet_voice_agent_design_wake_word_vosk, specs_2026_06_11_vibe_pet_voice_agent_design_voice_pipeline, specs_2026_06_11_vibe_pet_voice_agent_design_groq_brain, specs_2026_06_11_vibe_pet_voice_agent_design_command_registry, specs_2026_06_11_vibe_pet_voice_agent_design_agent_loop [EXTRACTED 1.00]
- **Teams Collaboration Supabase Stack** — specs_2026_06_15_vibe_space_teams_collab_design_clerk_third_party_auth, specs_2026_06_15_vibe_space_teams_collab_design_org_data_model, specs_2026_06_15_vibe_space_teams_collab_design_rls, specs_2026_06_15_vibe_space_teams_collab_design_presence [EXTRACTED 0.95]
- **Performance Overhaul Five Fixes** — specs_2026_06_10_perf_overhaul_design_imperative_world_space_overlay, specs_2026_06_10_perf_overhaul_design_gesture_local_drag, specs_2026_06_10_perf_overhaul_design_webgl_terminal_renderer, specs_2026_06_10_perf_overhaul_design_binary_pty_transport, specs_2026_06_10_perf_overhaul_design_throttled_thumbnails [EXTRACTED 1.00]

## Communities (75 total, 7 thin omitted)

### Community 0 - "Browser Client + Agent Names"
Cohesion: 0.05
Nodes (62): browserBack(), browserNavigate(), browserRead(), BrowserRect, browserSetVisible(), loadPresets(), saveThumbnail(), AGENT_NAMES (+54 more)

### Community 1 - "Settings + App Shell"
Cohesion: 0.05
Nodes (65): clerkAppearance, DEFAULT_SETTINGS, isBackground(), isRecord(), mergeSettings(), num(), Settings, SettingsStore (+57 more)

### Community 2 - "Vibe Agent Loop + Commands"
Cohesion: 0.09
Nodes (34): AgentOptions, AgentResult, ASK_USER, ChatFn, runAgent(), systemPrompt(), _clearRegistryForTests(), getToolDefs() (+26 more)

### Community 3 - "Rust Atomic Store"
Cohesion: 0.14
Nodes (39): write_atomic(), writes_and_overwrites_atomically(), import_background(), base(), index_load(), index_save(), presets_load(), presets_save() (+31 more)

### Community 4 - "PTY Client + Agent Status"
Cohesion: 0.10
Nodes (32): exitChannel(), killPty(), onPtyExit(), resizePty(), spawnPty(), toBytes(), writePty(), Activity (+24 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.05
Nodes (39): dependencies, @clerk/clerk-react, @excalidraw/excalidraw, @fontsource/geist, @fontsource/geist-mono, @fontsource/instrument-serif, @picovoice/web-voice-processor, react (+31 more)

### Community 6 - "Teams Collab Plans"
Cohesion: 0.07
Nodes (34): Settings Modal (sidebar + panes), Clerk-to-Supabase Token Bridge, Org/Member/Invite/Space Schema, RLS Policies + SECURITY DEFINER Helpers, Org Storage Buckets + Membership Policies, Supabase Client Factory, canUseTeams Entitlement, Claim Invites on Sign-In (+26 more)

### Community 7 - "Rust PTY Actor"
Cohesion: 0.10
Nodes (27): drain_pending(), drain_pending_stops_at_the_batch_cap(), exit_channel(), spawn(), SpawnConfig, pty_kill(), pty_resize(), pty_spawn() (+19 more)

### Community 8 - "Canvas/Tools + Teams Specs"
Cohesion: 0.09
Nodes (27): quansynd.com/join Landing Page, Custom Canvas & Tools Redesign, Desktop-Software Design Guardrails, Excalidraw Scoped CSS Skin Layer, Glass Tools Island, ToolsIsland Component, Launch Presets, Settings Panel (+19 more)

### Community 9 - "Tauri Config"
Cohesion: 0.08
Nodes (24): app, security, windows, enable, scope, build, beforeBuildCommand, beforeDevCommand (+16 more)

### Community 10 - "Rust Browser/PTY Registry"
Cohesion: 0.14
Nodes (16): BrowserState, execute_script(), HashMap, Mutex, dummy_handle(), insert_remove_roundtrip(), PtyCommand, PtyHandle (+8 more)

### Community 11 - "Rust Browser Commands"
Cohesion: 0.27
Nodes (21): browser_back(), browser_close(), browser_navigate(), browser_open(), browser_read(), browser_reload(), browser_set_rect(), browser_set_visible() (+13 more)

### Community 12 - "Voice Agent + Browser Specs"
Cohesion: 0.10
Nodes (23): Vibe Space App Shell (index.html), Agent Loop, Command Registry, Groq Free-Tier Brain (whisper + llama), VibePet UI, Vibe Pet Global Voice Agent, Voice Pipeline, Vosk Wake-Word Detection (+15 more)

### Community 13 - "Realtime Presence"
Cohesion: 0.14
Nodes (18): attachActivityListeners(), detachActivityListeners(), joinOrgPresence(), lastActivity, leavePresence(), onVisibility(), PresenceStore, retrack() (+10 more)

### Community 14 - "Supabase Client + Clerk Token"
Cohesion: 0.12
Nodes (16): ClerkWindow, getClerkToken(), W, supabase, CompositeTypes, Constants, Database, DatabaseWithoutInternals (+8 more)

### Community 15 - "Voice Pipeline + Groq Plans"
Cohesion: 0.13
Nodes (20): Settings Model with Forward-Compatible Merge, settingsStore (zustand load/save), LLM Agent Loop (tool-calling), Vibe Command Registry, Groq STT + Chat Client, RMS Silence Detector (endpointing), Porcupine Voice Pipeline, WAV Encoder for Mic Frames (+12 more)

### Community 16 - "Settings Modal Panes"
Cohesion: 0.13
Nodes (15): AgentsPane(), APP_SECTIONS, BackgroundPicker(), CanvasPane(), CARD_EMOJI, Section, SPACE_ONLY, TEAM_SECTIONS (+7 more)

### Community 17 - "Canvas Tool Icons"
Cohesion: 0.10
Nodes (10): ChevronUpIcon(), EllipseIcon(), GlobeIcon(), ImageIcon(), MoreIcon(), PaletteIcon(), PlusIcon(), RectangleIcon() (+2 more)

### Community 18 - "TypeScript Config (app)"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 19 - "Silence Detector + WAV"
Cohesion: 0.17
Nodes (12): createSilenceDetector(), SilenceDetectorOptions, SilenceState, frame(), loud(), noise(), plain(), quiet() (+4 more)

### Community 20 - "Org Store + Identity"
Cohesion: 0.20
Nodes (9): ClerkUser, ClerkWindow, currentProfile(), openableSpaceFor(), Invite, Member, Org, OrgStore (+1 more)

### Community 21 - "Desktop Schema (defs)"
Cohesion: 0.13
Nodes (14): anyOf, anyOf, description, definitions, Application, Target, Value, description (+6 more)

### Community 22 - "Windows Schema (defs)"
Cohesion: 0.13
Nodes (14): anyOf, anyOf, description, definitions, Application, Target, Value, description (+6 more)

### Community 23 - "Entitlements + Teams Bootstrap"
Cohesion: 0.27
Nodes (10): coerceTier(), Entitlements, entitlementsFor(), Tier, TIERS, useEntitlements(), TeamsBootstrap(), useClaimInvites() (+2 more)

### Community 24 - "Teams View + Settings Panes"
Cohesion: 0.23
Nodes (13): MembersPane(), MyCardPane(), OrganizationPane(), ProjectsPane(), SettingsModal(), currentUserId(), useOrgStore, usePresenceStore (+5 more)

### Community 25 - "Perf Overhaul + Browser Specs"
Cohesion: 0.15
Nodes (14): Agent Card Polish (cnvs-inspired), Binary Coalesced PTY Transport, Gesture-Local Drag/Resize, Imperative World-Space Overlay, Performance Overhaul + Agent Card Polish, Throttled Thumbnail Export, WebGL Terminal Renderer, Rust browser Module (+6 more)

### Community 26 - "Browser OAuth Sign-In"
Cohesion: 0.21
Nodes (7): buildSignInUrl(), OauthCallback, SetActive, signInWithProvider(), TicketSignIn, LoginPage(), Mode

### Community 27 - "Vibe Pet Positioning"
Cohesion: 0.33
Nodes (10): clampPosition(), defaultVibePosition(), loadVibePosition(), saveVibePosition(), VibePosition, positionTransform(), readInitialPosition(), VibeMascot (+2 more)

### Community 28 - "Groq Proxy Edge Function"
Cohesion: 0.29
Nodes (6): CORS, ROUTES, supabase, checkRequest(), overQuota(), Rejection

### Community 29 - "Perf/Grid Layout Plans"
Cohesion: 0.20
Nodes (10): Agent Name Picker, Gesture-Local Drag/Resize with Single Commit, layerTransform Camera Helper, World-Space Terminal Overlay Layer, Embedded Browser Card, Card Store (terminal/browser union), Native Child WebView2 (Rust), Page Reading via ExecuteScript (+2 more)

### Community 30 - "Desktop Schema (permissions)"
Cohesion: 0.20
Nodes (10): $ref, description, items, type, uniqueItems, description, items, type (+2 more)

### Community 31 - "Desktop Schema (webviews)"
Cohesion: 0.20
Nodes (10): type, webviews, windows, items, description, items, type, description (+2 more)

### Community 32 - "Windows Schema (permissions)"
Cohesion: 0.20
Nodes (10): $ref, description, items, type, uniqueItems, description, items, type (+2 more)

### Community 33 - "Windows Schema (webviews)"
Cohesion: 0.20
Nodes (10): type, webviews, windows, items, description, items, type, description (+2 more)

### Community 34 - "Clerk Ticket Edge Function"
Cohesion: 0.42
Nodes (5): JWKS, ALLOWED_ORIGINS, corsAllowOrigin(), corsHeaders(), parseBearer()

### Community 35 - "Desktop Schema (identifier)"
Cohesion: 0.22
Nodes (9): properties, Identifier, description, oneOf, type, identifier, remote, anyOf (+1 more)

### Community 36 - "Windows Schema (identifier)"
Cohesion: 0.22
Nodes (9): properties, Identifier, description, oneOf, type, identifier, remote, anyOf (+1 more)

### Community 37 - "Rust OAuth Loopback"
Cohesion: 0.36
Nodes (8): OauthCallback, percent_decode(), query_param(), start_oauth_loopback(), AppHandle, Option, Result, String

### Community 38 - "Desktop Schema (capability remote)"
Cohesion: 0.25
Nodes (8): description, properties, required, type, CapabilityRemote, urls, description, type

### Community 39 - "Windows Schema (capability remote)"
Cohesion: 0.25
Nodes (8): description, properties, required, type, CapabilityRemote, urls, description, type

### Community 40 - "Theme Accents"
Cohesion: 0.36
Nodes (6): accentForBackground(), applyAccent(), isThemeActive(), onAccentText(), Theme, THEMES

### Community 41 - "TypeScript Config (node)"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 42 - "Account Profile Providers"
Cohesion: 0.48
Nodes (5): connectedProviders(), KNOWN, memberSince(), providerLabel(), AccountPane()

### Community 43 - "Org Invites Pane"
Cohesion: 0.43
Nodes (5): InvitesPane(), isValidEmail(), OrgLike, resolveCurrentOrg(), orgs

### Community 44 - "Orbit Layout Math"
Cohesion: 0.38
Nodes (4): OrbitPos, orbitPositions(), RING_CAPACITY, RING_FRACTION

### Community 45 - "Tools Island Definitions"
Cohesion: 0.48
Nodes (4): TOOL_ICONS, ToolDef, TOOLS, ToolsIsland()

### Community 46 - "Capabilities Default"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 47 - "Deep-Link Join URL"
Cohesion: 0.53
Nodes (3): parseJoinUrl(), joinNow(), openTeams()

### Community 48 - "Canvas Engine Plan"
Cohesion: 0.50
Nodes (4): Embedded Excalidraw Canvas Engine, Excalidraw Skin CSS (scoped reskin), Tools Island (glass drawing toolbar), tools.ts Tool Definitions

### Community 49 - "Vibe Pet Voice Plan"
Cohesion: 0.50
Nodes (4): Vibe Pet Mascot UI, Hosted Groq Gateway with Daily Allowance, Vibe Voice Companion, Vosk Offline Wake Word

### Community 50 - "Desktop Schema (capability)"
Cohesion: 0.50
Nodes (4): description, required, type, Capability

### Community 51 - "Desktop Schema (default A)"
Cohesion: 0.50
Nodes (4): default, description, type, description

### Community 52 - "Desktop Schema (default B)"
Cohesion: 0.50
Nodes (4): default, description, type, local

### Community 53 - "Windows Schema (capability)"
Cohesion: 0.50
Nodes (4): description, required, type, Capability

### Community 54 - "Windows Schema (default A)"
Cohesion: 0.50
Nodes (4): default, description, type, description

### Community 55 - "Windows Schema (default B)"
Cohesion: 0.50
Nodes (4): default, description, type, local

### Community 56 - "Desktop Schema (number)"
Cohesion: 0.67
Nodes (3): Number, anyOf, description

### Community 57 - "Desktop Schema (permission entry)"
Cohesion: 0.67
Nodes (3): PermissionEntry, anyOf, description

### Community 58 - "Windows Schema (number)"
Cohesion: 0.67
Nodes (3): Number, anyOf, description

### Community 59 - "Windows Schema (permission entry)"
Cohesion: 0.67
Nodes (3): PermissionEntry, anyOf, description

## Knowledge Gaps
- **318 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+313 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useSettingsStore` connect `Settings Modal Panes` to `Browser Client + Agent Names`, `Settings + App Shell`, `Vibe Agent Loop + Commands`, `PTY Client + Agent Status`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `useOrgStore` connect `Teams View + Settings Panes` to `Browser Client + Agent Names`, `Org Invites Pane`, `Deep-Link Join URL`, `Settings Modal Panes`, `Org Store + Identity`, `Entitlements + Teams Bootstrap`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `properties` connect `Windows Schema (identifier)` to `Windows Schema (permissions)`, `Windows Schema (webviews)`, `Windows Schema (capability)`, `Windows Schema (default A)`, `Windows Schema (default B)`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _321 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Browser Client + Agent Names` be split into smaller, more focused modules?**
  _Cohesion score 0.051535087719298246 - nodes in this community are weakly interconnected._
- **Should `Settings + App Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.05005107252298264 - nodes in this community are weakly interconnected._
- **Should `Vibe Agent Loop + Commands` be split into smaller, more focused modules?**
  _Cohesion score 0.0861952861952862 - nodes in this community are weakly interconnected._