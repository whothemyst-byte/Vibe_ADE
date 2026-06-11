import { describe, it, expect, vi, afterEach } from "vitest";
import { transcribe, chat, GroqError } from "./groq";

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const fail = (status: number) =>
  Promise.resolve(new Response("{}", { status }));

afterEach(() => vi.unstubAllGlobals());

describe("transcribe", () => {
  it("posts multipart wav and returns the text", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "open a terminal" }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await transcribe(new Blob(["x"], { type: "audio/wav" }), "gsk_key");
    expect(text).toBe("open a terminal");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer gsk_key");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3-turbo");
  });

  it("maps 401 to a missing-key message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(401)));
    await expect(transcribe(new Blob(), "bad")).rejects.toThrow(/groq api key/i);
  });

  it("maps 429 to a rate-limit message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(429)));
    await expect(transcribe(new Blob(), "k")).rejects.toThrow(/try again in a moment/i);
  });

  it("maps network failure to an offline message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(transcribe(new Blob(), "k")).rejects.toThrow(/couldn't reach/i);
  });
});

describe("chat", () => {
  it("posts messages+tools and returns the assistant message", async () => {
    const message = { role: "assistant", content: "Done!", tool_calls: undefined };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await chat([{ role: "user", content: "hi" }], [], "gsk_key");
    expect(out).toEqual(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.tool_choice).toBeUndefined(); // no tools registered -> no tool fields
  });

  it("includes tools and tool_choice when tools are provided", async () => {
    const message = { role: "assistant", content: "Done!" };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    const tool = {
      type: "function" as const,
      function: { name: "noop", description: "d", parameters: { type: "object", properties: {} } },
    };
    await chat([{ role: "user", content: "hi" }], [tool], "gsk_key");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([tool]);
    expect(body.tool_choice).toBe("auto");
  });

  it("throws GroqError with status on http errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(500)));
    await expect(chat([], [], "k")).rejects.toBeInstanceOf(GroqError);
  });
});
