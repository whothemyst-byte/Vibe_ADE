import type { DesignNode, DesignDoc, Frame } from "./schema";
import { styleFor } from "./style";

function NodeView({ node, tokens }: { node: DesignNode; tokens: DesignDoc["tokens"] }) {
  const style = styleFor(node, tokens);
  switch (node.type) {
    case "text":   return <div style={style}>{node.text ?? ""}</div>;
    case "button": return <div style={{ textAlign: "center", ...style }}>{node.text ?? ""}</div>;
    case "input":  return <div style={{ color: "#7c7468", ...style }}>{node.placeholder ?? ""}</div>;
    case "image":  return <div style={{ background: "#2a2520", ...style }} />;
    case "icon":   return <div style={style}>◻</div>;
    case "rect":   return <div style={style} />;
    default:       // stack / row / component / instance → container
      return (
        <div style={style}>
          {(node.children ?? []).map((c) => <NodeView key={c.id} node={c} tokens={tokens} />)}
        </div>
      );
  }
}

/** A single artboard. Static mockup: pointer-events disabled (Phase 1). */
export function FrameView({ frame, tokens }: { frame: Frame; tokens: DesignDoc["tokens"] }) {
  return (
    <div
      style={{
        position: "absolute", left: frame.x, top: frame.y,
        width: frame.w, height: frame.h, background: "#15120f",
        border: "1px solid #2a2520", borderRadius: 10, overflow: "hidden",
        pointerEvents: "none", color: "#e8e2d8",
        fontFamily: "Geist, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", height: "100%" }}>
        <NodeView node={frame.root} tokens={tokens} />
      </div>
    </div>
  );
}
