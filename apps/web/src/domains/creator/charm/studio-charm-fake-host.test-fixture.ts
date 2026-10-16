/**
 * 삽입 뒤에 새 요소를 선택하는 가짜 편집기 호스트(시험 전용).
 *
 * 진짜 호스트의 `addEl` 은 요소를 문서에 넣고 곧바로 그 요소를 선택한다(`setSelectedId(el.id)`). 그래서 같은 칩을
 * 연달아 누르면 두 번째 누름의 세션에서 `selected` 는 직전에 붙인 요소다. 선택이 고정된 가짜 세션으로는 이 되먹임을
 * 시험할 수 없어서, 이 가짜 호스트가 삽입 명령마다 요소를 만들고 선택을 옮긴다.
 *
 * 기하는 호스트와 같은 공용 함수를 그대로 쓴다: 이미지는 `createCanvasImageElement`, 중심점 삽입은
 * `clampCanvasPlacementCenter`. 요소 모양도 호스트와 같다 — 스티커에는 폭·높이가 없고, 말풍선·이미지에는 있다.
 * 말풍선 크기(260×140)는 일부러 참 쪽 크기표(`studioCharmBubbleFootprint`)를 가져오지 않고 따로 적는다.
 */

import { createCanvasImageElement } from "../studio-image-placement";
import { clampCanvasPlacementCenter } from "../studio-selection";

import type { StudioCharmHostSession } from "./studio-charm-host-bridge";
import type { StudioCharmHostCommands } from "./studio-charm-insert";

export interface FakeHostElement {
  readonly id: string;
  readonly type: "frame" | "image" | "sticker" | "bubble" | "text";
  readonly x: number;
  readonly y: number;
  /** 스티커·텍스트처럼 크기를 들지 않는 요소는 없다. */
  readonly width?: number;
  readonly height?: number;
  readonly name?: string;
}

export interface FakeStudioHostSeed {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly elements: readonly FakeHostElement[];
  readonly selectedId: string | null;
}

export interface FakeStudioHost {
  readonly commands: StudioCharmHostCommands;
  readonly subscribe: (listener: () => void) => () => void;
  /** 바뀔 때마다 늘어나는 번호. `useSyncExternalStore` 의 스냅샷으로 쓴다. */
  readonly revision: () => number;
  readonly elements: () => readonly FakeHostElement[];
  readonly selected: () => FakeHostElement | null;
  /** 사용자가 캔버스에서 요소를 고른 것처럼 선택만 바꾼다(`null` 은 선택 해제). */
  readonly select: (id: string | null) => void;
  /** 다른 페이지(또는 문서 마스터)로 옮겨 간 것처럼 요소 목록 전체와 선택을 바꾼다. */
  readonly replaceDocument: (nextElements: readonly FakeHostElement[], nextSelectedId: string | null) => void;
  /** 호스트가 다시 그릴 때마다 슬롯에 넘기는 세션 값. 선택은 그때그때의 값이다. */
  readonly session: (overrides?: Partial<StudioCharmHostSession>) => StudioCharmHostSession;
}

const STICKER_SIZE = 80;
const BUBBLE_SIZE = { width: 260, height: 140 } as const;
const MARGIN = 8;

export function createFakeStudioHost(seed: FakeStudioHostSeed): FakeStudioHost {
  let elements: readonly FakeHostElement[] = [...seed.elements];
  let selectedId: string | null = seed.selectedId;
  let revision = 0;
  let serial = 0;
  const listeners = new Set<() => void>();

  const emit = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };
  const nextId = () => {
    serial += 1;
    return `new-${serial}`;
  };
  /** 호스트 `addEl`: 요소를 문서에 넣고 곧바로 선택한다. */
  const addEl = (element: FakeHostElement): boolean => {
    elements = [...elements, element];
    selectedId = element.id;
    emit();
    return true;
  };
  const centerOf = (at: { readonly x: number; readonly y: number } | undefined, width: number, height: number) =>
    clampCanvasPlacementCenter(
      seed.canvasWidth,
      seed.canvasHeight,
      at ?? { x: seed.canvasWidth / 2, y: seed.canvasHeight / 2 },
      { width, height, margin: MARGIN },
    );

  const commands: StudioCharmHostCommands = {
    addRenderedImage: (src, width, height, _provenance, _animated, elementPatch, insertionPlacement) => {
      const image = createCanvasImageElement({
        id: nextId(),
        src,
        canvasWidth: seed.canvasWidth,
        canvasHeight: seed.canvasHeight,
        sourceWidth: width,
        sourceHeight: height,
        placement: insertionPlacement,
      });
      return addEl({ id: image.id, type: "image", x: image.x, y: image.y, width: image.width, height: image.height, name: elementPatch.name });
    },
    addSticker: (_emoji, at) => {
      const [cx, cy] = centerOf(at, STICKER_SIZE, STICKER_SIZE);
      addEl({ id: nextId(), type: "sticker", x: cx - STICKER_SIZE / 2, y: cy - STICKER_SIZE / 2 });
    },
    addBubble: (_variant, at) => {
      const [cx, cy] = centerOf(at, BUBBLE_SIZE.width, BUBBLE_SIZE.height);
      addEl({
        id: nextId(),
        type: "bubble",
        x: cx - BUBBLE_SIZE.width / 2,
        y: cy - BUBBLE_SIZE.height / 2,
        width: BUBBLE_SIZE.width,
        height: BUBBLE_SIZE.height,
      });
    },
    addBuiltinRasterAsset: async () => true,
    addSfxPreset: async () => undefined,
    openStudioObjectInsert: () => undefined,
  };

  const selected = (): FakeHostElement | null => elements.find((element) => element.id === selectedId) ?? null;

  return {
    commands,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    revision: () => revision,
    elements: () => elements,
    selected,
    select: (id) => {
      selectedId = id;
      emit();
    },
    replaceDocument: (nextElements, nextSelectedId) => {
      elements = [...nextElements];
      selectedId = nextSelectedId;
      emit();
    },
    session: (overrides = {}) => ({
      studioToolBeltContentHandlers: commands,
      selected: selected(),
      elements,
      canvasH: seed.canvasHeight,
      canvasFlipH: false,
      canvasRotation: 0,
      snapEnabled: false,
      gridSize: 40,
      effScale: 1,
      ...overrides,
    }),
  };
}

export interface HostLockInputs {
  /** 공동 편집이 문서를 잠갔다(호스트의 `collaborationDocumentLocked`). */
  readonly collaborationDocumentLocked?: boolean;
  /** 이 페이지가 검토 잠금이다(호스트의 `pageEditLocked`). */
  readonly pageEditLocked?: boolean;
  /** 문서 마스터를 편집 중이다. 이 동안 페이지 검토 잠금은 편집을 막지 않는다. */
  readonly masterEditMode?: boolean;
  /** 호스트의 `collaborationLockMessage()` 가 돌려줄 문장. */
  readonly collaborationMessage?: string;
}

/**
 * 호스트(`StudioCuttoonEditorHost.tsx`)가 편집 잠금 값을 파생하는 식 그대로 세션의 잠금 필드를 만든다.
 * 서로 독립인 불리언·문자열을 따로 적으면 호스트에서는 생길 수 없는 조합(예: 공동 편집 잠금인데 검수 잠금이 꺼짐)을
 * 시험하게 된다. 아래 식이 호스트와 같은지는 `studio-charm-bar-host-contract.test.ts` 가 소스에서 지킨다.
 *
 * - `activeSurfaceReviewLocked = collaborationDocumentLocked || (pageEditLocked && !masterEditMode)`
 * - `collaborationLockMessage` 는 문자열이 아니라 `() => string` 함수다.
 */
export function deriveHostLockFields(input: HostLockInputs = {}): Pick<
  StudioCharmHostSession,
  "collaborationDocumentLocked" | "pageEditLocked" | "activeSurfaceReviewLocked" | "collaborationLockMessage"
> & { readonly masterEditMode: boolean } {
  const collaborationDocumentLocked = input.collaborationDocumentLocked ?? false;
  const pageEditLocked = input.pageEditLocked ?? false;
  const masterEditMode = input.masterEditMode ?? false;
  const message = input.collaborationMessage ?? "다른 작가가 이 회차를 편집 중이에요.";
  return {
    collaborationDocumentLocked,
    pageEditLocked,
    masterEditMode,
    activeSurfaceReviewLocked: collaborationDocumentLocked || (pageEditLocked && !masterEditMode),
    collaborationLockMessage: () => message,
  };
}
