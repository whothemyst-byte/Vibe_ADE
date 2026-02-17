const fs = require('node:fs');
const path = require('node:path');

const files = [
  path.join(process.cwd(), 'node_modules', 'node-pty', 'binding.gyp'),
  path.join(process.cwd(), 'node_modules', 'node-pty', 'deps', 'winpty', 'src', 'winpty.gyp')
];

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-node-pty-spectre] skipped (missing): ${filePath}`);
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  if (!original.includes("'SpectreMitigation': 'Spectre'")) {
    console.log(`[patch-node-pty-spectre] already patched: ${path.basename(filePath)}`);
    return;
  }

  const patched = original.replace(/\s*'SpectreMitigation': 'Spectre',?\r?\n/g, '\n');
  fs.writeFileSync(filePath, patched, 'utf8');
  console.log(`[patch-node-pty-spectre] patched: ${path.basename(filePath)}`);
}

for (const filePath of files) {
  patchFile(filePath);
}