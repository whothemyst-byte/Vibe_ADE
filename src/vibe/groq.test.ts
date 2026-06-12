import { describe, it, expect, vi, afterEach } from "vitest";
import { transcribe, chat, GroqError, type GroqAuth } from "./groq";

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const fail = (status: number) =>
  Promise.resolve(new Response("{}", { status }));

const direct: GroqAuth = { kind: "direct", key: "gsk_key" };
const proxy: GroqAuth = { kind: "proxy", deviceId: "dev-1" };

afterEach(() => vi.unstubAllGlobals());

describe("transcribe (direct)", () => {
  it("posts multipart wav to groq and returns the text", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "open a terminal" }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await transcribe(new Blob(["x"], { type: "audio/wav" }), direct);
    expect(text).toBe("open a terminal");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer gsk_key");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3-turbo");
  });

  it("maps 401 to a missing-key message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(401)));
    await expect(transcribe(new Blob(), direct)).rejects.toThrow(/groq api key/i);
  });

  it("maps 429 to a rate-limit message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(429)));
    await expect(transcribe(new Blob(), direct)).rejects.toThrow(/try again in a moment/i);
  });

  it("maps network failure to an offline message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(transcribe(new Blob(), direct)).rejects.toThrow(/couldn't reach/i);
  });
});

describe("transcribe (proxy)", () => {
  it("posts to the edge function with the device id, no Authorization", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "hi" }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribe(new Blob(["x"]), proxy);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy/transcribe"
    );
    expect(init.headers["x-device-id"]).toBe("dev-1");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("maps proxy 429 to the daily-allowance message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(429)));
    await expect(transcribe(new Blob(), proxy)).rejects.toThrow(/own .*key|daily/i);
  });
});

describe("chat", () => {
  it("posts messages+tools to groq directly and returns the assistant message", async () => {
    const message = { role: "assistant", content: "Done!", tool_calls: undefined };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await chat([{ role: "user", content: "hi" }], [], direct);
    expect(out).toEqual(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
    expect(body.tool_choice).toBeUndefined(); // no tools registered -> no tool fields
  });

  it("posts to the proxy chat route when using proxy auth", async () => {
    const message = { role: "assistant", content: "Done!" };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    await chat([{ role: "user", content: "hi" }], [], proxy);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy/chat"
    );
    expect(init.headers["x-device-id"]).toBe("dev-1");
    expect(JSON.parse(init.body).model).toBe("openai/gpt-oss-120b");
  });

  it("includes tools and tool_choice when tools are provided", async () => {
    const message = { role: "assistant", content: "Done!" };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    const tool = {
      type: "function" as const,
      function: { name: "noop", description: "d", parameters: { type: "object", properties: {} } },
    };
    await chat([{ role: "user", content: "hi" }], [tool], direct);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([tool]);
    expect(body.tool_choice).toBe("auto");
  });

  it("throws GroqError with status on http errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(500)));
    await expect(chat([], [], direct)).rejects.toBeInstanceOf(GroqError);
  });
});
