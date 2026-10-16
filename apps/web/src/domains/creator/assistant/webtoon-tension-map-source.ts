/**
 * webtoon-tension-map-source.ts
 *
 * 텐션 맵 화면이 쓰는 "무엇을 분석할지" 결정 로직 — 콘티 대본 또는 현재 원고의 컷 목록을 골라
 * 곡선 입력으로 바꾸고, 화면이 그대로 그릴 수 있는 상태(비어 있음 · 오류 · 준비됨)로 돌려준다.
 * React 에 의존하지 않아 컴포넌트 밖에서 시험할 수 있다. 부수효과·네트워크·난수가 없다.
 *
 * 대본은 이 기기 안에서만 분석한다. `StudioAiStoryboardDirector` 는 규칙 기반이라 AI 연결 없이
 * 동작하며 입력을 어디에도 보내지 않는다.
 */

import { StudioAiStoryboardDirector } from "../ai/studio-ai-storyboard-director";

import {
  analyzeTensionMap,
  tensionCutsFromPanels,
  tensionCutsFromStoryboardPlan,
  type TensionMapResult,
} from "./webtoon-tension-map";

import type { PanelVerticalSpan } from "./webtoon-scroll-pacing-simulator";

export type TensionMapSourceKind = "script" | "document";

/** 대본 입력 상한(문자). textarea 의 maxLength 와 분석이 같은 값을 쓴다. */
export const TENSION_MAP_SCRIPT_MAX_CHARS = 20_000;

/**
 * "예시 대본 넣기" 버튼이 채우는 열 줄 대본. 도입(평온) → 반전 → 대치 → 결의 순으로, 콘티
 * 디렉터의 규칙(키워드)에 맞춰 늘어짐·급함·절정 후보가 모두 한 번씩 나오게 썼다.
 * 사용자가 직접 누를 때만 입력란에 들어가며, 분석 결과로 위장하지 않는다.
 */
export const TENSION_MAP_SAMPLE_SCRIPT = [
  "방과 후 텅 빈 교실, 주인공이 혼자 칠판을 지운다.",
  "창밖으로 노을이 천천히 번진다.",
  "책상 위에 놓인 낡은 노트를 펼쳐 본다.",
  "노트 사이에서 오래된 편지가 툭 떨어진다.",
  "편지를 읽던 주인공의 숨결이 멎는다.",
  "복도 끝에서 낯선 발소리가 점점 가까워진다.",
  "교실 문이 쾅 하고 열리며 그림자가 드리운다.",
  '낯선 남자가 "그 편지, 내놔."라고 낮게 말하며 다가온다.',
  "주인공이 편지를 움켜쥐고 주먹에 힘을 준다.",
  "주인공이 고개를 들고 어둠 속으로 한 걸음 내딛는다.",
].join("\n");

export type TensionMapEmptyReason = "no-script" | "no-panels" | "no-scorable-cut";

export type TensionMapView =
  | { readonly status: "empty"; readonly reason: TensionMapEmptyReason }
  | { readonly status: "error"; readonly detail: string }
  | {
      readonly status: "ready";
      readonly kind: TensionMapSourceKind;
      readonly result: TensionMapResult;
    };

/**
 * 선택한 출처로 곡선을 계산한다. 예외는 던지지 않고 `error` 상태로 돌려준다 —
 * 화면이 빈 칸 대신 안내를 보여 줄 수 있게 한다.
 */
export function buildTensionMapView(params: {
  readonly kind: TensionMapSourceKind;
  readonly script: string;
  readonly panels: readonly PanelVerticalSpan[];
}): TensionMapView {
  try {
    if (params.kind === "script") {
      const script = params.script.slice(0, TENSION_MAP_SCRIPT_MAX_CHARS);
      if (script.trim() === "") return { status: "empty", reason: "no-script" };
      const plan = new StudioAiStoryboardDirector().direct(script);
      const result = analyzeTensionMap(tensionCutsFromStoryboardPlan(plan.cuts));
      return result.cuts.length === 0
        ? { status: "empty", reason: "no-scorable-cut" }
        : { status: "ready", kind: "script", result };
    }
    if (params.panels.length === 0) return { status: "empty", reason: "no-panels" };
    const result = analyzeTensionMap(tensionCutsFromPanels(params.panels));
    return result.cuts.length === 0
      ? { status: "empty", reason: "no-scorable-cut" }
      : { status: "ready", kind: "document", result };
  } catch (error) {
    return { status: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}
