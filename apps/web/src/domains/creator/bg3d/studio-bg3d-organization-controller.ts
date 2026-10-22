/**
 * 아웃라이너가 태그·컴포넌트·장면 정보를 다루는 좁은 통로.
 *
 * 화면(React)은 렌더러 객체·가변 ref·문서 setter 를 받지 않고 이 컨트롤러만 받는다. 모든 변경은 편집기가 주입한 `apply`
 * (계획 → 기존 실행 취소·다시 실행 경로 커밋)를 거치고, 결과는 던지지 않고 `{ ok }` 값으로 돌려줘 화면이 실패 이유를
 * 사용자 말로 알릴 수 있다. 읽기 모델(view)은 렌더마다 새로 만든 값을 그대로 담는다.
 */

import type { StudioBg3dOrganizationAction } from "./studio-bg3d-organization-mutation";
import type { StudioBg3dOutlinerMutationFailure } from "./studio-bg3d-outliner-mutation";
import type { StudioBg3dOrganizationView } from "./studio-bg3d-scene-organization";
import type { StudioBg3dSkpSourceRef } from "./studio-bg3d-skp-sidecar";

/** 계획이 거절한 이유에 더해, 캡처·복원·물리 같은 다른 작업 중이라 아예 시작하지 않은 `busy` 가 있다. */
export type StudioBg3dOrganizationFailureReason = StudioBg3dOutlinerMutationFailure["reason"] | "busy";

export type StudioBg3dOrganizationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: StudioBg3dOrganizationFailureReason };

export interface StudioBg3dOrganizationController {
  readonly view: StudioBg3dOrganizationView;
  /** .skp 에서 온 모델 노드의 원본 정보. 키는 노드 id. 이름 기록은 화면이 필요할 때 따로 읽는다. */
  readonly skpSourceByEntityId: ReadonlyMap<string, StudioBg3dSkpSourceRef>;
  readonly addTag: (ids: readonly string[], tag: string) => StudioBg3dOrganizationResult;
  readonly removeTag: (ids: readonly string[], tag: string) => StudioBg3dOrganizationResult;
  readonly toggleTagVisibility: (tag: string) => StudioBg3dOrganizationResult;
  readonly groupComponent: (ids: readonly string[], name: string) => StudioBg3dOrganizationResult;
  readonly ungroupComponent: (ids: readonly string[]) => StudioBg3dOrganizationResult;
  readonly renameComponent: (componentId: string, name: string) => StudioBg3dOrganizationResult;
  /** 빈 문자열은 지우기, 넘기지 않은 키는 그대로 둔다. */
  readonly setSceneMeta: (meta: { readonly name?: string; readonly memo?: string }) => StudioBg3dOrganizationResult;
  /** 태그·컴포넌트 묶음의 구성원을 한꺼번에 선택한다(현재 선택을 바꾼다). */
  readonly selectEntities: (ids: readonly string[]) => void;
}

export interface CreateStudioBg3dOrganizationControllerInput {
  readonly view: StudioBg3dOrganizationView;
  readonly skpSourceByEntityId: ReadonlyMap<string, StudioBg3dSkpSourceRef>;
  readonly apply: (action: StudioBg3dOrganizationAction) => StudioBg3dOrganizationResult;
  readonly selectEntities: (ids: readonly string[]) => void;
}

export function createStudioBg3dOrganizationController(
  input: CreateStudioBg3dOrganizationControllerInput,
): StudioBg3dOrganizationController {
  const { apply } = input;
  const controller: StudioBg3dOrganizationController = {
    view: input.view,
    skpSourceByEntityId: input.skpSourceByEntityId,
    addTag: (ids, tag) => apply({ type: "add-tag", ids, tag }),
    removeTag: (ids, tag) => apply({ type: "remove-tag", ids, tag }),
    toggleTagVisibility: (tag) => apply({ type: "toggle-tag-visibility", tag }),
    groupComponent: (ids, name) => apply({ type: "group-component", ids, name }),
    ungroupComponent: (ids) => apply({ type: "ungroup-component", ids }),
    renameComponent: (componentId, name) => apply({ type: "rename-component", componentId, name }),
    setSceneMeta: (meta) =>
      apply({
        type: "set-scene-meta",
        ...(meta.name === undefined ? {} : { name: meta.name }),
        ...(meta.memo === undefined ? {} : { memo: meta.memo }),
      }),
    selectEntities: input.selectEntities,
  };
  return Object.freeze(controller);
}
