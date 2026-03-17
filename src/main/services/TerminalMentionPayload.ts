import fs from 'node:fs/promises';
import path from 'node:path';

export type MentionEntry = Readonly<{
  name: string;
  path: string;
  type: 'file' | 'dir';
}>;

export type MentionTreeOptions = Readonly<{
  maxDepth: number;
  maxEntries: number;
  maxLines: number;
}>;

export type MentionKeyFilesOptions = Readonly<{
  maxFiles: number;
  maxCharsPerFile: number;
}>;

export type MentionPayloadOptions = Readonly<{
  tree: MentionTreeOptions;
  keyFiles: MentionKeyFilesOptions;
  maxTotalChars: number;
}>;

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  '.cache',
  'target',
  '.idea',
  '.vscode'
]);

export async function listDirectoryEntries(directory: string): Promise<MentionEntry[]> {
  const items = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  return items
    .filter((item) => item.name !== '.' && item.name !== '..')
    .map((item) => {
      const type: MentionEntry['type'] = item.isDirectory() ? 'dir' : 'file';
      return { name: item.name, path: path.join(directory, item.name), type };
    });
}

export async function buildMentionPayload(
  workspaceRootDir: string,
  targetPath: string,
  options: MentionPayloadOptions
): Promise<string> {
  const stat = await fs.stat(targetPath).catch(() => null);
  if (!stat) {
    return `[mention] Path not found: ${targetPath}`;
  }

  const relTarget = toRel(workspaceRootDir, targetPath);
  const header = `[mention: ${relTarget}]`;

  if (stat.isFile()) {
    const excerpt = await readFileExcerpt(targetPath, options.keyFiles.maxCharsPerFile);
    return boundTotal(`${header}\n\n${formatFileExcerpt(relTarget, excerpt)}\n\n[/mention]\n`, options.maxTotalChars);
  }

  if (!stat.isDirectory()) {
    return boundTotal(`${header}\n\n[unsupported path type]\n\n[/mention]\n`, options.maxTotalChars);
  }

  const tree = await renderTree(workspaceRootDir, targetPath, options.tree);
  const keyFilePaths = await pickKeyFiles(targetPath, options.keyFiles.maxFiles, options.tree.maxEntries);
  const excerpts: string[] = [];

  for (const filePath of keyFilePaths) {
    const rel = toRel(workspaceRootDir, filePath);
    const excerpt = await readFileExcerpt(filePath, options.keyFiles.maxCharsPerFile);
    if (!excerpt.trim()) continue;
    excerpts.push(formatFileExcerpt(rel, excerpt));
  }

  const parts = [
    header,
    '',
    'TREE:',
    tree.trimEnd(),
    '',
    excerpts.length > 0 ? `KEY FILE EXCERPTS (top ${excerpts.length}):` : 'KEY FILE EXCERPTS: (none found)',
    excerpts.join('\n\n'),
    '',
    '[/mention]',
    ''
  ];

  return boundTotal(parts.join('\n'), options.maxTotalChars);
}

function toRel(root: string, abs: string): string {
  const rel = path.relative(root, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
}

async function renderTree(rootDir: string, startDir: string, options: MentionTreeOptions): Promise<string> {
  const lines: string[] = [];
  const baseRel = toRel(rootDir, startDir);
  lines.push(baseRel || '.');

  let entries = 0;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > options.maxDepth) return;
    if (entries >= options.maxEntries) return;
    if (lines.length >= options.maxLines) return;

    const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const sorted = items.sort((a, b) => a.name.localeCompare(b.name));

    for (const item of sorted) {
      if (entries >= options.maxEntries || lines.length >= options.maxLines) {
        lines.push(`${'  '.repeat(depth)}… (truncated)`);
        return;
      }
      if (item.isDirectory() && DEFAULT_IGNORED_DIRS.has(item.name)) {
        continue;
      }

      entries += 1;
      const suffix = item.isDirectory() ? '/' : '';
      lines.push(`${'  '.repeat(depth)}- ${item.name}${suffix}`);

      if (item.isDirectory()) {
        await walk(path.join(dir, item.name), depth + 1);
      }
    }
  };

  await walk(startDir, 1);
  return lines.join('\n');
}

async function pickKeyFiles(dir: string, maxFiles: number, maxEntries: number): Promise<string[]> {
  const candidates: string[] = [];
  let entries = 0;

  const walk = async (current: string, depth: number): Promise<void> => {
    if (depth > 3) return;
    if (entries >= maxEntries) return;
    const items = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      if (entries >= maxEntries) return;
      if (item.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(item.name)) continue;
        entries += 1;
        await walk(path.join(current, item.name), depth + 1);
        continue;
      }
      entries += 1;
      const filePath = path.join(current, item.name);
      if (isLikelyTextFile(item.name)) {
        candidates.push(filePath);
      }
    }
  };

  await walk(dir, 0);

  const scored = candidates
    .map((filePath) => ({ filePath, score: scoreKeyFile(path.basename(filePath)) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));

  const picked: string[] = [];
  for (const row of scored) {
    if (picked.length >= maxFiles) break;
    picked.push(row.filePath);
  }
  return picked;
}

function isLikelyTextFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.ico')) return false;
  if (lower.endsWith('.zip') || lower.endsWith('.7z') || lower.endsWith('.rar')) return false;
  if (lower.endsWith('.exe') || lower.endsWith('.dll') || lower.endsWith('.pdb')) return false;
  if (lower.endsWith('.pdf') || lower.endsWith('.mp3') || lower.endsWith('.wav')) return false;
  return true;
}

function scoreKeyFile(baseName: string): number {
  const name = baseName.toLowerCase();
  if (name === 'readme.md' || name === 'readme') return 1000;
  if (name === 'package.json') return 900;
  if (name === 'tsconfig.json' || name.startsWith('tsconfig.')) return 820;
  if (name.startsWith('vite.config.')) return 810;
  if (name.startsWith('next.config.')) return 810;
  if (name === 'eslint.config.js' || name === '.eslintrc' || name.startsWith('.eslintrc.')) return 780;
  if (name.startsWith('tailwind.config.')) return 770;
  if (name === 'postcss.config.js') return 760;
  if (name === 'electron.vite.config.ts' || name === 'electron.vite.config.js') return 750;
  if (name === 'vitest.config.ts' || name === 'vitest.config.js') return 740;
  if (name === '.env.example') return 730;
  if (name === 'cargo.toml') return 900;
  if (name === 'pyproject.toml' || name === 'requirements.txt') return 820;

  if (name === 'index.ts' || name === 'index.tsx' || name === 'main.ts' || name === 'main.tsx' || name === 'app.tsx') return 650;
  if (name.endsWith('.md')) return 400;
  if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) return 300;
  if (name.endsWith('.json') || name.endsWith('.yml') || name.endsWith('.yaml') || name.endsWith('.toml')) return 260;
  return 0;
}

async function readFileExcerpt(filePath: string, maxChars: number): Promise<string> {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!raw) return '';
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.length <= maxChars) return normalized.trimEnd();
  return `${normalized.slice(0, maxChars).trimEnd()}\n… (truncated)`;
}

function formatFileExcerpt(relPath: string, excerpt: string): string {
  return `--- ${relPath} ---\n${excerpt.trimEnd()}`;
}

function boundTotal(text: string, maxTotalChars: number): string {
  if (text.length <= maxTotalChars) return text;
  return `${text.slice(0, Math.max(0, maxTotalChars - 32)).trimEnd()}\n… (truncated overall)`;
}

