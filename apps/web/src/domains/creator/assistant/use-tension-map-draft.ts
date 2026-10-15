import { useMemo, useState } from "react";

import type { TensionMapSourceKind } from "./webtoon-tension-map-source";

/**
 * 텐션 맵 탭에서 작가가 직접 넣은 입력 — 고른 컷 목록 출처와 붙여 넣은 콘티 대본.
 *
 * 탭 본문 안에 두면 보조 센터를 닫는 순간(Esc 한 번) 같이 사라진다. 이웃 탭들의 상태는 센터를 닫았다
 * 열어도 남으므로(`StudioWebtoonAssistantModal` 이 마운트를 유지한다) 텐션 맵도 같은 수명을 갖도록,
 * 이 훅을 센터 쪽에서 부르고 탭 본문에는 값과 변경 함수를 내려 보낸다. 다른 모듈에서 가져오는 것은
 * 타입뿐이라 탭 본문 청크(차트·계산·추천 코드)를 끌어오지 않는다.
 */
export interface TensionMapDraft {
  /**
   * 작가가 직접 고른 출처. null 이면 아직 고르지 않은 것이라 지금 원고에 컷이 있으면 `현재 원고`를,
   * 없으면 `콘티 대본`을 연다(센터를 닫은 사이 원고가 바뀌었어도 맞게 열린다).
   */
  readonly kind: TensionMapSourceKind | null;
  readonly script: string;
  readonly onKindChange: (kind: TensionMapSourceKind) => void;
  readonly onScriptChange: (script: string) => void;
}

export function useTensionMapDraft(): TensionMapDraft {
  const [kind, setKind] = useState<TensionMapSourceKind | null>(null);
  const [script, setScript] = useState("");
  return useMemo(
    () => ({ kind, script, onKindChange: setKind, onScriptChange: setScript }),
    [kind, script],
  );
}
