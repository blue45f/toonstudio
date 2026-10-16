/**
 * studio-webtoon-assistant-cut-pose.ts
 *
 * 어시스턴트의 포즈 추천이 "어디에 적용하고 어떻게 되돌리는가"를 정하는 순수 어댑터.
 *
 * 컷 포즈는 이미 있는 `studio-cut-pose.ts` 계약을 그대로 쓴다: 컷(페이지)의 옵셔널 필드
 * `posePresetId` 를 `withCutPose` 로 불변 갱신하고, 호스트가 넘긴 `commitPages` — 스튜디오의
 * 페이지 히스토리를 쓰는 바로 그 커밋 — 로 반영한다. 그래서 적용은 편집기의 실행 취소 기록에
 * 한 단계로 남고, 어시스턴트의 "되돌리기"도 같은 경로로 이전 값을 다시 커밋한다. 이 모듈은
 * 상태도 DOM 도 없다.
 *
 * `studio-cut-pose.ts` 는 진입 그래프 밖에 있어서 호스트(StudioCuttoonEditorHost)가 직접 가져오지
 * 않고, 이 지연 로드 청크가 `commitPages` 만 받아 변환을 맡는다(호스트에는 정적 import 가 늘지 않는다).
 */

import { pageDisplayName } from "../studio-page-meta";
import {
  readCutPoseId,
  withCutPose,
  type CutPoseCarrier,
} from "../studio-cut-pose";

import type { PageState } from "../studio-page-state";

/** 어시스턴트가 호스트에서 받는 문서 접근 — 페이지 목록·현재 페이지·히스토리 커밋. */
export interface StudioWebtoonAssistantCutPoseHost {
  readonly pages: readonly PageState[];
  readonly currentPageId: string;
  /** 편집기 페이지 히스토리에 한 단계로 커밋한다. 잠금·저장 중 등으로 거절되면 false. */
  readonly commitPages: (nextPages: PageState[]) => boolean;
}

/** 포즈를 적용할 대상 — 지금 작업 중인 페이지(컷). */
export interface CutPoseTarget {
  readonly pageId: string;
  /** "3페이지" 같은 표시 이름(작가가 붙인 이름이 있으면 그 이름). */
  readonly pageLabel: string;
  /** 지금 이 페이지에 지정된 포즈 id. 없으면 null. */
  readonly currentPoseId: string | null;
}

/** 현재 페이지를 포즈 적용 대상으로 풀어낸다. 페이지를 못 찾으면 null. */
export function resolveCutPoseTarget(
  pages: readonly PageState[],
  currentPageId: string,
): CutPoseTarget | null {
  const index = pages.findIndex((page) => page.id === currentPageId);
  if (index < 0) return null;
  const page = pages[index];
  // PageState 는 posePresetId 를 선언하지 않는다 — 컷 포즈 계약의 최소 형태로 읽는다.
  const carrier: CutPoseCarrier = page;
  return {
    pageId: page.id,
    pageLabel: pageDisplayName(page, index),
    currentPoseId: readCutPoseId(carrier) ?? null,
  };
}

/**
 * 컷 포즈를 지정(presetId)하거나 지운다(null). 실질 변화가 없으면 커밋하지 않고 성공으로 본다.
 * 반환값은 "지금 이 페이지의 포즈가 요청한 값이 되었는가"이다.
 */
export function commitCutPoseChange(
  host: StudioWebtoonAssistantCutPoseHost,
  pageId: string,
  presetId: string | null,
): boolean {
  if (!host.pages.some((page) => page.id === pageId)) return false;
  const next = withCutPose(host.pages, pageId, presetId);
  if (next === host.pages) return true;
  return host.commitPages(next);
}
