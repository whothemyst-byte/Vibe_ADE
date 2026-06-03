import { pickBackgroundFile, importBackground } from "../store/persistence";
import type { Background } from "../store/types";

const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "bin";

export function BackgroundMenu({
  background, onChange, onClose,
}: { background: Background; onChange: (bg: Background) => void; onClose: () => void }) {
  const pick = async (kind: "image" | "video") => {
    const src = await pickBackgroundFile();
    if (!src) return;
    const dest = await importBackground(src, `${crypto.randomUUID()}.${extOf(src)}`);
    onChange({ kind, path: dest });
    onClose();
  };

  return (
    <div className="bg-menu" onMouseLeave={onClose}>
      <label className="bg-row">
        Color
        <input
          type="color"
          value={background.kind === "color" ? background.color : "#12110f"}
          onChange={(e) => onChange({ kind: "color", color: e.target.value })}
        />
      </label>
      <button className="bg-row" onClick={() => pick("image")}>Image…</button>
      <button className="bg-row" onClick={() => pick("video")}>Video…</button>
    </div>
  );
}
