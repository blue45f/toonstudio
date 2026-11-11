export interface ScrollPosition { x: number; y: number; focusKey?: string }

/** Bounded, in-memory history. Never persists route queries or account identifiers. */
export function createNavigationMemory(limit = 80) {
  const capacity = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 80;
  const positions = new Map<string, ScrollPosition>();
  return {
    get(key: string): ScrollPosition | undefined {
      const value = positions.get(key);
      return value ? { ...value } : undefined;
    },
    set(key: string, position: ScrollPosition) {
      const finite = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
      const focusKey = typeof position.focusKey === "string"
        && position.focusKey.length > 0 && position.focusKey.length <= 256
        && position.focusKey.trim() === position.focusKey && !/\p{Cc}/u.test(position.focusKey)
        ? position.focusKey : undefined;
      positions.delete(key);
      positions.set(key, { x: finite(position.x), y: finite(position.y), ...(focusKey ? { focusKey } : {}) });
      while (positions.size > capacity) {
        const first = positions.keys().next().value;
        if (first === undefined) break;
        positions.delete(first);
      }
    },
    clear() {
      positions.clear();
    },
    get size() { return positions.size; },
  };
}
