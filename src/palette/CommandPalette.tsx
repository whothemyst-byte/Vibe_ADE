import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useBlocksBrowser } from "../wall/browserVisibility";
import { rankActions } from "./fuzzy";
import type { PaletteAction } from "./actions";

/**
 * Searchable quick menu. Dumb by design: it renders whatever actions it is
 * given and owns only query/selection state. `run()` side effects live with
 * the caller that built the registry.
 */
export function CommandPalette({
  open, onClose, actions,
}: { open: boolean; onClose: () => void; actions: PaletteAction[] }) {
  useBlocksBrowser(open);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      // Focus after the overlay mounts; rAF beats React's commit timing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const ranked = useMemo(() => rankActions(query, actions), [query, actions]);
  const clamped = Math.min(sel, Math.max(0, ranked.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${clamped}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [clamped, ranked]);

  if (!open) return null;

  const runAction = (a: PaletteAction) => {
    onClose();
    a.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (ranked.length ? (s + 1) % ranked.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (ranked.length ? (s - 1 + ranked.length) % ranked.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = ranked[clamped];
      if (a) runAction(a);
    }
  };

  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSel(0); }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {ranked.length === 0 && <div className="palette-empty">No matching actions</div>}
          {ranked.map((a, i) => (
            <button
              key={a.id}
              data-idx={i}
              className={`palette-item${i === clamped ? " active" : ""}`}
              onPointerEnter={() => setSel(i)}
              onPointerDown={() => runAction(a)}
            >
              <span className="palette-label">{a.label}</span>
              {a.shortcut && <kbd className="palette-kbd">{a.shortcut}</kbd>}
              <span className="palette-tag">{a.section}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
