import { useState } from "react";
import { terminalsOf, useCardStore } from "./cardStore";
import { presetTierColor } from "./presetTier";
import { useBlocksBrowser } from "./browserVisibility";
import { recipeEntries, runRecipe, summarizeRun } from "./recipe";
import { sendToSession } from "./sessions";

/**
 * Bottom-left "▶ Boot recipe" pill + popover: view and edit each terminal's
 * saved startup command, and replay them into the live shells on demand.
 * Commands persist per terminal in the WallDoc but NEVER run on wall load —
 * this popover (or the run_boot_recipe voice command) is the only trigger.
 */
export function BootRecipe() {
  const cards = useCardStore((s) => s.cards);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useBlocksBrowser(open);
  const terminals = terminalsOf(cards);

  const runAll = () => {
    const result = runRecipe(recipeEntries(cards), (id, cmd) => sendToSession(id, cmd, true));
    setNotice(summarizeRun(result));
  };
  const runOne = (id: string, cmd: string) => {
    const ok = sendToSession(id, cmd.trim(), true);
    setNotice(ok ? null : "No live session for that terminal.");
  };

  if (!terminals.length) return null;
  return (
    <div className="boot-recipe">
      {open && (
        <div className="boot-recipe-pop">
          {terminals.map((t) => (
            <div className="boot-recipe-row" key={t.id}>
              <span className="launch-ic" style={{ background: presetTierColor(t.presetId) }} />
              <span className="boot-recipe-name">{t.name}</span>
              <input
                className="boot-recipe-cmd"
                placeholder="startup command…"
                value={t.run ?? ""}
                onChange={(e) => useCardStore.getState().update(t.id, { run: e.target.value })}
                spellCheck={false}
              />
              <button
                className="boot-recipe-run"
                title={`Run in ${t.name}`}
                disabled={!(t.run ?? "").trim()}
                onClick={() => runOne(t.id, t.run ?? "")}
              >
                ▶
              </button>
            </div>
          ))}
          <div className="boot-recipe-foot">
            {notice && <span className="boot-recipe-notice">{notice}</span>}
            <button className="boot-recipe-all" onClick={runAll} disabled={!recipeEntries(cards).length}>
              Run recipe
            </button>
          </div>
        </div>
      )}
      <button className="boot-recipe-pill" onClick={() => { setNotice(null); setOpen((o) => !o); }}>
        ▶ Boot recipe
      </button>
    </div>
  );
}
