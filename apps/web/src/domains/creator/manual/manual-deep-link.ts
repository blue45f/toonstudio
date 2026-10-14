import { buildReturnContextHref } from "@/shared/navigation/return-context";

import type { ManualSectionTool } from "./manual-article-screens";
import type { ManualArticle } from "./studio-manual-data";
import { manualArticleHref } from "./studio-manual-search";

/**
 * 매뉴얼 딥링크 — BLUEPRINT §2.4 도착 지점 규칙(S2-9)의 출발 쪽 단일 경로.
 *
 * 매뉴얼에서 작업 공간으로 나갈 때 S2-8 복귀 맥락 계약
 * (`{ returnTo, intent: "manual-deep-link" }`)을 href에 실어, 도착 표면이
 * (a) 맥락 배너 한 줄("매뉴얼에서 이어서 실행 중")과 (b) 완료 시 복귀 행동
 * ("끝나면 매뉴얼로 돌아가기")을 제공할 수 있게 한다. 에디터 계열 도착지는
 * `ReturnContextBanner`(S2-8)가 이 계약을 그대로 소비한다.
 *
 * 규칙:
 * - `returnTo`는 지금 읽고 있는 문서 주소 하나만 싣는다. 섹션 앵커(#…)는
 *   계약의 `sanitizeReturnTo`가 거부하므로 복귀 대상에 넣지 않는다 —
 *   섹션 정밀도는 도착 href 쪽 해시로만 유지한다(아래 섹션 도구 참조).
 * - 링크는 기존처럼 새 탭으로 열리므로, 계약이 없는 표면에 도착해도
 *   매뉴얼 탭이 그대로 남아 동선이 끊기지 않는다.
 * - 검증에 실패하면 `buildReturnContextHref`가 원래 href를 그대로 돌려준다
 *   (맥락 없이 가는 기존 동선 무손상).
 */

/** 문서의 작업 공간 버튼(머리말·하단 CTA)이 여는 주소에 복귀 맥락을 실은 값. */
export function manualWorkspaceHref(article: Pick<ManualArticle, "id" | "workspace">): string {
  return buildReturnContextHref(article.workspace, {
    returnTo: manualArticleHref(article.id),
    intent: "manual-deep-link",
  });
}

/**
 * 섹션 단위 도구 바로가기가 여는 주소에 복귀 맥락을 실은 값.
 * 도구 href의 해시(예: `#music-import`, `#ai-director`)는 도착 표면의 실행
 * 위치를 가리키는 실행 맥락이므로, 쿼리를 끼운 뒤에도 그대로 보존한다.
 */
export function manualSectionToolHref(articleId: string, tool: Pick<ManualSectionTool, "href">): string {
  const hashIndex = tool.href.indexOf("#");
  const base = hashIndex >= 0 ? tool.href.slice(0, hashIndex) : tool.href;
  const hash = hashIndex >= 0 ? tool.href.slice(hashIndex) : "";
  return `${buildReturnContextHref(base, {
    returnTo: manualArticleHref(articleId),
    intent: "manual-deep-link",
  })}${hash}`;
}
