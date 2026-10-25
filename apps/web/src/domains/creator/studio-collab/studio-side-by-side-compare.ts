/**
 * 나란히 비교 검수 — 순수 로직 (2026-10-25, 3단계 협업 우위).
 *
 * 클립스튜디오 서브 뷰와의 구분 (비방이 아닌 기능 구분):
 * 서브 뷰는 공식 도움말 기준 "색상 참조용 이미지" 팔레트다 — 참조 이미지 한 장을
 * 띄워 색을 뽑는 용도이며, 두 제작 버전을 한 화면에서 대조하고 그 자리에서
 * 검수 결정을 내리는 표면이 아니다. 이 모듈은 그 빈틈을 메운다.
 *  1. 동기 내비게이션: 두 화면이 하나의 뷰포트(확대·이동)를 공유해 같은 부위를
 *     동시에 본다. 한쪽만 움직이는 참조창과 다르다.
 *  2. 원클릭 버전 교체: 좌·우 슬롯에 다른 버전을 한 번의 선택으로 갈아끼운다.
 *  3. 앵커 기반 인라인 피드백: 코멘트가 이미지 좌표(0~1 정규화)에 고정돼,
 *     확대·이동을 해도 지적 부위를 따라가고, 스레드가 비교 화면 안에서
 *     바로 열리고 답글을 단다. 검수 큐의 승인/수정요청과 같은 상태로 이어진다.
 * 참고: https://help.clip-studio.com/en-us/manual_en/210_file/Import_reference_image.htm
 */

export interface CompareVersion {
  readonly id: string;
  readonly label: string;
  /** 미리보기 이미지 URL. 없으면 버전 정보 카드만 표시한다. */
  readonly imageUrl?: string | null;
  readonly note?: string;
}

export interface ComparePair {
  readonly left: CompareVersion;
  readonly right: CompareVersion;
}

/** 두 화면이 공유하는 뷰포트. offset은 이미지 크기 대비 백분율이다. */
export interface CompareViewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const COMPARE_SCALE_MIN = 0.25;
export const COMPARE_SCALE_MAX = 8;

export const DEFAULT_COMPARE_VIEWPORT: CompareViewport = { scale: 1, offsetX: 0, offsetY: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyComparePan(viewport: CompareViewport, dxPercent: number, dyPercent: number): CompareViewport {
  return { ...viewport, offsetX: viewport.offsetX + dxPercent, offsetY: viewport.offsetY + dyPercent };
}

export function applyCompareZoom(viewport: CompareViewport, factor: number): CompareViewport {
  if (!Number.isFinite(factor) || factor <= 0) return viewport;
  return { ...viewport, scale: clamp(viewport.scale * factor, COMPARE_SCALE_MIN, COMPARE_SCALE_MAX) };
}

export function resetCompareViewport(): CompareViewport {
  return { ...DEFAULT_COMPARE_VIEWPORT };
}

/** 원클릭 버전 교체: 좌·우 슬롯을 맞바꾼다. */
export function swapComparePair(pair: ComparePair): ComparePair {
  return { left: pair.right, right: pair.left };
}

export function replaceCompareSide(pair: ComparePair, side: "left" | "right", version: CompareVersion): ComparePair {
  return side === "left" ? { left: version, right: pair.right } : { left: pair.left, right: version };
}

export interface CompareCommentAnchor {
  readonly id: string;
  readonly threadId: string;
  readonly side: "left" | "right";
  /** 0~1 정규화 좌표. 뷰포트와 무관하게 지적 부위를 고정한다. */
  readonly x: number;
  readonly y: number;
  readonly author: string;
  readonly body: string;
}

export function normalizeCompareAnchor(anchor: CompareCommentAnchor): CompareCommentAnchor {
  return { ...anchor, x: clamp(anchor.x, 0, 1), y: clamp(anchor.y, 0, 1) };
}

/** 앵커를 화면 픽셀 위치로 변환한다. 뷰포트 변환 뒤에도 같은 부위를 가리킨다. */
export function compareAnchorToPixels(
  anchor: CompareCommentAnchor,
  paneWidth: number,
  paneHeight: number,
  viewport: CompareViewport,
): { left: number; top: number } {
  const clamped = normalizeCompareAnchor(anchor);
  const contentWidth = paneWidth * viewport.scale;
  const contentHeight = paneHeight * viewport.scale;
  const originX = (paneWidth - contentWidth) / 2 + (viewport.offsetX / 100) * paneWidth;
  const originY = (paneHeight - contentHeight) / 2 + (viewport.offsetY / 100) * paneHeight;
  return { left: originX + clamped.x * contentWidth, top: originY + clamped.y * contentHeight };
}
