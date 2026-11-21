/**
 * Plotr 스토리 아틀리에 로컬 기기 영속 스토어.
 *
 * - 제품 런타임에서는 `withPlanningDocument("studio-plotr-workbenches", ...)`(기기 내장 DB)를 우선 사용한다.
 * - 테스트/비지원 환경에서는 `sessionStorage` + 메모리 캐시로 안전 폴백해 새로고침/재마운트 복원을 보장한다.
 * - `studio-browser-kv-authority-boundary.test.ts` 규약을 100% 준수한다(직접 localStorage 쓰기 0건).
 */
import { createSpatialStoryBoardDocument } from "../studio-spatial-story-board-canvas";
import { withPlanningDocument } from "../studio-planning-document-store";
import { findArtStylePreset } from "./plotr-consistency-and-batch";
import {
  findPlotrGenreTemplate,
  type PlotrGenreTemplate,
} from "./plotr-genre-templates";
import { parseScriptToPlotrCuts } from "./plotr-script-cut-engine";
import type {
  PlotrDocumentState,
  PlotrGenreTemplateId,
} from "./plotr-types";

export const STUDIO_PLOTR_UPDATED_EVENT = "toonstudio:plotr-atelier-updated";

const memoryFallbackStore = new Map<string, string>();

export function plotrStorageKey(projectId: string): string {
  const normalized = projectId.trim() || "default";
  return `toonstudio:plotr-atelier:v1:${encodeURIComponent(normalized)}`;
}

export function createEmptyPlotrDocument(projectId: string): PlotrDocumentState {
  const normalized = projectId.trim() || "default";
  return Object.freeze({
    schemaVersion: 1,
    projectId: normalized,
    title: "새 이야기 콘티",
    templateId: null,
    format: "webtoon",
    inputMode: "script",
    helper: {
      genre: "로판",
      targetReader: "20대 독자",
      mood: "몰입감 있게",
      scope: "series-ep1",
      length: "medium",
      trendTags: [],
      logline: "",
      worldSettingNote: "",
    },
    rawScript: "",
    assets: Object.freeze([]),
    cuts: Object.freeze([]),
    artStyle: findArtStylePreset("anime"),
    customStylePresets: Object.freeze([]),
    panelBorderEnabled: true,
    panelBorderWidthPx: 3,
    scenes: Object.freeze([]),
    sceneSnapshots: Object.freeze([]),
    codexEntries: Object.freeze([]),
    subwayTimeline: Object.freeze({
      id: `tl-${normalized}`,
      title: "작품 이중 타임라인",
      tracks: Object.freeze([]),
      events: Object.freeze([]),
      mapPins: Object.freeze([]),
    }),
    spatialBoard: createSpatialStoryBoardDocument("작품 공간 스토리보드"),
    updatedAtIso: new Date().toISOString(),
  });
}

export function createPlotrDocumentFromTemplate(
  projectId: string,
  templateOrId: PlotrGenreTemplateId | PlotrGenreTemplate,
): PlotrDocumentState {
  const tpl =
    typeof templateOrId === "string"
      ? findPlotrGenreTemplate(templateOrId)
      : templateOrId;
  const cuts = parseScriptToPlotrCuts({
    script: tpl.rawScript,
    format: tpl.defaultFormat,
    inputMode: "script",
    worldSettingNote: tpl.helper.worldSettingNote,
    assets: tpl.assets,
    panelBorderEnabled: true,
    panelBorderWidthPx: 3,
  });
  return Object.freeze({
    schemaVersion: 1,
    projectId: projectId.trim() || "default",
    title: tpl.title,
    templateId: tpl.id,
    format: tpl.defaultFormat,
    inputMode: "script",
    helper: tpl.helper,
    rawScript: tpl.rawScript,
    assets: tpl.assets,
    cuts,
    artStyle: findArtStylePreset("anime"),
    customStylePresets: Object.freeze([]),
    panelBorderEnabled: true,
    panelBorderWidthPx: 3,
    scenes: tpl.scenes,
    sceneSnapshots: Object.freeze([]),
    codexEntries: tpl.codexEntries,
    subwayTimeline: tpl.subwayTimeline,
    spatialBoard: tpl.spatialBoard,
    updatedAtIso: new Date().toISOString(),
  });
}

export function parsePlotrDocumentState(
  raw: string | null,
  expectedProjectId: string,
): PlotrDocumentState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlotrDocumentState> | null;
    if (
      !parsed ||
      parsed.schemaVersion !== 1 ||
      typeof parsed.projectId !== "string" ||
      parsed.projectId !== (expectedProjectId.trim() || "default") ||
      !Array.isArray(parsed.cuts) ||
      !Array.isArray(parsed.assets)
    ) {
      return null;
    }
    return parsed as PlotrDocumentState;
  } catch {
    return null;
  }
}

function readFallbackRaw(key: string): string | null {
  const fromMemory = memoryFallbackStore.get(key);
  if (fromMemory !== undefined) return fromMemory;
  if (typeof window !== "undefined") {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return null;
}

function writeFallbackRaw(key: string, serialized: string): void {
  memoryFallbackStore.set(key, serialized);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(key, serialized);
    } catch {
      // 세션 저장이 막힌 환경에서는 메모리 캐시로 동작을 이어간다.
    }
  }
}

export function clearPlotrMemoryStoreForTest(): void {
  memoryFallbackStore.clear();
}

export async function loadPlotrDocument(
  projectId: string,
): Promise<PlotrDocumentState> {
  const key = plotrStorageKey(projectId);
  try {
    const loaded = await withPlanningDocument(
      "studio-plotr-workbenches",
      key,
      async (_store, raw) => parsePlotrDocumentState(raw, projectId),
    );
    if (loaded) {
      writeFallbackRaw(key, JSON.stringify(loaded));
      return loaded;
    }
  } catch {
    // 기기 저장소 워커가 없는 테스트/오프라인 환경에서는 폴백 저장소에서 읽는다.
  }
  const fallback = parsePlotrDocumentState(readFallbackRaw(key), projectId);
  return fallback ?? createEmptyPlotrDocument(projectId);
}

export function loadPlotrDocumentSync(projectId: string): PlotrDocumentState {
  const key = plotrStorageKey(projectId);
  const fallback = parsePlotrDocumentState(readFallbackRaw(key), projectId);
  return fallback ?? createEmptyPlotrDocument(projectId);
}

export async function savePlotrDocument(
  doc: PlotrDocumentState,
): Promise<{ readonly savedToDevice: boolean; readonly document: PlotrDocumentState }> {
  const nextDoc: PlotrDocumentState = Object.freeze({
    ...doc,
    updatedAtIso: new Date().toISOString(),
  });
  const key = plotrStorageKey(nextDoc.projectId);
  const serialized = JSON.stringify(nextDoc);
  writeFallbackRaw(key, serialized);

  let savedToDevice = false;
  try {
    await withPlanningDocument(
      "studio-plotr-workbenches",
      key,
      async (store) => {
        await store.set(key, serialized);
      },
    );
    savedToDevice = true;
  } catch {
    // 기기 저장소 미연결 시에도 세션/메모리 폴백에 보존된다.
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STUDIO_PLOTR_UPDATED_EVENT, { detail: nextDoc }),
    );
  }
  return { savedToDevice, document: nextDoc };
}
