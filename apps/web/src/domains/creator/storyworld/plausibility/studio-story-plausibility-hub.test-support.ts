/**
 * 개연성 허브 화면 테스트가 함께 쓰는 도우미(시계·메모리 저장소·주입 의존성).
 *
 * 컴포넌트가 아닌 값은 이 파일에 모아 fast-refresh 규칙을 지킨다.
 */
import type { StudioProjectDiagnosticSource } from "../../studio-project-diagnostics";
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

/** 점검 요약 저장소(공용 SQLite 키-값 저장소의 메모리 대역). 저장된 문자열을 `map`으로 들여다볼 수 있다. */
export function memorySummaryStore(initial: Readonly<Record<string, string>> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    store: {
      get: (key: string) => Promise.resolve(map.get(key) ?? null),
      set: (key: string, value: string) => { map.set(key, value); return Promise.resolve(); },
    },
  };
}

export function makeHubDeps(overrides: Partial<PlausibilityRunDeps> = {}): PlausibilityRunDeps {
  const summary = memorySummaryStore();
  return {
    now: () => HUB_NOW,
    storage: memoryStorage(),
    loadManuscript: async () => ({ status: "missing" }),
    acquireSummaryStore: () => Promise.resolve(summary.store),
    yieldToHost: () => Promise.resolve(),
    ...overrides,
  };
}

/** 스토리 바이블의 인물 한 명(테스트용). */
export function bibleCharacter(id: string, name: string, aliases: readonly string[] = []) {
  return { id, name, aliases, defaultCostumeId: null, defaultAppearanceId: null };
}

/** 스토리 바이블 인물·장소만 채운 작품 진단 소스(테스트용). 나머지 칸은 비어 있다. */
export function diagnosticSourceWithBible(
  characters: StudioProjectDiagnosticSource["story"]["bible"]["characters"],
  locations: StudioProjectDiagnosticSource["story"]["bible"]["locations"],
  projectId = "work-1",
): StudioProjectDiagnosticSource {
  return {
    schemaVersion: 1,
    projectId,
    capturedAt: "2026-10-15T00:00:00.000Z",
    story: {
      bible: { projectId, characters, locations, facts: [] },
      states: [],
      transitions: [],
      narrative: { profiles: [], relations: [] },
    },
    productionTasks: [],
    assets: [],
    reviewSession: {
      documentId: "document-1",
      versionId: "v1",
      basedOnVersionId: null,
      status: "approved",
      requiredReviewerIds: [],
      threads: [],
      decisions: [],
      submittedAt: "2026-10-15T00:00:00.000Z",
      approvedAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    },
    localization: [],
    exportPreflights: [],
  };
}
