/**
 * 프로모 편집 undo 히스토리의 병합(coalescing) 판정.
 *
 * 제목·줄거리 같은 텍스트 입력과 음량 슬라이더는 onChange가 연속으로 발생한다.
 * 편집 1건마다 스냅샷을 쌓으면 undo 한 번에 한 글자씩만 되돌아가는 범람이 생기므로,
 * 같은 병합 키를 가진 연속 편집은 시간 창 안에서는 새 스냅샷을 쌓지 않는다.
 * 병합 키가 없는 편집(컷 추가·삭제·이동 같은 이산 조작)은 항상 스냅샷을 쌓는다.
 *
 * 병합 키는 컴포넌트·컷 단위가 아니라 연속 입력 컨트롤(글자·숫자·슬라이더) 단위로 준다.
 * 컷 하나를 키 하나로 묶으면 1.2초 안에 누른 버튼(구도 맞바꾸기·기본값·추가·제거)과 선택 상자 변경까지
 * 앞선 입력과 한 단계로 병합돼, 실행 취소 한 번이 마지막 조작보다 많이 되돌린다.
 */

export interface PromoHistoryMeta {
  readonly key: string | null;
  readonly at: number;
}

export const PROMO_HISTORY_COALESCE_MS = 1_200;
export const PROMO_HISTORY_LIMIT = 30;

export const EMPTY_PROMO_HISTORY_META: PromoHistoryMeta = { key: null, at: 0 };

/** 이번 편집이 undo 스택에 새 스냅샷을 쌓아야 하는지 판정한다. */
export function shouldPushPromoUndo(
  meta: PromoHistoryMeta,
  coalesceKey: string | undefined,
  now: number,
): boolean {
  if (!coalesceKey) return true;
  if (meta.key !== coalesceKey) return true;
  return now - meta.at >= PROMO_HISTORY_COALESCE_MS;
}

/** 편집 뒤의 다음 메타. 병합 여부와 무관하게 키와 시각을 갱신한다. */
export function nextPromoHistoryMeta(
  coalesceKey: string | undefined,
  now: number,
): PromoHistoryMeta {
  return { key: coalesceKey ?? null, at: now };
}

/**
 * 하위 편집기가 넘긴 필드 키에 편집 범위(컷·믹서·음성 항목 등)를 붙인다.
 * 필드 키는 연속 입력 컨트롤만 넘긴다. 필드 키 없이 호출한 이산 조작은 병합 키도 없어 항상 새 스냅샷을 쌓는다.
 */
export function scopedPromoCoalesceKey(
  scope: string,
  field: string | undefined,
): string | undefined {
  return field ? `${scope}:${field}` : undefined;
}

/** 상한을 지키며 스냅샷을 쌓는다. */
export function pushPromoSnapshot<T>(history: readonly T[], snapshot: T): T[] {
  return [...history.slice(-(PROMO_HISTORY_LIMIT - 1)), snapshot];
}

export interface PromoHistoryTracker {
  /** 편집 1건이 새 undo 스냅샷을 쌓아야 하는지 판정하고 메타를 갱신한다. 이벤트 핸들러에서만 호출한다. */
  shouldPush: (coalesceKey?: string) => boolean;
  /** undo/redo 이동 뒤에 호출해 다음 편집이 병합되지 않게 한다. */
  reset: () => void;
}

/** 병합 메타를 내부에 보관하는 트래커. Date.now는 핸들러 경로에서만 읽는다. */
export function createPromoHistoryTracker(
  windowMs: number = PROMO_HISTORY_COALESCE_MS,
): PromoHistoryTracker {
  let meta: PromoHistoryMeta = EMPTY_PROMO_HISTORY_META;
  return {
    shouldPush: (coalesceKey?: string) => {
      const now = Date.now();
      const push =
        !coalesceKey || meta.key !== coalesceKey || now - meta.at >= windowMs;
      meta = nextPromoHistoryMeta(coalesceKey, now);
      return push;
    },
    reset: () => {
      meta = EMPTY_PROMO_HISTORY_META;
    },
  };
}
