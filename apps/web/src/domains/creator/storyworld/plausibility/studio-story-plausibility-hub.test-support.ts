/**
 * 개연성 허브 화면 테스트가 함께 쓰는 도우미(시계·메모리 저장소·주입 의존성).
 *
 * 컴포넌트가 아닌 값은 이 파일에 모아 fast-refresh 규칙을 지킨다.
 */
import type { PlausibilityRunDeps } from "./studio-story-plausibility-run";

export const HUB_NOW = new Date("2026-10-15T09:30:00.000Z");

export function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

export function makeHubDeps(overrides: Partial<PlausibilityRunDeps> = {}): PlausibilityRunDeps {
  return {
    now: () => HUB_NOW,
    storage: memoryStorage(),
    loadManuscript: async () => ({ status: "missing" }),
    yieldToHost: () => Promise.resolve(),
    ...overrides,
  };
}
