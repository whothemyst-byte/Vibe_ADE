const fs = require('node:fs');
const path = require('node:path');

const targetPath = path.join(process.cwd(), 'node_modules', 'node-gyp', 'lib', 'find-visualstudio.js');

function replaceOne(source, from, to, label) {
  if (!source.includes(from)) {
    return { source, changed: false, label };
  }
  return { source: source.replace(from, to), changed: true, label };
}

function patchFindVisualStudio(content) {
  const ops = [
    {
      from: 'return this.findVSFromSpecifiedLocation([2019, 2022])',
      to: 'return this.findVSFromSpecifiedLocation([2019, 2022, 2026])',
      label: 'supportedYears specified location'
    },
    {
      from: 'return this.findNewVSUsingSetupModule([2019, 2022])',
      to: 'return this.findNewVSUsingSetupModule([2019, 2022, 2026])',
      label: 'supportedYears setup module'
    },
    {
      from: 'return this.findNewVS([2019, 2022])',
      to: 'return this.findNewVS([2019, 2022, 2026])',
      label: 'supportedYears powershell query'
    },
    {
      from: "if (ret.versionMajor === 17) {\n      ret.versionYear = 2022\n      return ret\n    }",
      to: "if (ret.versionMajor === 17) {\n      ret.versionYear = 2022\n      return ret\n    }\n    if (ret.versionMajor === 18) {\n      ret.versionYear = 2026\n      return ret\n    }",
      label: 'versionMajor->versionYear mapping'
    },
    {
      from: "} else if (versionYear === 2022) {\n      return 'v143'\n    }",
      to: "} else if (versionYear === 2022) {\n      return 'v143'\n    } else if (versionYear === 2026) {\n      return 'v145'\n    }",
      label: 'toolset mapping'
    }
  ];

  let next = content;
  let changedCount = 0;
  for (const op of ops) {
    const result = replaceOne(next, op.from, op.to, op.label);
    if (result.changed) {
      changedCount += 1;
    }
    next = result.source;
  }

  return { content: next, changedCount };
}

function main() {
  if (!fs.existsSync(targetPath)) {
    console.log('[patch-node-gyp-vs2026] skipped: node-gyp file not found');
    process.exit(0);
  }

  const original = fs.readFileSync(targetPath, 'utf8');

  if (
    original.includes('[2019, 2022, 2026]') &&
    original.includes('ret.versionYear = 2026') &&
    original.includes("return 'v145'")
  ) {
    console.log('[patch-node-gyp-vs2026] already patched');
    process.exit(0);
  }

  const patched = patchFindVisualStudio(original);
  if (patched.changedCount < 5) {
    console.error('[patch-node-gyp-vs2026] patch failed: unexpected node-gyp source format');
    process.exit(1);
  }

  fs.writeFileSync(targetPath, patched.content, 'utf8');
  console.log('[patch-node-gyp-vs2026] patch applied successfully');
}

main();