/**
 * 소재 권리 기록이 바뀌었음을 알리는 아주 작은 신호.
 *
 * 가져오기 직후의 AI 사용 표기 저장은 장면 반영보다 늦게 끝난다. 그 사이 카드는 이미 그려졌으므로, 저장이 끝나면
 * 이 신호로 권리 읽기 훅에게 다시 읽으라고 알린다. 의존하는 모듈이 없어 가져오기 쪽(지연 로드)과 패널 쪽(지연 로드)이
 * 서로를 불러오지 않고도 만날 수 있다.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** 권리 기록 변경을 구독한다. 반환된 함수로 해제한다. */
export function subscribeStudioBg3dAssetRightsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 권리 기록이 저장소에 쓰였음을 구독자에게 알린다. 구독자가 던져도 다른 구독자에게 영향을 주지 않는다. */
export function notifyStudioBg3dAssetRightsChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // 한 구독자의 오류가 저장 결과를 바꾸지 않는다.
    }
  }
}
