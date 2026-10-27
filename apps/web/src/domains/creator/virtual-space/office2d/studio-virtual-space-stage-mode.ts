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

export function readStudioVirtualStageMode(search: string): StudioVirtualStageMode {
  const value = new URLSearchParams(search).get(STUDIO_VIRTUAL_STAGE_QUERY);
  return value === "3d" || value === "legacy" ? value : "2d";
}

export function resolveStudioVirtualStageKind(input: {
  readonly engineMode: "2d" | "3d";
  readonly authoringMode: boolean;
  readonly search: string;
}): StudioVirtualStageKind {
  if (input.authoringMode || readStudioVirtualStageMode(input.search) === "legacy") return "legacy";
  return input.engineMode === "3d" ? "three" : "office2d";
}
