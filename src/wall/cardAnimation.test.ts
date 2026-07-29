import { describe, expect, it } from "vitest";
// The app ships no @types/node (same reason vite.config.ts shims `process`),
// and vitest resolves a `?raw` CSS import to "" because CSS handling is off —
// so this test reads the stylesheet straight off disk.
// @ts-expect-error node:fs is untyped in this project
import { readFileSync } from "node:fs";

/**
 * Guards the card-blink fix in App.css.
 *
 * `.terminal-window` carries the one-shot enter fade, and state rules
 * (data-working, :focus-within) layer the working glow on top. CSS matches an
 * element's animations to its previous list BY INDEX: an entry whose name is
 * unchanged at its index keeps its state (here: stays finished), a changed one
 * restarts. So any state rule that writes `animation` must keep `card-fade-in`
 * first — otherwise leaving that state replays the fade from opacity 0 and the
 * whole card blinks, which for a working->idle flip is every few seconds.
 */
const css: string = readFileSync(new URL("../App.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** Rules targeting a `.terminal-window` element itself (not its descendants). */
function cardRulesWithAnimation(): { selector: string; animation: string }[] {
  const out: { selector: string; animation: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    const anim = /(?:^|[;\s])animation:\s*([^;]+)/.exec(body)?.[1];
    if (!anim) continue;
    for (const sel of m[1].split(",").map((s: string) => s.trim())) {
      // ".terminal-window[data-working='true']" targets the card;
      // ".terminal-window[...] .terminal-status-dot" targets a child.
      if (/^\.terminal-window[^\s]*$/.test(sel)) out.push({ selector: sel, animation: anim.trim() });
    }
  }
  return out;
}

describe("terminal card animations", () => {
  it("finds the card's own animation rules", () => {
    const rules = cardRulesWithAnimation();
    expect(rules.map((r) => r.selector)).toContain(".terminal-window");
    expect(rules.length).toBeGreaterThan(1); // base + at least one state rule
  });

  it("keeps card-fade-in first in every state, so it never replays", () => {
    for (const { selector, animation } of cardRulesWithAnimation()) {
      expect(animation.split(",")[0].trim(), selector).toMatch(/^card-fade-in\b/);
    }
  });

  it("still breathes the working glow", () => {
    const working = cardRulesWithAnimation().find(
      (r) => r.selector === '.terminal-window[data-working="true"]'
    );
    expect(working?.animation).toContain("working-glow");
  });
});
