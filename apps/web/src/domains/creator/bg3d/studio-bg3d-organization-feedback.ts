/**
 * 태그·컴포넌트·장면 정보 명령의 결과를 사용자 말로 바꾸는 순수 모듈.
 *
 * 실패 문구는 "원인 + 다음 행동"을 함께 담는다(말투 가드와 같은 문형). 문구는 `studio.bg3dScene.*` 키가 정본이고,
 * 여기의 한국어는 사전이 아직 도착하지 않았을 때 보이는 폴백이다. 화면은 `t(copy.key, copy.fallback)` 로 푼다.
 */

import type { StudioBg3dOrganizationFailureReason } from "./studio-bg3d-organization-controller";

export interface StudioBg3dOrganizationCopy {
  readonly key: string;
  readonly fallback: string;
}

/** 입력 칸 종류 — 같은 `invalid-input` 이라도 어떤 글을 고쳐야 하는지가 다르다. */
export type StudioBg3dOrganizationField = "tag" | "name" | "memo" | "meta";

const INVALID_INPUT_COPY: Readonly<Record<StudioBg3dOrganizationField, StudioBg3dOrganizationCopy>> = {
  tag: {
    key: "studio.bg3dScene.error.invalidTag",
    fallback: "태그는 비어 있거나 32자를 넘으면 안 되고, 주소나 비밀번호처럼 보이는 글도 쓸 수 없어요. 다른 태그로 다시 입력해 주세요.",
  },
  name: {
    key: "studio.bg3dScene.error.invalidName",
    fallback: "이름이 비었거나 길이·글자 규칙에 맞지 않아요. 주소나 비밀번호처럼 보이는 글 없이 다시 입력해 주세요.",
  },
  memo: {
    key: "studio.bg3dScene.error.invalidMemo",
    fallback: "메모에 쓸 수 없는 글이 있어요. 주소나 비밀번호처럼 보이는 줄을 지우고 다시 저장해 주세요.",
  },
  meta: {
    key: "studio.bg3dScene.error.invalidMeta",
    fallback: "이름이나 메모에 쓸 수 없는 글이 있어요. 주소나 비밀번호처럼 보이는 글을 지우고 다시 저장해 주세요.",
  },
};

/** 거절 이유 → 사용자 문구. 이유는 모두 다음 행동을 안내한다. */
export function describeStudioBg3dOrganizationFailure(
  reason: StudioBg3dOrganizationFailureReason,
  field: StudioBg3dOrganizationField,
): StudioBg3dOrganizationCopy {
  switch (reason) {
    case "invalid-input":
      return INVALID_INPUT_COPY[field];
    case "limit-exceeded":
      return {
        key: "studio.bg3dScene.error.limit",
        fallback: "더 붙일 수 없어요. 오브젝트마다 태그 8개, 장면 전체로는 서로 다른 태그 64개까지 쓸 수 있으니 안 쓰는 태그를 뗀 뒤 다시 시도해 주세요.",
      };
    case "entity-not-found":
      return {
        key: "studio.bg3dScene.error.notFound",
        fallback: "대상을 찾지 못했어요. 목록을 확인한 뒤 오브젝트를 다시 선택해 주세요.",
      };
    case "busy":
      return {
        key: "studio.bg3dScene.error.busy",
        fallback: "캡처나 복원 같은 다른 작업이 끝난 뒤 다시 시도해 주세요.",
      };
    case "unchanged":
      return {
        key: "studio.bg3dScene.status.unchanged",
        fallback: "바뀐 내용이 없어요.",
      };
    case "remove-failed":
      return {
        key: "studio.bg3dScene.error.generic",
        fallback: "변경을 적용하지 못했어요. 선택을 확인한 뒤 다시 시도해 주세요.",
      };
  }
}
