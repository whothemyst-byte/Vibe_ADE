import { BackIcon } from "../wall/icons";

export function DesignTopBar({
  zoom,
  onBack,
  onReference,
}: {
  zoom: number;
  onBack: () => void;
  onReference: () => void;
}) {
  return (
    <div className="design-topbar">
      <button className="cnvs-btn" onClick={onBack} title="Back to wall">
        <BackIcon />
      </button>
      <span className="design-title">UI Design</span>
      <span className="design-spacer" />
      <span className="design-zoom-readout">{Math.round(zoom * 100)}%</span>
      <button
        className="cnvs-btn design-ref"
        onClick={onReference}
        title="Reference this UI in the focused terminal"
      >
        @ Reference in terminal
      </button>
    </div>
  );
}
