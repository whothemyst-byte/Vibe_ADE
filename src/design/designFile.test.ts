import { describe, it, expect, vi, beforeEach } from "vitest";
import { designPath, DESIGN_REL, resolveDesignPath, ensureDesignFile, formatReference } from "./designFile";
import * as persistence from "../store/persistence";
import { emptySceneJson } from "./normalize";

vi.mock("../store/persistence", () => ({
  loadIndex: vi.fn(),
  readDesignFile: vi.fn(),
  writeDesignFile: vi.fn(),
}));

const mocked = vi.mocked(persistence);
beforeEach(() => { vi.clearAllMocks(); });

describe("designPath", () => {
  it("joins the space folder with the well-known relative path", () => {
    expect(designPath("C:/Users/me/proj")).toBe(`C:/Users/me/proj/${DESIGN_REL}`);
  });

  it("trims a trailing slash on the folder", () => {
    expect(designPath("C:/Users/me/proj/")).toBe(`C:/Users/me/proj/${DESIGN_REL}`);
  });

  it("trims a trailing backslash on the folder", () => {
    expect(designPath("C:\\Users\\me\\proj\\")).toBe(`C:\\Users\\me\\proj/${DESIGN_REL}`);
  });

  it("ends in .design.json (required by the Rust write command)", () => {
    expect(designPath("C:/x").endsWith(".design.json")).toBe(true);
  });
});

describe("resolveDesignPath", () => {
  it("returns the design path for a known space", async () => {
    mocked.loadIndex.mockResolvedValue([{ id: "s1", name: "x", path: "C:/proj", updatedAt: 0 }] as never);
    expect(await resolveDesignPath("s1")).toBe(designPath("C:/proj"));
  });
  it("returns null for an unknown space", async () => {
    mocked.loadIndex.mockResolvedValue([] as never);
    expect(await resolveDesignPath("nope")).toBeNull();
  });
});

describe("ensureDesignFile", () => {
  const path = "C:/proj/designs/ui.design.json";
  it("seeds an empty scene when the file is missing", async () => {
    mocked.readDesignFile.mockRejectedValue(new Error("not found"));
    await ensureDesignFile(path);
    expect(mocked.writeDesignFile).toHaveBeenCalledWith(path, emptySceneJson());
  });
  it("leaves an existing file untouched", async () => {
    mocked.readDesignFile.mockResolvedValue("{}");
    await ensureDesignFile(path);
    expect(mocked.writeDesignFile).not.toHaveBeenCalled();
  });
  it("reseeds a blank file left behind by an interrupted write", async () => {
    mocked.readDesignFile.mockResolvedValue("  \n");
    await ensureDesignFile(path);
    expect(mocked.writeDesignFile).toHaveBeenCalledWith(path, emptySceneJson());
  });
});

describe("formatReference", () => {
  it("prefixes @ and adds a trailing space so the agent's file mention parses", () => {
    expect(formatReference("C:/proj/designs/ui.design.json")).toBe("@C:/proj/designs/ui.design.json ");
  });
});
