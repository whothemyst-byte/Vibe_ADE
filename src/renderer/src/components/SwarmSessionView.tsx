import { SwarmBoard } from './SwarmBoard';

export function SwarmSessionView(props: { swarmId: string }): JSX.Element {
  const { swarmId } = props;
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <SwarmBoard swarmId={swarmId} />
    </div>
  );
}

