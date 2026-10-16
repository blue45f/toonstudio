/**
 * 참 하나를 캔버스에 붙이는 순수 계획과 호스트 명령 호출.
 *
 * 붙이기는 편집기가 이미 가진 삽입 명령(`addRenderedImage`·`addSticker`·`addBubble`·
 * `addBuiltinRasterAsset`·`addSfxPreset`·`openStudioObjectInsert`) 중 정확히 하나를 한 번 부른다.
 * 그 명령들은 각각 한 번의 `commit` 만 일으키므로 삽입 한 번은 되돌리기(undo) 한 단계다
 * (`studio-charm-bar-host-contract.test.ts` 가 소스에서 이 불변식을 고정한다).
 *
 * 놓을 위치는 기존 삽입 규칙을 재사용한다.
 * - 대상: `resolveStudioInsertTarget` — 선택한 컷(프레임) 중앙 → (프레임이 아닌 선택이면 그 중앙) → 보이는 화면 중앙 → 문서 중앙.
 * - 겹침 방지: `cascadeCanvasPlacementAnchor` — 같은 대상에 5초 안에 연달아 붙이면 계단식으로 비킨다.
 * - 격자 스냅: `snapStudioObjectDragPosition` — 객체를 끌 때와 같은 자석 스냅(화면 px 허용 거리)을 왼쪽 위 모서리에 적용한다.
 */

import { svgToDataUrl } from "../studio-characters";
import {
  cascadeCanvasPlacementAnchor,
  createCanvasImageElement,
  type CanvasImagePlacement,
} from "../studio-image-placement";
import {
  resolveStudioInsertTarget,
  type StudioInsertBounds,
  type StudioInsertPoint,
  type StudioInsertTarget,
  type StudioInsertViewportTarget,
} from "../studio-insert-drag-core";
import { snapStudioObjectDragPosition } from "../studio-object-drag-snap";

import type { BubbleVariant } from "../studio-assets";
import type { StudioObjectInsertOpenTarget } from "../studio-object-insert-catalog";
import type { StudioRasterAsset } from "../render/studio-raster-assets";
import type { SfxPreset } from "../studio-sfx-presets";
import type { StudioCharmDescriptor } from "./studio-charm-descriptor";

export interface StudioCharmSelectionBounds {
  /** 같은 컷에 연달아 붙이는 횟수를 세는 키에 쓴다. 없으면 위치로 대신한다. */
  readonly id?: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioCharmSnapSettings {
  readonly enabled: boolean;
  readonly gridSize: number;
  /** 현재 화면 배율. 스냅 허용 거리를 화면 px 로 맞추는 데 쓴다. */
  readonly viewportScale: number;
}

export interface StudioCharmActivationContext {
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly selection: StudioCharmSelectionBounds | null;
  readonly visible: StudioInsertViewportTarget | null;
  readonly snap: StudioCharmSnapSettings;
  /** 같은 대상에 연달아 붙인 횟수(0부터). 호출자가 대상 키별로 세어 준다. */
  readonly sequenceFor: (targetKey: string) => number;
}

/** 편집기가 이미 가진 삽입 명령 중 참이 쓰는 것. `studioToolBeltContentHandlers` 의 일부다. */
export interface StudioCharmHostCommands {
  readonly addRenderedImage: (
    src: string,
    width: number,
    height: number,
    aiProvenance: undefined,
    isAnimatedGif: boolean,
    elementPatch: { readonly name: string },
    insertionPlacement: CanvasImagePlacement,
  ) => boolean;
  readonly addSticker: (emoji: string, at?: StudioInsertPoint) => void;
  readonly addBubble: (variant: BubbleVariant, at?: StudioInsertPoint, editImmediately?: boolean) => void;
  readonly addBuiltinRasterAsset: (asset: StudioRasterAsset) => Promise<boolean | void>;
  readonly addSfxPreset: (preset: SfxPreset) => Promise<void>;
  readonly openStudioObjectInsert: (request: {
    readonly openTarget: StudioObjectInsertOpenTarget;
    readonly sourceId: string;
  }) => void;
}

export type StudioCharmActivationResult =
  | { readonly status: "inserted" }
  | { readonly status: "opened" }
  | { readonly status: "rejected" }
  | { readonly status: "failed"; readonly message: string };

export interface StudioCharmPlacementPlan {
  readonly source: StudioInsertTarget["source"];
  /** 이미지 삽입용. 이미 스냅이 반영된 앵커를 가진다. */
  readonly placement: CanvasImagePlacement;
  /** 스티커·말풍선처럼 중심점으로 놓는 삽입용. */
  readonly point: StudioInsertPoint;
  readonly targetKey: string;
}

/** 호스트 `addSticker` 가 놓는 스티커 크기(중심 기준 80×80). */
const STICKER_FOOTPRINT = Object.freeze({ width: 80, height: 80 });
/** 호스트 `addBubble` 이 변종마다 정하는 말풍선 크기. 기본값과 다른 변종만 적는다. */
const BUBBLE_DEFAULT_FOOTPRINT = Object.freeze({ width: 260, height: 140 });
const BUBBLE_FOOTPRINT_OVERRIDES: Readonly<Partial<Record<BubbleVariant, { readonly width: number; readonly height: number }>>> = Object.freeze({
  double: Object.freeze({ width: 280, height: 180 }),
  system: Object.freeze({ width: 280, height: 150 }),
  heart: Object.freeze({ width: 200, height: 180 }),
});

/**
 * 말풍선이 놓일 크기. 호스트는 말풍선을 중심점 기준으로 놓으므로, 왼쪽 위 모서리를 격자에 맞추려면
 * 실제 크기를 알아야 한다. 값이 호스트와 어긋나지 않도록 `studio-charm-bar-host-contract.test.ts` 가
 * 호스트 소스와 대조한다.
 */
export function studioCharmBubbleFootprint(variant: BubbleVariant): { readonly width: number; readonly height: number } {
  return BUBBLE_FOOTPRINT_OVERRIDES[variant] ?? BUBBLE_DEFAULT_FOOTPRINT;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function finiteBounds(bounds: StudioCharmSelectionBounds | null): StudioInsertBounds | null {
  if (
    !bounds
    || !Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
    || bounds.width <= 0
    || bounds.height <= 0
  ) return null;
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function insetFor(target: StudioInsertTarget): number {
  const shortSide = Math.min(target.bounds.width, target.bounds.height);
  // 편집기의 `currentCanvasInsertionTarget` 과 같은 여백 규칙이다.
  if (target.source === "selected-frame") return Math.max(10, Math.min(28, shortSide * 0.04));
  if (target.source === "pointer") return 40;
  return Math.max(16, Math.min(40, shortSide * 0.05));
}

function targetKeyFor(target: StudioInsertTarget, selection: StudioCharmSelectionBounds | null): string {
  const cell = `${Math.round(target.anchor.x / 80)}:${Math.round(target.anchor.y / 80)}`;
  if (selection?.id && (target.source === "selected-frame" || target.source === "pointer")) {
    return `${target.source}:${selection.id}`;
  }
  return `${target.source}:${cell}`;
}

/** 붙일 위치를 정한다. 입력만으로 결정되는 순수 함수이며 DOM 을 읽지 않는다. */
export function planStudioCharmPlacement(
  context: StudioCharmActivationContext,
  footprint: { readonly width: number; readonly height: number },
): StudioCharmPlacementPlan {
  const selection = finiteBounds(context.selection);
  const selectedFrame = selection && context.selection?.type === "frame" ? selection : null;
  // 프레임이 아닌 요소를 골랐다면 그 요소의 중앙을 "선택 위치"로 본다(문서 안으로 클램프된다).
  const selectionCenter = selection && !selectedFrame
    ? { x: selection.x + selection.width / 2, y: selection.y + selection.height / 2 }
    : null;
  const target = resolveStudioInsertTarget({
    documentWidth: context.documentWidth,
    documentHeight: context.documentHeight,
    pointer: selectionCenter,
    selectedFrame,
    viewport: selection ? null : context.visible,
  });
  const inset = insetFor(target);
  const shortSide = Math.min(target.bounds.width, target.bounds.height);
  const step = clamp(shortSide / 18, 10, 18);
  const targetKey = targetKeyFor(target, context.selection);
  const anchor = cascadeCanvasPlacementAnchor(target.anchor, context.sequenceFor(targetKey), step);

  const provisional = createCanvasImageElement({
    id: "charm-placement-probe",
    src: "",
    canvasWidth: context.documentWidth,
    canvasHeight: context.documentHeight,
    sourceWidth: footprint.width,
    sourceHeight: footprint.height,
    placement: { anchor, bounds: target.bounds, inset },
  });
  const snappedCorner = snapStudioObjectDragPosition({
    position: { x: provisional.x, y: provisional.y },
    enabled: context.snap.enabled,
    gridSize: context.snap.gridSize,
    viewportScale: context.snap.viewportScale,
  });
  const snappedAnchor = {
    x: snappedCorner.x + provisional.width / 2,
    y: snappedCorner.y + provisional.height / 2,
  };

  // 스티커·말풍선은 80×80 / 180×120 정도의 발자국으로 보고 같은 방식으로 왼쪽 위 모서리를 스냅한다.
  const pointCorner = snapStudioObjectDragPosition({
    position: { x: anchor.x - footprint.width / 2, y: anchor.y - footprint.height / 2 },
    enabled: context.snap.enabled,
    gridSize: context.snap.gridSize,
    viewportScale: context.snap.viewportScale,
  });

  return {
    source: target.source,
    placement: { anchor: snappedAnchor, bounds: target.bounds, inset },
    point: { x: pointCorner.x + footprint.width / 2, y: pointCorner.y + footprint.height / 2 },
    targetKey,
  };
}

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "참을 붙이지 못했어요.";
}

/**
 * 참을 붙인다. 호스트 명령은 종류마다 정확히 한 번만 부른다.
 * 호스트가 잠금·저장 중 등으로 거절하면 `rejected`(자세한 안내는 호스트가 이미 띄웠다), 예외는 `failed`.
 */
export async function activateStudioCharm(
  descriptor: StudioCharmDescriptor,
  context: StudioCharmActivationContext,
  commands: StudioCharmHostCommands,
): Promise<StudioCharmActivationResult> {
  const { action } = descriptor;
  try {
    switch (action.type) {
      case "svg-image": {
        const plan = planStudioCharmPlacement(context, action);
        const accepted = commands.addRenderedImage(
          svgToDataUrl(action.svg),
          action.width,
          action.height,
          undefined,
          false,
          { name: descriptor.label },
          plan.placement,
        );
        return accepted ? { status: "inserted" } : { status: "rejected" };
      }
      case "library-image": {
        const plan = planStudioCharmPlacement(context, action);
        const accepted = commands.addRenderedImage(
          action.dataUrl,
          action.width,
          action.height,
          undefined,
          false,
          { name: descriptor.label },
          plan.placement,
        );
        return accepted ? { status: "inserted" } : { status: "rejected" };
      }
      case "emoji-sticker": {
        const plan = planStudioCharmPlacement(context, STICKER_FOOTPRINT);
        commands.addSticker(action.emoji, plan.point);
        return { status: "inserted" };
      }
      case "native-bubble": {
        const plan = planStudioCharmPlacement(context, studioCharmBubbleFootprint(action.variant));
        commands.addBubble(action.variant, plan.point, false);
        return { status: "inserted" };
      }
      case "raster-asset": {
        const result = await commands.addBuiltinRasterAsset(action.asset);
        return result === false ? { status: "rejected" } : { status: "inserted" };
      }
      case "sfx-text": {
        await commands.addSfxPreset(action.preset);
        return { status: "inserted" };
      }
      case "open-3d": {
        commands.openStudioObjectInsert({ openTarget: action.openTarget, sourceId: action.sourceId });
        return { status: "opened" };
      }
    }
  } catch (error) {
    return { status: "failed", message: failureMessage(error) };
  }
}
