import { describe, expect, it } from "vitest";
import { checkRequest, overQuota, DAILY_LIMIT, CHAT_MODEL, STT_MODEL } from "./rules";

describe("checkRequest", () => {
  it("allows whitelisted models on their routes", () => {
    expect(checkRequest("chat", CHAT_MODEL, "dev-1")).toBeNull();
    expect(checkRequest("transcribe", STT_MODEL, "dev-1")).toBeNull();
  });

  it("rejects missing device id with 400", () => {
    expect(checkRequest("chat", CHAT_MODEL, null)).toEqual({
      status: 400,
      message: "missing x-device-id",
    });
    expect(checkRequest("chat", CHAT_MODEL, "")).toEqual({
      status: 400,
      message: "missing x-device-id",
    });
  });

  it("rejects non-whitelisted models with 400", () => {
    expect(checkRequest("chat", "openai/gpt-oss-120b", "d")?.status).toBe(400);
    expect(checkRequest("chat", STT_MODEL, "d")?.status).toBe(400); // wrong route
    expect(checkRequest("transcribe", null, "d")?.status).toBe(400);
  });

  it("rejects unknown routes with 404", () => {
    expect(checkRequest("embeddings", CHAT_MODEL, "d")?.status).toBe(404);
  });
});

describe("overQuota", () => {
  it("allows up to the daily limit and rejects beyond it", () => {
    expect(overQuota(1)).toBe(false);
    expect(overQuota(DAILY_LIMIT)).toBe(false);
    expect(overQuota(DAILY_LIMIT + 1)).toBe(true);
  });
});
