/**
 * 추론 파이프라인의 공개 입출력 타입 — 순수 타입 모듈.
 *
 * 엔진(`studio-bg3d-inference-engine.ts`)·세션 리듀서·UI·변형 스냅 어댑터가 같은 계약을 보게 한다.
 * 런타임 값은 거의 두지 않는다.
 */

import type {
  StudioBg3dInferenceAxis,
  StudioBg3dInferenceKind,
} from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";

type V3 = StudioBg3dInferenceVec3;

export type StudioBg3dInferencePointerKind = "mouse" | "pen" | "touch" | "keyboard";

export type StudioBg3dInferenceProjection =
  | {
      readonly type: "perspective";
      /** 화면 1px이 이루는 시야각(라디안). 깊이 d에서 1px = d·radiansPerPixel 월드 단위. */
      readonly radiansPerPixel: number;
    }
  | {
      readonly type: "orthographic";
      /** 화면 1px에 해당하는 월드 길이(깊이와 무관). */
      readonly worldPerPixel: number;
    };

/** 어댑터(R3F 래이캐스트)가 알려 주는 첫 표면 교점. */
export interface StudioBg3dInferenceSurfaceHit {
  readonly point: V3;
  readonly normal?: V3 | null;
  readonly sourceId?: string | null;
  readonly label?: string | null;
}

export type StudioBg3dInferenceCursor =
  | {
      readonly kind: "point";
      readonly point: V3;
      /** 커서 깊이에서 화면 1px에 해당하는 월드 길이. */
      readonly worldPerPixel: number;
      readonly surfaceHit?: StudioBg3dInferenceSurfaceHit | null;
    }
  | {
      readonly kind: "ray";
      readonly origin: V3;
      /** 단위 방향 벡터. */
      readonly direction: V3;
      readonly projection: StudioBg3dInferenceProjection;
      readonly surfaceHit?: StudioBg3dInferenceSurfaceHit | null;
      /** 바닥 평면 높이(up 축 좌표). null이면 바닥을 후보로 쓰지 않는다. */
      readonly groundY?: number | null;
    };

export type StudioBg3dInferenceRelation = "parallel" | "perpendicular";

/** 방향키로 거는 잠금. */
export type StudioBg3dInferenceLock =
  | { readonly kind: "none" }
  | { readonly kind: "axis"; readonly axis: StudioBg3dInferenceAxis }
  | {
      readonly kind: "direction";
      readonly direction: V3;
      readonly relation: StudioBg3dInferenceRelation;
      readonly referenceId: string;
      readonly referenceLabel: string;
    };

/** Shift로 "현재 추론 유지" 중일 때의 제약. */
export type StudioBg3dInferenceHold =
  | {
      readonly kind: "line";
      readonly origin: V3;
      readonly direction: V3;
      readonly axis: StudioBg3dInferenceAxis | null;
      readonly from: StudioBg3dInferenceKind;
    }
  | {
      readonly kind: "plane";
      readonly point: V3;
      readonly normal: V3;
      readonly sourceId: string | null;
    }
  | {
      readonly kind: "point";
      readonly point: V3;
      readonly from: StudioBg3dInferenceKind;
    };

export interface StudioBg3dInferenceReferenceDirection {
  readonly id: string;
  readonly label: string;
  /** 단위 방향. */
  readonly direction: V3;
  /** 기준이 된 모서리 선분 — 있으면 평행·수직 유도선과 함께 강조해 보여 준다. */
  readonly segment?: { readonly a: V3; readonly b: V3 };
}

export interface StudioBg3dInferenceThresholds {
  readonly pointPx?: number;
  readonly edgePx?: number;
  readonly alignPx?: number;
}

export interface StudioBg3dInferenceQuery {
  readonly index: StudioBg3dInferenceIndex;
  readonly cursor: StudioBg3dInferenceCursor;
  /** 직전에 확정한 기준점 — 축 정렬·평행·수직 추론의 출발점. */
  readonly referencePoint?: V3 | null;
  /** 잠시 머물러 얻은 추가 기준점(최대 4개) — "기준점에서 연장". */
  readonly hoverReferences?: readonly V3[];
  /** 호출자가 이미 알고 있는 평행·수직 기준 방향(가이드선 등). */
  readonly referenceDirections?: readonly StudioBg3dInferenceReferenceDirection[];
  readonly lock?: StudioBg3dInferenceLock;
  readonly hold?: StudioBg3dInferenceHold | null;
  readonly pointer?: StudioBg3dInferencePointerKind;
  /** 지정하면 이 종류만 후보로 쓴다. */
  readonly enabledKinds?: ReadonlySet<StudioBg3dInferenceKind> | null;
  /** 지정한 종류가 거리와 무관하게 먼저 평가된다(레거시 `preferKinds` 호환). */
  readonly preferKinds?: ReadonlySet<StudioBg3dInferenceKind> | null;
  readonly excludeSourceIds?: ReadonlySet<string> | null;
  readonly grid?: { readonly step: number; readonly origin?: V3 } | null;
  readonly thresholds?: StudioBg3dInferenceThresholds;
}

export type StudioBg3dInferenceGuideRole =
  | "axis"
  | "from-point"
  | "relation"
  | "reference-edge"
  | "edge"
  | "projection"
  | "lock";

export interface StudioBg3dInferenceGuide {
  readonly id: string;
  readonly role: StudioBg3dInferenceGuideRole;
  readonly from: V3;
  readonly to: V3;
  readonly axis: StudioBg3dInferenceAxis | null;
  readonly dashed: boolean;
}

export type StudioBg3dInferenceAppliedConstraint =
  | { readonly kind: "none" }
  | { readonly kind: "axis"; readonly axis: StudioBg3dInferenceAxis }
  | { readonly kind: "direction"; readonly relation: StudioBg3dInferenceRelation }
  | { readonly kind: "hold-line" }
  | { readonly kind: "hold-plane" }
  | { readonly kind: "hold-point" };

export interface StudioBg3dInferenceResult {
  readonly kind: StudioBg3dInferenceKind;
  readonly point: V3;
  /** 툴팁에 짧게 보이는 문구. 예: "끝점", "X축 정렬". */
  readonly label: string;
  /** 출처 설명. 예: "상자 1 · 꼭짓점". */
  readonly detail: string | null;
  /** 스크린리더 안내문(측정값은 UI가 덧붙인다). */
  readonly announcement: string;
  readonly axis: StudioBg3dInferenceAxis | null;
  /** 축·평행·수직·선 위의 단위 방향. */
  readonly direction: V3 | null;
  readonly normal: V3 | null;
  readonly sourceIds: readonly string[];
  readonly edgeId: string | null;
  /** 정렬 선의 출발점(축 정렬은 직전 기준점, 기준점 연장은 호버 기준점). */
  readonly alignmentOrigin: V3 | null;
  /** 평행·수직의 기준이 된 모서리·가이드(↓ 키로 잠글 때 사용). */
  readonly relation: { readonly id: string; readonly label: string } | null;
  readonly guides: readonly StudioBg3dInferenceGuide[];
  readonly constraint: StudioBg3dInferenceAppliedConstraint;
  /** 잠금·유지로 특징점을 선·면에 투영해 얻은 결과인지. */
  readonly projected: boolean;
  /** 경계 상자에서 파생한 근사 후보인지. */
  readonly approximate: boolean;
  /** 커서에서 후보까지 화면 거리(px). 자유 위치는 null. */
  readonly distancePx: number | null;
}

export interface StudioBg3dInferenceCandidateSummary {
  readonly kind: StudioBg3dInferenceKind;
  readonly point: V3;
  readonly distancePx: number;
  readonly sourceIds: readonly string[];
}

export interface StudioBg3dInferenceStats {
  /** 쿼리 하나가 정밀 평가한 후보 수(점+모서리+면+정렬). */
  readonly evaluated: number;
  readonly pointsConsidered: number;
  readonly edgesConsidered: number;
  readonly volumesConsidered: number;
  readonly intersectionPairs: number;
  readonly cellsVisited: number;
  readonly featuresScanned: number;
  readonly truncated: boolean;
}

export type StudioBg3dInferenceFailureReason =
  | "invalid-cursor"
  | "invalid-scale"
  | "invalid-reference"
  | "no-target";

export interface StudioBg3dInferenceFailure {
  readonly ok: false;
  readonly reason: StudioBg3dInferenceFailureReason;
  readonly message: string;
}

export interface StudioBg3dInferenceSuccess {
  readonly ok: true;
  readonly result: StudioBg3dInferenceResult;
  /** 우선순위 순으로 정렬한 상위 후보(디버그·호환 어댑터용). */
  readonly ranked: readonly StudioBg3dInferenceCandidateSummary[];
  readonly stats: StudioBg3dInferenceStats;
}

export type StudioBg3dInferenceOutcome = StudioBg3dInferenceSuccess | StudioBg3dInferenceFailure;
