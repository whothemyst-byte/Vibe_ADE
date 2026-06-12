import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardStore } from "./cardStore";
import {
  autoOpenFromTerminal,
  browserCard,
  closeBrowser,
  openBrowser,
  _resetForTests,
} from "./browserActions";

vi.mock("../browser/client", () => ({
  browserNavigate: vi.fn(() => Promise.resolve()),
}));
import { browserNavigate } from "../browser/client";

const term = (id: string) => ({
  kind: "terminal" as const,
  id,
  name: id,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  presetId: "plain",
  cwd: "",
});

beforeEach(() => {
  useCardStore.setState({ cards: [], anchor: null });
  _resetForTests();
  vi.clearAllMocks();
});

describe("openBrowser", () => {
  it("adds the browser card with a default scheme", async () => {
    await openBrowser("localhost:5173");
    expect(browserCard()?.url).toBe("https://localhost:5173");
  });

  it("navigates instead of re-adding when already open", async () => {
    await openBrowser("http://localhost:5173");
    await openBrowser("https://github.com");
    expect(useCardStore.getState().cards).toHaveLength(1);
    expect(browserNavigate).toHaveBeenCalledWith("https://github.com");
    expect(browserCard()?.url).toBe("https://github.com");
  });

  it("falls back to the last url, then the default", async () => {
    await openBrowser("http://localhost:3000");
    closeBrowser();
    // Card is gone, so the next open uses the default page.
    await openBrowser();
    expect(browserCard()?.url).toMatch(/^https:\/\//);
  });
});

describe("closeBrowser", () => {
  it("removes the card and reports when nothing is open", async () => {
    await openBrowser("http://localhost:1");
    expect(closeBrowser()).toMatch(/closed/i);
    expect(browserCard()).toBeUndefined();
    expect(closeBrowser()).toMatch(/not open/i);
  });
});

describe("autoOpenFromTerminal", () => {
  it("opens for a new url from a terminal on the open wall", () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    expect(browserCard()?.url).toBe("http://localhost:5173/");
  });

  it("is once-per-url: a second sighting does nothing even after close", () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    closeBrowser();
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    expect(browserCard()).toBeUndefined();
  });

  it("ignores sessions whose terminal is not on the open wall", () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    autoOpenFromTerminal("parked-session", "http://localhost:4000/");
    expect(browserCard()).toBeUndefined();
  });

  it("never hijacks an already-open browser", async () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    await openBrowser("https://github.com");
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    expect(browserCard()?.url).toBe("https://github.com");
    expect(browserNavigate).not.toHaveBeenCalledWith("http://localhost:5173/");
  });
});
