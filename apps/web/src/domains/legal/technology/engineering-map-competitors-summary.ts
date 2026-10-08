import { COMPETITOR_ROWS } from "./engineering-map-competitors-rows";
import { D, WATCHLIST_ONLY_IDS, t, type CompetitorDomainId } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 경쟁·참고 제품 지도의 영역별 요약. 발표 덱·도식·본문의 개수와 이름이 모두 여기서 한 번에 계산된다(손으로 적은 숫자나 이름이 없다).
 *
 * - `names`: 그 영역의 행 이름을 지도 순서대로 모은 것. 행 이름은 정확히 한 영역에 한 번만 들어간다(테스트가 확인).
 * - `studiedNames`: 그중 저장소 문서가 관찰을 적은 제품. `watchedNames`: 감시 목록·대상 목록에만 이름이 있어 ‘미조사’로 적힌 제품.
 *   둘을 섞어 "참고한 제품 N곳"이라고 세지 않는다.
 * - `learned`: 영역별 ‘배운 점 한 줄’(70자 이내, 손으로 씀). 그 영역 행의 `learned` 칸에서 근거를 찾을 수 있는 말만 쓴다.
 *
 * 읽는 쪽은 이 모듈이 가진 행 배열을 다시 계산하지 않고 그대로 쓴다. 영역의 순서는 지도에 처음 나타나는 순서이며,
 * 기존 여덟 영역 뒤에 2D 애니메이션·마켓·계정 영역이 온다.
 */

export interface CompetitorDomainSummary {
  /** 영역 키(`engineering-map-competitors-kit.ts` 의 `D` 의 키). */
  readonly domainId: CompetitorDomainId;
  /** 표의 첫 열에 쓰는 영역 이름. */
  readonly domain: LocalizedText;
  /** 영역에 속한 모든 행의 이름(지도 순서). */
  readonly names: readonly string[];
  /** 그중 비교·적용·불채택 관찰이 있는 제품. */
  readonly studiedNames: readonly string[];
  /** 그중 ‘미조사’(감시 목록·대상 목록에만 있음)인 제품. */
  readonly watchedNames: readonly string[];
  /** 영역별 배운 점 한 줄(한국어 70자 이내). */
  readonly learned: LocalizedText;
}

/** 영역별 ‘배운 점 한 줄’. 영역 키가 빠지면 타입 오류가 나도록 모든 키를 적는다. */
export const COMPETITOR_DOMAIN_LEARNED: Readonly<Record<CompetitorDomainId, LocalizedText>> = {
  drawing: t(
    "획 보정·비파괴 효과·복구 구조를 배우되 이름·화면·소재는 따라 하지 않음",
    "Learned stroke stabilizing, non-destructive effects and recovery; copied no names, screens or assets",
  ),
  threeD: t(
    "포즈·품질 기준을 배우되 상용 런타임·자산은 넣지 않음",
    "Learned posing and quality bars; shipped no commercial runtimes or assets",
  ),
  collab: t(
    "커서·근접 대화·검수 초대를 배우되 ‘동등’ 주장은 하지 않음",
    "Learned cursors, nearby talk and review invites; claim no parity",
  ),
  storyboard: t(
    "검토 상태 보드·만료 검토 링크를 배우되 버전 승인 링크는 아직 안 만듦",
    "Learned review status boards and expiring review links; version-approval links are not built yet",
  ),
  design: t(
    "짧은 템플릿 길·저장 보호 계층을 배우되 화면·자산은 복제하지 않음",
    "Learned the short template path and layered save protection; copied no screens or assets",
  ),
  publishing: t(
    "예약·분석·발견 흐름을 배우되 외부 게시·수익 연동은 주장하지 않음",
    "Learned scheduling, analytics and discovery flows; claim no external publishing or revenue sync",
  ),
  ai: t(
    "공급자 라우팅·참조 팩·후보 비교를 배우되 애매한 실패는 다시 보내지 않음",
    "Learned provider routing, reference packs and candidate comparison; never resend an ambiguous failure",
  ),
  engines: t(
    "엔진은 미리 하나를 고르고 몰래 갈아타지 않으며 맞지 않으면 채택하지 않음",
    "Pick one engine up front, never switch silently, and adopt none that does not fit",
  ),
  animation: t(
    "고칠 수 있는 중심선과 가중 변형을 배우되 코드·소재는 가져오지 않음",
    "Learned editable centerlines and weighted deformation; took no code or assets",
  ),
  market: t(
    "제작 적합성 판정·리뷰 자격·학습 경로를 배우되 유료 결제는 넣지 않음",
    "Learned production-fit verdicts, review eligibility and learning paths; added no paid checkout",
  ),
  identity: t(
    "공급자별 최소 동의 범위를 배우고 수요가 없는 공급자는 늘리지 않음",
    "Learned minimal consent scopes per provider; added no provider without demand",
  ),
};

/** 감시 목록·대상 목록에만 이름이 있는 행인지. 발표 덱(engineering-talk-benchmarks)도 같은 기준을 쓴다. */
export function isUnresearchedCompetitorRow(row: EngineeringMapRow): boolean {
  return WATCHLIST_ONLY_IDS.has(row.id) || (row.cells.learned?.ko ?? "").startsWith("미조사");
}

const DOMAIN_IDS = Object.keys(D) as CompetitorDomainId[];

function domainIdOfRow(row: EngineeringMapRow): CompetitorDomainId | undefined {
  const label = row.cells.domain?.ko;
  return DOMAIN_IDS.find((id) => D[id].ko === label);
}

function buildSummary(rows: readonly EngineeringMapRow[]): readonly CompetitorDomainSummary[] {
  // 영역은 표에 처음 나타나는 순서로 정한다. 어느 영역에도 맞지 않는 행이 있으면 조용히 빼지 않고 테스트가 실패하도록 둔다.
  const order: CompetitorDomainId[] = [];
  const byDomain = new Map<CompetitorDomainId, EngineeringMapRow[]>();
  for (const row of rows) {
    const id = domainIdOfRow(row);
    if (!id) continue;
    if (!byDomain.has(id)) {
      byDomain.set(id, []);
      order.push(id);
    }
    byDomain.get(id)?.push(row);
  }
  return order.map((id) => {
    const members = byDomain.get(id) ?? [];
    return {
      domainId: id,
      domain: D[id],
      names: members.map((row) => row.name),
      studiedNames: members.filter((row) => !isUnresearchedCompetitorRow(row)).map((row) => row.name),
      watchedNames: members.filter((row) => isUnresearchedCompetitorRow(row)).map((row) => row.name),
      learned: COMPETITOR_DOMAIN_LEARNED[id],
    };
  });
}

export const COMPETITOR_DOMAIN_SUMMARY: readonly CompetitorDomainSummary[] = buildSummary(COMPETITOR_ROWS);

/** 본문·도식이 쓰는 개수. 모두 행에서 계산한다. */
export const COMPETITOR_COUNTS = {
  /** 지도의 모든 행. */
  total: COMPETITOR_ROWS.length,
  /** 비교·적용·불채택 관찰이 저장소 문서에 있는 제품. */
  studied: COMPETITOR_ROWS.filter((row) => !isUnresearchedCompetitorRow(row)).length,
  /** 감시 목록·대상 목록에만 이름이 있어 ‘미조사’로 적은 제품. */
  unresearched: COMPETITOR_ROWS.filter((row) => isUnresearchedCompetitorRow(row)).length,
  /** 영역 수. */
  areas: COMPETITOR_DOMAIN_SUMMARY.length,
} as const;
