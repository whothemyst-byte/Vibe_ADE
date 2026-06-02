import { convertFileSrc } from "@tauri-apps/api/core";
import type { Background } from "../store/types";

export function WallBackground({ background }: { background: Background }) {
  if (background.kind === "color") {
    return <div className="wall-bg" style={{ background: background.color }} />;
  }
  if (background.kind === "image") {
    return (
      <div
        className="wall-bg"
        style={{ backgroundImage: `url(${convertFileSrc(background.path)})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
    );
  }
  return (
    <video className="wall-bg" src={convertFileSrc(background.path)} autoPlay loop muted playsInline />
  );
}
