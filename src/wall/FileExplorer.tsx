import { useEffect, useState } from "react";
import { readDir, type DirEntry } from "../store/persistence";
import { openFile } from "./fileActions";
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, FileIcon, FolderIcon } from "./icons";

function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && children === null && !error) {
      readDir(entry.path).then(setChildren).catch(() => setError(true));
    }
  };

  const pad = { paddingLeft: 8 + depth * 12 };

  if (!entry.is_dir) {
    return (
      <button className="fx-row" style={pad} title={entry.path} onClick={() => openFile(entry.path, entry.name)}>
        <span className="fx-caret" />
        <span className="fx-icon"><FileIcon /></span>
        <span className="fx-name">{entry.name}</span>
      </button>
    );
  }

  return (
    <>
      <button className="fx-row" style={pad} title={entry.path} onClick={toggle}>
        <span className="fx-caret">{open ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
        <span className="fx-icon"><FolderIcon /></span>
        <span className="fx-name">{entry.name}</span>
      </button>
      {open && (
        error ? (
          <div className="fx-empty" style={{ paddingLeft: 20 + depth * 12 }}>can’t read folder</div>
        ) : children === null ? (
          <div className="fx-empty" style={{ paddingLeft: 20 + depth * 12 }}>…</div>
        ) : children.length === 0 ? (
          <div className="fx-empty" style={{ paddingLeft: 20 + depth * 12 }}>empty</div>
        ) : (
          children.map((c) => <TreeNode key={c.path} entry={c} depth={depth + 1} />)
        )
      )}
    </>
  );
}

export function FileExplorer({
  path, open, onClose,
}: { path: string; open: boolean; onClose: () => void }) {
  const [roots, setRoots] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !path) return;
    setRoots(null);
    setError(false);
    readDir(path).then(setRoots).catch(() => setError(true));
  }, [open, path]);

  if (!open) return null;
  const rootName = path.split(/[\\/]/).filter(Boolean).pop() ?? "Files";

  return (
    <div className="fx-panel">
      <div className="fx-head">
        <span className="fx-title">{rootName}</span>
        <button className="fx-close" title="Close explorer" onClick={onClose}><CloseIcon /></button>
      </div>
      <div className="fx-tree">
        {error ? (
          <div className="fx-empty">can’t read this folder</div>
        ) : roots === null ? (
          <div className="fx-empty">loading…</div>
        ) : roots.length === 0 ? (
          <div className="fx-empty">empty folder</div>
        ) : (
          roots.map((c) => <TreeNode key={c.path} entry={c} depth={0} />)
        )}
      </div>
    </div>
  );
}
