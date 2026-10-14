/**
 * 실시간 동시 드로잉 병합 엔진 — 연산(op) 모델.
 *
 * 설계 전제 (main 실측 기반, REPORT.md 참조):
 * - 프로덕션 문서 모델(`studio-crdt-document-types.ts`)의 스트로크 레코드 어휘를 그대로 따른다:
 *   스트로크는 `id + pageId + layerId + payload`이고, 삭제는 tombstone(`deleted`)이며,
 *   z-order는 레이어 내 순서 목록이 정본이다.
 * - 이 엔진은 스트로크를 원자 단위로 하는 op 로그다. 스트로크는 가산적(additive)이므로
 *   병합의 본질은 ① 순서(z-order) ② 삭제 참조(tombstone) 해결 ③ 속성 최신값 결정이며,
 *   문자 단위 OT 같은 변환 행렬은 필요 없다.
 * - 권위 순서는 서버가 부여하는 총순서(seq)다. 클라이언트는 자기 op를 낙관 적용하고,
 *   권위 순서가 도착하면 로그를 다시 접어(fold) 조정(reconcile)한다.
 */

/** 스트로크 기하 변형. 단위: dx/dy는 페이지 정규화 좌표 이동량, scale은 배율, rotation은 도(deg). */
export interface StrokeTransform {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
}

export const IDENTITY_TRANSFORM: StrokeTransform = Object.freeze({
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
});

/**
 * 그리기 페이로드. 프로덕션 `StudioCrdtDrawStrokePayload`의 병합 관련 부분집합.
 * points는 [x0, y0, x1, y1, ...] 페이지 정규화 좌표(0..1) 평탄 배열이다.
 * 페이로드는 add 시점에 확정되는 불변 본문 + transform + 시각 속성으로 나뉜다.
 */
export interface StrokeDrawPayload {
  version: 1;
  type: "draw";
  kind: string;
  mode: "pen" | "eraser";
  /** 선 색상 (CSS color). */
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  blendMode?: string;
  points: number[];
  pressures?: number[];
  transform?: StrokeTransform;
}

export interface StrokeInput {
  id: string;
  pageId: string;
  layerId: string;
  payload: StrokeDrawPayload;
}

/** setProps가 만질 수 있는 시각 속성 키. 기하(points)는 불변, 위치는 transform op 전담. */
export type StrokePropKey = "stroke" | "strokeWidth" | "opacity" | "blendMode";

export const STROKE_PROP_KEYS: readonly StrokePropKey[] = Object.freeze([
  "stroke",
  "strokeWidth",
  "opacity",
  "blendMode",
]);

/**
 * 속성 패치. set은 키→새 값, unset은 제거할 키.
 * 모든 setProps/transform op는 `prev`(덮어쓰기 직전 값의 패치)를 함께 실어
 * 사용자별 undo가 역연산을 만들 수 있게 한다.
 */
export interface StrokePropsPatch {
  set: Partial<Record<StrokePropKey, string | number>>;
  unset: StrokePropKey[];
}

export type StrokeOpBody =
  | {
      kind: "add";
      stroke: StrokeInput;
      /** z-order 삽입 기준. null/미지정이면 레이어 끝에 붙인다. */
      beforeStrokeId?: string | null;
    }
  | { kind: "remove"; strokeId: string }
  | { kind: "restore"; strokeId: string }
  | {
      kind: "transform";
      strokeId: string;
      transform: StrokeTransform;
      prev: StrokeTransform;
    }
  | {
      kind: "setProps";
      strokeId: string;
      patch: StrokePropsPatch;
      /** patch를 적용하기 직전 상태로 되돌리는 역패치. undo가 그대로 전송한다. */
      prev: StrokePropsPatch;
    };

/** 전송·저장 단위 op 봉투. */
export interface StrokeOp {
  /** `${actorId}:${counter}` — 전역 유일, 멱등 dedupe 키. */
  opId: string;
  actorId: string;
  /** Lamport 시계. 임시(미확정) 정렬과 진단용이며, 권위 순서는 seq가 정한다. */
  lamport: number;
  /** 발신자가 op 생성 시점에 적용 완료했던 마지막 권위 seq. 충돌 진단·catch-up 힌트. */
  baseSeq: number;
  body: StrokeOpBody;
}

/** 서버 총순서가 부여된 op. 브로드캐스트와 catch-up은 이 형태만 흐른다. */
export interface SequencedStrokeOp extends StrokeOp {
  seq: number;
}

/** 접힌(fold) 문서 상태에서의 스트로크. */
export interface StrokeState {
  id: string;
  pageId: string;
  layerId: string;
  payload: StrokeDrawPayload;
  /** tombstone. true여도 payload와 순서는 남는다(undo·restore·늦은 op 안전). */
  deleted: boolean;
  /**
   * 아직 add가 도착하지 않은 id에 remove가 먼저 접힌 자리표시 tombstone.
   * 뒤이어 오는 add는 이 tombstone을 존중해 deleted 상태로 생성된다(삭제 우선).
   */
  placeholder: boolean;
  createdBy: string;
}

/** 직렬화 가능한 스냅샷 상태. catch-up이 로그 유지 범위를 넘을 때 쓴다. */
export interface SerializedMergeState {
  strokes: StrokeState[];
  /** [`${pageId}\u0000${layerId}`, 순서 있는 strokeId 목록] 쌍 목록. */
  order: [string, string[]][];
}

export interface MergeSnapshot {
  seq: number;
  state: SerializedMergeState;
}

export function layerOrderKey(pageId: string, layerId: string): string {
  return `${pageId}\u0000${layerId}`;
}
