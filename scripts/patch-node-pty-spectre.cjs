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
  let patched = original;
  let changed = false;

  if (patched.includes("'SpectreMitigation': 'Spectre'")) {
    patched = patched.replace(/\s*'SpectreMitigation': 'Spectre',?\r?\n/g, '\n');
    changed = true;
  }

  // Windows: CWD is not searched for executables; .bat files need .\ prefix.
  const batPatches = [
    [/cd shared && GetCommitHash\.bat/g, 'cd shared && .\\\\GetCommitHash.bat'],
    [/cd shared && UpdateGenVersion\.bat/g, 'cd shared && .\\\\UpdateGenVersion.bat'],
  ];
  for (const [from, to] of batPatches) {
    if (from.test(patched)) {
      patched = patched.replace(from, to);
      changed = true;
    }
  }

  if (!changed) {
    console.log(`[patch-node-pty-spectre] already patched: ${path.basename(filePath)}`);
    return;
  }

  fs.writeFileSync(filePath, patched, 'utf8');
  console.log(`[patch-node-pty-spectre] patched: ${path.basename(filePath)}`);
}

for (const filePath of files) {
  patchFile(filePath);
}