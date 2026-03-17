import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMentionPayload, listDirectoryEntries } from '../../src/main/services/TerminalMentionPayload';

describe('TerminalMentionPayload', () => {
  it('lists directory entries with type and path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-mention-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'README.md'), '# Hello\n', 'utf8');

    const entries = await listDirectoryEntries(root);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['README.md', 'src']);
    expect(entries.find((e) => e.name === 'src')?.type).toBe('dir');
    expect(entries.find((e) => e.name === 'README.md')?.type).toBe('file');
  });

  it('builds directory payload with tree and key file excerpts (bounded)', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-mention-'));
    await mkdir(path.join(root, 'src'));
    await mkdir(path.join(root, 'node_modules'));

    await writeFile(path.join(root, 'README.md'), '# Project\n\nSome readme text.\n', 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2), 'utf8');
    await writeFile(path.join(root, 'src', 'index.ts'), 'export const hello = "world";\n', 'utf8');
    await writeFile(path.join(root, 'node_modules', 'ignored.txt'), 'should not appear\n', 'utf8');

    const payload = await buildMentionPayload(root, root, {
      tree: { maxDepth: 4, maxEntries: 200, maxLines: 200 },
      keyFiles: { maxFiles: 4, maxCharsPerFile: 4000 },
      maxTotalChars: 10_000
    });

    expect(payload).toContain('TREE:');
    expect(payload).toContain('- src/');
    expect(payload).not.toContain('node_modules');
    expect(payload).toContain('KEY FILE EXCERPTS');
    expect(payload).toContain('--- README.md ---');
    expect(payload).toContain('--- package.json ---');
  });

  it('truncates overall payload when maxTotalChars is small', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-mention-'));
    await writeFile(path.join(root, 'README.md'), 'x'.repeat(10_000), 'utf8');

    const payload = await buildMentionPayload(root, root, {
      tree: { maxDepth: 2, maxEntries: 50, maxLines: 50 },
      keyFiles: { maxFiles: 1, maxCharsPerFile: 9000 },
      maxTotalChars: 600
    });

    expect(payload.length).toBeLessThanOrEqual(600);
    expect(payload).toContain('truncated overall');
  });
});

