import { useEffect, useRef, useState } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { useSettingsStore } from "./settingsStore";
import { usePresetStore } from "../wall/presetStore";
import { presetTierColor } from "../wall/presetTier";
import type { Preset } from "../wall/presets";
import { importBackground, pickBackgroundFile, savePresets } from "../store/persistence";
import type { Background } from "../store/types";
import { CloseIcon, EllipseIcon, GearIcon, GridIcon, ImageIcon, PaletteIcon, PlusIcon, RectangleIcon, SelectIcon, TeamsIcon, UserIcon } from "../wall/icons";
import { THEMES, isThemeActive } from "./themes";
import { connectedProviders, memberSince } from "../auth/profile";
import { useEntitlements } from "../entitlements";
import { useOrgStore } from "../teams/orgStore";
import { currentUserId } from "../teams/identity";
import { inviteLinkFor } from "../teams/inviteLink";
import { isValidEmail } from "../teams/orgHelpers";
import { loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";
import { publishLocalSpace, openSharedSpace, unpublishSharedSpace } from "../teams/spaceSync";
import { setPresenceManualStatus } from "../teams/presence";

type Section =
  | "account" | "agents" | "terminal" | "themes" | "canvas" | "vibe" | "about"
  | "organization" | "members" | "invites" | "projects" | "mycard";

const APP_SECTIONS: { key: Section; label: string; icon: () => React.ReactElement }[] = [
  { key: "account", label: "Account", icon: UserIcon },
  { key: "agents", label: "Agents", icon: SelectIcon },
  { key: "terminal", label: "Terminal", icon: RectangleIcon },
  { key: "themes", label: "Themes", icon: PaletteIcon },
  { key: "canvas", label: "Canvas", icon: ImageIcon },
  { key: "vibe", label: "Vibe", icon: EllipseIcon },
  { key: "about", label: "About", icon: EllipseIcon },
];

const TEAM_SECTIONS: { key: Section; label: string; icon: () => React.ReactElement }[] = [
  { key: "organization", label: "Organization", icon: TeamsIcon },
  { key: "members", label: "Members", icon: UserIcon },
  { key: "invites", label: "Invites", icon: PlusIcon },
  { key: "projects", label: "Projects", icon: GridIcon },
  { key: "mycard", label: "My Card", icon: EllipseIcon },
];

/** Space-scoped sections that only make sense with an active wall. */
const SPACE_ONLY: Section[] = ["themes", "canvas"];

const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "bin";

/** Rough relative luminance of a #rrggbb color, for picking label contrast. */
const isLightColor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
};

/** Shared color / image / video background picker row. */
function BackgroundPicker({ value, onChange }: { value: Background; onChange: (bg: Background) => void }) {
  const pick = async (kind: "image" | "video") => {
    const src = await pickBackgroundFile();
    if (!src) return;
    const dest = await importBackground(src, `${crypto.randomUUID()}.${extOf(src)}`);
    onChange({ kind, path: dest });
  };
  return (
    <div className="set-bg-picker">
      <label className="set-bg-swatch" title="Solid color">
        <input
          type="color"
          value={value.kind === "color" ? value.color : "#12110f"}
          onChange={(e) => onChange({ kind: "color", color: e.target.value })}
        />
        Color
      </label>
      <button className="set-btn" onClick={() => void pick("image")}>Image…</button>
      <button className="set-btn" onClick={() => void pick("video")}>Video…</button>
      <span className="set-hint">
        {value.kind === "color" ? value.color : `${value.kind}: …${(value.path ?? value.url ?? "").slice(-24)}`}
      </span>
    </div>
  );
}

function AccountPane() {
  const { user } = useUser();
  const clerk = useClerk();
  if (!user) return null;

  const providers = connectedProviders(user.externalAccounts);
  const email = user.primaryEmailAddress?.emailAddress ?? "—";
  const since = memberSince(user.createdAt ?? null);

  return (
    <>
      <h2 className="set-title">Account</h2>
      <p className="set-sub">You're signed in to Vibe Space.</p>
      <div className="set-row set-account">
        {user.imageUrl
          ? <img className="set-avatar" src={user.imageUrl} alt="" width={48} height={48} />
          : <span className="set-avatar set-avatar-empty" />}
        <div className="set-account-meta">
          <span className="set-account-name">{user.fullName ?? email}</span>
          <span className="set-hint">{email}</span>
          {since && <span className="set-hint">Member since {since}</span>}
        </div>
      </div>
      <div className="set-row">
        <span className="set-label">Connected accounts</span>
        <span className="set-hint">{providers.length ? providers.join(", ") : "None"}</span>
      </div>
      <div className="set-row">
        <button className="set-btn" onClick={() => clerk.openUserProfile()}>Manage account…</button>
        <button className="set-btn" onClick={() => void clerk.signOut()}>Sign out</button>
      </div>
    </>
  );
}

function AgentsPane() {
  const stored = usePresetStore((s) => s.presets);
  const [presets, setPresets] = useState<Preset[]>(stored);
  const timer = useRef<number | null>(null);

  const persist = (next: Preset[]) => {
    setPresets(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void savePresets(next).then(() => usePresetStore.getState().load());
    }, 400);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const patch = (id: string, p: Partial<Preset>) =>
    persist(presets.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <>
      <h2 className="set-title">Agents</h2>
      <p className="set-sub">Launch presets shown in the “+ Terminal” menu. The command is typed into the shell after it opens; leave it empty for a plain shell.</p>
      {presets.map((p) => (
        <div className="set-row set-preset" key={p.id}>
          <span className="terminal-status-dot" style={{ background: presetTierColor(p.id) }} />
          <input
            className="set-input"
            value={p.label}
            placeholder="Label"
            onChange={(e) => patch(p.id, { label: e.target.value })}
          />
          <input
            className="set-input set-mono"
            value={p.command ?? ""}
            placeholder="plain shell"
            onChange={(e) => patch(p.id, { command: e.target.value || undefined })}
          />
          {p.id !== "plain" && (
            <button
              className="set-icon-btn"
              title="Delete preset"
              onClick={() => persist(presets.filter((x) => x.id !== p.id))}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ))}
      <button
        className="set-btn set-add"
        onClick={() => persist([...presets, { id: crypto.randomUUID(), label: "New agent", icon: "▷", command: "" }])}
      >
        <PlusIcon /> Add preset
      </button>
    </>
  );
}

function TerminalPane() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const t = settings.terminal;
  const setTerm = (patch: Partial<typeof t>) =>
    save({ ...settings, terminal: { ...t, ...patch } });

  return (
    <>
      <h2 className="set-title">Terminal</h2>
      <p className="set-sub">Font size applies to running terminals immediately; shell and scrollback apply to newly launched ones.</p>
      <div className="set-row">
        <span className="set-label">Font size</span>
        <input
          className="set-input set-num"
          type="number" min={10} max={20}
          value={t.fontSize}
          onChange={(e) => setTerm({ fontSize: Math.min(20, Math.max(10, Number(e.target.value) || 13)) })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Scrollback lines</span>
        <input
          className="set-input set-num"
          type="number" min={500} max={50000} step={500}
          value={t.scrollback}
          onChange={(e) => setTerm({ scrollback: Math.min(50000, Math.max(500, Number(e.target.value) || 5000)) })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Shell</span>
        <input
          className="set-input set-mono"
          value={t.shell}
          onChange={(e) => setTerm({ shell: e.target.value || "powershell.exe" })}
        />
      </div>
    </>
  );
}

function VibePane() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const v = settings.vibe;
  const setVibe = (patch: Partial<typeof v>) =>
    save({ ...settings, vibe: { ...v, ...patch } });

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  return (
    <>
      <h2 className="set-title">Vibe</h2>
      <p className="set-sub">
        Voice companion. Works out of the box — speech recognition and the brain run
        through our hosted gateway with a free daily allowance. Paste your own free
        Groq API key (console.groq.com) for unlimited usage. The "Vibe" wake word
        runs fully offline. Models: GPT-OSS 120B (brain) + Whisper large-v3-turbo
        (ears).
      </p>
      <div className="set-row">
        <span className="set-label">Enable Vibe</span>
        <input
          type="checkbox"
          checked={v.enabled}
          onChange={(e) => setVibe({ enabled: e.target.checked })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Groq API key (optional)</span>
        <input
          className="set-input set-mono"
          type="password"
          value={v.groqApiKey}
          onChange={(e) => setVibe({ groqApiKey: e.target.value.trim() })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Push-to-talk hotkey</span>
        <input
          className="set-input set-mono"
          value={v.hotkey}
          onChange={(e) => setVibe({ hotkey: e.target.value || "Ctrl+Shift+V" })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Voice</span>
        <select
          className="set-input"
          value={v.voice}
          onChange={(e) => setVibe({ voice: e.target.value })}
        >
          <option value="">System default</option>
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
        <button
          className="set-btn"
          onClick={() => {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance("Hi! I'm Vibe, your voice companion.");
            const chosen = voices.find((x) => x.name === v.voice);
            if (chosen) u.voice = chosen;
            window.speechSynthesis.speak(u);
          }}
        >
          Test
        </button>
      </div>
    </>
  );
}

function ThemesPane({ background, onChangeBackground }: {
  background: Background;
  onChangeBackground: (bg: Background) => void;
}) {
  return (
    <>
      <h2 className="set-title">Themes</h2>
      <p className="set-sub">Pick a theme for this space — or craft your own below.</p>
      <div className="theme-grid">
        {THEMES.map((t) => {
          const active = isThemeActive(background, t);
          const light = t.background.kind === "color" && isLightColor(t.background.color);
          return (
            <button
              key={t.id}
              className={`theme-card${active ? " active" : ""}`}
              onClick={() => onChangeBackground(t.background)}
            >
              <span
                className="theme-preview"
                style={{ background: t.background.kind === "color" ? t.background.color : undefined }}
              >
                {t.palette.map((c) => (
                  <span key={c} className="theme-dot" style={{ background: c }} />
                ))}
              </span>
              <span
                className={`theme-meta${light ? " on-light" : ""}`}
                style={{ background: t.background.kind === "color" ? t.background.color : undefined }}
              >
                <span className="theme-name">{t.name}</span>
                <span className="theme-tagline">{t.tagline}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="set-group">
        <span className="set-label">Create your own</span>
        <BackgroundPicker value={background} onChange={onChangeBackground} />
        <span className="set-hint">A color, image, or video of your choice becomes this space’s theme.</span>
      </div>
    </>
  );
}

function CanvasPane() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  return (
    <>
      <h2 className="set-title">Canvas</h2>
      <p className="set-sub">Space-level canvas behavior. Theme the current space from the Themes tab.</p>
      <div className="set-group">
        <span className="set-label">Default background for new spaces</span>
        <BackgroundPicker
          value={settings.canvas.defaultBackground}
          onChange={(bg) => save({ ...settings, canvas: { ...settings.canvas, defaultBackground: bg } })}
        />
      </div>
    </>
  );
}

function AboutPane() {
  return (
    <>
      <h2 className="set-title">About</h2>
      <p className="set-sub">
        <strong>Vibe Space</strong> v1.0.0 — an infinite canvas for commanding a constellation of
        coding agents. Draw, plan, and run Claude Code, Codex, and friends side by side.
      </p>
      <p className="set-hint">Quansynd · built with Tauri, Excalidraw, and xterm.js</p>
    </>
  );
}

function OrganizationPane() {
  const orgs = useOrgStore((s) => s.orgs);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const members = useOrgStore((s) => s.members);
  const org = orgs.find((o) => o.id === currentOrgId) ?? null;
  const myId = currentUserId();
  const myRole = members.find((m) => m.user_id === myId)?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  if (!org) return null;
  const copy = (kind: "code" | "link", text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <>
      <h2 className="set-title">Organization</h2>
      <p className="set-sub">{members.length} {members.length === 1 ? "member" : "members"}.</p>
      <div className="set-row"><span className="set-label">Name</span><span>{org.name}</span></div>
      {isAdmin && (
        <>
          <div className="set-row">
            <span className="set-label">Join code</span>
            <button className="teams-code" onClick={() => copy("code", org.join_code)}>
              <strong>{org.join_code}</strong> {copied === "code" ? "✓" : "⧉"}
            </button>
          </div>
          <div className="set-row">
            <span className="set-label">Invite link</span>
            <button className="set-btn" onClick={() => copy("link", inviteLinkFor(org.join_code))}>
              {copied === "link" ? "Copied ✓" : "Copy invite link"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
function MembersPane() {
  const members = useOrgStore((s) => s.members);
  const orgId = useOrgStore((s) => s.currentOrgId);
  const setRole = useOrgStore((s) => s.setRole);
  const removeMember = useOrgStore((s) => s.removeMember);
  const myId = currentUserId();
  const myRole = members.find((m) => m.user_id === myId)?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  if (!orgId) return null;
  return (
    <>
      <h2 className="set-title">Members</h2>
      <p className="set-sub">Everyone in this organization.</p>
      <ul className="teams-members">
        {members.map((m) => {
          const name = m.display_name || m.user_id;
          const initial = (m.display_name || "?").trim().charAt(0).toUpperCase();
          const isMe = m.user_id === myId;
          return (
            <li key={m.user_id} className="teams-member">
              <span className="teams-avatar">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : initial}</span>
              <span className="teams-member-name">{name}{isMe && <span className="teams-you"> (you)</span>}</span>
              {isAdmin && !isMe ? (
                <select className="teams-role" value={m.role}
                  onChange={(e) => void setRole(orgId, m.user_id, e.target.value as "owner" | "admin" | "member")}>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              ) : (
                <span className="teams-role-badge">{m.role}</span>
              )}
              {isAdmin && !isMe && (
                <button className="teams-remove" title="Remove member" onClick={() => void removeMember(orgId, m.user_id)}>×</button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
function InvitesPane() {
  const orgId = useOrgStore((s) => s.currentOrgId);
  const orgs = useOrgStore((s) => s.orgs);
  const members = useOrgStore((s) => s.members);
  const invites = useOrgStore((s) => s.invites);
  const invite = useOrgStore((s) => s.invite);
  const revokeInvite = useOrgStore((s) => s.revokeInvite);
  const org = orgs.find((o) => o.id === orgId) ?? null;
  const myRole = members.find((m) => m.user_id === currentUserId())?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!orgId || !org) return null;
  if (!isAdmin) {
    return (
      <>
        <h2 className="set-title">Invites</h2>
        <p className="set-sub">Only owners and admins can invite people.</p>
      </>
    );
  }
  const valid = isValidEmail(email);
  return (
    <>
      <h2 className="set-title">Invites</h2>
      <p className="set-sub">Invite by email, or share the invite link.</p>
      <div className="set-row">
        <span className="set-label">Invite link</span>
        <button className="set-btn" onClick={() => {
          void navigator.clipboard.writeText(inviteLinkFor(org.join_code));
          setCopied(true); setTimeout(() => setCopied(false), 1500);
        }}>{copied ? "Copied ✓" : "Copy invite link"}</button>
      </div>
      <div className="teams-form-row">
        <input className="teams-input" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="teams-role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button className="teams-btn primary" disabled={busy || !valid}
          onClick={async () => { setBusy(true); try { await invite(orgId, email.trim(), role); setEmail(""); } finally { setBusy(false); } }}>
          Send
        </button>
      </div>
      {invites.length > 0 && (
        <ul className="teams-invites">
          {invites.map((inv) => (
            <li key={inv.id} className="teams-invite">
              <span className="teams-invite-email">{inv.email}</span>
              <span className="teams-role-badge">{inv.role}</span>
              <span className="teams-invite-pending">pending</span>
              <button className="teams-remove" title="Revoke invite" onClick={() => void revokeInvite(inv.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
function ProjectsPane({ onOpenWall }: { onOpenWall?: (id: string) => void }) {
  const orgId = useOrgStore((s) => s.currentOrgId);
  const members = useOrgStore((s) => s.members);
  const projects = useOrgStore((s) => s.projects);
  const loadProjects = useOrgStore((s) => s.loadProjects);
  const myId = currentUserId();
  const myRole = members.find((m) => m.user_id === myId)?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [locals, setLocals] = useState<WallMeta[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadIndex().then((idx) => setLocals(idx.filter((w) => w.sharedOrgSpaceId == null)));
  }, [projects]);

  if (!orgId) return null;
  const share = async () => {
    if (!pick) return;
    setBusy(true);
    try { await publishLocalSpace(pick, orgId); await loadProjects(orgId); setPick(""); } finally { setBusy(false); }
  };
  const open = async (id: string) => {
    setBusy(true);
    try { onOpenWall?.(await openSharedSpace(id)); } finally { setBusy(false); }
  };
  const unpublish = async (id: string) => {
    setBusy(true);
    try { await unpublishSharedSpace(id); await loadProjects(orgId); } finally { setBusy(false); }
  };
  return (
    <>
      <h2 className="set-title">Projects</h2>
      <p className="set-sub">Spaces shared to this organization.</p>
      <div className="teams-form-row">
        <select className="teams-input" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Share a space…</option>
          {locals.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="teams-btn primary" disabled={busy || !pick} onClick={() => void share()}>Share</button>
      </div>
      {projects.length === 0 ? (
        <p className="teams-placeholder">No shared projects yet. Share one of your spaces above.</p>
      ) : (
        <ul className="teams-projects">
          {projects.map((p) => (
            <li key={p.id} className="teams-project">
              <span className="teams-proj-mono">{p.name.charAt(0).toUpperCase() || "?"}</span>
              <span className="teams-proj-name">{p.name}</span>
              <button className="teams-btn" disabled={busy} onClick={() => void open(p.id)}>Open</button>
              {(isAdmin || p.owner_user_id === myId) && (
                <button className="teams-remove" title="Unpublish" disabled={busy} onClick={() => void unpublish(p.id)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
const CARD_EMOJI = ["🧠","🚀","⚡","🔥","🌟","🎧","☕","🐛","🛠️","🎯","🌙","🧪","📦","🔭","🦊","🐢","🧩","🎨","💤","🌈"];

function MyCardPane() {
  const members = useOrgStore((s) => s.members);
  const setMyCard = useOrgStore((s) => s.setMyCard);
  const me = members.find((m) => m.user_id === currentUserId());
  const [name, setName] = useState(me?.display_name ?? "");
  const [status, setStatus] = useState(me?.manual_status ?? "");
  const [emoji, setEmoji] = useState(me?.manual_status_emoji ?? "");
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const saveName = async () => {
    const display = name.trim();
    if (!display || display === me.display_name) return;
    setBusy(true); try { await setMyCard({ display_name: display }); } finally { setBusy(false); }
  };
  const saveStatus = async () => {
    setBusy(true);
    try {
      const t = status.trim() || null;
      const em = emoji.trim() || null;
      await setMyCard({ manual_status: t, manual_status_emoji: em });
      setPresenceManualStatus(t, em);
    } finally { setBusy(false); }
  };
  const pickEmoji = async (em: string) => {
    setEmoji(em);
    setBusy(true);
    try { await setMyCard({ manual_status_emoji: em }); setPresenceManualStatus(status.trim() || null, em); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h2 className="set-title">My Card</h2>
      <p className="set-sub">How you appear to teammates in the orbit.</p>
      <div className="set-row">
        <span className="set-label">Username</span>
        <input className="set-input" value={name} placeholder="what should people call you"
          onChange={(e) => setName(e.target.value)} onBlur={() => void saveName()} />
      </div>
      <div className="set-group">
        <span className="set-label">Emoji / mood</span>
        <div className="mycard-emoji">
          {CARD_EMOJI.map((em) => (
            <button key={em} className={`mycard-emoji-btn${emoji === em ? " active" : ""}`}
              disabled={busy} onClick={() => void pickEmoji(em)}>{em}</button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <span className="set-label">Status line</span>
        <input className="set-input" value={status} placeholder="shipping the thing"
          onChange={(e) => setStatus(e.target.value)} onBlur={() => void saveStatus()} />
      </div>
    </>
  );
}

export function SettingsModal({ background, onChangeBackground, onClose, initialSection, onOpenWall }: {
  background?: Background;
  onChangeBackground?: (bg: Background) => void;
  onClose: () => void;
  initialSection?: Section;
  onOpenWall?: (id: string) => void;
}) {
  const ent = useEntitlements();
  const hasOrg = useOrgStore((s) => s.currentOrgId != null);
  const showTeam = ent.canUseTeams && hasOrg;

  const sections = [
    ...APP_SECTIONS.filter((s) => background != null || !SPACE_ONLY.includes(s.key)),
    ...(showTeam ? TEAM_SECTIONS : []),
  ];
  const [section, setSection] = useState<Section>(
    initialSection && sections.some((s) => s.key === initialSection) ? initialSection : "agents",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-modal" role="dialog" aria-label="Settings">
        <aside className="settings-side">
          <span className="settings-head"><GearIcon /> Settings</span>
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`settings-item${section === key ? " active" : ""}`}
              onClick={() => setSection(key)}
            >
              <Icon /> {label}
            </button>
          ))}
        </aside>
        <section className="settings-pane">
          <button className="settings-close" title="Close" onClick={onClose}><CloseIcon /></button>
          {section === "account" && <AccountPane />}
          {section === "agents" && <AgentsPane />}
          {section === "terminal" && <TerminalPane />}
          {section === "themes" && background != null && onChangeBackground && <ThemesPane background={background} onChangeBackground={onChangeBackground} />}
          {section === "canvas" && <CanvasPane />}
          {section === "vibe" && <VibePane />}
          {section === "about" && <AboutPane />}
          {section === "organization" && <OrganizationPane />}
          {section === "members" && <MembersPane />}
          {section === "invites" && <InvitesPane />}
          {section === "projects" && <ProjectsPane onOpenWall={onOpenWall} />}
          {section === "mycard" && <MyCardPane />}
        </section>
      </div>
    </div>
  );
}
