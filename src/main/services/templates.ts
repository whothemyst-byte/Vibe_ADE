import type { WorkspaceTemplate } from '@shared/types';

export const DEFAULT_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'node-project',
    name: 'Node Project',
    description: 'Initialize npm project and install TypeScript tooling.',
    shell: 'powershell',
    commands: [
      "npm init -y",
      "npm install -D typescript ts-node @types/node",
      "npx tsc --init"
    ]
  },
  {
    id: 'python-ai-starter',
    name: 'Python AI Starter',
    description: 'Create venv and base AI dependencies.',
    shell: 'powershell',
    commands: [
      "python -m venv .venv",
      ".\\.venv\\Scripts\\Activate.ps1; python -m pip install --upgrade pip",
      ".\\.venv\\Scripts\\Activate.ps1; pip install openai langchain"
    ]
  },
  {
    id: 'react-app',
    name: 'React App',
    description: 'Scaffold a React + TypeScript app with Vite.',
    shell: 'powershell',
    commands: [
      "npm create vite@latest . -- --template react-ts",
      "npm install"
    ]
  },
  {
    id: 'automation-workspace',
    name: 'Automation Workspace',
    description: 'Initialize scripts folder and automation dependencies.',
    shell: 'powershell',
    commands: [
      "New-Item -ItemType Directory -Path scripts -Force",
      "npm init -y",
      "npm install zx dotenv"
    ]
  }
];