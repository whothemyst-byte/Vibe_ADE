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
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, minHeight: 520 }}>
      <aside style={{ border: '1px solid rgba(0,0,0,0.10)', borderRadius: 12, padding: 10, overflow: 'auto' }}>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>AGENTS</div>
        {agents.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.8 }}>Waiting for agent output…</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {agents.map((a) => (
              <button
                key={a.agentId}
                onClick={() => setSelectedAgentId(a.agentId)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.10)',
                  background: a.agentId === selectedAgentId ? 'rgba(59,130,246,0.10)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <code>{a.agentId}</code>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>{a.role}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{a.lineCount} lines</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section style={{ border: '1px solid rgba(0,0,0,0.10)', borderRadius: 12, padding: 10, display: 'grid', gridTemplateRows: 'auto 1fr' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>TERMINAL OUTPUT</div>
          <button
            onClick={() => {
              shouldStickToBottomRef.current = true;
              const host = scrollRef.current;
              if (host) host.scrollTop = host.scrollHeight;
            }}
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
          style={{
            overflow: 'auto',
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 10,
            padding: 10,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace',
            fontSize: 12,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap'
          }}
        >
          {!selectedAgentId ? (
            <div style={{ opacity: 0.75 }}>Select an agent to view output.</div>
          ) : !selected ? (
            <div style={{ opacity: 0.75 }}>No output yet.</div>
          ) : (
            selected.lines.join('\n')
          )}
        </div>
      </section>
    </div>
  );
}

