import { describe, expect, it } from "vitest";
import { youtubeEmbedUrl } from "./youtube";

describe("youtubeEmbedUrl", () => {
  it("converts watch URLs", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&enablejsapi=1"
    );
  });

  it("converts youtu.be short links", () => {
    expect(youtubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toContain("/embed/dQw4w9WgXcQ?");
  });

  it("converts shorts and music.youtube.com", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/shorts/abcdefghijk")).toContain("/embed/abcdefghijk?");
    expect(youtubeEmbedUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toContain("/embed/dQw4w9WgXcQ?");
  });

  it("keeps the playlist parameter", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123")).toContain("&list=PL123");
    expect(youtubeEmbedUrl("https://www.youtube.com/playlist?list=PL123")).toContain("/embed/videoseries?list=PL123");
  });

  it("returns null for non-YouTube URLs and junk", () => {
    expect(youtubeEmbedUrl("https://stream.radioparadise.com/aac-128")).toBeNull();
    expect(youtubeEmbedUrl("not a url")).toBeNull();
    expect(youtubeEmbedUrl("https://www.youtube.com/")).toBeNull();
  });
});
