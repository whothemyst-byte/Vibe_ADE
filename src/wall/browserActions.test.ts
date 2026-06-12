import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardStore } from "./cardStore";
import {
  autoOpenFromTerminal,
  browserCard,
  closeBrowser,
  openBrowser,
  toNavigableUrl,
  _resetForTests,
} from "./browserActions";

vi.mock("../browser/client", () => ({
  browserNavigate: vi.fn(() => Promise.resolve()),
  browserSetVisible: vi.fn(() => Promise.resolve()),
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

describe("toNavigableUrl", () => {
  it("keeps explicit schemes as-is", () => {
    expect(toNavigableUrl("https://example.com")).toBe("https://example.com");
    expect(toNavigableUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
  });

  it("adds https:// to host-like input", () => {
    expect(toNavigableUrl("github.com/foo")).toBe("https://github.com/foo");
    expect(toNavigableUrl("localhost:3000")).toBe("https://localhost:3000");
    expect(toNavigableUrl("127.0.0.1:8080")).toBe("https://127.0.0.1:8080");
  });

  it("turns bare words into a google search, like a browser omnibox", () => {
    expect(toNavigableUrl("google")).toBe("https://www.google.com/search?q=google");
    expect(toNavigableUrl("what is rust")).toBe(
      "https://www.google.com/search?q=what%20is%20rust"
    );
  });
});

describe("openBrowser", () => {
  it("searches instead of navigating when given a bare word", async () => {
    await openBrowser("google");
    expect(browserCard()?.url).toBe("https://www.google.com/search?q=google");
  });

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
