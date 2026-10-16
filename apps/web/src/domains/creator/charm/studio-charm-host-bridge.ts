/**
 * 편집기 세션(호스트 백)에서 참이 필요한 값만 타입이 있는 모양으로 읽어 내는 어댑터.
 *
 * 호스트(`StudioCuttoonEditorHost`)는 건드리지 않는다. 이미 세션 백에 실려 오는 삽입 명령과 선택·보기·스냅
 * 설정을 좁은 인터페이스로 받아, 누르는 순간의 활성화 문맥(`StudioCharmActivationContext`)으로 바꾼다.
 * 문맥은 렌더 중이 아니라 이벤트 시점에 읽으므로 선택이나 스크롤이 바뀐 직후에도 최신 값을 쓴다.
 */

import { resolveStudioVisibleDocumentPlacement } from "../studio-view-controls";
import { createStudioCharmCascade } from "./studio-charm-cascade";

import type {
  StudioCharmActivationContext,
  StudioCharmHostCommands,
  StudioCharmSelectionBounds,
} from "./studio-charm-insert";
import type { StudioInsertViewportTarget } from "../studio-insert-drag-core";

export interface StudioCharmClientRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface StudioCharmMeasurable {
  getBoundingClientRect(): StudioCharmClientRect;
}

/** 세션 백에서 참이 읽는 값. 필드 이름은 세션 백의 이름을 그대로 따른다. */
export interface StudioCharmHostSession {
  readonly studioToolBeltContentHandlers: StudioCharmHostCommands;
  readonly selected?: (StudioCharmSelectionBounds & { readonly id?: string }) | null;
  readonly canvasH: number;
  readonly canvasFlipH: boolean;
  readonly canvasRotation: number;
  readonly snapEnabled: boolean;
  readonly gridSize: number;
  readonly effScale: number;
  readonly zoomHostRef?: { readonly current: StudioCharmMeasurable | null } | null;
  readonly wrapRef?: { readonly current: StudioCharmMeasurable | null } | null;
  readonly activeSurfaceReviewLocked?: boolean;
  readonly pageEditLocked?: boolean;
  readonly collaborationDocumentLocked?: boolean;
  readonly collaborationLockMessage?: string | null;
}

function readVisibleTarget(session: StudioCharmHostSession, documentWidth: number): StudioInsertViewportTarget | null {
  const host = session.zoomHostRef?.current;
  const viewport = session.wrapRef?.current;
  if (!host || !viewport) return null;
  const hostRect = host.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  return resolveStudioVisibleDocumentPlacement({
    documentWidth,
    documentHeight: session.canvasH,
    canvasFlipH: session.canvasFlipH,
    canvasRotation: session.canvasRotation,
    hostRect: { left: hostRect.left, top: hostRect.top, right: hostRect.right, bottom: hostRect.bottom },
    viewportRect: {
      left: viewportRect.left,
      top: viewportRect.top,
      right: viewportRect.right,
      bottom: viewportRect.bottom,
    },
  });
}

export interface StudioCharmContextReader {
  /** 누르는 순간의 활성화 문맥을 만든다(보이는 화면 측정 포함). */
  read(session: StudioCharmHostSession, now?: number): StudioCharmActivationContext;
}

/** 연속 삽입 계단 카운터를 가진 문맥 읽기 도구를 만든다. 바 하나가 하나씩 가진다. */
export function createStudioCharmContextReader(documentWidth: number): StudioCharmContextReader {
  const cascade = createStudioCharmCascade();
  return {
    read(session, now = Date.now()) {
      return {
        documentWidth,
        documentHeight: session.canvasH,
        selection: session.selected ?? null,
        visible: readVisibleTarget(session, documentWidth),
        snap: {
          enabled: session.snapEnabled,
          gridSize: session.gridSize,
          viewportScale: session.effScale,
        },
        sequenceFor: (targetKey) => cascade(targetKey, now),
      };
    },
  };
}

export type StudioCharmLockKind = "review" | "collaboration" | "page";

export interface StudioCharmLock {
  readonly kind: StudioCharmLockKind;
  /** 호스트가 이미 가진 사용자용 안내(협업 잠금). 없으면 화면이 종류별 기본 문구를 쓴다. */
  readonly message: string | null;
}

/**
 * 편집을 막는 사유. 문서 잠금·검수 잠금·협업 잠금 중 하나라도 있으면 칩은 눌러도 붙이지 않고 이유를 안내한다.
 * (붙이기 명령 자체도 잠금이면 거절하지만, 칩이 미리 알려 주는 편이 정직하다.)
 */
export function studioCharmLock(session: StudioCharmHostSession): StudioCharmLock | null {
  if (session.activeSurfaceReviewLocked) return { kind: "review", message: null };
  if (session.collaborationDocumentLocked) {
    return { kind: "collaboration", message: session.collaborationLockMessage || null };
  }
  if (session.pageEditLocked) return { kind: "page", message: null };
  return null;
}
