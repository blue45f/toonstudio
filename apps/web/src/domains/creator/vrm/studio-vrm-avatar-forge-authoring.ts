/**
 * 아바타 조형 상태의 **생성 VRM 전용 저작 설정**(`AvatarForgeState.authoring`).
 *
 * 표정 편집과 헤어 흔들림은 새로 만드는 VRM 의 모프 타깃·스프링본에만 들어간다. 불러온 VRM 위에
 * 얹는 비파괴 조형(오버레이)은 이 값을 읽지 않는다 — 남의 모델이 가진 표정·스프링을 덮어쓰지 않는다.
 *
 * 저장 계약
 *  - 조형 코어(studio-vrm-avatar-forge)는 Studio 편집기가 처음부터 불러오는 모듈이다. 거기서 표정·흔들림
 *    검증기를 정적으로 가져오면 편집기 첫 로딩에 VRM 생성 코드가 딸려 온다(studio eager graph 래칫).
 *    그래서 코어는 이 값을 **불투명한 원본으로 보관만** 하고, 쓰는 쪽(생성 레시피·휴머노이드 메시·
 *    편집 UI)은 언제나 {@link readAvatarForgeVrmAuthoring} 으로 검증된 값을 읽는다.
 *  - 설정이 비면 키 자체를 지운다. 그래서 이 기능 이전 조형 문서·직렬화 서명·생성 결과 바이트가 같다.
 */

import {
  sanitizeStudioVrmExpressionAuthoring,
  type StudioVrmExpressionAuthoring,
} from "./studio-vrm-generate-expressions";
import {
  sanitizeStudioVrmHairSwayAuthoring,
  type StudioVrmHairSwayAuthoring,
} from "./studio-vrm-generate-hair-sway";

import type { AvatarForgeState } from "./studio-vrm-avatar-forge";

/** 조형 코어가 보관하는 원본 모양(JSON). 검증 전이라 안쪽 값은 알 수 없다. */
export type AvatarForgeVrmAuthoringDocument = NonNullable<AvatarForgeState["authoring"]>;

export type AvatarForgeVrmAuthoring = {
  readonly expressions?: StudioVrmExpressionAuthoring;
  readonly hairSway?: StudioVrmHairSwayAuthoring;
};

export function sanitizeAvatarForgeVrmAuthoring(raw: unknown): AvatarForgeVrmAuthoring | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const expressions = sanitizeStudioVrmExpressionAuthoring(source.expressions);
  const hairSway = sanitizeStudioVrmHairSwayAuthoring(source.hairSway);
  if (!expressions && !hairSway) return undefined;
  return { ...(expressions ? { expressions } : {}), ...(hairSway ? { hairSway } : {}) };
}

/** 조형 상태에서 검증된 저작 설정을 읽는다. 저장본이 오염됐으면 그 부분만 버린다. */
export function readAvatarForgeVrmAuthoring(
  state: Pick<AvatarForgeState, "authoring">,
): AvatarForgeVrmAuthoring | undefined {
  return sanitizeAvatarForgeVrmAuthoring(state.authoring);
}

/**
 * 검증된 설정을 조형 상태에 보관할 JSON 원본으로 넘긴다. 정규화는 값이 없는 키를 만들지 않아(undefined 를
 * 남기지 않는다) 모양 그대로 JSON 이고, 장면 문서 저장도 이 모양을 그대로 받는다.
 */
function toAuthoringDocument(authoring: AvatarForgeVrmAuthoring): AvatarForgeVrmAuthoringDocument {
  return authoring as AvatarForgeVrmAuthoringDocument;
}

/** 조형 상태의 저작 설정 하나를 바꾼 새 상태. 비면 키를 지운다. */
export function withAvatarForgeVrmAuthoring(
  state: AvatarForgeState,
  patch: Partial<AvatarForgeVrmAuthoring>,
): AvatarForgeState {
  const authoring = sanitizeAvatarForgeVrmAuthoring({ ...readAvatarForgeVrmAuthoring(state), ...patch });
  const next: AvatarForgeState = { ...state };
  if (authoring) next.authoring = toAuthoringDocument(authoring);
  else delete next.authoring;
  return next;
}

/** 저작 설정을 뺀 외형 서명. 표정·흔들림만 바꿨을 때 외형에서 나오는 계산(헤어 체인 등)을 다시 하지 않게 한다. */
export function avatarForgeAppearanceSignature(state: AvatarForgeState): string {
  const { authoring: _authoring, ...appearance } = state;
  return JSON.stringify(appearance);
}

/**
 * 상태를 통째로 갈아끼우는 조작(스타일 프리셋 적용 등)에서 작가가 만든 표정·흔들림을 지키기 위해
 * 이전 상태의 저작 설정을 새 상태로 옮긴다. 새 상태가 이미 자기 설정을 가졌다면 그쪽이 이긴다.
 */
export function carryAvatarForgeVrmAuthoring(next: AvatarForgeState, previous: AvatarForgeState): AvatarForgeState {
  if (next.authoring || !previous.authoring) return next;
  return { ...next, authoring: previous.authoring };
}
