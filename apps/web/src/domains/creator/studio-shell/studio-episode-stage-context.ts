/**
 * 에디터 헤더 칩의 명시적 회차 맥락 (BLUEPRINT S2-5 확산, S2-8 복귀 맥락의 선행 부분집합).
 *
 * 에디터 문서 신원(projectId·documentId·workId)만으로는 제작 회차를 알 수 없다 —
 * 문서 프로젝트는 로컬 라이브러리 메타데이터이고, 정본 문서 라우트의 workId는
 * 문서 id를 얹은 레거시 신원이다(studio-workspace-route 실측). 그래서 칩은
 * 신원에서 단계를 추측하지 않고, 표면을 연 쪽이 URL에 명시한 맥락
 * (`?productionProjectId=…&episodeId=…`)이 있을 때만 표시된다. 이 읽기 규칙은
 * 마켓 복귀 안내(StudioMarketplaceReturnNotice)가 URL 맥락을 읽는 기존 방식과
 * 같고, 정본 문서 href의 파라미터 정리(cleanCanonicalParams)는 예약 키와
 * 레거시 신원 키만 지우므로 이 두 키는 작업공간 전환에도 유지된다.
 *
 * S2-8 복귀 맥락 계약({returnTo, stageId, projectId, episodeId, intent})이
 * 일반화되면 이 리더는 그 계약의 독자로 합쳐진다. 그때까지의 계약은
 * "두 값이 모두 유효한 신원이어야 맥락이 있다" 하나뿐이다.
 */

export interface StudioEpisodeStageContext {
  /** 제작 허브 aggregate를 읽을 제작 프로젝트 id (문서 프로젝트 id와 다른 신원이다). */
  readonly productionProjectId: string;
  /** 그 프로젝트 안에서 단계를 도출할 회차 id. */
  readonly episodeId: string;
}

/** studio-document-workspace의 신원 정규화와 같은 규칙: 길이·공백·제어문자·백슬래시를 거부한다. */
function normalizeContextIdentity(value: string | null): string | null {
  if (value === null) return null;
  if (
    value.length === 0
    || value.length > 160
    || value.trim() !== value
    || value === "."
    || value === ".."
    || value.includes("\\")
  ) {
    return null;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return null;
  }
  return value;
}

/**
 * URL 검색 파라미터에서 회차 맥락을 읽는다. 둘 중 하나라도 없거나 유효하지
 * 않으면 맥락 없음(null)이다 — 한쪽만으로 단계를 지어내지 않는다.
 * 같은 키가 여러 번 오면 첫 값을 쓴다(URLSearchParams.get의 기본 동작).
 */
export function readStudioEpisodeStageContext(
  search: string | URLSearchParams,
): StudioEpisodeStageContext | null {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const productionProjectId = normalizeContextIdentity(params.get("productionProjectId"));
  const episodeId = normalizeContextIdentity(params.get("episodeId"));
  if (!productionProjectId || !episodeId) return null;
  return { productionProjectId, episodeId };
}
