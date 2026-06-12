import { describe, expect, it, vi } from "vitest";
import { createUrlScanner, normalizeLocalUrl } from "./urlScanner";

describe("normalizeLocalUrl", () => {
  it("rewrites 0.0.0.0 to localhost", () => {
    expect(normalizeLocalUrl("http://0.0.0.0:8000/")).toBe("http://localhost:8000/");
  });
  it("trims trailing punctuation", () => {
    expect(normalizeLocalUrl("http://localhost:5173/.")).toBe("http://localhost:5173/");
  });
});

describe("createUrlScanner", () => {
  it("reports a plain localhost URL once", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("  Local:   http://localhost:5173/\n");
    expect(onUrl).toHaveBeenCalledExactlyOnceWith("http://localhost:5173/");
  });

  it("strips ANSI color codes around the URL", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("\x1b[32mLocal\x1b[0m: \x1b[36mhttp://localhost:5173/\x1b[0m\n");
    expect(onUrl).toHaveBeenCalledExactlyOnceWith("http://localhost:5173/");
  });

  it("joins a URL split across two chunks", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("Local: http://local");
    scan("host:4321/app\n");
    expect(onUrl).toHaveBeenCalledExactlyOnceWith("http://localhost:4321/app");
  });

  it("dedupes repeats of the same URL", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("http://127.0.0.1:3000\n");
    scan("restarting…\nhttp://127.0.0.1:3000\n");
    expect(onUrl).toHaveBeenCalledTimes(1);
  });

  it("ignores non-local URLs", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("see https://vitejs.dev/config for docs\n");
    expect(onUrl).not.toHaveBeenCalled();
  });

  it("reports distinct ports separately", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("http://localhost:5173/\nhttp://localhost:4173/\n");
    expect(onUrl).toHaveBeenCalledTimes(2);
  });
});
