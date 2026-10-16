/**
 * 같은 대상에 참을 연달아 붙이는 흐름(계단 카운터와 선택 이어 받기).
 *
 * 5초 안에 같은 대상에 이어 붙이면 횟수가 늘어 계단식으로 비껴 놓이고, 대상이 바뀌거나 시간이 지나면 처음부터다
 * (호스트의 `nextAssetInsertionPlacement` 와 같은 규칙). 이 모듈은 의존성이 없어서, 편집기 진입 그래프에 정적으로
 * 들어오는 슬롯이 붙이기 계산 전체(`studio-charm-insert.ts`)를 끌어오지 않고도 쓸 수 있다.
 */

const CASCADE_WINDOW_MS = 5_000;

export function createStudioCharmCascade(
  windowMs: number = CASCADE_WINDOW_MS,
): (targetKey: string, now: number) => number {
  let last: { readonly key: string; readonly count: number; readonly at: number } | null = null;
  return (targetKey, now) => {
    const count = last && last.key === targetKey && now - last.at < windowMs ? last.count + 1 : 0;
    last = { key: targetKey, count, at: now };
    return count;
  };
}

/** 선택 이어 받기가 필요로 하는 선택의 최소 모양. */
export interface StudioCharmBurstSelection {
  readonly id?: string;
}

/**
 * 연달아 붙이는 동안 "붙인 직후 호스트가 자동으로 고른 요소"를 사용자의 선택으로 오해하지 않게 한다.
 *
 * 호스트의 삽입 명령(`addEl`)은 새 요소를 문서에 넣고 곧바로 그 요소를 선택한다. 그대로 두면 같은 칩을 다시 눌렀을 때
 * 선택은 "방금 붙인 요소"이고, 컷을 고른 채 시작했어도 대상이 그 요소로 바뀌어 계단 카운터가 0 으로 돌아간다
 * (스티커처럼 크기가 없는 요소면 선택이 없는 것으로 읽혀 화면 중앙으로 새기도 한다).
 *
 * 구분 방법: 직전에 읽은 뒤로 같은 문서에 새로 생긴 요소(직전 읽기 때의 요소 ID 목록에 없던 ID)가 지금 선택돼 있으면
 * 그것은 사용자가 고른 것이 아니라 직전 붙이기의 결과다. 이때는 직전 붙이기가 쓴 선택(컷·요소·없음)을 그대로 이어 받는다.
 * 붙이기는 요소를 늘리기만 하므로 "직전에 알던 요소가 모두 그대로 있다"도 조건이다 — 다른 페이지나 문서 마스터로 옮겨
 * 요소 목록이 통째로 바뀐 뒤에 고른 컷은 새로 생긴 요소처럼 보이지만 붙이기의 결과가 아니다.
 * 사용자가 문서에 원래 있던 요소를 직접 고르거나 선택을 풀면 이어 받지 않고 그 선택을 따른다. 요소 ID 목록을 모르거나
 * 창(5초)이 지났으면 이어 받지 않는다 — 이때의 동작은 이어 받기가 없던 때와 같다.
 *
 * 한계: 5초 안에 사용자가 같은 문서에서 다른 도구로 새 요소를 만들어 선택한 경우도 "새로 생긴 요소"라 직전 대상을 이어 받는다.
 * 그 사이에 요소를 지웠다면 이어 받지 않고(안전한 쪽), 선택한 요소가 요소 목록에 없으면(저장 전 펜 획) 이어 받지 않는다.
 */
export function createStudioCharmBurst<TSelection extends StudioCharmBurstSelection>(
  windowMs: number = CASCADE_WINDOW_MS,
): (selected: TSelection | null, elementIds: readonly string[] | null, now: number) => TSelection | null {
  let last: {
    readonly selection: TSelection | null;
    readonly knownIds: ReadonlySet<string> | null;
    readonly at: number;
  } | null = null;
  return (selected, elementIds, now) => {
    const current = elementIds ? new Set(elementIds) : null;
    const echoed = last !== null
      && last.knownIds !== null
      && current !== null
      && now - last.at < windowMs
      && selected?.id !== undefined
      && current.has(selected.id)
      && !last.knownIds.has(selected.id)
      && [...last.knownIds].every((id) => current.has(id));
    const selection = echoed && last ? last.selection : selected;
    last = { selection, knownIds: current, at: now };
    return selection;
  };
}
