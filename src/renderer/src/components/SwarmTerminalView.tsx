import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type AgentRole = 'coordinator' | 'builder' | 'scout' | 'reviewer';

type AgentOutputSnapshot = {
  agentId: string;
  role: AgentRole;
  lines: string[];
};

type LiveAgentOutput = {
  swarmId: string;
  agentId: string;
  role: AgentRole | string;
  data: string;
  timestamp: number;
};

function coerceSnapshot(value: unknown): AgentOutputSnapshot[] {
  if (!Array.isArray(value)) return [];
  const rows: AgentOutputSnapshot[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.agentId !== 'string') continue;
    const role = (typeof obj.role === 'string' ? obj.role : 'builder') as AgentRole;
    const lines = Array.isArray(obj.lines) ? obj.lines.filter((l): l is string => typeof l === 'string') : [];
    rows.push({ agentId: obj.agentId, role, lines });
  }
  return rows;
}

export function SwarmAgentTerminalView(props: { swarmId: string }): JSX.Element {
  const { swarmId } = props;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Map<string, { role: AgentRole; lines: string[] }>>(new Map());

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const seed = useCallback(async () => {
    try {
      const snapshot = coerceSnapshot(await window.vibeAde.swarm.agentOutput(swarmId, 250));
      const next = new Map<string, { role: AgentRole; lines: string[] }>();
      for (const row of snapshot) {
        next.set(row.agentId, { role: row.role, lines: row.lines.slice(-250) });
      }
      setBuffers(next);
      if (!selectedAgentId && snapshot.length > 0) {
        setSelectedAgentId(snapshot[0]!.agentId);
      }
    } catch {
      // best-effort only
    }
  }, [selectedAgentId, swarmId]);

  useEffect(() => {
    void seed();
  }, [seed]);

  useEffect(() => {
    const onOutput = (event: Event) => {
      const detail = (event as CustomEvent).detail as LiveAgentOutput | undefined;
      if (!detail || detail.swarmId !== swarmId) return;
      const agentId = detail.agentId;
      const role = (detail.role as AgentRole) ?? 'builder';
      const newLines = String(detail.data ?? '')
        .split('\n')
        .map((l) => l.replace(/\s+$/g, ''))
        .filter(Boolean);
      if (newLines.length === 0) return;

      setBuffers((prev) => {
        const next = new Map(prev);
        const existing = next.get(agentId) ?? { role, lines: [] as string[] };
        const merged = [...existing.lines, ...newLines].slice(-2000);
        next.set(agentId, { role: existing.role ?? role, lines: merged });
        return next;
      });
    };

    window.addEventListener('vibe:swarm-agent-output', onOutput as EventListener);
    return () => window.removeEventListener('vibe:swarm-agent-output', onOutput as EventListener);
  }, [swarmId]);

  const agents = useMemo(() => {
    const list = Array.from(buffers.entries()).map(([agentId, b]) => ({ agentId, role: b.role, lineCount: b.lines.length }));
    list.sort((a, b) => a.agentId.localeCompare(b.agentId));
    return list;
  }, [buffers]);

  const selected = useMemo(() => {
    if (!selectedAgentId) return null;
    return buffers.get(selectedAgentId) ?? null;
  }, [buffers, selectedAgentId]);

  // Auto-stick to bottom when user hasn't scrolled up.
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    if (!shouldStickToBottomRef.current) return;
    host.scrollTop = host.scrollHeight;
  }, [selectedAgentId, selected?.lines.length]);

  return (
    <div className="grid grid-cols-[260px_1fr] gap-3 min-h-[520px]">
      <aside className="premium-card overflow-auto p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-2 px-1">
          Agents
        </div>
        {agents.length === 0 ? (
          <div className="text-xs text-fg-muted px-1">Waiting for agent output…</div>
        ) : (
          <div className="grid gap-1.5">
            {agents.map((a) => {
              const active = a.agentId === selectedAgentId;
              return (
                <button
                  key={a.agentId}
                  onClick={() => setSelectedAgentId(a.agentId)}
                  className={
                    active
                      ? 'text-left px-2.5 py-2 rounded-lg border border-primary/40 bg-primary/10 transition-colors'
                      : 'text-left px-2.5 py-2 rounded-lg border border-line bg-bg-panel-2/40 hover:border-line-strong hover:bg-bg-panel-2 transition-colors'
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-[11px] text-fg truncate">{a.agentId}</code>
                    <span className="text-[10px] uppercase tracking-wider text-fg-muted">{a.role}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-fg-muted">{a.lineCount} lines</div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <section className="premium-card p-3 grid grid-rows-[auto_1fr]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">
            Terminal Output
          </div>
          <button
            onClick={() => {
              shouldStickToBottomRef.current = true;
              const host = scrollRef.current;
              if (host) host.scrollTop = host.scrollHeight;
            }}
            className="h-7 px-2.5 text-[11px] font-medium rounded-md bg-bg-panel-2 text-fg-muted hover:text-fg hover:bg-bg-elev border border-line transition-colors"
          >
            Stick to bottom
          </button>
        </div>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
            shouldStickToBottomRef.current = atBottom;
          }}
          className="overflow-auto bg-bg-page/60 border border-line rounded-lg p-3 font-mono text-[11px] leading-[1.45] whitespace-pre-wrap text-fg"
        >
          {!selectedAgentId ? (
            <div className="text-fg-muted">Select an agent to view output.</div>
          ) : !selected ? (
            <div className="text-fg-muted">No output yet.</div>
          ) : (
            selected.lines.join('\n')
          )}
        </div>
      </section>
    </div>
  );
}

