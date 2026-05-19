import { describe, expect, it } from 'vitest';
import { captionFor } from '../../src/renderer/src/components/Vibe.captions';

describe('Vibe captions — captionFor', () => {
  it('returns the no-workspace caption when no workspace is active', () => {
    expect(captionFor('no-workspace', 0)).toBe('No workspace open yet.');
  });

  it('returns the empty caption when a workspace is active but no tasks are in-progress', () => {
    expect(captionFor('empty', 0)).toBe('Nothing in flight — want to start something?');
  });

  it('uses singular phrasing when exactly one in-progress task exists', () => {
    expect(captionFor('has-tasks', 1)).toBe('Working on 1 thing right now —');
  });

  it('uses plural phrasing when multiple in-progress tasks exist', () => {
    expect(captionFor('has-tasks', 3)).toBe('Working on 3 things right now —');
  });
});
