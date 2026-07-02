const ROWS: Array<[string, string]> = [
  ["V / H", "Select / Hand"],
  ["R · O · D", "Rectangle · Ellipse · Diamond"],
  ["A · L · P", "Arrow · Line · Draw"],
  ["T · E · F", "Text · Eraser · Frame"],
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
