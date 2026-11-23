/**
 * Figma Auto-Layout 제약 솔버 · 마스터-인스턴스 오버라이드 전파 · Excalidraw 손그림 스케치 엔진
 *
 * - computeAutoLayout(frame): row / column / wrap, padding, gap, alignItems, justifyContent,
 *   자식 크기 모드(hug / fill / fixed) 및 중첩 프레임 재귀 배치
 * - syncComponentInstances(master, instances): 마스터 속성 변경 시 오버라이드되지 않은 속성만 전파
 * - roughifyPolygonPath(points, seed): 결정론적 시드 기반 Excalidraw 스타일 이중 손그림 SVG 경로 변환
 */

export {
  roughifyArrowPath,
  roughifyPolygonPath,
  roughifyRectPath,
  type Point2D,
  type RoughifyOptions,
} from "./excalidraw-sketch-path";

export type AutoLayoutDirection = "row" | "column" | "wrap";
export type AutoLayoutSizingMode = "hug" | "fill" | "fixed";
export type AutoLayoutAlignItems = "start" | "center" | "end" | "stretch";
export type AutoLayoutJustifyContent = "start" | "center" | "end" | "space-between";

export interface AutoLayoutPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface AutoLayoutNodeBase {
  readonly id: string;
  readonly name?: string;
  readonly width: number;
  readonly height: number;
  readonly widthMode: AutoLayoutSizingMode;
  readonly heightMode: AutoLayoutSizingMode;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly growWeight?: number;
}

export interface AutoLayoutLeafNode extends AutoLayoutNodeBase {
  readonly kind: "leaf";
  readonly intrinsicWidth?: number;
  readonly intrinsicHeight?: number;
  readonly labelKo?: string;
  readonly labelEn?: string;
  readonly tokenRole?: "surface" | "accent" | "accent-2" | "badge" | "cta" | "muted";
}

export interface AutoLayoutFrameNode extends AutoLayoutNodeBase {
  readonly kind: "frame";
  readonly x?: number;
  readonly y?: number;
  readonly direction: AutoLayoutDirection;
  readonly padding: AutoLayoutPadding;
  readonly gap: number;
  readonly crossAxisGap?: number;
  readonly alignItems: AutoLayoutAlignItems;
  readonly justifyContent: AutoLayoutJustifyContent;
  readonly children: readonly AutoLayoutNode[];
}

export type AutoLayoutNode = AutoLayoutFrameNode | AutoLayoutLeafNode;

export interface ComputedAutoLayoutNode {
  readonly id: string;
  readonly kind: "frame" | "leaf";
  readonly name?: string;
  readonly labelKo?: string;
  readonly labelEn?: string;
  readonly tokenRole?: "surface" | "accent" | "accent-2" | "badge" | "cta" | "muted";
  readonly x: number;
  readonly y: number;
  readonly localX: number;
  readonly localY: number;
  readonly width: number;
  readonly height: number;
  readonly children: readonly ComputedAutoLayoutNode[];
}

export interface ComponentPropMap {
  readonly labelKo?: string;
  readonly labelEn?: string;
  readonly fillToken?: string;
  readonly textToken?: string;
  readonly borderRadius?: number;
  readonly fontSize?: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
  readonly gap?: number;
  readonly elevation?: "flat" | "soft" | "raised";
  readonly sketchMode?: boolean;
}

export type ComponentPropKey = keyof ComponentPropMap;

export interface ComponentMaster {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly props: ComponentPropMap;
}

export interface ComponentInstance {
  readonly id: string;
  readonly masterId: string;
  readonly name: string;
  readonly overrides: Partial<ComponentPropMap>;
  readonly resolvedProps: ComponentPropMap;
  readonly syncedMasterVersion: number;
  readonly detached?: boolean;
}

export interface ComponentSyncResult {
  readonly instances: readonly ComponentInstance[];
  readonly updatedCount: number;
  readonly skippedDetachedCount: number;
  readonly preservedOverrideKeysByInstance: Readonly<Record<string, readonly ComponentPropKey[]>>;
}

interface MeasuredSize {
  readonly width: number;
  readonly height: number;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function clampDim(value: number, min?: number, max?: number): number {
  const safeMin = Math.max(0, finiteOr(min, 0));
  const safeMax = max !== undefined && Number.isFinite(max) ? Math.max(safeMin, max) : Number.POSITIVE_INFINITY;
  const safeVal = Math.max(0, finiteOr(value, safeMin));
  return Math.min(safeMax, Math.max(safeMin, safeVal));
}

function normalizePadding(padding: AutoLayoutPadding): AutoLayoutPadding {
  return {
    top: Math.max(0, finiteOr(padding.top, 0)),
    right: Math.max(0, finiteOr(padding.right, 0)),
    bottom: Math.max(0, finiteOr(padding.bottom, 0)),
    left: Math.max(0, finiteOr(padding.left, 0)),
  };
}

export function createUniformPadding(amount: number): AutoLayoutPadding {
  const safe = Math.max(0, finiteOr(amount, 0));
  return { top: safe, right: safe, bottom: safe, left: safe };
}

/**
 * Pass 1 (Bottom-Up): 노드의 고유 크기(fixed 또는 hug 기준)를 재귀적으로 측정한다.
 */
function measureNodeIntrinsic(node: AutoLayoutNode, availableWidthHint?: number): MeasuredSize {
  if (node.kind === "leaf") {
    const baseW = node.widthMode === "hug" ? finiteOr(node.intrinsicWidth, node.width) : node.width;
    const baseH = node.heightMode === "hug" ? finiteOr(node.intrinsicHeight, node.height) : node.height;
    return {
      width: clampDim(baseW, node.minWidth, node.maxWidth),
      height: clampDim(baseH, node.minHeight, node.maxHeight),
    };
  }

  const pad = normalizePadding(node.padding);
  const gap = Math.max(0, finiteOr(node.gap, 0));
  const crossGap = Math.max(0, finiteOr(node.crossAxisGap, gap));
  const padX = pad.left + pad.right;
  const padY = pad.top + pad.bottom;

  const fixedOrHintWidth =
    node.widthMode === "fixed"
      ? clampDim(node.width, node.minWidth, node.maxWidth)
      : availableWidthHint !== undefined
        ? clampDim(availableWidthHint, node.minWidth, node.maxWidth)
        : clampDim(node.width, node.minWidth, node.maxWidth);

  const childAvailableWidth = Math.max(0, fixedOrHintWidth - padX);
  const childSizes = node.children.map((child) => measureNodeIntrinsic(child, childAvailableWidth));

  let contentW = 0;
  let contentH = 0;

  if (childSizes.length > 0) {
    if (node.direction === "row") {
      contentW =
        childSizes.reduce((acc, item) => acc + item.width, 0) +
        gap * Math.max(0, childSizes.length - 1);
      contentH = childSizes.reduce((acc, item) => Math.max(acc, item.height), 0);
    } else if (node.direction === "column") {
      contentW = childSizes.reduce((acc, item) => Math.max(acc, item.width), 0);
      contentH =
        childSizes.reduce((acc, item) => acc + item.height, 0) +
        gap * Math.max(0, childSizes.length - 1);
    } else {
      // wrap: 가로 줄바꿈 기준 행 높이 합산
      const wrapLimit = Math.max(1, childAvailableWidth);
      let lineW = 0;
      let lineH = 0;
      let lineCount = 0;
      let maxLineW = 0;
      let totalH = 0;

      for (const size of childSizes) {
        const projected = lineW === 0 ? size.width : lineW + gap + size.width;
        if (lineW > 0 && projected > wrapLimit) {
          maxLineW = Math.max(maxLineW, lineW);
          totalH += (lineCount > 0 ? crossGap : 0) + lineH;
          lineCount += 1;
          lineW = size.width;
          lineH = size.height;
        } else {
          lineW = projected;
          lineH = Math.max(lineH, size.height);
        }
      }

      maxLineW = Math.max(maxLineW, lineW);
      totalH += (lineCount > 0 ? crossGap : 0) + lineH;
      contentW = maxLineW;
      contentH = totalH;
    }
  }

  const measuredW =
    node.widthMode === "hug"
      ? clampDim(contentW + padX, node.minWidth, node.maxWidth)
      : clampDim(node.width, node.minWidth, node.maxWidth);
  const measuredH =
    node.heightMode === "hug"
      ? clampDim(contentH + padY, node.minHeight, node.maxHeight)
      : clampDim(node.height, node.minHeight, node.maxHeight);

  return { width: measuredW, height: measuredH };
}

function distributeFillSizes(
  children: readonly AutoLayoutNode[],
  intrinsicSizes: readonly MeasuredSize[],
  isHorizontalMain: boolean,
  innerMain: number,
  gap: number,
): readonly number[] {
  const totalGap = gap * Math.max(0, children.length - 1);
  let fixedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const mainMode = isHorizontalMain ? child.widthMode : child.heightMode;
    if (mainMode === "fill") {
      totalWeight += Math.max(0.01, finiteOr(child.growWeight, 1));
    } else {
      fixedSum += isHorizontalMain ? intrinsicSizes[i].width : intrinsicSizes[i].height;
    }
  }

  const remaining = Math.max(0, innerMain - fixedSum - totalGap);

  return children.map((child, idx) => {
    const mainMode = isHorizontalMain ? child.widthMode : child.heightMode;
    if (mainMode !== "fill") {
      return isHorizontalMain ? intrinsicSizes[idx].width : intrinsicSizes[idx].height;
    }
    const weight = Math.max(0.01, finiteOr(child.growWeight, 1));
    const share = totalWeight > 0 ? (remaining * weight) / totalWeight : 0;
    return isHorizontalMain
      ? clampDim(share, child.minWidth, child.maxWidth)
      : clampDim(share, child.minHeight, child.maxHeight);
  });
}

function resolveCrossSize(
  child: AutoLayoutNode,
  intrinsic: MeasuredSize,
  isHorizontalMain: boolean,
  innerCross: number,
  alignItems: AutoLayoutAlignItems,
): number {
  const crossMode = isHorizontalMain ? child.heightMode : child.widthMode;
  if (crossMode === "fill" || alignItems === "stretch") {
    return isHorizontalMain
      ? clampDim(innerCross, child.minHeight, child.maxHeight)
      : clampDim(innerCross, child.minWidth, child.maxWidth);
  }
  return isHorizontalMain ? intrinsic.height : intrinsic.width;
}

function resolveMainSpacing(
  justifyContent: AutoLayoutJustifyContent,
  innerMain: number,
  sumChildMain: number,
  count: number,
  gap: number,
): { readonly startOffset: number; readonly stepGap: number } {
  const totalGap = gap * Math.max(0, count - 1);
  const usedMain = sumChildMain + totalGap;

  if (justifyContent === "center") {
    return { startOffset: Math.max(0, (innerMain - usedMain) / 2), stepGap: gap };
  }
  if (justifyContent === "end") {
    return { startOffset: Math.max(0, innerMain - usedMain), stepGap: gap };
  }
  if (justifyContent === "space-between" && count > 1) {
    return {
      startOffset: 0,
      stepGap: Math.max(0, (innerMain - sumChildMain) / (count - 1)),
    };
  }
  return { startOffset: 0, stepGap: gap };
}

function resolveCrossOffset(
  alignItems: AutoLayoutAlignItems,
  innerCross: number,
  childCross: number,
): number {
  if (alignItems === "center") return (innerCross - childCross) / 2;
  if (alignItems === "end") return innerCross - childCross;
  return 0;
}

interface WrapLineItem {
  readonly node: AutoLayoutNode;
  readonly intrinsic: MeasuredSize;
}

/**
 * Pass 2 (Top-Down): 확정된 프레임 크기를 바탕으로 모든 자식의 절대/로컬 좌표를 재귀 산출한다.
 */
function layoutFrameResolved(
  frame: AutoLayoutFrameNode,
  absX: number,
  absY: number,
  localX: number,
  localY: number,
  resolvedW: number,
  resolvedH: number,
): ComputedAutoLayoutNode {
  const pad = normalizePadding(frame.padding);
  const gap = Math.max(0, finiteOr(frame.gap, 0));
  const crossGap = Math.max(0, finiteOr(frame.crossAxisGap, gap));
  const innerW = Math.max(0, resolvedW - pad.left - pad.right);
  const innerH = Math.max(0, resolvedH - pad.top - pad.bottom);

  if (frame.children.length === 0) {
    return {
      id: frame.id,
      kind: "frame",
      name: frame.name,
      x: round2(absX),
      y: round2(absY),
      localX: round2(localX),
      localY: round2(localY),
      width: round2(resolvedW),
      height: round2(resolvedH),
      children: [],
    };
  }

  const intrinsicSizes = frame.children.map((child) => measureNodeIntrinsic(child, innerW));
  const computedChildren: ComputedAutoLayoutNode[] = [];

  if (frame.direction === "row" || frame.direction === "column") {
    const isRow = frame.direction === "row";
    const innerMain = isRow ? innerW : innerH;
    const innerCross = isRow ? innerH : innerW;

    const mainSizes = distributeFillSizes(frame.children, intrinsicSizes, isRow, innerMain, gap);
    const crossSizes = frame.children.map((child, idx) =>
      resolveCrossSize(child, intrinsicSizes[idx], isRow, innerCross, frame.alignItems),
    );
    const sumMain = mainSizes.reduce((acc, size) => acc + size, 0);
    const { startOffset, stepGap } = resolveMainSpacing(
      frame.justifyContent,
      innerMain,
      sumMain,
      frame.children.length,
      gap,
    );

    let cursorMain = (isRow ? pad.left : pad.top) + startOffset;

    for (let i = 0; i < frame.children.length; i += 1) {
      const child = frame.children[i];
      const childMain = mainSizes[i];
      const childCross = crossSizes[i];
      const crossPos =
        (isRow ? pad.top : pad.left) +
        resolveCrossOffset(frame.alignItems, innerCross, childCross);

      const childLocalX = isRow ? cursorMain : crossPos;
      const childLocalY = isRow ? crossPos : cursorMain;
      const childW = isRow ? childMain : childCross;
      const childH = isRow ? childCross : childMain;

      computedChildren.push(
        placeChildNode(child, absX + childLocalX, absY + childLocalY, childLocalX, childLocalY, childW, childH),
      );
      cursorMain += childMain + stepGap;
    }
  } else {
    // direction === "wrap"
    const lines: WrapLineItem[][] = [];
    let currentLine: WrapLineItem[] = [];
    let currentLineWidth = 0;

    for (let i = 0; i < frame.children.length; i += 1) {
      const item: WrapLineItem = { node: frame.children[i], intrinsic: intrinsicSizes[i] };
      const itemW = item.intrinsic.width;
      const projected = currentLine.length === 0 ? itemW : currentLineWidth + gap + itemW;

      if (currentLine.length > 0 && projected > innerW) {
        lines.push(currentLine);
        currentLine = [item];
        currentLineWidth = itemW;
      } else {
        currentLine.push(item);
        currentLineWidth = projected;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    let cursorY = pad.top;

    for (const line of lines) {
      const lineNodes = line.map((entry) => entry.node);
      const lineIntrinsics = line.map((entry) => entry.intrinsic);
      const lineWidths = distributeFillSizes(lineNodes, lineIntrinsics, true, innerW, gap);
      const lineHeight = lineIntrinsics.reduce((acc, sz) => Math.max(acc, sz.height), 0);
      const sumLineW = lineWidths.reduce((acc, w) => acc + w, 0);

      const { startOffset, stepGap } = resolveMainSpacing(
        frame.justifyContent,
        innerW,
        sumLineW,
        line.length,
        gap,
      );

      let cursorX = pad.left + startOffset;

      for (let i = 0; i < line.length; i += 1) {
        const child = line[i].node;
        const childW = lineWidths[i];
        const childH = resolveCrossSize(child, line[i].intrinsic, true, lineHeight, frame.alignItems);
        const childLocalY = cursorY + resolveCrossOffset(frame.alignItems, lineHeight, childH);

        computedChildren.push(
          placeChildNode(child, absX + cursorX, absY + childLocalY, cursorX, childLocalY, childW, childH),
        );
        cursorX += childW + stepGap;
      }

      cursorY += lineHeight + crossGap;
    }
  }

  return {
    id: frame.id,
    kind: "frame",
    name: frame.name,
    x: round2(absX),
    y: round2(absY),
    localX: round2(localX),
    localY: round2(localY),
    width: round2(resolvedW),
    height: round2(resolvedH),
    children: computedChildren,
  };
}

function placeChildNode(
  child: AutoLayoutNode,
  absX: number,
  absY: number,
  localX: number,
  localY: number,
  width: number,
  height: number,
): ComputedAutoLayoutNode {
  if (child.kind === "frame") {
    return layoutFrameResolved(child, absX, absY, localX, localY, width, height);
  }
  return {
    id: child.id,
    kind: "leaf",
    name: child.name,
    labelKo: child.labelKo,
    labelEn: child.labelEn,
    tokenRole: child.tokenRole,
    x: round2(absX),
    y: round2(absY),
    localX: round2(localX),
    localY: round2(localY),
    width: round2(width),
    height: round2(height),
    children: [],
  };
}

/**
 * Figma Auto-Layout 제약 솔버 진입점.
 * 중첩 프레임의 hug/fill/fixed·wrap·alignItems·justifyContent 좌표를 2-Pass로 계산한다.
 */
export function computeAutoLayout(frame: AutoLayoutFrameNode): ComputedAutoLayoutNode {
  const rootX = finiteOr(frame.x, 0);
  const rootY = finiteOr(frame.y, 0);
  const rootIntrinsic = measureNodeIntrinsic(frame);
  const resolvedW = frame.widthMode === "hug" ? rootIntrinsic.width : clampDim(frame.width, frame.minWidth, frame.maxWidth);
  const resolvedH = frame.heightMode === "hug" ? rootIntrinsic.height : clampDim(frame.height, frame.minHeight, frame.maxHeight);

  return layoutFrameResolved(frame, rootX, rootY, rootX, rootY, resolvedW, resolvedH);
}

export function flattenAutoLayoutNodes(
  root: ComputedAutoLayoutNode,
): readonly ComputedAutoLayoutNode[] {
  const result: ComputedAutoLayoutNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenAutoLayoutNodes(child));
  }
  return result;
}

/**
 * 컴포넌트 마스터 → 인스턴스 오버라이드 전파 엔진.
 * 마스터 속성이 바뀌면 오버라이드되지 않은 인스턴스 속성만 자동 동기화하고,
 * 인스턴스가 개별 덮어쓴(override) 속성 및 분리(detached) 인스턴스는 보존한다.
 */
export function syncComponentInstances(
  master: ComponentMaster,
  instances: readonly ComponentInstance[],
): ComponentSyncResult {
  let updatedCount = 0;
  let skippedDetachedCount = 0;
  const preservedOverrideKeysByInstance: Record<string, readonly ComponentPropKey[]> = {};

  const nextInstances = instances.map((instance): ComponentInstance => {
    if (instance.masterId !== master.id) {
      return instance;
    }
    if (instance.detached) {
      skippedDetachedCount += 1;
      return instance;
    }

    const overrideKeys = (Object.keys(instance.overrides) as ComponentPropKey[]).filter(
      (key) => instance.overrides[key] !== undefined,
    );
    preservedOverrideKeysByInstance[instance.id] = overrideKeys;

    const merged: Record<string, unknown> = { ...master.props };
    for (const key of overrideKeys) {
      merged[key] = instance.overrides[key];
    }

    updatedCount += 1;
    return {
      ...instance,
      resolvedProps: merged as ComponentPropMap,
      syncedMasterVersion: master.version,
    };
  });

  return {
    instances: nextInstances,
    updatedCount,
    skippedDetachedCount,
    preservedOverrideKeysByInstance,
  };
}

export function setInstanceOverride<K extends ComponentPropKey>(
  instance: ComponentInstance,
  key: K,
  value: ComponentPropMap[K],
): ComponentInstance {
  const nextOverrides: Partial<ComponentPropMap> = {
    ...instance.overrides,
    [key]: value,
  };
  return {
    ...instance,
    overrides: nextOverrides,
    resolvedProps: {
      ...instance.resolvedProps,
      [key]: value,
    },
  };
}

export function resetInstanceOverride<K extends ComponentPropKey>(
  instance: ComponentInstance,
  master: ComponentMaster,
  key: K,
): ComponentInstance {
  const nextOverrides: Partial<ComponentPropMap> = { ...instance.overrides };
  delete nextOverrides[key];
  const nextResolved: ComponentPropMap = {
    ...instance.resolvedProps,
    [key]: master.props[key],
  };
  return {
    ...instance,
    overrides: nextOverrides,
    resolvedProps: nextResolved,
  };
}
