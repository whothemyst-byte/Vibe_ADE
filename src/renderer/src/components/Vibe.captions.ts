export type DialogState = 'has-tasks' | 'empty' | 'no-workspace';

export function captionFor(state: DialogState, count: number): string {
  if (state === 'no-workspace') {
    return 'No workspace open yet.';
  }
  if (state === 'empty') {
    return 'Nothing in flight — want to start something?';
  }
  if (count === 1) {
    return 'Working on 1 thing right now —';
  }
  return `Working on ${count} things right now —`;
}
