import {
  normalizeStudioDrawingAssistDocument,
  resolveStudioDrawingAssistPreviewDocument,
  type StudioDrawingAssistDocument,
  type StudioDrawingAssistPreviewCandidate,
} from "../brush/studio-drawing-assist-document";
import {
  hasCustomBubbleShape,
  insertBubbleShapePointAtClosestSegment,
  removeBubbleShapePoint,
} from "../lettering/studio-bubble-custom-shape";
import {
  bubbleLetterSpacing,
  bubbleTextBoxWidth,
  bubbleVerticalPaddingTotal,
  fitBubbleBoxHeightToText,
  resolveBubbleFontFamily,
  resolveBubbleFontSize,
  resolveBubbleFontStyle,
  resolveBubbleLineHeight,
} from "../lettering/studio-bubble-text-fit";
import { studioKonvaRuntime as KonvaRuntime } from "../render/studio-konva-runtime";
import { CANVAS_W } from "../studio-assets";
import { elBounds } from "../studio-element-geometry";
import type { BubbleEl, El, FrameEl, ImageEl } from "../studio-element-model";
import { insertFrame } from "../studio-frame-animation";
import { createFrameFolderGroupForNewFrame } from "../studio-frame-folder";
import type { LayerGroup } from "../studio-layers";
import type { StudioMacroCommand } from "../studio-macro-recorder";
import type { PageState } from "../studio-page-state";
import {
  layoutScenarioPanels,
  scenarioGenerationPreferences,
  scenarioReviewedArtwork,
  type ScenarioPreviewItem,
} from "../studio-scenario-layout";

export function extractStudioMacroCommandsFromPatch(
  patch: Partial<El>,
): StudioMacroCommand[] {
  const fields = patch as Partial<El> & {
    fontSize?: number;
    color?: string;
    blendMode?: string;
    font?: string;
    opacity?: number;
    hidden?: boolean;
    locked?: boolean;
  };
  const commands: StudioMacroCommand[] = [];
  if (typeof fields.opacity === "number") {
    commands.push({ type: "set-opacity", opacity: fields.opacity });
  }
  if (typeof fields.hidden === "boolean") {
    commands.push({ type: "set-hidden", hidden: fields.hidden });
  }
  if (typeof fields.locked === "boolean") {
    commands.push({ type: "set-locked", locked: fields.locked });
  }
  if (typeof fields.blendMode === "string") {
    commands.push({ type: "set-blend-mode", blendMode: fields.blendMode });
  }
  if (typeof fields.fontSize === "number") {
    commands.push({ type: "lettering-font-size", fontSize: fields.fontSize });
  }
  if (typeof fields.color === "string") {
    commands.push({ type: "lettering-color", color: fields.color });
  }
  if (typeof fields.font === "string") {
    commands.push({ type: "lettering-font", font: fields.font });
  }
  return commands;
}

export function computeStudioBubbleOutlinePointInsert(
  customShapePoints: readonly number[] | undefined,
  selectedPointIndex: number | null,
): { readonly points: number[]; readonly pointIndex: number } | null {
  if (!hasCustomBubbleShape(customShapePoints)) return null;
  const points = customShapePoints;
  const pointCount = points.length / 2;
  let segmentIndex =
    selectedPointIndex !== null &&
    selectedPointIndex >= 0 &&
    selectedPointIndex < pointCount
      ? selectedPointIndex
      : 0;
  if (selectedPointIndex === null) {
    let longestSquared = -1;
    for (let index = 0; index < pointCount; index++) {
      const nextIndex = (index + 1) % pointCount;
      const dx = points[nextIndex * 2]! - points[index * 2]!;
      const dy = points[nextIndex * 2 + 1]! - points[index * 2 + 1]!;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared > longestSquared) {
        longestSquared = lengthSquared;
        segmentIndex = index;
      }
    }
  }
  const nextIndex = (segmentIndex + 1) % pointCount;
  const midpointX = (points[segmentIndex * 2]! + points[nextIndex * 2]!) / 2;
  const midpointY = (points[segmentIndex * 2 + 1]! + points[nextIndex * 2 + 1]!) / 2;
  const inserted = insertBubbleShapePointAtClosestSegment(points, midpointX, midpointY);
  if (!inserted.changed || inserted.pointIndex === null) return null;
  return { points: inserted.points, pointIndex: inserted.pointIndex };
}

export function computeStudioBubbleOutlinePointRemoval(
  customShapePoints: readonly number[] | undefined,
  selectedPointIndex: number,
):
  | { readonly kind: "removed"; readonly points: number[]; readonly nextSelectedIndex: number }
  | { readonly kind: "minimum-points" }
  | { readonly kind: "unchanged" } {
  const removed = removeBubbleShapePoint(customShapePoints ?? [], selectedPointIndex);
  if (removed.changed) {
    const nextCount = removed.points.length / 2;
    return {
      kind: "removed",
      points: removed.points,
      nextSelectedIndex: Math.min(selectedPointIndex, nextCount - 1),
    };
  }
  if (removed.outcome === "minimum-points") return { kind: "minimum-points" };
  return { kind: "unchanged" };
}

export function planStudioSplitFrameSelected(input: {
  readonly frame: FrameEl;
  readonly orientation: "horizontal" | "vertical";
  readonly panelSplitRatio: number;
  readonly panelGutter: number;
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly allocateId: () => string;
}): {
  readonly elements: El[];
  readonly groups: LayerGroup[];
  readonly selectedId: string;
} {
  const f = input.frame;
  const ratio = input.panelSplitRatio / 100;
  const gutter = input.panelGutter;
  let f1: FrameEl;
  let f2: FrameEl;

  if (input.orientation === "horizontal") {
    const availableH = f.height - gutter;
    const h1 = Math.round(availableH * ratio);
    const h2 = Math.round(availableH * (1 - ratio));
    f1 = {
      id: input.allocateId(),
      type: "frame",
      x: f.x,
      y: f.y,
      width: f.width,
      height: h1,
      bg: f.bg,
      bundleSourceCredit: f.bundleSourceCredit,
    };
    f2 = {
      id: input.allocateId(),
      type: "frame",
      x: f.x,
      y: f.y + h1 + gutter,
      width: f.width,
      height: h2,
      bg: f.bg,
      bundleSourceCredit: f.bundleSourceCredit,
    };
  } else {
    const availableW = f.width - gutter;
    const w1 = Math.round(availableW * ratio);
    const w2 = Math.round(availableW * (1 - ratio));
    f1 = {
      id: input.allocateId(),
      type: "frame",
      x: f.x,
      y: f.y,
      width: w1,
      height: f.height,
      bg: f.bg,
      bundleSourceCredit: f.bundleSourceCredit,
    };
    f2 = {
      id: input.allocateId(),
      type: "frame",
      x: f.x + w1 + gutter,
      y: f.y,
      width: w2,
      height: f.height,
      bg: f.bg,
      bundleSourceCredit: f.bundleSourceCredit,
    };
  }

  const nextElements = input.elements.filter((e) => e.id !== f.id);
  const splitLabel =
    "name" in f && typeof f.name === "string" && f.name.trim() ? f.name : "컷";
  const folder1 = createFrameFolderGroupForNewFrame({ frameLabel: splitLabel, groupId: input.allocateId() });
  const folder2 = createFrameFolderGroupForNewFrame({ frameLabel: splitLabel, groupId: input.allocateId() });
  return {
    elements: [...nextElements, f1, f2],
    groups: [...input.groups, ...(folder1 ? [folder1] : []), ...(folder2 ? [folder2] : [])],
    selectedId: f1.id,
  };
}

export function planStudioDiagonalSplitFrames(input: {
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly canvasHeight: number;
  readonly allocateId: () => string;
}): {
  readonly elements: El[];
  readonly groups: LayerGroup[];
  readonly canvasH: number;
} {
  const margin = 24;
  const w = CANVAS_W - margin * 2;
  const frames = input.elements.filter((e): e is FrameEl => e.type === "frame");
  const bottomFrame = frames.reduce<FrameEl | null>(
    (best, f) => (!best || f.y + f.height > best.y + best.height ? f : best),
    null,
  );
  const top = bottomFrame ? bottomFrame.y + bottomFrame.height + margin : margin;
  const h = 440;
  const g = 18;
  const t1 = Math.round(h * 0.6);
  const t2 = Math.round(h * 0.4);
  const upper: FrameEl = {
    id: input.allocateId(),
    type: "frame",
    x: margin,
    y: top,
    width: w,
    height: t1,
    points: [0, 0, w, 0, w, t2, 0, t1],
  };
  const lowerY = top + t2 + g;
  const lowerH = h - (t2 + g);
  const lower: FrameEl = {
    id: input.allocateId(),
    type: "frame",
    x: margin,
    y: lowerY,
    width: w,
    height: lowerH,
    points: [0, t1 - t2, w, 0, w, lowerH, 0, lowerH],
  };
  const folderUpper = createFrameFolderGroupForNewFrame({ frameLabel: "컷", groupId: input.allocateId() });
  const folderLower = createFrameFolderGroupForNewFrame({ frameLabel: "컷", groupId: input.allocateId() });
  return {
    elements: [...input.elements, upper, lower],
    groups: [...input.groups, ...(folderUpper ? [folderUpper] : []), ...(folderLower ? [folderLower] : [])],
    canvasH: Math.max(input.canvasHeight, top + h + margin),
  };
}

export function createStudioFocusLinesElement(id: string): El {
  return {
    id,
    type: "focusLines",
    x: 100,
    y: 100,
    width: 360,
    height: 360,
    lineCount: 80,
    innerRadius: 100,
    outerRadius: 360,
    stroke: "#16100c",
    strokeWidth: 2.5,
    noise: 20,
    rotation: 0,
  };
}

export function createStudioSpeedLinesElement(id: string): El {
  return {
    id,
    type: "speedLines",
    x: 50,
    y: 200,
    width: 500,
    height: 180,
    lineCount: 50,
    direction: "horizontal",
    stroke: "#16100c",
    strokeWidth: 2.5,
    rotation: 0,
  };
}

export type StudioScenarioApplyLayerImage = Omit<ImageEl, "id"> & { readonly name: string };

export function computeStudioScenarioDraftRelayout(input: {
  readonly items: readonly ScenarioPreviewItem[];
  readonly target: "current-page" | "new-page";
  readonly elements: readonly El[];
  readonly canvasHeight: number;
}): {
  readonly nextCanvasH: number;
  readonly items: ScenarioPreviewItem[];
} {
  const existingFrames =
    input.target === "current-page"
      ? input.elements.filter((element): element is FrameEl => element.type === "frame")
      : [];
  const layout = layoutScenarioPanels(
    existingFrames,
    CANVAS_W,
    input.target === "current-page" ? input.canvasHeight : 1080,
    input.items.map((item) => ({
      beatType: item.beatType,
      summary: item.summary,
      imagePrompt: item.imagePrompt,
      dialogue: item.dialogue,
      continuity: item.continuity,
    })),
  );
  return {
    nextCanvasH: layout.nextCanvasH,
    items: layout.panels.map((panel, index) => {
      const source = input.items[index];
      const manifest = source?.layerManifest;
      // 레거시 적용 래퍼가 말풍선 배열에 잠시 넣은 분리 이미지만 새 프레임으로 옮긴다.
      const decorations = source?.bubbles as readonly (ScenarioPreviewItem["bubbles"][number] | StudioScenarioApplyLayerImage)[] | undefined;
      const images = manifest?.editable ? decorations?.flatMap((item) =>
        item.type === "image" && manifest.layers.some((layer) => layer.imageDataUrl === item.src && layer.name === item.name)
          ? [{ ...item, ...panel.frame }]
          : [],
      ) ?? [] : [];
      return {
        ...panel,
        ...scenarioReviewedArtwork(source),
        ...scenarioGenerationPreferences(source ?? {}),
        ...(images.length > 0 ? { bubbles: [...images, ...panel.bubbles] as unknown as ScenarioPreviewItem["bubbles"] } : {}),
      };
    }),
  };
}

export function applyStudioScenarioScenePatch(
  items: readonly ScenarioPreviewItem[],
  index: number,
  patch: Partial<ScenarioPreviewItem>,
): ScenarioPreviewItem[] {
  return items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const generationInputChanged =
      (typeof patch.imagePrompt === "string" && patch.imagePrompt !== item.imagePrompt)
      || ("continuity" in patch && patch.continuity !== item.continuity);
    return {
      ...item,
      ...patch,
      ...(generationInputChanged
        ? { imageDataUrl: undefined, imageError: undefined, imageProvenance: undefined }
        : {}),
    };
  });
}

export function measureStudioBubbleCommitHeight(
  el: BubbleEl,
  finalValue: string,
  webtoonTheme: "classic" | "soft" | "vivid",
): number | undefined {
  if (el.autoShrinkText) return undefined;
  const fontSize = resolveBubbleFontSize(el.fontSize);
  const fontFamily = resolveBubbleFontFamily(el.font);
  const fontStyle = resolveBubbleFontStyle(el.fontStyle);
  const lineHeight = resolveBubbleLineHeight({
    lineHeight: el.lineHeight,
    vertical: el.vertical,
    theme: webtoonTheme,
  });
  const letterSpacing = bubbleLetterSpacing(webtoonTheme);
  if (el.vertical) {
    return fitBubbleBoxHeightToText({
      text: finalValue,
      boxWidth: el.width,
      fontSize,
      fontFamily,
      fontStyle,
      lineHeight,
      letterSpacing,
      vertical: true,
      minHeight: el.height,
    });
  }
  const measure = new KonvaRuntime.Text({
    text: finalValue || " ",
    width: bubbleTextBoxWidth(el.width, fontSize),
    fontSize,
    fontFamily,
    fontStyle,
    align: el.align ?? "center",
    lineHeight,
    letterSpacing,
  });
  const height = Math.max(
    el.height,
    Math.ceil(measure.height()) + bubbleVerticalPaddingTotal(fontSize),
  );
  measure.destroy();
  return height;
}

export function planStudioAnimFrameCaptureElements(input: {
  readonly elements: readonly El[];
  readonly target: ImageEl;
  readonly capturedElementIds: ReadonlySet<string>;
  readonly newFrameId: string;
  readonly src: string;
}): El[] {
  const bbox = {
    x: input.target.x,
    y: input.target.y,
    w: input.target.width,
    h: input.target.height,
  };
  const overlaps = (b: { x: number; y: number; w: number; h: number }) =>
    b.x < bbox.x + bbox.w && b.x + b.w > bbox.x && b.y < bbox.y + bbox.h && b.y + b.h > bbox.y;
  const newStrokeIds = new Set(
    input.elements
      .filter((e) => e.type === "draw" && !input.capturedElementIds.has(e.id) && overlaps(elBounds(e)))
      .map((e) => e.id),
  );
  const kept = input.elements.filter((e) => !newStrokeIds.has(e.id));
  return kept.map((e) =>
    e.id === input.target.id
      ? ({
          ...e,
          frames: insertFrame(
            (e as ImageEl).frames ?? [],
            { id: input.newFrameId, src: input.src },
            (e as ImageEl).activeFrameId ?? null,
          ),
          activeFrameId: input.newFrameId,
          src: input.src,
        } as El)
      : e,
  );
}

export function deriveStudioDrawingAssistDocumentSnapshot(input: {
  readonly history: readonly PageState[][];
  readonly historyIndex: number;
  readonly fallbackPages: PageState[];
  readonly currentPageId: string;
  readonly showIsometricOnDraw: boolean;
  readonly preview: StudioDrawingAssistPreviewCandidate | null;
}): {
  readonly document: StudioDrawingAssistDocument;
  readonly persistedDocument: StudioDrawingAssistDocument;
  readonly page: PageState;
  readonly pages: PageState[];
} | null {
  const clampedIndex = Math.max(
    0,
    Math.min(input.historyIndex, Math.max(0, input.history.length - 1)),
  );
  const currentPages = input.history[clampedIndex] ?? input.fallbackPages;
  const page = currentPages.find((candidate) => candidate.id === input.currentPageId);
  if (!page) return null;
  const normalized = normalizeStudioDrawingAssistDocument(page.drawingAssist, {
    canvasWidth: CANVAS_W,
    canvasHeight: page.canvasH,
  });
  const defaulted = page.drawingAssist === undefined && input.showIsometricOnDraw
    ? { ...normalized, isometric: { ...normalized.isometric, active: true } }
    : normalized;
  return {
    document: resolveStudioDrawingAssistPreviewDocument({
      preview: input.preview,
      pageId: page.id,
      source: page.drawingAssist,
      fallback: defaulted,
      viewport: { canvasWidth: CANVAS_W, canvasHeight: page.canvasH },
    }),
    persistedDocument: defaulted,
    page,
    pages: currentPages,
  };
}
