import { describe, it, expect } from 'vitest';
import { deriveMindmap } from '../../src/renderer/src/state/slices/mindmapSlice';

describe('deriveMindmap', () => {
  it('produces task, agent, file nodes and the three edge kinds', () => {
    const tasks = [
      { id: 't1', title: 'Build login', assignedAgentIds: ['a1'] },
      { id: 't2', title: 'Style cards', assignedAgentIds: ['a1', 'a2'] }
    ];
    const agents = [
      { id: 'a1', name: 'Coder' },
      { id: 'a2', name: 'Designer' }
    ];
    const ownership = {
      byFile: { 'login.tsx': 'a1', 'cards.css': 'a2' },
      byTask: { t1: ['login.tsx'], t2: ['login.tsx', 'cards.css'] }
    };

    const { nodes, edges } = deriveMindmap(tasks as any, agents as any, ownership);

    expect(nodes.map((n) => n.id).sort()).toEqual(
      ['agent:a1', 'agent:a2', 'file:cards.css', 'file:login.tsx', 'task:t1', 'task:t2'].sort()
    );

    const edgeIds = edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(edgeIds).toContain('task:t1->agent:a1');
    expect(edgeIds).toContain('task:t2->agent:a2');
    expect(edgeIds).toContain('agent:a1->file:login.tsx');
    expect(edgeIds).toContain('agent:a2->file:cards.css');
    expect(edgeIds).toContain('task:t1->file:login.tsx');
    expect(edgeIds).toContain('task:t2->file:cards.css');
  });
});
