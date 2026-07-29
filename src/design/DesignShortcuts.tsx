import { DESIGN_TOOL_GROUPS } from "./designTools";

/** Derived from the toolbar itself, so the cheatsheet can never advertise a
 *  tool this page doesn't have. */
const TOOL_ROWS: Array<[string, string]> = DESIGN_TOOL_GROUPS.map((group) => [
  group.map((t) => t.shortcut).join(" · "),
  group.map((t) => t.label).join(" · "),
]);

const ROWS: Array<[string, string]> = [
  ...TOOL_ROWS,
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / Redo"],
  ["Ctrl+G / Ctrl+Shift+G", "Group / Ungroup"],
  ["Ctrl+D", "Duplicate"],
  ["Ctrl+[ / Ctrl+]", "Send backward / Bring forward"],
  ["Shift+1 / Shift+2", "Zoom to fit / to selection"],
  ["Alt+drag", "Duplicate by dragging"],
  ["?", "This cheatsheet"],
];

export function DesignShortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="design-shortcuts-backdrop" onClick={onClose}>
      <div className="design-shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="design-shortcuts-head">Keyboard shortcuts</div>
        {ROWS.map(([keys, what]) => (
          <div key={keys} className="design-shortcuts-row">
            <span className="design-shortcuts-keys">{keys}</span>
            <span className="design-shortcuts-what">{what}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
