import { useEffect, useMemo, useState } from "react";

import {
  readStudioEpisodeStageContext,
  type StudioEpisodeStageContext,
} from "../../studio-shell/studio-episode-stage-context";
import { loadStudioEpisodeStageIdLazy } from "./studio-episode-stage-source";

/**
 * 에디터 호스트용 회차 단계 소스 (A3 잔여 연결).
 *
 * 호스트가 마운트 시점에 들고 있는 것 중 제작 회차를 가리키는 것은
 * 문서 신원이 아니라, 표면을 연 쪽이 URL에 명시한 회차 맥락
 * (`?productionProjectId=…&episodeId=…`, studio-episode-stage-context)
 * 뿐이다. 그래서 이 훅은 그 맥락과 로그인 세션이 모두 있을 때만
 * 정본 합성(studio-episode-stage-source)을 지연 조달하고, 나머지는
 * 전부 null이다 — 맥락 없음·로그인 전·읽기 실패·지금 단계 없음이
 * 모두 "제안 없음"이며, 이는 연결 전(`episodeStage: null`)의 동작과
 * 같다. 문서 워크스페이스(documentWorkspace)는 문서 종류 분류라
 * 회차 단계로 읽지 않는다.
 *
 * 조달 결과는 (사용자·맥락) 키와 함께 보관한다. 맥락이 바뀌면 이전
 * 회차의 단계가 한 프레임이라도 새 회차의 제안으로 새지 않는다 —
 * 반환값은 현재 키와 맞는 결과뿐이고, 그 전에는 null이다.
 */
export function useStudioEpisodeStage(
  search: string,
  userId: string | null,
): string | null {
  const context = useMemo(() => readStudioEpisodeStageContext(search), [search]);
  const contextKey = context && userId
    ? `${userId}:${context.productionProjectId}:${context.episodeId}`
    : null;
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly stage: string | null;
  } | null>(null);

  useEffect(() => {
    if (!context || !contextKey) return;
    let active = true;
    const requested: StudioEpisodeStageContext = context;
    void loadStudioEpisodeStageIdLazy(requested)
      .then((stage) => {
        if (active) setLoaded({ key: contextKey, stage });
      })
      .catch(() => {
        if (active) setLoaded({ key: contextKey, stage: null });
      });
    return () => {
      active = false;
    };
  }, [context, contextKey]);

  if (!contextKey || !loaded || loaded.key !== contextKey) return null;
  return loaded.stage;
}
