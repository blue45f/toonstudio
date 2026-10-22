/**
 * 에디터 작업 모드 단계 제안의 정본 소스 조달 (A3 잔여 연결).
 *
 * 단계 도출 자체는 이 파일이 만들지 않는다. 정본은 제작 허브의
 * `deriveEpisodeStageStates`이고, 허브 밖 표면용 합성(QC 경유)은 공개 경계
 * `episodeStageForEpisode`(public/episode-stage)가 유일하게 소유한다 —
 * 에디터 헤더 칩(StudioEpisodeStageChip)이 쓰는 것과 같은 합성이다.
 * 이 파일의 몫은 둘뿐이다:
 * - 도출 결과에서 "지금 단계" 하나를 고르는 것. 규칙은 정본
 *   `currentEpisodeStage`(production-episode-stage)와 칩의
 *   `episodeStageChipCurrent`가 이미 고정해 둔 것과 같다 — status가
 *   "current"인 단계가 없으면 지어내지 않고 null이다.
 * - 그 단계 id를 문자열 그대로 돌려주는 것. 작업 모드로의 해석
 *   (storyboard→콘티 모드, review→마감 모드, art→전체 등)은
 *   `suggestStudioWorkModeForStage`(studio-work-mode)가 소유하므로,
 *   여기서 art를 draw/color로 나누는 식의 매핑을 만들지 않는다.
 *
 * 식별자는 명시적 회차 맥락(studio-episode-stage-context)이 있을 때만
 * 온다. 문서 신원(projectId·documentId·workId)은 제작 회차 신원이
 * 아니므로(StudioEpisodeStageChip 파일 주석의 실측) 여기서도 쓰지 않는다.
 */
import type { StudioEpisodeStageContext } from "../../studio-shell/studio-episode-stage-context";

/** 단계 도출 결과의 최소 모양. 정본 EpisodeStageState가 구조적으로 만족한다. */
export interface StudioEpisodeStageStateLike {
  readonly id: string;
  readonly status: string;
}

/** 지금 단계의 id. current가 없으면(게시 완료·멈춤·근거 없음) null — 단계를 지어내지 않는다. */
export function currentStudioEpisodeStageId(
  states: readonly StudioEpisodeStageStateLike[] | null | undefined,
): string | null {
  if (!states) return null;
  return states.find((state) => state.status === "current")?.id ?? null;
}

/** 공개 경계 조달에 필요한 두 함수의 모양. 테스트는 이 경계만 대체한다. */
export interface StudioEpisodeStageSourceDeps {
  readonly getProductionProject: (
    productionProjectId: string,
  ) => Promise<{ readonly aggregate: unknown }>;
  readonly episodeStageForEpisode: (
    aggregate: never,
    episodeId: string,
  ) => { readonly states: readonly StudioEpisodeStageStateLike[] } | null;
}

/**
 * 맥락이 가리키는 회차 1개의 지금 단계를 정본 합성으로 도출한다.
 * aggregate에 그 회차가 없거나(공개 경계가 null), 읽기에 실패하거나,
 * 지금 단계가 없으면 전부 null이다 — 다른 회차의 단계로 대체하거나
 * 실패를 단계처럼 말하지 않는다(칩의 "실패 = 없음" 계약과 같다).
 */
export async function loadStudioEpisodeStageId(
  context: StudioEpisodeStageContext,
  deps: StudioEpisodeStageSourceDeps,
): Promise<string | null> {
  try {
    const record = await deps.getProductionProject(context.productionProjectId);
    const derived = deps.episodeStageForEpisode(
      record.aggregate as never,
      context.episodeId,
    );
    return currentStudioEpisodeStageId(derived?.states);
  } catch {
    return null;
  }
}

/**
 * 실제 조달. 제작 허브 모델은 에디터 시작 그래프의 금지 도메인이라
 * (scripts/lib/studio-eager-graph-policy: production-hub = own-surface,
 * 기준선 0개) 정적 import로 끌어오지 않고, 맥락이 있는 표면에서만
 * 동적 import로 연다 — 헤더 칩 슬롯(StudioEpisodeStageChipSlot)이
 * 연결 단위를 지연 로딩하는 것과 같은 경계다.
 */
export async function loadStudioEpisodeStageIdLazy(
  context: StudioEpisodeStageContext,
): Promise<string | null> {
  const [{ getProductionProject }, { episodeStageForEpisode }] = await Promise.all([
    import("../../public/production-projects"),
    import("../../public/episode-stage"),
  ]);
  return loadStudioEpisodeStageId(context, {
    getProductionProject,
    episodeStageForEpisode: episodeStageForEpisode as StudioEpisodeStageSourceDeps["episodeStageForEpisode"],
  });
}
