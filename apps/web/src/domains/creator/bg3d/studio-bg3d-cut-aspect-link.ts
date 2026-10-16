// 시네마틱 디렉터의 "컷 비율" 선택지와 문서 캡처 프레임 비율(output.exportAspectRatio, 가로/세로)
// 사이의 변환. 컷 비율은 예전에 북마크 메모(panelAspect)로만 남아 캡처 프레임과 이어지지 않았다.
// 이제 3D 장면과 연결된 덱에서는 같은 값을 LT 탭의 "출력 비율"과 공유한다 — 둘 중 어느 쪽에서
// 바꿔도 뷰포트의 안전 프레임·삽입 크롭·컷 저장이 같은 비율을 쓴다.
//
// 비교는 캡처 프레임 프리셋과 같은 함수(matchStudioBg3dCaptureAspectPreset)로 해서, 디렉터 쪽 표기와
// LT 패널 쪽 표기가 서로 다른 판정 기준을 갖지 않게 한다.

import { matchStudioBg3dCaptureAspectPreset } from "./studio-bg3d-capture-frame-geometry";

import type { WebtoonPanelAspect } from "../scene-3d/studio-3d-camera-cinematic-director";

export interface StudioBg3dCutAspectOption {
  readonly id: WebtoonPanelAspect;
  /** 가로/세로. 캡처 프레임 프리셋(STUDIO_BG3D_CAPTURE_ASPECT_PRESETS)의 같은 비율과 일치한다. */
  readonly ratio: number;
  /** 캡처 프레임 프리셋 id. */
  readonly presetId: string;
}

/** 디렉터 "컷 비율" 선택지(세로로 긴 순서에서 가로로 넓은 순서). */
export const STUDIO_BG3D_CUT_ASPECT_OPTIONS: readonly StudioBg3dCutAspectOption[] = Object.freeze([
  Object.freeze({ id: "9:16", ratio: 9 / 16, presetId: "9-16" }),
  Object.freeze({ id: "4:5", ratio: 4 / 5, presetId: "4-5" }),
  Object.freeze({ id: "1:1", ratio: 1, presetId: "1-1" }),
  Object.freeze({ id: "16:9", ratio: 16 / 9, presetId: "16-9" }),
  Object.freeze({ id: "21:9", ratio: 21 / 9, presetId: "21-9" }),
]);

/**
 * 선택 칸이 보여 줄 값. 다섯 비율 중 하나이거나, 뷰포트 비율을 따르는 자동("free"),
 * 또는 다섯 비율에 없는 직접 지정("custom")이다.
 */
export type StudioBg3dCutAspectSelection = WebtoonPanelAspect | "free" | "custom";

export function resolveStudioBg3dCutAspectSelection(
  captureRatio: number | null | undefined,
): StudioBg3dCutAspectSelection {
  const presetId = matchStudioBg3dCaptureAspectPreset(captureRatio);
  if (presetId === "viewport") return "free";
  return STUDIO_BG3D_CUT_ASPECT_OPTIONS.find((option) => option.presetId === presetId)?.id ?? "custom";
}

/** 선택지 id 를 캡처 프레임 비율로. 선택지에 없는 값(자동·직접 지정 포함)은 undefined 다. */
export function studioBg3dCaptureRatioFromCutAspect(value: string): number | undefined {
  return STUDIO_BG3D_CUT_ASPECT_OPTIONS.find((option) => option.id === value)?.ratio;
}

export function isStudioBg3dCutAspectOptionId(value: unknown): value is WebtoonPanelAspect {
  return STUDIO_BG3D_CUT_ASPECT_OPTIONS.some((option) => option.id === value);
}
