const DESTRUCTIVE_PATTERNS = [
  // File deletion
  /\brm\s+(-[rf]+\s+)?[^|&>;\n]+/i,
  /\bdel\s+[^|&>;\n]+/i,
  /\bRemove-Item\s+[^|&>;\n]+/i,
  /\berase\s+[^|&>;\n]+/i,

  // Disk operations
  /\bformat\s+/i,
  /\bdiskpart\s+/i,
  /\bmkfs\./i,

  // System modifications
  /\breg\s+delete/i,
  /\bsc\s+delete/i,
  /\bchkdsk\s+.*\/f/i,

  // Git operations
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-[df]+/i,
  /\bgit\s+push\s+.*--force/i,

  // Recursive operations
  /\brm\s+-[rf]+/i,
  /\bRemove-Item\s+.*-Recurse/i,

  // Dangerous redirects
  />\s*\/dev\/[^|&>;\n]+/i,
  />\s*[a-zA-Z]:\\[^|&>;\n]+/i,

  // Process termination
  /\btaskkill\s+.*\/f/i,
  /\bkill\s+-9/i,

  // Shutdown/restart
  /\bshutdown\s+/i,
  /\brestart-computer/i
];

export function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
}