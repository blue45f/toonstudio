/**
 * 작품 시작 입구 정본 (A5, 2026-10-22) — "시작 입구 3중 분산" 해소의 단일 출처.
 *
 * 실측 (2026-10-22, 이 모듈 도입 직전):
 * 시작 입구가 세 갈래로 읽혔다.
 *  1. 전역 입구 — 헤더 CTA·모바일 메뉴·커맨드 팔레트는 /create(작품 시작
 *     시트, 레인 5개)를 가리킨다. 정문으로 올바르다.
 *  2. 작업공간 입구 — /home 작업공간과 /studio 라이브러리 로비의 "새 작품"
 *     주 행동이 전부 bare /studio/new(2단계 생성 양식)로 직행했다. 사용자는
 *     레인 선택(기획 착지냐 에디터 착지냐)을 건너뛰고, 양식 기본값
 *     (idea → 기획 착지)으로 떨어졌다. 같은 "새 작품"인데 입구마다
 *     착지가 달랐다.
 *  3. 온보딩 입구 — 온보딩 게이트 완료 CTA의 기본값도 bare /studio/new
 *     직행이라, 첫 사용자의 첫 작품조차 관문을 거치지 않았다.
 * 그리고 양식(/studio/new)에는 관문으로 돌아가는 복귀 링크가 없어,
 * 직행으로 들어온 사용자는 시작 방법을 다시 고를 길이 없었다.
 *
 * 이 모듈이 고정하는 계약:
 *  - 맥락 없는 "새 작품" 주 행동은 전부 정문(/create) 하나로 읽힌다.
 *    레인·착지는 관문과 양식의 레인 계약(studio-create-lane)이 결정한다.
 *  - 맥락 있는 딥링크는 예외다: 템플릿(kind·template)·시작점(start)·레인
 *    (lane)·제작 온보딩(onboarding) 파라미터를 단 /studio/new 링크는
 *    의도가 이미 정해진 진입이라 양식으로 직행한다. 관문으로 돌리면
 *    의도가 깨진다(로비의 템플릿 프리셋 카드, 학습 가이드의 제작 시작
 *    링크, 아이디어 입력의 start=idea 등이 여기 해당한다).
 *  - 양식에서의 복귀는 관문이다 — "시작 방법 다시 고르기"는 /create로
 *    돌아간다(StudioNewIntegratedPage 상단 복귀 링크가 이 값을 쓴다).
 *  - 이어가기(기존 작품 열기)는 시작 입구가 아니다. 이 계약의 대상이
 *    아니며, 작품이 없을 때의 폴백만 시작 입구로 본다.
 */

export const STUDIO_START_GATEWAY_HREF = "/create";
export const STUDIO_NEW_FORM_PATH = "/studio/new";

/** 시작 의도를 싣는 쿼리 키 — 하나라도 있으면 딥링크로 보고 양식 직행을 허용한다. */
export const STUDIO_START_INTENT_PARAM_KEYS = [
  "template",
  "kind",
  "start",
  "lane",
  "onboarding",
  "title",
] as const;

/** href가 시작 의도를 단 딥링크인지 — 경로가 양식이고 의도 키가 하나라도 있을 때만 true. */
export function hasStudioStartIntent(href: string): boolean {
  const queryIndex = href.indexOf("?");
  if (queryIndex < 0) return false;
  if (href.slice(0, queryIndex) !== STUDIO_NEW_FORM_PATH) return false;
  const params = new URLSearchParams(href.slice(queryIndex + 1));
  return STUDIO_START_INTENT_PARAM_KEYS.some((key) => params.has(key));
}

/**
 * 시작 링크 정규화 — bare 양식 링크(의도 없음)는 정문으로, 딥링크와
 * 그 외 경로는 그대로 돌려준다. 입구 표면이 자기 링크를 이 함수에
 * 통과시키면 "맥락 없는 새 작품 = 정문" 계약이 표면마다 흔들리지 않는다.
 */
export function resolveStudioStartHref(href: string): string {
  if (href === STUDIO_NEW_FORM_PATH) return STUDIO_START_GATEWAY_HREF;
  return href;
}

/** 양식 상단 복귀 링크의 도착지 — 시작 방법을 다시 고르는 곳은 관문뿐이다. */
export const STUDIO_START_FORM_BACK_HREF = STUDIO_START_GATEWAY_HREF;
