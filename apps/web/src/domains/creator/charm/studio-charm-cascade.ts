/**
 * 같은 대상에 참을 연달아 붙이는 횟수를 세는 카운터.
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
