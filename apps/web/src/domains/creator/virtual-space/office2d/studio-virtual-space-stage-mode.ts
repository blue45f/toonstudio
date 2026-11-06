/**
 * 가상 스튜디오 스테이지 선택.
 *
 * - office2d(기본): ToonOffice 2D 엔진(StudioOffice2dCanvas). 2026-10-28부터 기본이다.
 * - three: 선택형 3D(three.js) 스테이지. 위치 칩의 2D/3D 전환이나 `?stage=3d`로 연다.
 * - legacy: 이전 Phaser 2D 스테이지. 월드 편집(저작 모드)은 디버그 오버레이가 있는 이 스테이지를 계속 쓰고,
 *   `?stage=legacy`로 비교·롤백 확인을 할 수 있다(레거시 예외, 점진 제거 대상).
 */
export type StudioVirtualStageMode = "2d" | "3d" | "legacy";
export type StudioVirtualStageKind = "office2d" | "three" | "legacy";

export const STUDIO_VIRTUAL_STAGE_QUERY = "stage";
export const STUDIO_VIRTUAL_STAGE_STORAGE_KEY = "toonstudio:virtual-space-stage-mode:v1";

export function readStudioVirtualPreferredEngineMode(search?: string): "2d" | "3d" {
  if (typeof search === "string" && search.length > 0) {
    const explicit = new URLSearchParams(search).get(STUDIO_VIRTUAL_STAGE_QUERY);
    if (explicit === "3d") return "3d";
    if (explicit === "2d" || explicit === "legacy") return "2d";
  }
  if (typeof window === "undefined") return "2d";
  try {
    const saved = window.localStorage.getItem(STUDIO_VIRTUAL_STAGE_STORAGE_KEY);
    return saved === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

export function writeStudioVirtualPreferredEngineMode(mode: "2d" | "3d"): boolean {
  if ((mode !== "2d" && mode !== "3d") || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_STAGE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export function applyStudioVirtualStageSearch(search: string, mode: "2d" | "3d"): string {
  const params = new URLSearchParams(search);
  if (mode === "3d") {
    params.set(STUDIO_VIRTUAL_STAGE_QUERY, "3d");
  } else {
    params.delete(STUDIO_VIRTUAL_STAGE_QUERY);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function readStudioVirtualStageMode(search: string): StudioVirtualStageMode {
  const value = new URLSearchParams(search).get(STUDIO_VIRTUAL_STAGE_QUERY);
  if (value === "3d" || value === "legacy" || value === "2d") return value;
  if (value === null) return readStudioVirtualPreferredEngineMode();
  return "2d";
}

export function resolveStudioVirtualStageKind(input: {
  readonly engineMode: "2d" | "3d";
  readonly authoringMode: boolean;
  readonly search: string;
}): StudioVirtualStageKind {
  if (input.authoringMode || readStudioVirtualStageMode(input.search) === "legacy") return "legacy";
  return input.engineMode === "3d" ? "three" : "office2d";
}
