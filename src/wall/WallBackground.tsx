import { convertFileSrc } from "@tauri-apps/api/core";
import type { Background } from "../store/types";

function srcOf(bg: { path?: string; url?: string }): string {
  return bg.url ?? (bg.path ? convertFileSrc(bg.path) : "");
}

export function WallBackground({ background }: { background: Background }) {
  if (background.kind === "color") {
    return <div className="wall-bg" style={{ background: background.color }} />;
  }
  if (background.kind === "image") {
    // Bundled pixel-art scenes render crisp; user photos keep normal smoothing.
    const pixel = background.url?.startsWith("/themes/scenes/");
    return (
      <div
        className="wall-bg"
        style={{
          backgroundImage: `url(${srcOf(background)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          imageRendering: pixel ? "pixelated" : undefined,
        }}
      />
    );
  }
  return <video className="wall-bg" src={srcOf(background)} autoPlay loop muted playsInline />;
}
