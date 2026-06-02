export function TaskBoard({
  onBack,
}: { onBack: () => void; onOpenWall: (id: string) => void }) {
  return (
    <div className="taskboard">
      <div className="tb-bar">
        <button className="cnvs-btn" onClick={onBack} title="Back">←</button>
        <span className="tb-title">Taskboard</span>
      </div>
      <div className="tb-columns" />
    </div>
  );
}
