import type { StudioProjectStartPoint } from "./studio-project-definition";

/**
 * 시작 레인 계약 (BLUEPRINT §2.3, S2-7).
 *
 * /create 관문의 시작 레인은 카드 장식이 아니라 "무엇을 먼저 할 것인가"의 선택지이며,
 * 2단계 생성 양식(/studio/new)은 레인 정보를 받아 초기값과 생성 후 착지를 결정한다.
 *
 * - 이야기부터(idea): 첫 단계는 기획. 양식 시작점 초기값은 idea, 착지는 기획 표면(story).
 * - 콘티부터(storyboard): 첫 단계는 콘티/작화. 시작점 초기값은 storyboard, 착지는 에디터.
 * - 빈 캔버스(blank): 재료가 없으므로 시작점 초기값은 강제하지 않고(기존 기본값 유지),
 *   착지만 에디터로 정한다. 캔버스 규격은 1단계 형식 선택의 기본 규격을 쓴다.
 * - 템플릿에서(template): 캔버스 규격은 `?template=`가 고른 형식·템플릿 크기가 결정하고,
 *   착지는 에디터다. 레인은 template 파라미터에서 추론한다.
 * - 가져오기(import)는 양식을 거치지 않고 /studio/import 표면 자체가 착지라 레인으로 다루지 않는다.
 *
 * 레인이 없는 진입(딥링크·기존 링크)은 null을 돌려주어 양식의 기존 동작을 그대로 유지한다.
 */
export type StudioCreateLane = "idea" | "storyboard" | "blank" | "template";

/** 생성 완료 후 착지 종류. planning=기획 표면(story), editor=문서 에디터. */
export type StudioCreateLanding = "planning" | "editor";

export interface StudioCreateLaneSpec {
  readonly lane: StudioCreateLane;
  /** 양식 2단계(지금 가진 재료)의 초기값. null이면 레인이 강제하지 않는다. */
  readonly startPoint: StudioProjectStartPoint | null;
  readonly landing: StudioCreateLanding;
}

const LANE_SPECS: Readonly<Record<StudioCreateLane, StudioCreateLaneSpec>> = Object.freeze({
  idea: Object.freeze({ lane: "idea", startPoint: "idea", landing: "planning" }),
  storyboard: Object.freeze({ lane: "storyboard", startPoint: "storyboard", landing: "editor" }),
  blank: Object.freeze({ lane: "blank", startPoint: null, landing: "editor" }),
  template: Object.freeze({ lane: "template", startPoint: null, landing: "editor" }),
});

const LANE_IDS: ReadonlySet<string> = new Set(Object.keys(LANE_SPECS));

export function studioCreateLaneSpec(lane: StudioCreateLane): StudioCreateLaneSpec {
  return LANE_SPECS[lane];
}

/** `?lane=`로 명시된 레인만 돌려준다. 모르는 값은 무시한다(추론으로 떨어지지 않는다). */
export function studioCreateExplicitLane(params: URLSearchParams): StudioCreateLane | null {
  const raw = params.get("lane");
  return raw !== null && LANE_IDS.has(raw) ? (raw as StudioCreateLane) : null;
}

/**
 * 진입 파라미터에서 레인을 확정한다. 명시된 `?lane=`가 우선하고,
 * 없으면 기존 파라미터(template·start)에서 추론한다. 어느 쪽도 없으면 null.
 */
export function resolveStudioCreateLane(params: URLSearchParams): StudioCreateLane | null {
  const explicit = studioCreateExplicitLane(params);
  if (explicit !== null) return explicit;
  if (params.get("lane") !== null) return null;
  if (params.get("template")) return "template";
  const start = params.get("start");
  if (start === "idea" || start === "script") return "idea";
  if (start === "storyboard") return "storyboard";
  return null;
}

/**
 * 사용자가 양식 안에서 재료(시작점)를 직접 바꿨을 때 레인이 따라가는 매핑.
 * files는 가져오기 착지가 따로 있어 레인을 바꾸지 않는다(null = 기존 레인 유지).
 */
export function studioCreateLaneForStartPoint(
  startPoint: StudioProjectStartPoint,
): StudioCreateLane | null {
  if (startPoint === "idea" || startPoint === "script") return "idea";
  if (startPoint === "storyboard") return "storyboard";
  return null;
}

/** 레인이 정하는 착지. 레인이 없으면 null — 호출부가 기존 시작점 기반 착지를 유지한다. */
export function studioCreateLanding(lane: StudioCreateLane | null): StudioCreateLanding | null {
  return lane === null ? null : LANE_SPECS[lane].landing;
}
