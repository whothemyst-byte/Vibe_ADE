export function isAltModifiedPrimaryShortcut(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return Boolean((event.ctrlKey || event.metaKey) && event.altKey);
}
