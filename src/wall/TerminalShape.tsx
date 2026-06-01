import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T, type TLBaseShape } from "tldraw";

// Augment tldraw's global shape map so TerminalShape is part of TLShape union.
// This is the v5 pattern for custom shapes.
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    terminal: TerminalShapeProps;
  }
}

export interface TerminalShapeProps {
  w: number;
  h: number;
  presetId: string;
  label: string;
  cwd: string;
  started: boolean;
}

export type TerminalShape = TLBaseShape<"terminal", TerminalShapeProps>;

export class TerminalShapeUtil extends BaseBoxShapeUtil<TerminalShape> {
  static override type = "terminal" as const;

  static override props = {
    w: T.number,
    h: T.number,
    presetId: T.string,
    label: T.string,
    cwd: T.string,
    started: T.boolean,
  };

  override getDefaultProps(): TerminalShapeProps {
    return { w: 420, h: 260, presetId: "plain", label: "Terminal", cwd: "", started: false };
  }

  override getGeometry(shape: TerminalShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override getIndicatorPath(shape: TerminalShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }

  override component(shape: TerminalShape) {
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          border: "1px solid #2a2f3a",
          borderRadius: 8,
          background: "#0b0e14",
          pointerEvents: "all",
        }}
      />
    );
  }
}
