/**
 * Scout prompt + parsing helpers.
 *
 * The scout produces a rigid, sectioned report that can be parsed into {@link ScoutAnalysis}
 * and fed into coordinator/builder shared context.
 */

export interface ScoutAnalysis {
  /** Key files with short purposes. */
  readonly keyFiles: readonly { file: string; purpose: string }[];
  /** Naming conventions summary. */
  readonly namingConventions: Readonly<{ functions: string; classes: string; files: string }>;
  /** Common patterns described by the scout. */
  readonly commonPatterns: readonly { name: string; description: string }[];
  /** Existing utilities enumerated by the scout. */
  readonly existingUtilities: readonly { name: string; description: string }[];
  /** Security practices described by the scout. */
  readonly securityPractices: readonly string[];
  /** Risks and gotchas described by the scout. */
  readonly risks: readonly string[];
  /** Original report text for debugging. */
  readonly raw: string;
}

/**
 * Build the Scout role prompt for codebase exploration.
 */
export function buildScoutPrompt(projectRoot: string): string {
  return `
[SYSTEM ROLE]
YOU ARE THE CODEBASE INTELLIGENCE SPECIALIST.

[YOUR JOB - BEFORE BUILDERS START]
EXPLORE THE ENTIRE CODEBASE AND CREATE A STRUCTURED INTELLIGENCE REPORT.

[EXPLORATION TASK]
1. READ src/ DIRECTORY STRUCTURE
2. IDENTIFY CODE CONVENTIONS:
   - NAMING PATTERNS (camelCase, snake_case, PascalCase)
   - FILE ORGANIZATION
   - MODULE/IMPORT PATTERNS
3. MAP EXISTING PATTERNS:
   - ERROR HANDLING APPROACH
   - AUTHENTICATION/AUTHORIZATION
   - DATABASE QUERY PATTERNS
   - API RESPONSE FORMATTING
   - VALIDATION PATTERNS
4. NOTE IMPORTANT FILES:
   - CONFIGURATION FILES
   - BASE CLASSES OR UTILITIES
   - TYPES/SCHEMAS
5. IDENTIFY RISKS:
   - SECURITY CONCERNS
   - POTENTIAL CONFLICTS
   - MISSING PATTERNS

[OUTPUT FORMAT]
GENERATE A REPORT WITH THESE SECTIONS (EXACT HEADINGS):

## KEY FILES
- <file>: <purpose>

## NAMING CONVENTIONS
- Functions: <pattern>
- Classes: <pattern>
- Files: <pattern>

## COMMON PATTERNS
1. Error Handling: <description>
2. Database Access: <description>
3. API Routes: <description>
4. Validation: <description>

## EXISTING UTILITIES
- <name>: <what it does>

## SECURITY PRACTICES
- <practice>: <how it's implemented>

## RISKS & GOTCHAS
- <risk>: <what to watch out for>

[THEN: READY FOR QUESTIONS]
AFTER YOUR REPORT, YOU WILL ANSWER BUILDER QUESTIONS USING:
@<builder-name>: <answer with code example>

[PROJECT ROOT]
${projectRoot}

START EXPLORING NOW. OUTPUT THE REPORT FIRST.
`.trim();
}

/**
 * Parse a scout report into a structured {@link ScoutAnalysis}.
 *
 * Throws a descriptive error if required sections are missing.
 */
export function parseScoutReport(output: string): ScoutAnalysis {
  const raw = output.replace(/\r\n/g, '\n').trim();
  if (!raw) {
    throw new Error('Scout report is empty.');
  }

  const sections = splitMarkdownSections(raw);

  const keyFilesText = requireSection(sections, 'KEY FILES');
  const namingText = requireSection(sections, 'NAMING CONVENTIONS');
  const patternsText = requireSection(sections, 'COMMON PATTERNS');
  const utilitiesText = requireSection(sections, 'EXISTING UTILITIES');
  const securityText = requireSection(sections, 'SECURITY PRACTICES');
  const risksText = requireSection(sections, 'RISKS & GOTCHAS');

  const keyFiles = parseKeyFiles(keyFilesText);
  const namingConventions = parseNamingConventions(namingText);
  const commonPatterns = parseCommonPatterns(patternsText);
  const existingUtilities = parseNamePurposeList(utilitiesText);
  const securityPractices = parseBullets(securityText);
  const risks = parseBullets(risksText);

  return {
    keyFiles,
    namingConventions,
    commonPatterns,
    existingUtilities,
    securityPractices,
    risks,
    raw
  };
}

function splitMarkdownSections(markdown: string): Map<string, string> {
  const lines = markdown.split('\n');
  const sections = new Map<string, string>();

  let currentKey: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentKey) return;
    sections.set(currentKey, currentLines.join('\n').trim());
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)\s*$/);
    if (heading) {
      flush();
      currentKey = heading[1]!.trim().toUpperCase();
      currentLines = [];
      continue;
    }
    if (currentKey) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

function requireSection(sections: Map<string, string>, name: string): string {
  const key = name.toUpperCase();
  const value = sections.get(key);
  if (!value) {
    throw new Error(`Scout report missing required section "## ${name}".`);
  }
  return value;
}

function parseKeyFiles(section: string): Array<{ file: string; purpose: string }> {
  const items: Array<{ file: string; purpose: string }> = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const content = trimmed.replace(/^-+\s*/, '');
    const [file, ...rest] = content.split(':');
    if (!file || rest.length === 0) continue;
    const purpose = rest.join(':').trim();
    items.push({ file: file.trim(), purpose });
  }
  return items;
}

function parseNamingConventions(section: string): { functions: string; classes: string; files: string } {
  const functions = matchLineValue(section, 'Functions');
  const classes = matchLineValue(section, 'Classes');
  const files = matchLineValue(section, 'Files');
  if (!functions || !classes || !files) {
    throw new Error('NAMING CONVENTIONS section must include Functions, Classes, and Files lines.');
  }
  return { functions, classes, files };
}

function matchLineValue(section: string, label: string): string | null {
  const regex = new RegExp(`^-\\s*${escapeRegExp(label)}:\\s*(.+)$`, 'mi');
  const match = section.match(regex);
  return match ? match[1]!.trim() : null;
}

function parseCommonPatterns(section: string): Array<{ name: string; description: string }> {
  const patterns: Array<{ name: string; description: string }> = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\d+\.\s*([^:]+):\s*(.+)$/);
    if (!match) continue;
    patterns.push({ name: match[1]!.trim(), description: match[2]!.trim() });
  }
  return patterns;
}

function parseNamePurposeList(section: string): Array<{ name: string; description: string }> {
  const items: Array<{ name: string; description: string }> = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const content = trimmed.replace(/^-+\s*/, '');
    const [name, ...rest] = content.split(':');
    if (!name || rest.length === 0) continue;
    items.push({ name: name.trim(), description: rest.join(':').trim() });
  }
  return items;
}

function parseBullets(section: string): string[] {
  const items: string[] = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const value = trimmed.replace(/^-+\s*/, '').trim();
    if (value) items.push(value);
  }
  return items;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

